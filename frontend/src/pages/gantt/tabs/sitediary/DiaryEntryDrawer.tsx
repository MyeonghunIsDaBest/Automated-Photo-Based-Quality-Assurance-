// frontend/src/pages/gantt/tabs/sitediary/DiaryEntryDrawer.tsx
//
// Create / edit a Site Diary entry. Modeled on TaskDrawer's autosave-on-blur
// pattern; uses MotionDrawer for the side-sheet/bottom-sheet shell.

import { useEffect, useMemo, useRef, useState } from 'react';
import { Camera, Plus, Sparkles, Trash2, X, Sun, Cloud, CloudRain, CloudSnow, Zap } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import MotionDrawer from '../../../../components/ui/MotionDrawer';
import { Button } from '../../../../components/ui/button';
import { inputField } from '../../components/ledger';
import { cn } from '../../../../lib/cn';
import { useGanttSideStore } from '../../store';
import { uploadAndAttach } from './uploadDiaryPhoto';
import { uploadPhoto } from '../../../../lib/api/photos';
import { detectConditions } from '../../../../lib/api/diaryConditions';
import { createPunchItem } from '../../../../lib/api/punchItems';
import { TimelinePhotoThumb } from './TimelinePhotoThumb';
import { PhotoUploadRing, type PhotoUploadStatus } from './PhotoUploadRing';
import { WORKER_COLORS, COMMON_WORKS } from './mockTimeline';
import { colorIndexForWorker } from './diaryRowMapper';
import { SparkyAssistModal } from './SparkyAssistModal';
import type { DiaryEntry, DiaryPersonnel, DiaryStatus, WeatherKind } from '../../types';
import type { User } from '../../../../types';

interface DiaryEntryDrawerProps {
  open: boolean;
  mode: 'new' | 'edit';
  entry: DiaryEntry | null;
  projectId: string;
  currentUser: User | null;
  todayISO: string;
  pendingPhoto?: File | null;
  seedTags?: string[];
  usageByName?: Record<string, number>;
  autoOpenSparky?: boolean;
  onClose: () => void;
}

const STATUS_OPTIONS: Array<{ value: DiaryStatus; label: string; pill: string }> = [
  { value: 'pending', label: 'Pending', pill: 'bg-[#F9EFD9] text-[#C8841E] border-[#E8D8B5]' },
  { value: 'signed',  label: 'Signed',  pill: 'bg-[#E5F2EA] text-[#246F47] border-[#C8E0D2]' },
  { value: 'flagged', label: 'Flagged', pill: 'bg-[#FBE5E5] text-[#C44545] border-[#F0C8C8]' },
];

