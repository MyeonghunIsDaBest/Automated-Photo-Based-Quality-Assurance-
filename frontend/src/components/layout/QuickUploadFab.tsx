// QuickUploadFab — persistent floating action button for fast photo upload +
// AI auto-analysis. Mounts in Layout so it's available from any authenticated
// page that has an active project. Hidden on the login screen and on routes
// where there's no active project.
//
// Flow:
//   1. Tap FAB → modal opens with task picker + dropzone.
//   2. User picks files + (optionally) a task.
//   3. Upload runs. In live mode → Supabase Storage. In mock mode → synthesised
//      Photo objects pushed into the local store.
//   4. After upload, the Mock-AI batch fires automatically against the project.
//      Both real-AI and mock paths react to the new pending photos.
//
// The FAB stays out of the way: bottom-right with safe-area inset, behind any
// modal stacks (z-30), above page content. The Quick Upload modal itself
// claims z-50 like the rest of the editorial modals.

import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { Camera, X, Upload as UploadIcon, Sparkles, CheckCircle2 } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabaseConfigured } from '../../lib/supabase';
import { uploadPhoto } from '../../lib/api/photos';
import { canUploadPhotos } from '../../lib/permissions';
import { Button } from '../ui/button';
import { FRAUNCES } from '../../pages/gantt/components/ledger';
import type { Photo } from '../../types';

