2// frontend/src/pages/gantt/tabs/TaskDrawingsPane.tsx
//
// Drawings & Permits panel. Two modes:
//   • Task-scoped: pass `task` — list/upload drawings attached to that task.
//   • Project-wide: omit `task` — list/upload drawings attached to the
//     project (no task_id). Mounted on TasksTab.tsx above the schedule grid.
//
// Data lives in the existing `photos` table so we get free Supabase storage,
// signed URLs, and project + task scoping. Drawings are distinguished from
// regular photos via `notes = '__drawing__'`; `phase_hint` carries the
// Foundation / Framing / Electrical / General tag.

import { useCallback, useEffect, useRef, useState } from 'react';
import { format, parseISO } from 'date-fns';
import {
  ExternalLink, FileText, Image as ImageIcon, Lock, MoreHorizontal,
  Trash2, Upload as UploadIcon, X,
} from 'lucide-react';
import type { ConstructionPhase, Task, User } from '../../../types';
import { canUploadPhotos } from '../../../lib/permissions';
import { deletePhoto, getPhotoUrl, listPhotos, uploadPhoto, type PhotoRow } from '../../../lib/api/photos';
import { supabaseConfigured } from '../../../lib/supabase';

const DRAWING_MARKER = '__drawing__';

// Phase palette — matches the editorial site-diary palette. "General" is the
// catch-all for drawings without an explicit construction phase.
type DrawingPhase = ConstructionPhase | 'general';
const PHASE_ORDER: DrawingPhase[] = [
  'foundation', 'framing', 'electrical', 'plumbing',
  'drywall', 'finishing', 'roofing', 'excavation', 'general',
];

interface PhaseStyle {
  label: string;
  cardBg: string;       // Tailwind bg classes for the preview block
  dot: string;          // dot color for the chip
  chip: string;         // chip background + text
  ink: string;          // accent ink for icons / borders on the preview
}

const PHASE_STYLES: Record<DrawingPhase, PhaseStyle> = {
  foundation: {
    label: 'Foundation',
    cardBg: 'bg-[#E5EBE0]',
    dot:    'bg-[#246F47]',
    chip:   'bg-white text-[#1A1A1A] border-[#E6E1D4]',
    ink:    'text-[#5C7A60]',
  },
  framing: {
    label: 'Framing',
    cardBg: 'bg-[#FBE5E5]',
    dot:    'bg-[#C44545]',
    chip:   'bg-white text-[#1A1A1A] border-[#E6E1D4]',
    ink:    'text-[#C44545]/70',
  },
  electrical: {
    label: 'Electrical',
    cardBg: 'bg-[#FAEBC8]',
    dot:    'bg-[#C8841E]',
    chip:   'bg-white text-[#1A1A1A] border-[#E6E1D4]',
    ink:    'text-[#8C6B2C]',
  },
  plumbing: {
    label: 'Plumbing',
    cardBg: 'bg-[#E5EBF7]',
    dot:    'bg-[#4A5DAD]',
    chip:   'bg-white text-[#1A1A1A] border-[#E6E1D4]',
    ink:    'text-[#4A5DAD]',
  },
  drywall: {
    label: 'Drywall',
    cardBg: 'bg-[#F4F1E8]',
    dot:    'bg-[#9C8B5A]',
    chip:   'bg-white text-[#1A1A1A] border-[#E6E1D4]',
    ink:    'text-[#9C8B5A]',
  },
  finishing: {
    label: 'Finishing',
    cardBg: 'bg-[#EDE5F2]',
    dot:    'bg-[#7B5C9C]',
    chip:   'bg-white text-[#1A1A1A] border-[#E6E1D4]',
    ink:    'text-[#7B5C9C]',
  },
  roofing: {
    label: 'Roofing',
    cardBg: 'bg-[#F2DECC]',
    dot:    'bg-[#A06A3A]',
    chip:   'bg-white text-[#1A1A1A] border-[#E6E1D4]',
    ink:    'text-[#A06A3A]',
  },
  excavation: {
    label: 'Excavation',
    cardBg: 'bg-[#F0E4D2]',
    dot:    'bg-[#8B5E3C]',
    chip:   'bg-white text-[#1A1A1A] border-[#E6E1D4]',
    ink:    'text-[#8B5E3C]',
  },
  general: {
    label: 'General',
    cardBg: 'bg-[#FAF8F2]',
    dot:    'bg-[#6B6B6B]',
    chip:   'bg-white text-[#1A1A1A] border-[#E6E1D4]',
    ink:    'text-[#6B6B6B]',
  },
};

