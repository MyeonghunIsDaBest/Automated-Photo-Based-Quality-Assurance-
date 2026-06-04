// ProjectConfigTab — admin-tier surface for editing the per-project
// configuration row introduced in migration 09.
//
// Layout:
//   [Project picker]
//   [AI thresholds   — sliders + live caption + default model]
//   [Progression     — mode radio, weights with sum-100 validator, target, manual floor]
//   [Dedup           — phash slider]
//   [Branding        — accent colour picker (+ advanced hex), logo path]
//   [Reports         — cadence radio]
//   [Save / Cancel]
//
// All sections live in one form; the Save handler computes the diff against
// `config` and calls `useProjectConfig().save(patch)`. Audit log is emitted
// via `useAppStore.addAuditLog` so the entry shows up alongside every other
// auditable action in `/audit`.

import { useEffect, useMemo, useState } from 'react';
import { RotateCcw } from 'lucide-react';
import { useProjectsListStore } from '../../projects/store';
import { useAppStore } from '../../../store';
import { useFeatureStore } from '../../../store/features';
import { useProjectConfig } from '../../../lib/hooks/useProjectConfig';
import { canManageProjectConfig } from '../../../lib/permissions';
import type { ProjectConfig } from '../../../types';
import type { ProjectConfigPatch } from '../../../lib/api/projectConfig';
import {
  demoInflightTasks,
  DEMO_INFLIGHT_PROJECT_ID,
} from '../../../data/demoInflightProject';

type ProgressionMode = 'manual' | 'human_assisted' | 'full_auto';
type ReportCadence = 'none' | 'weekly' | 'monthly';

interface DraftState {
  aiAutoUpdateThreshold: number;
  aiReviewQueueThreshold: number;
  aiDefaultModel: string;
  progressionMode: ProgressionMode;
  weightChecklist: number;
  weightPhotos: number;
  weightAi: number;
  targetPhotosPerTask: number;
  manualFloorAllowed: boolean;
  phashThreshold: number;
  accentColor: string;
  logoStoragePath: string;
  reportCadence: ReportCadence;
}

// Editorial-palette presets for the accent colour picker. The "advanced"
// reveal lets admins type any hex; everyone else stays within the curated set
// that's been contrast-tested against the slate/emerald shell.
const ACCENT_PRESETS: Array<{ label: string; value: string }> = [
  { label: 'Emerald (default)', value: '#10B981' },
  { label: 'Deep teal',         value: '#0F766E' },
  { label: 'Slate',             value: '#0F172A' },
  { label: 'Rose',              value: '#BE123C' },
  { label: 'Amber',             value: '#B45309' },
  { label: 'Indigo',            value: '#4338CA' },
];

function configToDraft(cfg: ProjectConfig): DraftState {
  return {
    aiAutoUpdateThreshold: cfg.aiAutoUpdateThreshold,
    aiReviewQueueThreshold: cfg.aiReviewQueueThreshold,
    aiDefaultModel: cfg.aiDefaultModel,
    progressionMode: cfg.progressionMode,
    weightChecklist: cfg.weightChecklist,
    weightPhotos: cfg.weightPhotos,
    weightAi: cfg.weightAi,
    targetPhotosPerTask: cfg.targetPhotosPerTask,
    manualFloorAllowed: cfg.manualFloorAllowed,
    phashThreshold: cfg.phashThreshold,
    accentColor: cfg.accentColor ?? '#10B981',
    logoStoragePath: cfg.logoStoragePath ?? '',
    reportCadence: cfg.reportCadence,
  };
}

