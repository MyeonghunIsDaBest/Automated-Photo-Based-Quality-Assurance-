import { useCallback, useEffect, useRef, useState } from 'react';
import { Camera, Clock, Loader2 } from 'lucide-react';
import { format } from 'date-fns';
import { useAppStore } from '../../store';
import { uploadPhoto } from '../../lib/api/photos';
import { clockIn, clockOut, listTimesheets, type Timesheet } from '../../lib/api/timesheets';
import { supabaseConfigured } from '../../lib/supabase';
import { FRAUNCES } from '../../pages/gantt/components/ledger';

// Worker field cockpit (Phase 2) — the two actions a worker does most, made
// one-tap on /home instead of buried in the Gantt: snap a site photo, and clock
// in / out of their shift. Both target the active project. Degrades gracefully
// when Supabase isn't configured (clock control hides; capture shows a notice).

export default function FieldActionsCard() {
  const project = useAppStore((s) => s.project);
  const currentUser = useAppStore((s) => s.currentUser);
  const setNotification = useAppStore((s) => s.setNotification);

  const projectId = project?.id;
  const workerName = currentUser?.fullName ?? '';

  // ── Capture ──
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [capturing, setCapturing] = useState(false);
  const handleCapture = async (files: FileList | null) => {
    const file = files?.[0];
    if (!file || !projectId) return;
    if (!supabaseConfigured()) {
      setNotification({ message: 'Uploads need Supabase configured.', type: 'error' });
      return;
    }
    setCapturing(true);
    try {
      await uploadPhoto({ file, projectId });
      setNotification({ message: 'Photo uploaded — AI analysis queued.', type: 'success' });
    } catch (e) {
      setNotification({ message: e instanceof Error ? e.message : 'Upload failed.', type: 'error' });
    } finally {
      setCapturing(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  };

  // ── Clock ── (open shift = my timesheet row with timeIn set + no timeOut)
  const [openShift, setOpenShift] = useState<Timesheet | null>(null);
  const [clockBusy, setClockBusy] = useState(false);
  const loadShift = useCallback(async () => {
    if (!supabaseConfigured() || !projectId || !workerName) return;
    try {
      const rows = await listTimesheets(projectId);
      setOpenShift(rows.find((t) => t.workerName === workerName && t.timeIn && !t.timeOut) ?? null);
    } catch { /* non-fatal — clock just shows "Clock in" */ }
  }, [projectId, workerName]);
  useEffect(() => { void loadShift(); }, [loadShift]);

  const toggleClock = async () => {
    if (!projectId || !workerName || clockBusy) return;
    setClockBusy(true);
    try {
      if (openShift?.timeIn) {
        await clockOut(openShift.id, openShift.timeIn);
        setOpenShift(null);
        setNotification({ message: 'Clocked out — shift hours recorded.', type: 'success' });
      } else {
        const ts = await clockIn(projectId, workerName, currentUser?.id);
        setOpenShift(ts);
        setNotification({ message: 'Clocked in — running timer started.', type: 'success' });
      }
    } catch (e) {
      setNotification({ message: e instanceof Error ? e.message : 'Clock action failed.', type: 'error' });
    } finally {
      setClockBusy(false);
    }
  };

  const onClock = Boolean(openShift?.timeIn);
  const clockConfigured = supabaseConfigured();

  return (
    <section className="rounded-[14px] border border-[#E6E1D4] bg-white p-5 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <p className="mb-3 text-[11px] font-medium uppercase tracking-[0.22em] text-[#6B6B6B]">Quick actions</p>
      <div className={`grid grid-cols-1 gap-3 ${clockConfigured ? 'sm:grid-cols-2' : ''}`}>
        {/* Capture */}
        <button
          type="button"
          onClick={() => fileRef.current?.click()}
          disabled={capturing}
          className="group flex min-h-[64px] items-center gap-3 rounded-[12px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3 text-left transition-colors hover:border-[#2F8F5C] hover:bg-[#E5F2EA]/50 disabled:opacity-60"
        >
          <span className="grid h-10 w-10 flex-shrink-0 place-items-center rounded-full bg-[#2F8F5C] text-white">
            {capturing ? <Loader2 className="h-5 w-5 animate-spin" /> : <Camera className="h-5 w-5" />}
          </span>
          <span className="min-w-0">
            <span className="block text-[15px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
              {capturing ? 'Uploading…' : 'Snap a site photo'}
            </span>
            <span className="block truncate text-[12px] text-[#6B6B6B]">Lands in {project?.name ?? 'this project'} → AI scans it</span>
          </span>
        </button>

        {/* Clock in / out */}
        {clockConfigured && (
          <button
            type="button"
            onClick={() => void toggleClock()}
            disabled={clockBusy}
            className={`group flex min-h-[64px] items-center gap-3 rounded-[12px] border px-4 py-3 text-left transition-colors disabled:opacity-60 ${
              onClock
                ? 'border-[#F0D5A0] bg-[#F9EFD9] hover:border-[#C8841E]'
                : 'border-[#E6E1D4] bg-[#FAF8F2] hover:border-[#2F8F5C] hover:bg-[#E5F2EA]/50'
            }`}
          >
            <span className={`grid h-10 w-10 flex-shrink-0 place-items-center rounded-full text-white ${onClock ? 'bg-[#C8841E]' : 'bg-[#1A1A1A]'}`}>
              {clockBusy ? <Loader2 className="h-5 w-5 animate-spin" /> : <Clock className="h-5 w-5" />}
            </span>
            <span className="min-w-0">
              <span className="block text-[15px] font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
                {clockBusy ? 'Working…' : onClock ? 'Clock out' : 'Clock in'}
              </span>
              <span className="block truncate text-[12px] text-[#6B6B6B]">
                {onClock && openShift?.timeIn
                  ? `On the clock since ${format(new Date(openShift.timeIn), 'h:mm a')}`
                  : 'Start your shift on this project'}
              </span>
            </span>
          </button>
        )}
      </div>

      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={(e) => { void handleCapture(e.target.files); }}
      />
    </section>
  );
}