export default function QuickUploadFab() {
  const { isAuthenticated, project, currentUser, tasks, addPhoto } = useAppStore();
  const [open, setOpen] = useState(false);

  // Don't render unless there's an authenticated user + active project. The
  // FAB hides itself rather than appearing disabled — less visual noise on
  // login / settings pages.
  if (!isAuthenticated) return null;
  if (!project.id) return null;
  if (!canUploadPhotos(currentUser)) return null;

  return (
    <>
      {/* Subtle spring on hover/tap layers a tactile feel on top of the existing
          hover:scale and active:scale Tailwind utilities. With framer-motion's
          spring physics the bounce feels physical rather than CSS-cliff. */}
      <motion.button
        type="button"
        onClick={() => setOpen(true)}
        whileHover={{ scale: 1.05 }}
        whileTap={{ scale: 0.94 }}
        transition={{ type: 'spring', damping: 14, stiffness: 360 }}
        className="fixed bottom-6 right-6 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-[#2F8F5C] text-white shadow-[0_8px_28px_rgba(20,20,20,0.18)] ring-4 ring-[#E5F2EA] hover:bg-[#246F47] sm:bottom-8 sm:right-8"
        style={{
          // Clears the phone bottom tab bar (--bottom-nav-h, 0 at md+).
          bottom: 'calc(max(env(safe-area-inset-bottom), 1.5rem) + var(--bottom-nav-h, 0px))',
          right: 'max(env(safe-area-inset-right), 1.5rem)',
        }}
        aria-label="Quick upload"
      >
        <Camera className="h-6 w-6" />
      </motion.button>

      {open && (
        <QuickUploadModal
          onClose={() => setOpen(false)}
          projectId={project.id}
          projectTasks={tasks.filter((t) => t.projectId === project.id && !t.isPhaseAnchor)}
          currentUserId={currentUser?.id ?? 'anon'}
          addPhoto={addPhoto}
        />
      )}
    </>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function QuickUploadModal({
  onClose, projectId, projectTasks, currentUserId, addPhoto,
}: {
  onClose: () => void;
  projectId: string;
  projectTasks: Array<{ id: string; name: string; phase: string }>;
  currentUserId: string;
  addPhoto: (p: Photo) => Promise<void> | void;
}) {
  const [files, setFiles] = useState<File[]>([]);
  const [taskId, setTaskId] = useState<string>('');
  const [autoAnalyse, setAutoAnalyse] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);

  // Real AI fires automatically server-side via the Postgres webhook on
  // `photos` INSERT — no client-side trigger needed. The `autoAnalyse`
  // toggle stays as an informational opt-in (the webhook always runs; the
  // flag is reserved for future per-upload "don't analyse" overrides).

  // ESC closes the modal. Stopping propagation lets nested ESCs (in inputs)
  // behave normally — the listener only fires when nothing else catches it.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  // Drag/drop wire-up. preventDefault is mandatory or the browser navigates
  // away to display the dropped file.
  useEffect(() => {
    const el = dropRef.current;
    if (!el) return;
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      el.classList.add('border-[#2F8F5C]', 'bg-[#E5F2EA]/30');
    };
    const onDragLeave = () => {
      el.classList.remove('border-[#2F8F5C]', 'bg-[#E5F2EA]/30');
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      el.classList.remove('border-[#2F8F5C]', 'bg-[#E5F2EA]/30');
      const list = e.dataTransfer?.files;
      if (list && list.length > 0) {
        addFiles(Array.from(list));
      }
    };
    el.addEventListener('dragover', onDragOver);
    el.addEventListener('dragleave', onDragLeave);
    el.addEventListener('drop', onDrop);
    return () => {
      el.removeEventListener('dragover', onDragOver);
      el.removeEventListener('dragleave', onDragLeave);
      el.removeEventListener('drop', onDrop);
    };
  }, []);

  const addFiles = (incoming: File[]) => {
    const images = incoming.filter((f) => f.type.startsWith('image/') || f.type.startsWith('video/'));
    if (images.length < incoming.length) {
      setError('Some files were skipped (only images / video are accepted).');
    }
    setFiles((prev) => [...prev, ...images]);
  };

  const removeFile = (idx: number) => {
    setFiles((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleUpload = async () => {
    if (files.length === 0) return;
    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      if (supabaseConfigured()) {
        // Live path — push each file through the API. Realtime echoes the
        // INSERT back into the store via Layout's subscriptions.
        for (const file of files) {
          // eslint-disable-next-line no-await-in-loop
          await uploadPhoto({
            file,
            projectId,
            taskId: taskId || undefined,
          });
        }
      } else {
        // Mock-mode path — synthesise Photo objects and push to the store.
        // Object URLs are fine here (they live for the tab session); the
        // Mock-AI runner reads from these directly.
        for (const file of files) {
          const photo: Photo = {
            id: `quick_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
            projectId,
            taskId: taskId || undefined,
            uploadedBy: currentUserId,
            filename: file.name,
            storageUrl: URL.createObjectURL(file),
            fileSizeKb: Math.round(file.size / 1024),
            width: 1600,
            height: 1200,
            uploadedAt: new Date().toISOString(),
            aiAnalyzed: false,
          };
          // eslint-disable-next-line no-await-in-loop
          await addPhoto(photo);
        }
      }

      setSuccess(`Uploaded ${files.length} ${files.length === 1 ? 'photo' : 'photos'}.`);
      setFiles([]);

      // Real AI runs server-side on photo INSERT; no client-side trigger.
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-[#1A1A1A]/40 p-2 sm:items-center sm:p-4"
      onClick={busy ? undefined : onClose}
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-upload-title"
    >
      <div
        className="flex max-h-[90dvh] w-full max-w-lg flex-col overflow-hidden rounded-[14px] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)] sm:max-h-none"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-center justify-between border-b border-[#E6E1D4] px-5 py-4">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
              Quick upload
            </p>
            <h2
              id="quick-upload-title"
              className="text-base font-semibold text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES }}
            >
              Drop photos, AI handles the rest.
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={busy}
            className="inline-flex h-9 w-9 items-center justify-center rounded-md text-[#A0A0A0] hover:bg-[#FAF8F2] hover:text-[#3A3A3A] disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="editorial-scrollbox flex-1 space-y-4 px-5 py-4">
          {/* Task picker */}
          <div>
            <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
              Attach to task
            </label>
            <select
              value={taskId}
              onChange={(e) => setTaskId(e.target.value)}
              className="block w-full rounded-md border border-[#E6E1D4] bg-white px-3 py-2 text-sm text-[#3A3A3A] shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              disabled={busy}
            >
              <option value="">— Project-wide —</option>
              {projectTasks.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.phase})
                </option>
              ))}
            </select>
            <p className="mt-1 text-[10px] text-[#A0A0A0]">
              Picking a task makes the AI bump that task's % directly. Leave blank for project-wide uploads.
            </p>
          </div>

          {/* Dropzone */}
          <div
            ref={dropRef}
            onClick={() => !busy && inputRef.current?.click()}
            className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-[14px] border-2 border-dashed border-[#E6E1D4] px-4 py-6 text-center text-sm text-[#3A3A3A] transition-colors hover:border-[#2F8F5C] hover:bg-[#E5F2EA]/30"
          >
            <UploadIcon className="h-6 w-6 text-[#A0A0A0]" />
            <p>
              <span className="font-medium text-[#1A1A1A]">Tap to choose</span> or drag photos here
            </p>
            <p className="text-[10px] text-[#A0A0A0]">Images and videos · up to 25MB each</p>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="image/*,video/mp4,video/quicktime"
              onChange={(e) => {
                if (e.target.files) addFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>

          {files.length > 0 && (
            <div className="space-y-1.5">
              <p className="text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
                Queued ({files.length})
              </p>
              <ul className="divide-y divide-[#EFEBE0] rounded-md border border-[#E6E1D4]">
                {files.map((f, idx) => (
                  <li key={idx} className="flex items-center gap-2 px-3 py-2 text-sm">
                    <span className="min-w-0 flex-1 truncate text-[#3A3A3A]">{f.name}</span>
                    <span className="flex-shrink-0 text-[10px] text-[#A0A0A0]">
                      {(f.size / 1024).toFixed(0)} KB
                    </span>
                    <button
                      type="button"
                      onClick={() => removeFile(idx)}
                      disabled={busy}
                      className="text-[#A0A0A0] hover:text-[#C44545] disabled:opacity-30"
                      aria-label={`Remove ${f.name}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Auto-analyse toggle */}
          <label className="flex cursor-pointer items-start gap-2 rounded-[14px] border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2.5">
            <input
              type="checkbox"
              checked={autoAnalyse}
              onChange={(e) => setAutoAnalyse(e.target.checked)}
              className="mt-0.5 h-3.5 w-3.5 accent-[#2F8F5C]"
              disabled={busy}
            />
            <div>
              <p className="flex items-center gap-1.5 text-sm font-medium text-[#1A1A1A]">
                <Sparkles className="h-3.5 w-3.5 text-[#2F8F5C]" />
                Analyse with AI after upload
              </p>
              <p className="mt-0.5 text-[11px] text-[#6B6B6B]">
                Runs the mock detector against any pending photo on this project. New uploads auto-bump task progress when confidence is high.
              </p>
            </div>
          </label>

          {(error || success) && (
            <div
              className={`rounded-[14px] border px-3 py-2 text-xs ${
                error
                  ? 'border-[#C44545]/30 bg-[#FBE5E5] text-[#C44545]'
                  : 'border-[#2F8F5C]/30 bg-[#E5F2EA] text-[#246F47]'
              }`}
            >
              <div className="flex items-center gap-1.5">
                {error ? <X className="h-3 w-3" /> : <CheckCircle2 className="h-3 w-3" />}
                {error ?? success}
              </div>
            </div>
          )}

        </div>

        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-[#E6E1D4] px-5 py-3">
          <p className="text-[11px] text-[#A0A0A0]">
            {supabaseConfigured() ? 'Uploads to Supabase Storage.' : 'Demo mode — files stay in this browser.'}
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" onClick={onClose} disabled={busy}>
              {success ? 'Done' : 'Cancel'}
            </Button>
            <Button onClick={handleUpload} disabled={busy || files.length === 0}>
              {busy ? 'Uploading…' : `Upload ${files.length || ''}`.trim()}
            </Button>
          </div>
        </footer>
      </div>
    </div>
  );
}