// Diff helpers — only send keys the admin actually touched so unrelated columns
// don't get re-written.
function buildPatch(cfg: ProjectConfig, draft: DraftState): ProjectConfigPatch {
  const patch: ProjectConfigPatch = {};
  const normAccent = draft.accentColor.trim();
  const normLogo = draft.logoStoragePath.trim();
  if (draft.aiAutoUpdateThreshold !== cfg.aiAutoUpdateThreshold) patch.aiAutoUpdateThreshold = draft.aiAutoUpdateThreshold;
  if (draft.aiReviewQueueThreshold !== cfg.aiReviewQueueThreshold) patch.aiReviewQueueThreshold = draft.aiReviewQueueThreshold;
  if (draft.aiDefaultModel !== cfg.aiDefaultModel) patch.aiDefaultModel = draft.aiDefaultModel;
  if (draft.progressionMode !== cfg.progressionMode) patch.progressionMode = draft.progressionMode;
  if (draft.weightChecklist !== cfg.weightChecklist) patch.weightChecklist = draft.weightChecklist;
  if (draft.weightPhotos !== cfg.weightPhotos) patch.weightPhotos = draft.weightPhotos;
  if (draft.weightAi !== cfg.weightAi) patch.weightAi = draft.weightAi;
  if (draft.targetPhotosPerTask !== cfg.targetPhotosPerTask) patch.targetPhotosPerTask = draft.targetPhotosPerTask;
  if (draft.manualFloorAllowed !== cfg.manualFloorAllowed) patch.manualFloorAllowed = draft.manualFloorAllowed;
  if (draft.phashThreshold !== cfg.phashThreshold) patch.phashThreshold = draft.phashThreshold;
  const nextAccent = normAccent === '#10B981' || normAccent === '' ? null : normAccent;
  if (nextAccent !== cfg.accentColor) patch.accentColor = nextAccent;
  const nextLogo = normLogo === '' ? null : normLogo;
  if (nextLogo !== cfg.logoStoragePath) patch.logoStoragePath = nextLogo;
  if (draft.reportCadence !== cfg.reportCadence) patch.reportCadence = draft.reportCadence;
  return patch;
}

function captionForConfidence(autoUpdate: number, reviewQueue: number): string {
  // "What would happen at the demo confidence?" — pin a representative value
  // so the admin sees the rule come alive as they drag.
  const c = 0.7;
  if (c >= autoUpdate) return `At ${c.toFixed(2)} confidence the analysis would auto-update the task.`;
  if (c >= reviewQueue) return `At ${c.toFixed(2)} confidence the analysis would land in the review queue.`;
  return `At ${c.toFixed(2)} confidence the analysis would be skipped.`;
}

