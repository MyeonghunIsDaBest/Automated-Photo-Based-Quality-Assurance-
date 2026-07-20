// TimeEntriesSection — Time log for a service job.
// Workers add entries for themselves; managers can pick any active tech.
// Displays tech name resolved from a profiles map, date, hours, note, role.
// Running total shown at the bottom via totalHours().
// Role picker shows role names only — never $ rates (rate data is manager-only
// in Settings; this component is used by field workers too).

import { useState, useEffect } from 'react';
import { Trash2, Plus, Loader2, Clock } from 'lucide-react';
import {
  addTimeEntry,
  deleteTimeEntry,
  totalHours,
  type ServiceJobTimeEntry,
} from '../../lib/api/serviceJobs';
import { listLabourRates, type LabourRate } from '../../lib/api/labourRates';
import { inputField } from '../gantt/components/ledger';
import { cn } from '../../lib/cn';
import type { Profile } from '../../types';

interface Props {
  jobId: string;
  entries: ServiceJobTimeEntry[];
  profiles: Profile[];
  /** The currently signed-in user's profile id. */
  currentUserId: string | null;
  canLog: boolean;
  canManage: boolean;
  onChanged: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimeEntriesSection({
  jobId,
  entries,
  profiles,
  currentUserId,
  canLog,
  canManage,
  onChanged,
}: Props) {
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  // Role list — loaded once on mount; no rates exposed here (names only).
  const [labourRates, setLabourRates] = useState<LabourRate[]>([]);
  useEffect(() => {
    listLabourRates(false).then(setLabourRates).catch(() => {/* silent — non-fatal */});
  }, []);

  const [formDate,   setFormDate]   = useState(todayISO);
  const [formHours,  setFormHours]  = useState('');
  const [formNote,   setFormNote]   = useState('');
  const [formRole,   setFormRole]   = useState('');
  // Manager-only: tech picker. Defaults to '' (will use currentUserId for workers).
  const [formUserId, setFormUserId] = useState('');

  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Active internal profiles for the manager tech-picker — same exclusion rule
  // as NewServiceJobModal/ServiceJobDrawer (externals + hidden dev superuser).
  const internalProfiles = profiles.filter(
    (p) => p.isActive !== false &&
      !['customer', 'supplier', 'stakeholder', 'dev'].includes(p.securityGroup ?? ''),
  );

  const resolvedUserId = canManage
    ? (formUserId || currentUserId || '')
    : (currentUserId || '');

  const handleAdd = async () => {
    const hours = parseFloat(formHours);
    if (!formHours || isNaN(hours) || hours < 0.25) {
      setSaveError('Hours must be at least 0.25.');
      return;
    }
    if (!resolvedUserId) {
      setSaveError('Cannot determine user — please refresh.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await addTimeEntry(jobId, {
        userId: resolvedUserId,
        date: formDate,
        hours,
        note: formNote.trim() || undefined,
        role: formRole || null,
      });
      // Reset form
      setFormDate(todayISO);
      setFormHours('');
      setFormNote('');
      setFormRole('');
      setFormUserId('');
      onChanged();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not add entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteTimeEntry(id);
      onChanged();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  const total = totalHours(entries);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">
          Time Entries
        </label>
        <span className="inline-flex items-center gap-1 rounded-full bg-[#F0EDE4] px-2.5 py-0.5 text-[11px] font-semibold text-[#3A3A3A]">
          <Clock className="h-3 w-3" />
          {total} h total
        </span>
      </div>

      {deleteError && (
        <p className="rounded-md border border-[#F0C8C8] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
          {deleteError}
        </p>
      )}

      {/* Entry list */}
      {entries.length === 0 ? (
        <p className="text-[11px] text-[#A0A0A0]">No time logged yet.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            const profile = profileMap.get(entry.userId);
            const techName = profile
              ? `${profile.firstName} ${profile.lastName}`.trim() || profile.email || 'Unknown'
              : entry.userId.slice(0, 8) + '…';
            const isOwn = entry.userId === currentUserId;
            const canDeleteEntry = isOwn || canManage;

            return (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded-md border border-[#E6E1D4] bg-white px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-[#1A1A1A] truncate">
                      {techName}
                    </span>
                    <span className="text-[11px] text-[#6B6B6B]">·</span>
                    <span className="text-[11px] text-[#6B6B6B]">{entry.date}</span>
                    <span className="ml-auto text-[12px] font-semibold text-[#1A1A1A] flex-shrink-0">
                      {entry.hours} h
                    </span>
                  </div>
                  {entry.note && (
                    <p className="mt-0.5 text-[11px] text-[#6B6B6B] line-clamp-2">
                      {entry.note}
                    </p>
                  )}
                  {entry.role && (
                    <p className="mt-0.5 text-[10px] font-medium text-[#A0A0A0] uppercase tracking-[0.08em]">
                      {entry.role}
                    </p>
                  )}
                </div>
                {canDeleteEntry && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(entry.id)}
                    disabled={deletingId === entry.id}
                    className="flex-shrink-0 rounded p-1 text-[#A0A0A0] hover:bg-[#FBE5E5] hover:text-[#C44545] disabled:opacity-50"
                    aria-label="Delete time entry"
                  >
                    {deletingId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add form (workers + managers) */}
      {canLog && (
        <div className="rounded-md border border-dashed border-[#D8D2C4] bg-[#FAF8F2] px-3 py-2.5 space-y-2">
          <p className="text-[11px] font-semibold text-[#6B6B6B] uppercase tracking-[0.1em]">
            Log time
          </p>

          {/* Manager tech picker */}
          {canManage && internalProfiles.length > 0 && (
            <select
              value={formUserId}
              onChange={(e) => setFormUserId(e.target.value)}
              className={inputField}
              aria-label="Select technician"
            >
              <option value="">My entry (myself)</option>
              {internalProfiles.map((p) => {
                const name = `${p.firstName} ${p.lastName}`.trim() || p.email || p.id;
                const isSelf = p.id === currentUserId;
                return (
                  <option key={p.id} value={p.id}>
                    {name}{isSelf ? ' (me)' : ''}
                  </option>
                );
              })}
            </select>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block mb-0.5 text-[10px] font-medium text-[#6B6B6B]">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className={inputField}
              />
            </div>
            <div>
              <label className="block mb-0.5 text-[10px] font-medium text-[#6B6B6B]">Hours</label>
              <input
                type="number"
                inputMode="decimal"
                min={0.25}
                step={0.25}
                value={formHours}
                onChange={(e) => setFormHours(e.target.value)}
                placeholder="0.25"
                className={cn(inputField, 'text-right tabular-nums')}
              />
            </div>
          </div>

          <div>
            <label className="block mb-0.5 text-[10px] font-medium text-[#6B6B6B]">Note (optional)</label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="e.g. Board installation, rough-in"
              className={inputField}
            />
          </div>

          {labourRates.length > 0 && (
            <div>
              <label className="block mb-0.5 text-[10px] font-medium text-[#6B6B6B]">Role (optional)</label>
              <select
                value={formRole}
                onChange={(e) => setFormRole(e.target.value)}
                className={inputField}
                aria-label="Select role"
              >
                <option value="">{"-- role --"}</option>
                {labourRates.map((r) => (
                  <option key={r.id} value={r.role}>{r.role}</option>
                ))}
              </select>
            </div>
          )}

          {saveError && (
            <p className="text-[11px] text-[#C44545]">{saveError}</p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={saving || !formHours}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#246F47] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              {saving ? 'Saving…' : 'Add entry'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