const WEATHER_CHIPS: Array<{ value: WeatherKind; Icon: typeof Sun; label: string }> = [
  { value: 'sunny',  Icon: Sun,       label: 'Sunny'  },
  { value: 'cloudy', Icon: Cloud,     label: 'Cloudy' },
  { value: 'rain',   Icon: CloudRain, label: 'Rain'   },
  { value: 'storm',  Icon: CloudSnow, label: 'Storm'  },
];

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '—';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function nowHHmm(): string {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function DiaryEntryDrawer({
  open, mode, entry, projectId, currentUser, todayISO,
  pendingPhoto, seedTags, usageByName, autoOpenSparky, onClose,
}: DiaryEntryDrawerProps) {
  const addDiaryEntry      = useGanttSideStore((s) => s.addDiaryEntry);
  const updateDiaryEntry   = useGanttSideStore((s) => s.updateDiaryEntry);
  const removeDiaryEntry   = useGanttSideStore((s) => s.removeDiaryEntry);
  const addDiaryPersonnel  = useGanttSideStore((s) => s.addDiaryPersonnel);
  const removeDiaryPersonnel = useGanttSideStore((s) => s.removeDiaryPersonnel);

  const isCreate = mode === 'new';

  // ── Local draft state. In create mode we accumulate everything client-side
  //    and commit at "Create entry". In edit mode each input commits on blur.
  const [description, setDescription] = useState('');
  const [startTime, setStartTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [status, setStatus] = useState<DiaryStatus>('pending');
  const [weather, setWeather] = useState<WeatherKind>('sunny');
  const [tempC, setTempC] = useState<string>('');
  const [tags, setTags] = useState<string[]>([]);
  const [draftPersonnel, setDraftPersonnel] = useState<DiaryPersonnel[]>([]);
  const [tagDraft, setTagDraft] = useState('');
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [newPerson, setNewPerson] = useState<{ name: string; role: string; company: string; hours: string }>({
    name: '', role: '', company: '', hours: '',
  });

  // Create-mode photo buffer: files held in memory until "Create entry" is
  // clicked, then uploaded in one batch with photoIds attached on the new
  // entry. Edit mode bypasses this — its photos pane uploads directly.
  const [draftPhotoFiles, setDraftPhotoFiles] = useState<File[]>([]);
  const [draftPhotoUrls, setDraftPhotoUrls] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);
  // Per-photo upload status (create-mode batch). Keyed by index in
  // draftPhotoFiles. Drives the progress rings + retry affordance.
  const [uploadStates, setUploadStates] = useState<Record<number, { status: PhotoUploadStatus; progress: number; photoId?: string }>>({});
  const sawUploadFailureRef = useRef(false);

  // Sparky writing assistant — opens as a modal layered over the drawer.
  const [sparkyOpen, setSparkyOpen] = useState(false);
  const autoOpenedRef = useRef(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const seededPendingRef = useRef(false);

  // AI auto-detect (conditions) — on the first photo attached in create mode,
  // detect-diary-conditions reads weather/temp/crew and pre-fills them with a
  // dismissable "AI suggested" tag. Fires once per drawer open. No-op unless
  // the project opted in (Edge Function gates on ai_auto_detect_enabled).
  const [aiSuggested, setAiSuggested] = useState<Set<'weather' | 'temp' | 'crew'>>(() => new Set());
  const [aiCrewCount, setAiCrewCount] = useState<number | null>(null);
  const autoDetectFiredRef = useRef(false);

  const runAutoDetect = async (file: File) => {
    if (autoDetectFiredRef.current) return;
    autoDetectFiredRef.current = true;
    try {
      const res = await detectConditions({ projectId, file });
      if (res.skipped) return;
      const flagged = new Set<'weather' | 'temp' | 'crew'>();
      setWeather(res.weather);
      flagged.add('weather');
      if (res.temperatureC != null) {
        setTempC(String(res.temperatureC));
        flagged.add('temp');
      }
      if (res.crewCount > 0) {
        setAiCrewCount(res.crewCount);
        flagged.add('crew');
      }
      setAiSuggested(flagged);
    } catch {
      // Best-effort — a detection failure never blocks the entry.
    }
  };

  const dismissSuggestion = (key: 'weather' | 'temp' | 'crew') => {
    // Keep the value, drop the tag.
    setAiSuggested((prev) => {
      if (!prev.has(key)) return prev;
      const next = new Set(prev);
      next.delete(key);
      return next;
    });
  };

  // ── Hydrate drafts whenever the drawer opens or the underlying entry id
  //    changes. seededPendingRef gate makes sure pendingPhoto is only
  //    consumed once per open.
  useEffect(() => {
    if (!open) {
      seededPendingRef.current = false;
      setConfirmDelete(false);
      setUploadError(null);
      setShowAddPerson(false);
      return;
    }
    if (entry) {
      setDescription(entry.description ?? '');
      setStartTime(entry.startTime ?? '');
      setEndTime(entry.endTime ?? '');
      setStatus(entry.status ?? 'pending');
      setWeather(entry.weather ?? 'sunny');
      setTempC(entry.temperatureC == null ? '' : String(entry.temperatureC));
      setTags(entry.tags ?? []);
      setDraftPersonnel(entry.personnel);
    } else {
      // New entry — stamp the current time so the user doesn't have to type
      // it. End time stays blank for "still on site".
      setDescription('');
      setStartTime(nowHHmm());
      setEndTime('');
      setStatus('pending');
      setWeather('sunny');
      setTempC('');
      setTags(seedTags ?? []);
      setDraftPersonnel(currentUser ? [{
        id: 'draft-primary',
        workerId: currentUser.id,
        workerName: currentUser.fullName,
        hours: 0,
        role: currentUser.role ?? 'worker',
        company: 'Casone Electrical',
      }] : []);
    }
    setTagDraft('');
  }, [open, entry?.id, currentUser?.id]);

  // Seed the create-mode photo buffer from the FAB / QuickAdd hand-off
  // exactly once per open. Object URLs are kept for previews.
  useEffect(() => {
    if (!open || !isCreate || !pendingPhoto || seededPendingRef.current) return;
    seededPendingRef.current = true;
    const url = URL.createObjectURL(pendingPhoto);
    setDraftPhotoFiles((prev) => [...prev, pendingPhoto]);
    setDraftPhotoUrls((prev) => [...prev, url]);
    // FAB / QuickAdd hand-off is the day's first photo — auto-detect too.
    void runAutoDetect(pendingPhoto);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, isCreate, pendingPhoto]);

  // Reset the photo buffer when the drawer is fully closed, and revoke any
  // outstanding Object URLs.
  useEffect(() => {
    if (open) return;
    draftPhotoUrls.forEach((u) => URL.revokeObjectURL(u));
    setDraftPhotoFiles([]);
    setDraftPhotoUrls([]);
    setCreating(false);
    setSparkyOpen(false);
    autoOpenedRef.current = false;
    autoDetectFiredRef.current = false;
    setAiSuggested(new Set());
    setAiCrewCount(null);
    setUploadStates({});
    sawUploadFailureRef.current = false;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // Open Sparky automatically when the drawer was launched from the empty-state
  // "Ask Sparky" button (autoOpenSparky=true). One-shot per drawer open.
  useEffect(() => {
    if (!open || !autoOpenSparky || autoOpenedRef.current) return;
    autoOpenedRef.current = true;
    setSparkyOpen(true);
  }, [open, autoOpenSparky]);

  const drawerTitle = useMemo(() => {
    if (isCreate) return 'New entry';
    const d = entry?.date ?? todayISO;
    try {
      return `Diary entry · ${format(parseISO(d), 'MMM d, yyyy')}`;
    } catch {
      return 'Diary entry';
    }
  }, [isCreate, entry?.date, todayISO]);

  // ── Edit-mode field commits. Each input calls commit<Field> on blur.
  const commitDescription = () => {
    if (!entry || description === entry.description) return;
    updateDiaryEntry(projectId, entry.id, { description });
  };
  const commitStartTime = () => {
    if (!entry || startTime === (entry.startTime ?? '')) return;
    updateDiaryEntry(projectId, entry.id, { startTime: startTime || undefined });
  };
  const commitEndTime = () => {
    if (!entry || endTime === (entry.endTime ?? '')) return;
    updateDiaryEntry(projectId, entry.id, { endTime: endTime || undefined });
  };
  const commitStatus = (next: DiaryStatus) => {
    setStatus(next);
    if (entry) updateDiaryEntry(projectId, entry.id, { status: next });
  };
  const commitWeather = (next: WeatherKind) => {
    setWeather(next);
    if (entry) updateDiaryEntry(projectId, entry.id, { weather: next });
  };
  const commitTemp = () => {
    if (!entry) return;
    const trimmed = tempC.trim();
    const next: number | undefined = trimmed === '' ? undefined : Number(trimmed);
    if (next != null && !Number.isFinite(next)) return;
    if ((entry.temperatureC ?? undefined) === next) return;
    updateDiaryEntry(projectId, entry.id, { temperatureC: next });
  };
  const commitTags = (next: string[]) => {
    setTags(next);
    if (entry) updateDiaryEntry(projectId, entry.id, { tags: next });
  };

  const addTag = (raw: string) => {
    const name = raw.trim();
    if (!name) return;
    if (tags.includes(name)) return;
    commitTags([...tags, name]);
    setTagDraft('');
  };
  const removeTag = (name: string) => {
    commitTags(tags.filter((t) => t !== name));
  };
  const toggleTemplateTag = (name: string) => {
    if (tags.includes(name)) {
      commitTags(tags.filter((t) => t !== name));
    } else {
      commitTags([...tags, name]);
    }
  };

  // Order templates: most-used this week first, then catalog order.
  const orderedTemplates = useMemo(() => {
    const counts = usageByName ?? {};
    return [...COMMON_WORKS].sort((a, b) => {
      const ca = counts[a.name] ?? 0;
      const cb = counts[b.name] ?? 0;
      if (cb !== ca) return cb - ca;
      return 0;     // stable — preserve catalog order on ties
    });
  }, [usageByName]);

  // ── Personnel: in edit mode, mutations go through the store immediately;
  //    in create mode they stay in draftPersonnel until commit.
  const handlePrimaryHoursChange = (raw: string) => {
    const hours = Math.max(0, Number(raw) || 0);
    const next = [...draftPersonnel];
    if (!next[0]) return;
    next[0] = { ...next[0], hours };
    setDraftPersonnel(next);
    if (entry) {
      updateDiaryEntry(projectId, entry.id, { personnel: next });
    }
  };
  const handleAdditionalHoursChange = (idx: number, raw: string) => {
    if (idx === 0) return;
    const hours = Math.max(0, Number(raw) || 0);
    const next = [...draftPersonnel];
    if (!next[idx]) return;
    next[idx] = { ...next[idx], hours };
    setDraftPersonnel(next);
    if (entry) updateDiaryEntry(projectId, entry.id, { personnel: next });
  };
  const handleRemovePerson = (idx: number) => {
    if (draftPersonnel.length <= 1) return;
    const target = draftPersonnel[idx];
    if (entry && target?.id && !target.id.startsWith('draft-')) {
      removeDiaryPersonnel(projectId, entry.id, target.id);
      setDraftPersonnel(draftPersonnel.filter((_, i) => i !== idx));
    } else {
      setDraftPersonnel(draftPersonnel.filter((_, i) => i !== idx));
    }
  };
  const handleAddPerson = () => {
    const name = newPerson.name.trim();
    if (!name) return;
    const hoursNum = Math.max(0, Number(newPerson.hours) || 0);
    const person: Omit<DiaryPersonnel, 'id'> = {
      workerId: `manual-${Date.now()}`,
      workerName: name,
      hours: hoursNum,
      role: newPerson.role.trim() || 'worker',
      company: newPerson.company.trim() || '—',
    };
    if (entry) {
      addDiaryPersonnel(projectId, entry.id, person);
      setDraftPersonnel([...draftPersonnel, { ...person, id: `pending-${Date.now()}` }]);
    } else {
      setDraftPersonnel([...draftPersonnel, { ...person, id: `draft-${Date.now()}` }]);
    }
    setNewPerson({ name: '', role: '', company: '', hours: '' });
    setShowAddPerson(false);
  };

  // ── Photo handling — split between create-mode buffer and edit-mode direct upload.
  const onAddPhotoFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    const accepted: File[] = [];
    for (const file of Array.from(files)) {
      if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) {
        setUploadError(`${file.name}: only images / videos allowed.`);
        continue;
      }
      accepted.push(file);
    }
    if (accepted.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = '';
      return;
    }

    if (isCreate) {
      // Buffer client-side; previews via Object URLs. Upload happens on Create.
      const wasFirst = draftPhotoFiles.length === 0;
      const urls = accepted.map((f) => URL.createObjectURL(f));
      setDraftPhotoFiles((prev) => [...prev, ...accepted]);
      setDraftPhotoUrls((prev) => [...prev, ...urls]);
      setUploadError(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
      // On the first attached photo, ask the AI to read site conditions.
      if (wasFirst) {
        const firstImage = accepted.find((f) => f.type.startsWith('image/'));
        if (firstImage) void runAutoDetect(firstImage);
      }
      return;
    }

    if (!entry) {
      setUploadError('No entry to attach to.');
      return;
    }
    setUploadBusy(true);
    setUploadError(null);
    try {
      for (const file of accepted) {
        await uploadAndAttach({ file, projectId, entry, updateDiaryEntry });
      }
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Upload failed.');
    } finally {
      setUploadBusy(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeDraftPhoto = (idx: number) => {
    setDraftPhotoFiles((prev) => prev.filter((_, i) => i !== idx));
    setDraftPhotoUrls((prev) => {
      const url = prev[idx];
      if (url) URL.revokeObjectURL(url);
      return prev.filter((_, i) => i !== idx);
    });
    // Indices shift on removal — clear per-photo upload state so it re-derives
    // cleanly on the next Create pass.
    setUploadStates({});
    sawUploadFailureRef.current = false;
  };

  // Upload one buffered photo with a perceived-progress ring (storage has no
  // native progress event). Returns the new photoId, or null on failure.
  const uploadOne = async (idx: number, file: File): Promise<string | null> => {
    setUploadStates((s) => ({ ...s, [idx]: { status: 'uploading', progress: 8 } }));
    const timer = window.setInterval(() => {
      setUploadStates((s) => {
        const cur = s[idx];
        if (!cur || cur.status !== 'uploading') return s;
        return { ...s, [idx]: { ...cur, progress: Math.min(90, cur.progress + 12) } };
      });
    }, 150);
    try {
      const photo = await uploadPhoto({ file, projectId });
      window.clearInterval(timer);
      setUploadStates((s) => ({ ...s, [idx]: { status: 'done', progress: 100, photoId: photo.id } }));
      return photo.id;
    } catch {
      window.clearInterval(timer);
      setUploadStates((s) => ({ ...s, [idx]: { status: 'error', progress: 0 } }));
      return null;
    }
  };

  // Per-photo retry from the error ring — re-uploads just that file.
  const retryPhoto = (idx: number) => {
    const file = draftPhotoFiles[idx];
    if (file) void uploadOne(idx, file);
  };

  // ── Create / delete final actions.
  const canCreate = description.trim().length > 0 || draftPersonnel.length > 0 || draftPhotoFiles.length > 0;
  const handleCreate = async () => {
    if (!canCreate || creating) return;
    setCreating(true);
    setUploadError(null);
    try {
      // Upload buffered photos with progress rings. A photo already uploaded
      // on a previous attempt (status 'done') is reused, not re-uploaded.
      const photoIds: string[] = [];
      for (let i = 0; i < draftPhotoFiles.length; i++) {
        const existing = uploadStates[i];
        if (existing?.status === 'done' && existing.photoId) {
          photoIds.push(existing.photoId);
          continue;
        }
        const id = await uploadOne(i, draftPhotoFiles[i]);
        if (id) photoIds.push(id);
      }

      const failedCount = draftPhotoFiles.length - photoIds.length;
      // First time we hit a failure, pause so the user can retry the red
      // rings. A second "Create entry" click then proceeds with the rest —
      // a failed photo never permanently blocks the save.
      if (failedCount > 0 && !sawUploadFailureRef.current) {
        sawUploadFailureRef.current = true;
        setUploadError(`${failedCount} photo${failedCount === 1 ? '' : 's'} failed to upload. Retry below, or click Create entry again to save with the rest.`);
        setCreating(false);
        return;
      }

      const tempNum = tempC.trim() === '' ? undefined : Number(tempC);
      addDiaryEntry(projectId, {
        date: entry?.date ?? todayISO,
        description: description.trim(),
        weather,
        temperatureC: tempNum != null && Number.isFinite(tempNum) ? tempNum : undefined,
        personnel: draftPersonnel.map((p) => ({
          ...p,
          id: p.id.startsWith('draft-') ? `pers_${Date.now()}_${Math.random().toString(36).slice(2, 6)}` : p.id,
        })),
        photoIds,
        startTime: startTime || undefined,
        endTime: endTime || undefined,
        status,
        tags,
        createdBy: currentUser?.id ?? 'unknown',
      });
      // A flagged entry auto-creates a punch item so the issue is tracked on
      // the punch list, not just buried in the diary. Fire-and-forget (no-op
      // in mock mode); never blocks the save.
      if (status === 'flagged' && description.trim()) {
        void createPunchItem(projectId, {
          text: `Flagged in site diary: ${description.trim().slice(0, 120)}`,
          createdBy: currentUser?.id ?? 'system',
        }).catch(() => { /* non-fatal — entry still saved */ });
      }
      onClose();
    } catch (e) {
      setUploadError(e instanceof Error ? e.message : 'Could not save entry.');
      setCreating(false);
    }
  };

  const handleDelete = async () => {
    if (!entry) return;
    removeDiaryEntry(projectId, entry.id);
    onClose();
  };

  const livePhotoIds = entry?.photoIds ?? [];

  // Close-guard (E8): Esc / backdrop / X no-op while an upload or the create
  // batch is in flight so a stray dismiss can't orphan a half-written entry.
  // Also bail while Sparky is open: Sparky is a hand-rolled modal (not a
  // MotionDrawer), so it's absent from MotionDrawer's openStack — one Esc would
  // otherwise fire Sparky's close AND this drawer's, discarding an in-progress
  // entry. Programmatic closes after a successful save call onClose directly.
  const guardedClose = () => {
    if (uploadBusy || creating || sparkyOpen) return;
    onClose();
  };

  return (
    <MotionDrawer
      open={open}
      onClose={guardedClose}
      ariaLabel="Site diary entry"
      sizeClass="sm:w-[520px] lg:w-[600px]"
    >
      <div className="flex h-full min-h-0 flex-col">
        {/* Header */}
        <header className="flex items-center justify-between border-b border-[#EFEBE0] px-5 py-3">
          <div>
            <h2 className="text-[17px] font-medium" style={{ fontFamily: "'Fraunces', Georgia, serif" }}>
              {drawerTitle}
            </h2>
            {!isCreate && entry ? (
              <p className="text-[11px] text-[#A0A0A0] mt-0.5">Auto-saves on blur</p>
            ) : null}
          </div>
          <button
            type="button"
            onClick={guardedClose}
            aria-label="Close"
            className="grid min-h-11 min-w-11 place-items-center rounded-md text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4 space-y-5">
          {/* Description */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B]">
                Description
              </label>
              <button
                type="button"
                onClick={() => setSparkyOpen(true)}
                className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full border border-[#E6E1D4] bg-white text-[11.5px] font-semibold text-[#3A3A3A] hover:bg-[#FAF8F2] hover:border-[#2F8F5C]"
              >
                <Sparkles className="h-3 w-3 text-[#C8841E]" />
                Ask Sparky
              </button>
            </div>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onBlur={commitDescription}
              autoFocus={isCreate}
              rows={5}
              placeholder="What happened today? Mention worker, location, milestones, blockers…"
              className={inputField}
            />
          </section>

          {/* Time & status */}
          <section>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B] mb-1.5">
              Time &amp; status
            </label>
            <div className="grid grid-cols-3 gap-2">
              <input
                type="time"
                value={startTime}
                onChange={(e) => setStartTime(e.target.value)}
                onBlur={commitStartTime}
                className={inputField}
              />
              <input
                type="time"
                value={endTime}
                onChange={(e) => setEndTime(e.target.value)}
                onBlur={commitEndTime}
                className={inputField}
              />
              <div className="flex items-center gap-1">
                {STATUS_OPTIONS.map((s) => {
                  const on = status === s.value;
                  return (
                    <button
                      key={s.value}
                      type="button"
                      onClick={() => commitStatus(s.value)}
                      className={`flex-1 px-2 py-1 rounded-full border text-[11px] font-semibold ${
                        on ? s.pill : 'bg-white text-[#6B6B6B] border-[#E6E1D4] hover:bg-[#FAF8F2]'
                      }`}
                    >
                      {s.label}
                    </button>
                  );
                })}
              </div>
            </div>
            {isCreate ? (
              <p className="mt-1 text-[10.5px] text-[#A0A0A0]">
                Start time auto-stamped to now. Edit if needed.
              </p>
            ) : null}
          </section>

          {/* Primary worker */}
          {draftPersonnel[0] ? (
            <section>
              <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B] mb-1.5">
                Primary worker
              </label>
              <div className="flex items-center gap-3 rounded-md border border-[#E6E1D4] px-3 py-2">
                <div
                  className="w-9 h-9 rounded-full grid place-items-center text-white text-[12px] font-semibold"
                  style={{ background: WORKER_COLORS[colorIndexForWorker(draftPersonnel[0].workerId)] }}
                >
                  {initialsFor(draftPersonnel[0].workerName)}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="text-sm font-semibold text-[#1A1A1A] truncate">{draftPersonnel[0].workerName}</div>
                  <div className="text-xs text-[#6B6B6B] truncate">
                    {draftPersonnel[0].role}{draftPersonnel[0].company ? ` · ${draftPersonnel[0].company}` : ''}
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  <input
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step={0.25}
                    value={draftPersonnel[0].hours || ''}
                    onChange={(e) => handlePrimaryHoursChange(e.target.value)}
                    placeholder="0"
                    className={cn(inputField, 'w-16 px-2 py-1 text-right tabular-nums')}
                  />
                  <span className="text-xs text-[#6B6B6B]">h</span>
                </div>
              </div>
            </section>
          ) : null}

          {/* Additional personnel */}
          <section>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B]">
                Additional personnel
              </label>
              <button
                type="button"
                onClick={() => setShowAddPerson((v) => !v)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#2F8F5C] hover:text-[#246F47]"
              >
                <Plus className="h-3 w-3" />
                Add person
              </button>
            </div>
            <div className="space-y-1.5">
              {draftPersonnel.slice(1).map((p, sliceIdx) => {
                const idx = sliceIdx + 1;
                return (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border border-[#E6E1D4] px-3 py-2">
                    <div
                      className="w-7 h-7 rounded-full grid place-items-center text-white text-[10px] font-semibold"
                      style={{ background: WORKER_COLORS[colorIndexForWorker(p.workerId)] }}
                    >
                      {initialsFor(p.workerName)}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-[#1A1A1A] truncate">{p.workerName}</div>
                      <div className="text-[11px] text-[#6B6B6B] truncate">
                        {p.role}{p.company ? ` · ${p.company}` : ''}
                      </div>
                    </div>
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.25}
                      value={p.hours || ''}
                      onChange={(e) => handleAdditionalHoursChange(idx, e.target.value)}
                      placeholder="0"
                      className={cn(inputField, 'w-14 px-2 py-1 text-xs text-right tabular-nums')}
                    />
                    <span className="text-[10px] text-[#6B6B6B]">h</span>
                    <button
                      type="button"
                      onClick={() => handleRemovePerson(idx)}
                      className="p-1 rounded text-[#A0A0A0] hover:text-[#C44545] hover:bg-[#FBE5E5]"
                      aria-label={`Remove ${p.workerName}`}
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                );
              })}
              {showAddPerson ? (
                <div className="rounded-md border border-dashed border-[#D8D2C4] bg-[#FAF8F2] px-3 py-2 space-y-1.5">
                  <input
                    type="text"
                    value={newPerson.name}
                    onChange={(e) => setNewPerson((p) => ({ ...p, name: e.target.value }))}
                    placeholder="Name"
                    className={cn(inputField, 'px-2 py-1 text-xs')}
                  />
                  <div className="grid grid-cols-3 gap-1.5">
                    <input
                      type="text"
                      value={newPerson.role}
                      onChange={(e) => setNewPerson((p) => ({ ...p, role: e.target.value }))}
                      placeholder="Role"
                      className={cn(inputField, 'px-2 py-1 text-xs')}
                    />
                    <input
                      type="text"
                      value={newPerson.company}
                      onChange={(e) => setNewPerson((p) => ({ ...p, company: e.target.value }))}
                      placeholder="Company"
                      className={cn(inputField, 'px-2 py-1 text-xs')}
                    />
                    <input
                      type="number"
                      inputMode="decimal"
                      min={0}
                      step={0.25}
                      value={newPerson.hours}
                      onChange={(e) => setNewPerson((p) => ({ ...p, hours: e.target.value }))}
                      placeholder="Hours"
                      className={cn(inputField, 'px-2 py-1 text-xs text-right tabular-nums')}
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button variant="outline" size="sm" onClick={() => setShowAddPerson(false)}>Cancel</Button>
                    <Button size="sm" onClick={handleAddPerson} disabled={!newPerson.name.trim()}>Add</Button>
                  </div>
                </div>
              ) : null}
              {draftPersonnel.length <= 1 && !showAddPerson ? (
                <p className="text-[11px] text-[#A0A0A0]">Just one worker on this entry. Use Add person to log a crew.</p>
              ) : null}
            </div>
          </section>

          {/* Conditions */}
          <section>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B] mb-1.5">
              Conditions
            </label>
            <div className="flex items-center gap-1.5 flex-wrap">
              {WEATHER_CHIPS.map(({ value, Icon, label }) => {
                const on = weather === value;
                return (
                  <button
                    key={value}
                    type="button"
                    onClick={() => commitWeather(value)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border text-[12px] font-medium transition-colors duration-200 ${
                      on
                        ? 'bg-[#FFF8E1] text-[#1A1A1A] border-[#E8C25A]'
                        : 'bg-white text-[#3A3A3A] border-[#E6E1D4] hover:bg-[#FAF8F2]'
                    }`}
                  >
                    <Icon className={`h-3.5 w-3.5 ${on ? 'text-[#D6A22F]' : ''}`} />
                    {label}
                  </button>
                );
              })}
              <div className="ml-auto flex items-center gap-1">
                <input
                  type="number"
                  inputMode="numeric"
                  value={tempC}
                  onChange={(e) => setTempC(e.target.value)}
                  onBlur={commitTemp}
                  placeholder="—"
                  className={cn(inputField, 'w-16 px-2 py-1 text-right tabular-nums')}
                />
                <span className="text-xs text-[#6B6B6B]">°C</span>
              </div>
            </div>

            {/* AI-suggested tags — pre-filled from the first photo. Dismissing
                keeps the value, just removes the tag. */}
            {aiSuggested.size > 0 ? (
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {(['weather', 'temp', 'crew'] as const)
                  .filter((k) => aiSuggested.has(k))
                  .map((k) => (
                    <span
                      key={k}
                      className="inline-flex items-center gap-1 rounded-full border border-[#E8C25A] bg-[#FFF8E1] px-2 py-0.5 text-[10.5px] font-medium text-[#9A6B1E]"
                    >
                      <Sparkles className="h-2.5 w-2.5 text-[#C8841E]" />
                      AI suggested {k === 'temp' ? 'temp' : k === 'crew' ? `${aiCrewCount} crew` : 'weather'}
                      <button
                        type="button"
                        onClick={() => dismissSuggestion(k)}
                        aria-label={`Dismiss AI ${k} suggestion`}
                        className="ml-0.5 text-[#C8841E] hover:text-[#9A6B1E]"
                      >
                        <X className="h-2.5 w-2.5" />
                      </button>
                    </span>
                  ))}
              </div>
            ) : null}
          </section>

          {/* Tags + Common Works picker */}
          <section>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B] mb-1.5">
              Tags
            </label>
            <div className="flex flex-wrap gap-1.5 mb-2">
              {tags.length === 0 ? (
                <span className="text-[11px] text-[#A0A0A0]">No tags yet. Pick a Common Works template below or type your own.</span>
              ) : (
                tags.map((t) => (
                  <span
                    key={t}
                    className="inline-flex items-center gap-1 rounded-[7px] bg-[#F0EDE4] border border-[#E6E1D4] px-2 py-0.5 text-[11.5px] font-medium text-[#3A3A3A]"
                  >
                    {t}
                    <button
                      type="button"
                      onClick={() => removeTag(t)}
                      className="text-[#A0A0A0] hover:text-[#C44545]"
                      aria-label={`Remove ${t}`}
                    >
                      <X className="h-2.5 w-2.5" />
                    </button>
                  </span>
                ))
              )}
            </div>
            <div className="flex gap-1.5 mb-3">
              <input
                type="text"
                value={tagDraft}
                onChange={(e) => setTagDraft(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addTag(tagDraft);
                  }
                }}
                placeholder="Add a tag…"
                className={cn(inputField, 'flex-1')}
              />
              <Button size="sm" variant="outline" onClick={() => addTag(tagDraft)}>Add</Button>
            </div>
            <div>
              <div className="flex items-center gap-1.5 mb-1.5">
                <Zap className="h-3 w-3 text-[#C8841E]" />
                <span className="text-[10.5px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B]">
                  Common works
                </span>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {orderedTemplates.map((tpl) => {
                  const on = tags.includes(tpl.name);
                  const count = usageByName?.[tpl.name] ?? 0;
                  return (
                    <button
                      key={tpl.id}
                      type="button"
                      onClick={() => toggleTemplateTag(tpl.name)}
                      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[11.5px] font-medium transition-colors ${
                        on
                          ? 'bg-[#2F8F5C] text-white border-[#2F8F5C]'
                          : 'bg-white text-[#3A3A3A] border-[#E6E1D4] hover:border-[#2F8F5C] hover:bg-[#E1F3EA]/40'
                      }`}
                    >
                      {tpl.name}
                      {count > 0 && !on ? (
                        <span className="text-[10px] text-[#C8841E] font-semibold">{count}×</span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          {/* Photos */}
          <section>
            <label className="block text-[11px] font-semibold uppercase tracking-[0.12em] text-[#6B6B6B] mb-1.5">
              Photos
            </label>
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploadBusy || creating}
              className="flex w-full items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#E6E1D4] px-4 py-4 text-sm text-[#3A3A3A] hover:border-[#2F8F5C] hover:bg-[#E1F3EA]/40 hover:text-[#1A1A1A] disabled:opacity-60"
            >
              <Camera className="h-4 w-4" />
              {uploadBusy ? 'Uploading…' : 'Upload photo'}
            </button>
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/*,video/mp4,video/quicktime"
              onChange={(e) => onAddPhotoFiles(e.target.files)}
              className="hidden"
              aria-label="Upload diary photos"
            />
            {uploadError ? (
              <p className="mt-2 rounded-md border border-[#F0C8C8] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
                {uploadError}
              </p>
            ) : null}

            {isCreate ? (
              draftPhotoFiles.length === 0 ? (
                <p className="mt-2 text-[11px] text-[#A0A0A0]">
                  No photos yet. They upload when you click Create entry.
                </p>
              ) : (
                <div className="mt-2 grid grid-cols-3 gap-1.5">
                  {draftPhotoUrls.map((url, idx) => (
                    <div key={url} className="relative aspect-square overflow-hidden rounded-[7px] border border-[#E6E1D4] bg-[#F0EDE4]">
                      <img src={url} alt="" className="h-full w-full object-cover" />
                      <PhotoUploadRing
                        status={uploadStates[idx]?.status ?? 'pending'}
                        progress={uploadStates[idx]?.progress ?? 0}
                        onRetry={() => retryPhoto(idx)}
                      />
                      <button
                        type="button"
                        onClick={() => removeDraftPhoto(idx)}
                        className="absolute top-1 right-1 w-5 h-5 rounded-full bg-black/70 text-white grid place-items-center hover:bg-black"
                        aria-label="Remove photo"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )
            ) : livePhotoIds.length === 0 ? (
              <p className="mt-2 text-[11px] text-[#A0A0A0]">No photos attached yet.</p>
            ) : (
              <div className="mt-2 grid grid-cols-3 gap-1.5">
                {livePhotoIds.map((id) => (
                  <TimelinePhotoThumb key={id} photoId={id} large />
                ))}
              </div>
            )}
          </section>
        </div>

        {/* Footer */}
        <footer className="flex flex-shrink-0 items-center justify-between gap-3 border-t border-[#EFEBE0] px-5 py-3">
          {isCreate ? (
            <>
              <span className="text-xs text-[#A0A0A0]">
                {creating ? 'Saving…' : "Saving logs today's entry."}
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={guardedClose} disabled={creating}>Cancel</Button>
                <Button onClick={handleCreate} disabled={!canCreate || creating}>
                  {creating ? 'Saving…' : 'Create entry'}
                </Button>
              </div>
            </>
          ) : (
            <>
              <span className="text-xs text-[#A0A0A0]">Auto-saves on blur</span>
              {entry ? (
                confirmDelete ? (
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[#C44545]">Delete this entry?</span>
                    <Button variant="outline" size="sm" onClick={() => setConfirmDelete(false)}>Cancel</Button>
                    <button
                      type="button"
                      onClick={handleDelete}
                      className="inline-flex items-center gap-1.5 rounded-md bg-[#C44545] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#A83838] active:bg-[#8F3030]"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Confirm
                    </button>
                  </div>
                ) : (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium text-[#6B6B6B] hover:bg-[#FBE5E5] hover:text-[#C44545]"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete entry
                  </button>
                )
              ) : null}
            </>
          )}
        </footer>
      </div>

      <SparkyAssistModal
        open={sparkyOpen}
        projectId={projectId}
        targetDate={entry?.date ?? todayISO}
        currentUser={currentUser}
        onUseDraft={(text) => {
          setDescription(text);
          if (entry) updateDiaryEntry(projectId, entry.id, { description: text });
        }}
        onClose={() => setSparkyOpen(false)}
      />
    </MotionDrawer>
  );
}