export default function ProjectConfigTab() {
  const projects = useProjectsListStore((s) => s.projects);
  const activeProjectId = useProjectsListStore((s) => s.activeProjectId);
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);
  const currentProfile = useAppStore((s) => s.currentProfile);
  const currentUser = useAppStore((s) => s.currentUser);
  const addAuditLog = useAppStore((s) => s.addAuditLog);
  const canEdit = canManageProjectConfig(currentProfile);

  // The hook keys off the active project automatically — flipping the picker
  // re-fetches.
  const { config, isLoading, error: loadError, save } = useProjectConfig();

  const [draft, setDraft] = useState<DraftState | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savedFlash, setSavedFlash] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [showHex, setShowHex] = useState(false);

  // Reset the draft whenever the active project's config lands (or changes).
  useEffect(() => {
    if (config) {
      setDraft(configToDraft(config));
      setSaveError(null);
    } else {
      setDraft(null);
    }
  }, [config?.projectId, config?.updatedAt]);

  // Sum-100 validator for the progression weights.
  const weightSum = draft ? draft.weightChecklist + draft.weightPhotos + draft.weightAi : 100;
  const weightsValid = weightSum === 100;
  const thresholdsValid = !draft || draft.aiReviewQueueThreshold <= draft.aiAutoUpdateThreshold;

  const isDirty = useMemo(() => {
    if (!config || !draft) return false;
    return Object.keys(buildPatch(config, draft)).length > 0;
  }, [config, draft]);

  const onSave = async () => {
    if (!config || !draft) return;
    if (!weightsValid) {
      setSaveError(`Progression weights must sum to 100 (currently ${weightSum}).`);
      return;
    }
    if (!thresholdsValid) {
      setSaveError('Review-queue threshold must not exceed auto-update threshold.');
      return;
    }
    const patch = buildPatch(config, draft);
    if (Object.keys(patch).length === 0) return;

    setIsSaving(true);
    setSaveError(null);
    try {
      const updated = await save(patch);
      addAuditLog({
        projectId: updated.projectId,
        userId: currentUser?.id ?? 'system',
        action: 'project_config_updated',
        entityType: 'project_config',
        entityId: updated.projectId,
        oldValue: Object.fromEntries(
          Object.keys(patch).map((k) => [k, (config as unknown as Record<string, unknown>)[k]]),
        ),
        newValue: patch as unknown as Record<string, unknown>,
      });
      setSavedFlash(true);
      window.setTimeout(() => setSavedFlash(false), 2500);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsSaving(false);
    }
  };

  const onCancel = () => {
    if (config) setDraft(configToDraft(config));
    setSaveError(null);
  };

  // ─── Reset demo state ──────────────────────────────────────────────────
  // Clears every photo's AI analysis + resets task progress on the active
  // project. For the canonical demo (Hampstead Heights) we snap tasks back
  // to their seed values from `data/demoInflightProject.ts`. For any other
  // project, we drop non-anchor tasks to 0% / not_started. Use case: re-
  // pitching the same demo back-to-back without manual cleanup.
  const [resetStep, setResetStep] = useState<'idle' | 'confirm' | 'busy' | 'done'>('idle');
  const onResetDemo = () => {
    if (!activeProjectId) return;
    setResetStep('busy');

    // 1. Strip aiAnalysis from every project photo so the Mock-AI runner
    //    sees them as pending again.
    useAppStore.setState((s) => ({
      photos: s.photos.map((p) =>
        p.projectId === activeProjectId
          ? { ...p, aiAnalyzed: false, aiAnalysis: undefined }
          : p,
      ),
    }));

    // 2. Snap tasks back. Hampstead gets its seed; other projects reset to
    //    zero. Phase anchors keep their structure (they're non-deletable).
    if (activeProjectId === DEMO_INFLIGHT_PROJECT_ID) {
      useFeatureStore.setState((s) => ({
        tasks: [
          ...s.tasks.filter((t) => t.projectId !== activeProjectId),
          ...demoInflightTasks,
        ],
      }));
    } else {
      const now = new Date().toISOString();
      useFeatureStore.setState((s) => ({
        tasks: s.tasks.map((t) =>
          t.projectId === activeProjectId && !t.isPhaseAnchor
            ? { ...t, percentComplete: 0, status: 'not_started' as const, lastUpdated: now }
            : t,
        ),
      }));
    }

    addAuditLog({
      projectId: activeProjectId,
      userId: currentUser?.id ?? 'system',
      action: 'demo_reset',
      entityType: 'project',
      entityId: activeProjectId,
      notes: 'Reset demo state — cleared AI analyses, restored task seed values.',
    });

    setResetStep('done');
    window.setTimeout(() => setResetStep('idle'), 2500);
  };

  if (!canEdit) {
    return (
      <div className="rounded-[14px] border border-[#E6E1D4] bg-white p-6 text-sm text-[#6B6B6B]">
        Your role can view this surface but can't edit project configuration.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Project picker */}
      <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#E6E1D4] bg-white px-4 py-3 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
        <label className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
          Project
        </label>
        <select
          value={activeProjectId ?? ''}
          onChange={(e) => setActiveProject(e.target.value)}
          className="h-9 min-w-[18rem] rounded-md border border-[#E6E1D4] bg-white px-3 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
          disabled={projects.length === 0}
        >
          {projects.length === 0 && <option value="">No projects yet</option>}
          {projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        {isLoading && <span className="text-xs text-[#A0A0A0]">Loading…</span>}
        {loadError && (
          <span className="text-xs text-[#C44545]" role="alert">
            {loadError}
          </span>
        )}
      </div>

      {!draft || !config ? (
        <div className="rounded-[14px] border border-[#E6E1D4] bg-white p-6 text-sm text-[#6B6B6B]">
          {projects.length === 0
            ? 'Create a project first; configuration appears here once one exists.'
            : 'Loading project configuration…'}
        </div>
      ) : (
        <>
          {/* ── AI thresholds ─────────────────────────────────────────── */}
          <SubSection
            title="AI thresholds"
            description="Where the photo-QA pipeline draws the line between skip, review queue, and auto-update."
          >
            <Field label="Auto-update threshold">
              <Slider
                value={draft.aiAutoUpdateThreshold}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setDraft({ ...draft, aiAutoUpdateThreshold: v })}
                fmt={(v) => v.toFixed(2)}
              />
            </Field>
            <Field label="Review-queue threshold">
              <Slider
                value={draft.aiReviewQueueThreshold}
                min={0}
                max={1}
                step={0.01}
                onChange={(v) => setDraft({ ...draft, aiReviewQueueThreshold: v })}
                fmt={(v) => v.toFixed(2)}
              />
            </Field>
            <Field label="Default model">
              <input
                type="text"
                value={draft.aiDefaultModel}
                onChange={(e) => setDraft({ ...draft, aiDefaultModel: e.target.value })}
                className="block h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              />
            </Field>
            <p className="text-xs text-[#6B6B6B]">{captionForConfidence(draft.aiAutoUpdateThreshold, draft.aiReviewQueueThreshold)}</p>
            {!thresholdsValid && (
              <p className="text-xs text-[#C44545]" role="alert">
                Review-queue threshold must not exceed auto-update threshold.
              </p>
            )}
          </SubSection>

          {/* ── Progression ──────────────────────────────────────────── */}
          <SubSection
            title="Progression"
            description="How tasks advance: a freeform manager slider, signal-driven, or fully automatic."
          >
            <Field label="Mode">
              <div className="flex flex-wrap gap-2">
                {(['manual', 'human_assisted', 'full_auto'] as ProgressionMode[]).map((m) => (
                  <ModeChip
                    key={m}
                    label={
                      m === 'manual' ? 'Manual'
                      : m === 'human_assisted' ? 'Human-assisted'
                      : 'Full auto'
                    }
                    selected={draft.progressionMode === m}
                    onClick={() => setDraft({ ...draft, progressionMode: m })}
                  />
                ))}
              </div>
            </Field>
            <div className="grid gap-4 sm:grid-cols-3">
              <Field label="Weight: Checklist">
                <NumberInput
                  value={draft.weightChecklist}
                  min={0}
                  max={100}
                  onChange={(v) => setDraft({ ...draft, weightChecklist: v })}
                  suffix="%"
                />
              </Field>
              <Field label="Weight: Photos">
                <NumberInput
                  value={draft.weightPhotos}
                  min={0}
                  max={100}
                  onChange={(v) => setDraft({ ...draft, weightPhotos: v })}
                  suffix="%"
                />
              </Field>
              <Field label="Weight: AI">
                <NumberInput
                  value={draft.weightAi}
                  min={0}
                  max={100}
                  onChange={(v) => setDraft({ ...draft, weightAi: v })}
                  suffix="%"
                />
              </Field>
            </div>
            <p className={`text-xs ${weightsValid ? 'text-[#6B6B6B]' : 'text-[#C44545]'}`}>
              Weights sum: {weightSum}/100. {weightsValid ? '' : 'Adjust to total exactly 100.'}
            </p>
            <Field label="Target photos per task">
              <NumberInput
                value={draft.targetPhotosPerTask}
                min={1}
                max={50}
                onChange={(v) => setDraft({ ...draft, targetPhotosPerTask: v })}
              />
            </Field>
            <Field label="Manager force-floor allowed">
              <Toggle
                checked={draft.manualFloorAllowed}
                onChange={(v) => setDraft({ ...draft, manualFloorAllowed: v })}
                label={draft.manualFloorAllowed ? 'Allowed — managers can override the AI percentage' : 'Disabled — confirm-analysis rejects overridePct'}
              />
            </Field>
          </SubSection>

          {/* ── Dedup ─────────────────────────────────────────────────── */}
          <SubSection
            title="Dedup"
            description="Perceptual-hash distance below which two photos are flagged as near-duplicates."
          >
            <Field label="phash threshold">
              <Slider
                value={draft.phashThreshold}
                min={0}
                max={64}
                step={1}
                onChange={(v) => setDraft({ ...draft, phashThreshold: Math.round(v) })}
                fmt={(v) => `${Math.round(v)}`}
              />
            </Field>
            <p className="text-xs text-[#6B6B6B]">Lower = stricter dedup. Higher = catches more near-duplicates at the cost of false positives.</p>
          </SubSection>

          {/* ── Branding ──────────────────────────────────────────────── */}
          <SubSection
            title="Branding"
            description="Light per-project styling — accent colour is read by the AccentBar wrapper; the logo path points to a Storage object."
          >
            <Field label="Accent colour">
              <div className="flex flex-wrap gap-2">
                {ACCENT_PRESETS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setDraft({ ...draft, accentColor: p.value })}
                    className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${draft.accentColor === p.value ? 'border-[#1A1A1A] bg-[#FAF8F2] text-[#1A1A1A]' : 'border-[#E6E1D4] text-[#6B6B6B] hover:border-[#D8D2C4]'}`}
                  >
                    <span
                      className="inline-block h-3 w-3 rounded-full"
                      style={{ backgroundColor: p.value }}
                      aria-hidden
                    />
                    {p.label}
                  </button>
                ))}
                <button
                  type="button"
                  onClick={() => setShowHex((v) => !v)}
                  className="rounded-full border border-dashed border-[#D8D2C4] px-3 py-1.5 text-xs font-medium text-[#6B6B6B] hover:border-[#A0A0A0]"
                >
                  {showHex ? 'Hide advanced' : 'Advanced (hex)'}
                </button>
              </div>
              {showHex && (
                <input
                  type="text"
                  value={draft.accentColor}
                  onChange={(e) => setDraft({ ...draft, accentColor: e.target.value })}
                  placeholder="#10B981"
                  className="mt-2 block h-9 w-32 rounded-md border border-[#E6E1D4] bg-white px-3 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
                />
              )}
            </Field>
            <Field label="Logo storage path">
              <input
                type="text"
                value={draft.logoStoragePath}
                onChange={(e) => setDraft({ ...draft, logoStoragePath: e.target.value })}
                placeholder="project-logos/<project-id>.jpg"
                className="block h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              />
              <p className="mt-1 text-[11px] text-[#A0A0A0]">
                Upload to the <code>project-logos</code> Storage bucket separately, then paste the path here. Single 200&times;200 JPEG, &lt;50&nbsp;KB.
              </p>
            </Field>
          </SubSection>

          {/* ── Reports ───────────────────────────────────────────────── */}
          <SubSection
            title="Reports"
            description="Cadence preference for the automated weekly/monthly digest. The scheduler itself is a follow-up plan — this stores the preference."
          >
            <Field label="Cadence">
              <div className="flex flex-wrap gap-2">
                {(['none', 'weekly', 'monthly'] as ReportCadence[]).map((c) => (
                  <ModeChip
                    key={c}
                    label={c === 'none' ? 'None' : c === 'weekly' ? 'Weekly' : 'Monthly'}
                    selected={draft.reportCadence === c}
                    onClick={() => setDraft({ ...draft, reportCadence: c })}
                  />
                ))}
              </div>
            </Field>
          </SubSection>

          {/* ── Demo controls ────────────────────────────────────────── */}
          <SubSection
            title="Demo controls"
            description="Restart the demo flow without leaving the page. Clears all AI analyses for this project, then snaps tasks back to their seed percentages (Hampstead Heights) or to 0% (everything else). Useful when running back-to-back walk-throughs."
          >
            <div className="flex flex-wrap items-center gap-3 rounded-[14px] border border-[#F0D5A0] bg-[#F9EFD9]/40 px-4 py-3">
              <RotateCcw className="h-4 w-4 flex-shrink-0 text-[#C8841E]" aria-hidden />
              <div className="min-w-0 flex-1 text-xs text-[#3A3A3A]">
                {resetStep === 'done' ? (
                  <span className="font-medium text-[#246F47]">
                    Demo reset · AI analyses cleared, task progress restored.
                  </span>
                ) : (
                  <>
                    <span className="font-medium text-[#1A1A1A]">Reset demo state.</span>{' '}
                    Wipes Mock-AI analyses + restores task seed values for the active project.
                  </>
                )}
              </div>
              {resetStep === 'confirm' ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setResetStep('idle')}
                    className="rounded-full border border-[#E6E1D4] px-3 py-1 text-xs font-medium text-[#6B6B6B] hover:border-[#D8D2C4]"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={onResetDemo}
                    className="rounded-full bg-[#C8841E] px-3 py-1 text-xs font-medium text-white hover:bg-[#B5602A]"
                  >
                    Confirm reset
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setResetStep('confirm')}
                  disabled={resetStep === 'busy'}
                  className="inline-flex items-center gap-1.5 rounded-full border border-[#F0D5A0] bg-white px-3 py-1 text-xs font-medium text-[#C8841E] transition-colors hover:border-[#C8841E] hover:bg-[#F9EFD9] disabled:opacity-50"
                >
                  <RotateCcw className="h-3 w-3" />
                  Reset demo
                </button>
              )}
            </div>
          </SubSection>

          {/* ── Action bar ────────────────────────────────────────────── */}
          <div className="sticky bottom-0 flex items-center justify-end gap-3 rounded-[14px] border border-[#E6E1D4] bg-white/95 px-4 py-3 backdrop-blur shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
            {saveError && (
              <p className="mr-auto text-xs text-[#C44545]" role="alert">{saveError}</p>
            )}
            {savedFlash && (
              <p className="mr-auto text-xs text-[#246F47]">Saved.</p>
            )}
            <button
              type="button"
              onClick={onCancel}
              disabled={!isDirty || isSaving}
              className="rounded-full border border-[#E6E1D4] px-4 py-1.5 text-xs font-medium text-[#6B6B6B] transition-colors hover:border-[#D8D2C4] disabled:opacity-50"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={onSave}
              disabled={!isDirty || !weightsValid || !thresholdsValid || isSaving}
              className="rounded-full bg-[#2F8F5C] px-4 py-1.5 text-xs font-medium text-white transition-colors hover:bg-[#246F47] disabled:opacity-50 disabled:hover:bg-[#2F8F5C]"
            >
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}

// ── Local presentational helpers ────────────────────────────────────────

function SubSection({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-[14px] border border-[#E6E1D4] bg-white p-5 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
      <div className="mb-4">
        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">{title}</p>
        <p className="mt-1 text-xs text-[#6B6B6B]">{description}</p>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-[#3A3A3A]">{label}</label>
      {children}
    </div>
  );
}

function Slider({
  value,
  min,
  max,
  step,
  onChange,
  fmt,
}: {
  value: number;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
  fmt: (v: number) => string;
}) {
  return (
    <div className="flex items-center gap-3">
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="flex-1 accent-[#2F8F5C]"
      />
      <span className="w-12 text-right text-sm tabular-nums text-[#3A3A3A]">{fmt(value)}</span>
    </div>
  );
}

function NumberInput({
  value,
  min,
  max,
  onChange,
  suffix,
}: {
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
  suffix?: string;
}) {
  return (
    <div className="flex items-center gap-2">
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="block h-9 w-24 rounded-md border border-[#E6E1D4] bg-white px-3 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
      />
      {suffix && <span className="text-xs text-[#6B6B6B]">{suffix}</span>}
    </div>
  );
}

function Toggle({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-3"
    >
      <span
        className={`inline-flex h-5 w-9 items-center rounded-full border transition-colors ${checked ? 'border-[#2F8F5C] bg-[#2F8F5C]' : 'border-[#E6E1D4] bg-[#F0EDE4]'}`}
      >
        <span
          className={`ml-0.5 h-4 w-4 rounded-full bg-white shadow-sm transition-transform ${checked ? 'translate-x-4' : ''}`}
        />
      </span>
      <span className="text-xs text-[#3A3A3A]">{label}</span>
    </button>
  );
}

function ModeChip({
  label,
  selected,
  onClick,
}: {
  label: string;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${selected ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white' : 'border-[#E6E1D4] text-[#6B6B6B] hover:border-[#D8D2C4]'}`}
    >
      {label}
    </button>
  );
}