function isDrawing(p: PhotoRow): boolean {
  return typeof p.notes === 'string' && p.notes.startsWith(DRAWING_MARKER);
}

function phaseOf(p: PhotoRow): DrawingPhase {
  const hint = p.phase_hint as DrawingPhase | undefined | null;
  if (hint && hint in PHASE_STYLES) return hint;
  return 'general';
}

function extOf(filename: string): 'pdf' | 'png' | 'jpg' | 'other' {
  const dot = filename.lastIndexOf('.');
  if (dot < 0) return 'other';
  const ext = filename.slice(dot + 1).toLowerCase();
  if (ext === 'pdf') return 'pdf';
  if (ext === 'png') return 'png';
  if (ext === 'jpg' || ext === 'jpeg') return 'jpg';
  return 'other';
}

function formatSize(kb: number): string {
  if (!Number.isFinite(kb) || kb <= 0) return '—';
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function formatUploadedAt(iso: string | null | undefined): string {
  if (!iso) return '—';
  try {
    return format(parseISO(iso), 'MMM d');
  } catch {
    return '—';
  }
}

function shortLabel(filename: string): string {
  const dot = filename.lastIndexOf('.');
  if (dot <= 0) return filename;
  return filename.slice(0, dot);
}

interface TaskDrawingsPaneProps {
  /** Task to attach drawings to. Omit for project-wide drawings. */
  task?: Task;
  projectId: string;
  currentUser: User | null;
  readOnly?: boolean;
  /** Render the "Manage all →" button in the top-right (project-wide only). */
  showManageAll?: boolean;
  /** Called when the user clicks "Manage all →". Decorative if unset. */
  onManageAll?: () => void;
}

export function TaskDrawingsPane({
  task, projectId, currentUser, readOnly, showManageAll, onManageAll,
}: TaskDrawingsPaneProps) {
  const canUpload = !readOnly && canUploadPhotos(currentUser);
  const taskId = task?.id;
  const defaultPhase = task?.phase as ConstructionPhase | undefined;

  const [drawings, setDrawings] = useState<PhotoRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [menuOpenId, setMenuOpenId] = useState<string | null>(null);
  const [pickerForId, setPickerForId] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Initial load + reload when the (project, task) identity changes. In
  // project-wide mode `taskId` is undefined — listPhotos then returns every
  // photo for the project; the isDrawing filter still narrows to drawings.
  useEffect(() => {
    let alive = true;
    if (!supabaseConfigured()) {
      setDrawings([]);
      return () => { alive = false; };
    }
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const rows = await listPhotos(projectId, taskId);
        if (!alive) return;
        // Project-wide mode: only keep drawings that actually have no taskId,
        // so we don't surface every task's drawings on the schedule header.
        const filtered = taskId
          ? rows.filter(isDrawing)
          : rows.filter((p) => isDrawing(p) && !p.task_id);
        setDrawings(filtered);
      } catch (e) {
        if (alive) setError(e instanceof Error ? e.message : 'Could not load drawings.');
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [projectId, taskId]);

  const triggerPicker = useCallback(() => inputRef.current?.click(), []);

  const handleFiles = useCallback(async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    if (!supabaseConfigured()) {
      setError('Uploads need Supabase env keys to be set.');
      return;
    }
    setBusy(true);
    setError(null);
    const uploaded: PhotoRow[] = [];
    try {
      for (const file of Array.from(files)) {
        const ext = extOf(file.name);
        if (ext === 'other') {
          setError(`${file.name}: only PDF, PNG, or JPG supported.`);
          continue;
        }
        const row = await uploadPhoto({
          file,
          projectId,
          taskId,
          notes: DRAWING_MARKER,
          phaseHint: defaultPhase,
        });
        uploaded.push(row);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
      if (uploaded.length > 0) setDrawings((prev) => [...uploaded, ...prev]);
    }
  }, [projectId, taskId, defaultPhase]);

  const handleOpen = useCallback(async (row: PhotoRow) => {
    try {
      const url = await getPhotoUrl(row.storage_path);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open file.');
    }
  }, []);

  const handleRemove = useCallback(async (row: PhotoRow) => {
    setMenuOpenId(null);
    if (!supabaseConfigured()) return;
    try {
      await deletePhoto(row);
      setDrawings((prev) => prev.filter((d) => d.id !== row.id));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not delete drawing.');
    }
  }, []);

  const handleChangePhase = useCallback(async (row: PhotoRow, next: DrawingPhase) => {
    if (!supabaseConfigured()) return;
    setPickerForId(null);
    setMenuOpenId(null);
    const prev = drawings;
    setDrawings(prev.map((d) => (d.id === row.id ? { ...d, phase_hint: next === 'general' ? null : next } : d)));
    try {
      const { supabase } = await import('../../../lib/supabase');
      const { error: updateError } = await supabase
        .from('photos')
        .update({ phase_hint: next === 'general' ? null : next })
        .eq('id', row.id);
      if (updateError) throw updateError;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not update phase.');
      setDrawings(prev);          // roll back the optimistic update
    }
  }, [drawings]);

  const count = drawings.length;

  return (
    <div className="space-y-3">
      {/* Section header */}
      <div className="flex items-center gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.14em] text-[#6B6B6B] font-semibold">
          <span className="h-px w-4 bg-[#A0A0A0]" />
          Drawings &amp; Permits
        </div>
        <span className="text-[12px] text-[#6B6B6B]">
          · {count === 0 ? 'No documents yet' : `${count} document${count === 1 ? '' : 's'} on file`}
        </span>
        {showManageAll ? (
          <button
            type="button"
            onClick={onManageAll}
            className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-[#E6E1D4] bg-white text-[12px] font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2]"
          >
            Manage all
            <span aria-hidden="true">→</span>
          </button>
        ) : null}
      </div>

      {error ? (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}

      {!supabaseConfigured() ? (
        <div className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
          Drawings need Supabase env keys. Set <code>VITE_SUPABASE_URL</code> and{' '}
          <code>VITE_SUPABASE_ANON_KEY</code> in <code>frontend/.env.local</code>.
        </div>
      ) : null}

      {/* Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
        {drawings.map((row) => {
          const phase = phaseOf(row);
          const style = PHASE_STYLES[phase];
          const ext = extOf(row.filename);
          const extBadge = ext === 'pdf' ? 'PDF' : ext === 'png' ? 'PNG' : ext === 'jpg' ? 'JPG' : 'FILE';
          const extColor = ext === 'pdf' ? 'bg-[#C44545]' : ext === 'png' ? 'bg-[#4A5DAD]' : 'bg-[#246F47]';
          const Icon = ext === 'pdf' ? FileText : ImageIcon;
          return (
            <div
              key={row.id}
              className="group relative flex flex-col rounded-[12px] border border-[#E6E1D4] bg-white overflow-hidden shadow-[0_1px_2px_rgba(20,20,20,0.04)] hover:shadow-[0_2px_8px_rgba(20,20,20,0.06)] transition-shadow"
            >
              {/* Preview */}
              <button
                type="button"
                onClick={() => handleOpen(row)}
                className={`relative aspect-[5/3] grid place-items-center ${style.cardBg} hover:brightness-95 transition`}
                aria-label={`Open ${row.filename}`}
              >
                <span className={`absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-0.5 rounded-md ${extColor} text-white text-[10.5px] font-semibold tracking-wide`}>
                  {extBadge}
                </span>
                <Icon className={`h-9 w-9 ${style.ink}`} aria-hidden="true" />
                {/* Subtle hover indicator */}
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-md bg-white/0 group-hover:bg-white/90 text-[10px] text-slate-700 transition-colors">
                  <ExternalLink className="h-3 w-3" />
                </span>
                {/* Phase chip overlapping bottom-left */}
                <span
                  className={`absolute -bottom-2.5 left-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium ${style.chip} shadow-[0_1px_2px_rgba(20,20,20,0.06)]`}
                  onClick={(e) => {
                    e.stopPropagation();
                    if (!canUpload) return;
                    setPickerForId((id) => (id === row.id ? null : row.id));
                  }}
                  role={canUpload ? 'button' : undefined}
                  tabIndex={canUpload ? 0 : -1}
                >
                  <span className={`w-1.5 h-1.5 rounded-full ${style.dot}`} />
                  {style.label}
                </span>
              </button>

              {/* Body */}
              <div className="px-3 pt-4 pb-3 flex items-start gap-2">
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-semibold text-[#1A1A1A] truncate">{shortLabel(row.filename)}</div>
                  <div className="text-[11.5px] text-[#6B6B6B] mt-0.5">
                    {formatSize(row.file_size_kb)} · {formatUploadedAt(row.uploaded_at)}
                  </div>
                </div>
                {canUpload ? (
                  <div className="relative">
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setMenuOpenId((id) => (id === row.id ? null : row.id));
                      }}
                      className="p-1 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100"
                      aria-label="More options"
                    >
                      <MoreHorizontal className="h-4 w-4" />
                    </button>
                    {menuOpenId === row.id ? (
                      <div
                        className="absolute right-0 mt-1 w-44 rounded-md border border-slate-200 bg-white shadow-lg z-10 overflow-hidden"
                        onClick={(e) => e.stopPropagation()}
                      >
                        <button
                          type="button"
                          onClick={() => { setMenuOpenId(null); handleOpen(row); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          <ExternalLink className="h-3 w-3" />
                          Open
                        </button>
                        <button
                          type="button"
                          onClick={() => { setPickerForId(row.id); setMenuOpenId(null); }}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-slate-700 hover:bg-slate-50"
                        >
                          Change phase
                        </button>
                        <button
                          type="button"
                          onClick={() => handleRemove(row)}
                          className="flex w-full items-center gap-2 px-3 py-2 text-xs text-red-600 hover:bg-red-50"
                        >
                          <Trash2 className="h-3 w-3" />
                          Delete
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>

              {/* Inline phase picker */}
              {pickerForId === row.id ? (
                <div className="border-t border-slate-100 px-3 py-2 bg-[#FAF8F2]">
                  <div className="flex items-center justify-between mb-1.5">
                    <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-slate-500">
                      Set phase
                    </span>
                    <button
                      type="button"
                      onClick={() => setPickerForId(null)}
                      className="p-0.5 rounded text-slate-400 hover:text-slate-700"
                      aria-label="Close phase picker"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-1">
                    {PHASE_ORDER.map((p) => {
                      const ps = PHASE_STYLES[p];
                      const isOn = phaseOf(row) === p;
                      return (
                        <button
                          key={p}
                          type="button"
                          onClick={() => handleChangePhase(row, p)}
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10.5px] font-medium transition-colors ${
                            isOn
                              ? 'bg-[#1A1A1A] text-white border-[#1A1A1A]'
                              : 'bg-white text-[#3A3A3A] border-[#E6E1D4] hover:bg-slate-50'
                          }`}
                        >
                          <span className={`w-1.5 h-1.5 rounded-full ${ps.dot}`} />
                          {ps.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}

        {/* Add tile */}
        {canUpload ? (
          <button
            type="button"
            onClick={triggerPicker}
            disabled={busy}
            className="aspect-[5/3] sm:aspect-auto sm:min-h-[180px] flex flex-col items-center justify-center gap-2 rounded-[12px] border-2 border-dashed border-[#D6CDB7] bg-[#FAF8F2] px-4 py-6 text-slate-600 hover:border-emerald-400 hover:bg-emerald-50/40 hover:text-slate-900 disabled:opacity-60 transition-colors"
          >
            <span className="w-10 h-10 rounded-md bg-white border border-[#E6E1D4] grid place-items-center">
              <UploadIcon className="h-4 w-4 text-emerald-600" />
            </span>
            <span className="text-[13px] font-semibold">{busy ? 'Uploading…' : 'Add a drawing'}</span>
            <span className="text-[11px] text-[#6B6B6B]">Drop file or click to browse</span>
            <div className="mt-1 flex items-center gap-1">
              <span className="px-1.5 py-0.5 rounded-md bg-white border border-[#E6E1D4] text-[10px] font-semibold text-[#6B6B6B] tracking-wide">PDF</span>
              <span className="px-1.5 py-0.5 rounded-md bg-white border border-[#E6E1D4] text-[10px] font-semibold text-[#6B6B6B] tracking-wide">PNG</span>
              <span className="px-1.5 py-0.5 rounded-md bg-white border border-[#E6E1D4] text-[10px] font-semibold text-[#6B6B6B] tracking-wide">JPG</span>
            </div>
          </button>
        ) : null}

        <input
          ref={inputRef}
          type="file"
          multiple
          accept=".pdf,application/pdf,image/png,image/jpeg"
          onChange={(e) => { void handleFiles(e.target.files); }}
          className="hidden"
        />
      </div>

      {/* Empty / loading hints — only when no add tile is visible either */}
      {!canUpload && drawings.length === 0 && !loading ? (
        <div className="flex items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
          <Lock className="h-3.5 w-3.5 text-slate-400" />
          Your role can view drawings but not upload to this task.
        </div>
      ) : null}
      {loading && drawings.length === 0 ? (
        <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50/60 px-4 py-6 text-center text-sm text-slate-400">
          Loading drawings…
        </p>
      ) : null}
    </div>
  );
}
