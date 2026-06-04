import { useMemo, useRef, useState } from 'react';
import {
  ChevronDown, ChevronRight, ExternalLink,
  FileBox, FileCheck2, FileText, Image as ImageIcon,
  Layers, PencilRuler, Upload as UploadIcon,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import { useFeatureStore, type ProjectDocument } from '../../../store/features';
import {
  LedgerHeader, LedgerStatRow, StatusPill, MetaChip,
  FRAUNCES, REG, cardShell, btnPrimary, type ToneKey,
} from '../components/ledger';

// ─── Constants ───────────────────────────────────────────────────────────────

interface PlansTabProps {
  project: Project;
  canEdit: boolean;
}

// Blueprint disciplines — derived from category. A future backend field
// (e.g. `sheet_discipline`) would let us group by Architectural / Structural /
// Electrical; for now we use `category` and filename heuristics.
const PLAN_CATEGORIES: ProjectDocument['category'][] = ['blueprint', 'permit'];

// Rev labels — A, B, C … Z, then AA, AB … (matches common drawing-register
// practice). Index 0 = oldest = Rev A, last index = latest = "Current".
const revLabel = (idx: number): string => {
  if (idx < 26) return String.fromCharCode(65 + idx); // A–Z
  const hi = Math.floor(idx / 26) - 1;
  const lo = idx % 26;
  return String.fromCharCode(65 + hi) + String.fromCharCode(65 + lo); // AA, AB…
};

// Strip extension and common version suffixes to get the "sheet identity" for
// grouping. E.g. "A001_Rev_B.pdf", "A001 RevC.pdf", "A001-v2.pdf" all map to
// "A001" so they appear as revisions of the same sheet.
const REV_SUFFIX_RE = /[_\s\-]?(rev|revision|r|v|ver|version)[_\s\-]?[0-9a-z]+$/i;

function sheetKey(name: string): string {
  const dot = name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  return stem.replace(REV_SUFFIX_RE, '').trim().toLowerCase();
}

function extOf(name: string): 'pdf' | 'png' | 'jpg' | 'other' {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return 'other';
  const e = name.slice(dot + 1).toLowerCase();
  if (e === 'pdf') return 'pdf';
  if (e === 'png') return 'png';
  if (e === 'jpg' || e === 'jpeg') return 'jpg';
  return 'other';
}

function fmtSize(bytes: number): string {
  if (!bytes || bytes <= 0) return '—';
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

function fmtDate(iso: string): string {
  try { return format(parseISO(iso), 'MMM d, yyyy'); } catch { return '—'; }
}

function fmtDateShort(iso: string): string {
  try { return format(parseISO(iso), 'MMM d'); } catch { return '—'; }
}

// ─── Sheet-set types ─────────────────────────────────────────────────────────

/** One logical sheet — may have multiple revisions (uploads). */
interface Sheet {
  /** Normalised sheet identity (filename stem, rev-suffix stripped). */
  key: string;
  /** Display title — the stem of the latest revision's filename. */
  title: string;
  /** All revisions, oldest first. */
  revisions: ProjectDocument[];
  /** Most-recent revision (shown as "current"). */
  current: ProjectDocument;
}

/** A discipline group containing one or more sheets. */
interface DisciplineGroup {
  label: string;
  tone: ToneKey;
  sheets: Sheet[];
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/** Build sheets from a flat list of documents (same category). */
function buildSheets(docs: ProjectDocument[]): Sheet[] {
  const map = new Map<string, ProjectDocument[]>();
  for (const d of docs) {
    const k = sheetKey(d.name);
    const arr = map.get(k);
    if (arr) arr.push(d); else map.set(k, [d]);
  }

  const sheets: Sheet[] = [];
  for (const [key, revs] of map.entries()) {
    // Sort oldest first so Rev A = first upload, etc.
    const sorted = [...revs].sort(
      (a, b) => Date.parse(a.uploadedAt) - Date.parse(b.uploadedAt),
    );
    const current = sorted[sorted.length - 1];
    // Display title = stem of the current revision's filename.
    const dot = current.name.lastIndexOf('.');
    const title = (dot > 0 ? current.name.slice(0, dot) : current.name).trim();
    sheets.push({ key, title, revisions: sorted, current });
  }

  // Alphabetical by title.
  return sheets.sort((a, b) => a.title.localeCompare(b.title));
}

// ─── Drawing card ─────────────────────────────────────────────────────────────

interface SheetCardProps {
  sheet: Sheet;
  canEdit: boolean;
  taskName?: string;
  defaultExpanded?: boolean;
}

function SheetCard({ sheet, canEdit: _canEdit, taskName, defaultExpanded = false }: SheetCardProps) {
  const [open, setOpen] = useState(defaultExpanded);
  const { current, revisions } = sheet;
  const ext = extOf(current.name);
  const hasRevisions = revisions.length > 1;

  const extBadge = ext === 'pdf' ? 'PDF' : ext === 'png' ? 'PNG' : ext === 'jpg' ? 'JPG' : 'FILE';
  const extColor =
    ext === 'pdf' ? '#C44545'
    : ext === 'png' ? '#4A5DAD'
    : '#246F47';

  const Icon = ext === 'pdf' ? FileText : ImageIcon;

  const openFile = () => {
    if (current.url) window.open(current.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`overflow-hidden ${cardShell}`}>
      {/* Card top row */}
      <div className="flex items-start gap-3 p-4">
        {/* File-type icon */}
        <button
          type="button"
          onClick={openFile}
          className="relative grid h-12 w-12 flex-shrink-0 place-items-center rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] text-[#246F47] hover:bg-[#E5F2EA] transition-colors"
          aria-label={`Open ${current.name}`}
        >
          <Icon className="h-5 w-5" />
          <span
            className="absolute -top-1.5 -right-1.5 rounded-md px-1 py-0.5 text-[9px] font-bold tracking-wide text-white"
            style={{ background: extColor }}
          >
            {extBadge}
          </span>
        </button>

        {/* Title + meta */}
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={openFile}
              className="min-w-0 text-left"
            >
              <p
                className="truncate text-[14px] font-semibold text-[#1A1A1A] hover:text-[#2F8F5C] transition-colors"
                style={{ fontFamily: FRAUNCES }}
              >
                {sheet.title}
              </p>
            </button>
            {/* Current rev badge */}
            <span
              className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10.5px] font-semibold tracking-wide"
              style={{ background: '#E5F2EA', color: '#246F47' }}
            >
              Rev {revLabel(revisions.length - 1)}
            </span>
          </div>

          {/* Meta row */}
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-[#6B6B6B]">
              {fmtSize(current.size)} · {fmtDate(current.uploadedAt)}
            </span>
            {taskName && (
              <MetaChip>
                <Layers className="h-3 w-3" />
                {taskName}
              </MetaChip>
            )}
          </div>
        </div>
      </div>

      {/* Revision history expander */}
      {hasRevisions && (
        <>
          <button
            type="button"
            onClick={() => setOpen((p) => !p)}
            className="flex w-full items-center gap-1.5 border-t border-[#EFEBE0] bg-[#FAF8F2] px-4 py-2 text-left hover:bg-[#F0EDE4] transition-colors"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#6B6B6B]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#6B6B6B]" />
            )}
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">
              {revisions.length} revision{revisions.length === 1 ? '' : 's'}
            </span>
          </button>

          {open && (
            <div className="border-t border-[#EFEBE0] divide-y divide-[#EFEBE0]">
              {[...revisions].reverse().map((rev, riRev) => {
                const chronIdx = revisions.length - 1 - riRev; // oldest = 0
                const isCurrent = rev.id === current.id;
                return (
                  <div
                    key={rev.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${isCurrent ? 'bg-[#F7F9F6]' : 'bg-white'}`}
                  >
                    <span
                      className="w-10 flex-shrink-0 text-right text-[11px] font-semibold tabular-nums"
                      style={{ color: isCurrent ? '#246F47' : '#A0A0A0' }}
                    >
                      Rev {revLabel(chronIdx)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#3A3A3A]">
                      {rev.name}
                    </span>
                    <span className="flex-shrink-0 text-[11px] tabular-nums text-[#A0A0A0]">
                      {fmtDateShort(rev.uploadedAt)}
                    </span>
                    {isCurrent && (
                      <span
                        className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: '#E5F2EA', color: '#246F47' }}
                      >
                        Current
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => { if (rev.url) window.open(rev.url, '_blank', 'noopener,noreferrer'); }}
                      className="flex-shrink-0 rounded p-1 text-[#A0A0A0] hover:text-[#2F8F5C] hover:bg-[#E5F2EA] transition-colors"
                      aria-label={`Open ${rev.name}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Permit card ──────────────────────────────────────────────────────────────
// Permits are displayed in a list register rather than a card grid — they're
// typically fewer, carry an authority reference, and benefit from a table
// layout. Expiry chip: no `expires_at` field in the current data model —
// rendered as "—" with a note. A future backend column (`expires_at`) will
// unlock live status chips.

interface PermitCardProps {
  sheet: Sheet;
  taskName?: string;
}

function PermitCard({ sheet, taskName }: PermitCardProps) {
  const { current, revisions } = sheet;
  const [open, setOpen] = useState(false);
  const hasRevisions = revisions.length > 1;

  const openFile = () => {
    if (current.url) window.open(current.url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className={`overflow-hidden ${cardShell}`}>
      <div className="flex items-start gap-3 p-4">
        {/* Icon */}
        <button
          type="button"
          onClick={openFile}
          className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-[10px] border border-[#E6E1D4] bg-[#FBF8EC] text-[#C8841E] hover:bg-[#F9EFD9] transition-colors"
          aria-label={`Open ${current.name}`}
        >
          <FileCheck2 className="h-5 w-5" />
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button type="button" onClick={openFile} className="min-w-0 text-left">
              <p
                className="truncate text-[14px] font-semibold text-[#1A1A1A] hover:text-[#C8841E] transition-colors"
                style={{ fontFamily: FRAUNCES }}
              >
                {sheet.title}
              </p>
            </button>
            {/* Expiry chip — no expires_at field, show dash */}
            <span
              className="flex-shrink-0 rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[10.5px] font-semibold text-[#6B6B6B]"
              title="No expiry date on file — add expires_at column to surface permit validity status"
            >
              Expiry —
            </span>
          </div>

          <div className="mt-1 flex flex-wrap items-center gap-2">
            <span className="text-[11.5px] text-[#6B6B6B]">
              {fmtSize(current.size)} · Filed {fmtDate(current.uploadedAt)}
            </span>
            {taskName && (
              <MetaChip>
                <Layers className="h-3 w-3" />
                {taskName}
              </MetaChip>
            )}
          </div>
        </div>
      </div>

      {/* Revision history — same pattern as SheetCard */}
      {hasRevisions && (
        <>
          <button
            type="button"
            onClick={() => setOpen((p) => !p)}
            className="flex w-full items-center gap-1.5 border-t border-[#EFEBE0] bg-[#FAF8F2] px-4 py-2 text-left hover:bg-[#F0EDE4] transition-colors"
          >
            {open ? (
              <ChevronDown className="h-3.5 w-3.5 text-[#6B6B6B]" />
            ) : (
              <ChevronRight className="h-3.5 w-3.5 text-[#6B6B6B]" />
            )}
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">
              {revisions.length} revision{revisions.length === 1 ? '' : 's'}
            </span>
          </button>

          {open && (
            <div className="border-t border-[#EFEBE0] divide-y divide-[#EFEBE0]">
              {[...revisions].reverse().map((rev, riRev) => {
                const chronIdx = revisions.length - 1 - riRev;
                const isCurrent = rev.id === current.id;
                return (
                  <div
                    key={rev.id}
                    className={`flex items-center gap-3 px-4 py-2.5 ${isCurrent ? 'bg-[#FBF8EC]' : 'bg-white'}`}
                  >
                    <span
                      className="w-10 flex-shrink-0 text-right text-[11px] font-semibold tabular-nums"
                      style={{ color: isCurrent ? '#C8841E' : '#A0A0A0' }}
                    >
                      Rev {revLabel(chronIdx)}
                    </span>
                    <span className="min-w-0 flex-1 truncate text-[12px] text-[#3A3A3A]">{rev.name}</span>
                    <span className="flex-shrink-0 text-[11px] tabular-nums text-[#A0A0A0]">
                      {fmtDateShort(rev.uploadedAt)}
                    </span>
                    {isCurrent && (
                      <span
                        className="flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold"
                        style={{ background: '#F9EFD9', color: '#C8841E' }}
                      >
                        Current
                      </span>
                    )}
                    <button
                      type="button"
                      onClick={() => { if (rev.url) window.open(rev.url, '_blank', 'noopener,noreferrer'); }}
                      className="flex-shrink-0 rounded p-1 text-[#A0A0A0] hover:text-[#C8841E] hover:bg-[#F9EFD9] transition-colors"
                      aria-label={`Open ${rev.name}`}
                    >
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

export function PlansTab({ project, canEdit }: PlansTabProps) {
  const documents = useFeatureStore((s) => s.documents);
  const uploadDoc  = useFeatureStore((s) => s.uploadDocument);
  const tasks      = useFeatureStore((s) => s.tasks);
  const inputRef   = useRef<HTMLInputElement | null>(null);
  const [dragOver, setDragOver] = useState(false);

  // Task map for link labels.
  const taskById = useMemo(
    () => new Map(tasks.filter((t) => t.projectId === project.id).map((t) => [t.id, t.name])),
    [tasks, project.id],
  );

  // All plan-category docs for this project.
  const plans = useMemo(
    () => documents.filter((d) => d.projectId === project.id && PLAN_CATEGORIES.includes(d.category)),
    [documents, project.id],
  );

  // Split into blueprints and permits.
  const blueprints = useMemo(() => plans.filter((d) => d.category === 'blueprint'), [plans]);
  const permits    = useMemo(() => plans.filter((d) => d.category === 'permit'),    [plans]);

  // Build sheet sets (grouped + sorted revisions).
  const blueprintSheets = useMemo(() => buildSheets(blueprints), [blueprints]);
  const permitSheets    = useMemo(() => buildSheets(permits),    [permits]);

  // Discipline groups for blueprints — in the current data model there's only
  // one category ("blueprint"), so all sheets land in a single group.
  // A future `sheet_discipline` field would let us split into Architectural,
  // Structural, Mechanical, Electrical, etc.
  const disciplineGroups = useMemo<DisciplineGroup[]>(() => {
    if (blueprintSheets.length === 0) return [];
    return [
      {
        label: 'Blueprints & Drawings',
        tone: 'ink' as ToneKey,
        sheets: blueprintSheets,
      },
    ];
  }, [blueprintSheets]);

  // Stats.
  const stats = useMemo(() => {
    const totalSheets = blueprintSheets.length + permitSheets.length;
    const totalRevisions = plans.length; // one doc = one revision
    const last = plans.reduce<string>(
      (acc, d) => (Date.parse(d.uploadedAt) > Date.parse(acc || '0') ? d.uploadedAt : acc),
      '',
    );
    const sheetsWithRevisions =
      [...blueprintSheets, ...permitSheets].filter((s) => s.revisions.length > 1).length;
    return { totalSheets, totalRevisions, last, sheetsWithRevisions, permits: permitSheets.length };
  }, [plans, blueprintSheets, permitSheets]);

  // Upload handler.
  const handleFiles = (files: File[]) => {
    files.forEach((file) => {
      uploadDoc({
        projectId: project.id,
        name: file.name,
        type: file.type.startsWith('image/') ? 'photo' : 'document',
        category: 'blueprint',
        size: file.size,
        uploadedBy: 'me',
        url: URL.createObjectURL(file),
      });
    });
  };

  const isEmpty = plans.length === 0;

  return (
    <>
      {/* ── Header ── */}
      <LedgerHeader
        kicker="PLN"
        icon={FileBox}
        eyebrow={`Plan set · ${project.name}`}
        title="Drawings & Permit Register"
        meta={
          <>
            {stats.totalSheets} sheet{stats.totalSheets === 1 ? '' : 's'} on file
            {stats.totalRevisions > stats.totalSheets && (
              <>
                <span className="mx-2" style={{ color: REG.faint }}>·</span>
                {stats.totalRevisions} total revisions
              </>
            )}
            <span className="mx-2" style={{ color: REG.faint }}>·</span>
            <span style={{ color: REG.muted }}>
              local-only until the Storage path lands
            </span>
          </>
        }
      />

      {/* ── Stat strip ── */}
      <LedgerStatRow
        stats={[
          {
            value: stats.totalSheets,
            label: 'Sheets',
            sub: 'in the register',
            tone: 'ink',
          },
          {
            value: blueprintSheets.length,
            label: 'Blueprints',
            tone: 'slate',
          },
          {
            value: stats.permits,
            label: 'Permits',
            tone: 'amber',
          },
          {
            value: stats.sheetsWithRevisions,
            label: 'Multi-rev',
            sub: 'sheets',
            tone: 'sage',
          },
          {
            value: stats.last
              ? format(parseISO(stats.last), 'MMM d')
              : '—',
            label: 'Last filed',
            tone: 'slate',
          },
        ]}
      />

      {/* ── Upload zone ── */}
      {canEdit && (
        <div className="mb-4">
          <div
            onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files) handleFiles(Array.from(e.dataTransfer.files));
            }}
            className={`flex items-center gap-4 rounded-[12px] border-2 border-dashed px-5 py-5 transition-colors ${
              dragOver
                ? 'border-[#2F8F5C] bg-[#E5F2EA]/50'
                : 'border-[#D6CDB7] bg-[#FAF8F2] hover:border-[#2F8F5C] hover:bg-[#E5F2EA]/40'
            }`}
          >
            <span className="grid h-12 w-12 flex-shrink-0 place-items-center rounded-[10px] border border-[#E6E1D4] bg-white">
              <PencilRuler className="h-5 w-5 text-[#246F47]" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[14px] font-semibold text-[#1A1A1A]">
                Drop blueprints, drawings, or permits
              </p>
              <p className="mt-0.5 text-[12px] text-[#6B6B6B]">
                Uploaded files are grouped into the plan set automatically — revisions
                of the same sheet are detected by filename stem.
              </p>
              <div className="mt-2 flex items-center gap-1">
                {['PDF', 'PNG', 'JPG'].map((t) => (
                  <span
                    key={t}
                    className="rounded-md border border-[#E6E1D4] bg-white px-1.5 py-0.5 text-[10px] font-semibold tracking-wide text-[#6B6B6B]"
                  >
                    {t}
                  </span>
                ))}
              </div>
            </div>
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className={btnPrimary}
            >
              <UploadIcon className="h-3.5 w-3.5" /> Browse
            </button>
            <input
              ref={inputRef}
              type="file"
              multiple
              accept="application/pdf,image/png,image/jpeg,image/webp"
              onChange={(e) => {
                if (e.target.files) handleFiles(Array.from(e.target.files));
                e.target.value = '';
              }}
              className="hidden"
            />
          </div>
        </div>
      )}

      {/* ── Empty state ── */}
      {isEmpty && (
        <div className={`px-6 py-16 text-center ${cardShell}`}>
          <div
            className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full"
            style={{ background: REG.wash, color: REG.sage }}
          >
            <FileBox className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h3
            className="text-[22px] font-medium text-[#1A1A1A]"
            style={{ fontFamily: FRAUNCES }}
          >
            No plans filed yet.
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">
            {canEdit
              ? 'Drop a PDF or drawing above — revisions of the same sheet are grouped automatically.'
              : 'Once drawings are filed, they appear here as a versioned plan-set register.'}
          </p>
        </div>
      )}

      {/* ── Blueprint discipline groups ── */}
      {disciplineGroups.map((group) => (
        <section key={group.label} className="mb-8">
          {/* Section header */}
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: group.tone === 'ink' ? REG.ink : REG.sage }}
              />
              <h3
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: REG.muted }}
              >
                {group.label}
              </h3>
            </div>
            <div className="flex items-center gap-2">
              <span
                className="text-[11px] tabular-nums"
                style={{ color: REG.faint }}
              >
                {group.sheets.length} sheet{group.sheets.length === 1 ? '' : 's'}
              </span>
              {group.sheets.some((s) => s.revisions.length > 1) && (
                <StatusPill tone="slate">
                  {group.sheets.filter((s) => s.revisions.length > 1).length} multi-rev
                </StatusPill>
              )}
            </div>
          </div>

          {/* Sheet cards — 2-col on md, 3-col on xl */}
          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {group.sheets.map((sheet) => (
              <SheetCard
                key={sheet.key}
                sheet={sheet}
                canEdit={canEdit}
                taskName={sheet.current.taskId ? taskById.get(sheet.current.taskId) : undefined}
              />
            ))}
          </div>
        </section>
      ))}

      {/* ── Permits register ── */}
      {permitSheets.length > 0 && (
        <section className="mb-8">
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span
                className="inline-block h-2 w-2 rounded-full"
                style={{ background: '#C8841E' }}
              />
              <h3
                className="text-[11px] font-semibold uppercase tracking-[0.12em]"
                style={{ color: REG.muted }}
              >
                Permits &amp; Authorities
              </h3>
            </div>
            <div className="flex items-center gap-3">
              <span
                className="text-[11px] tabular-nums"
                style={{ color: REG.faint }}
              >
                {permitSheets.length} permit{permitSheets.length === 1 ? '' : 's'}
              </span>
              {/* Expiry status note — no expires_at field yet */}
              <span
                className="rounded-full border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[10.5px] font-medium text-[#6B6B6B]"
                title="Permit expiry status requires an expires_at column — see report for details"
              >
                Expiry tracking: not configured
              </span>
            </div>
          </div>

          <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {permitSheets.map((sheet) => (
              <PermitCard
                key={sheet.key}
                sheet={sheet}
                taskName={sheet.current.taskId ? taskById.get(sheet.current.taskId) : undefined}
              />
            ))}
          </div>

          {/* Future expiry note */}
          <p className="mt-3 text-[11.5px]" style={{ color: REG.faint }}>
            Permit validity status (Valid / Expiring / Expired) will appear here once an{' '}
            <code className="rounded bg-[#F0EDE4] px-1 py-0.5 text-[10.5px]">expires_at</code>{' '}
            column is added to the documents table.
          </p>
        </section>
      )}

      {/* ── Data-gap notice (dev-facing, small) ── */}
      {!isEmpty && (
        <div
          className="mt-2 rounded-[10px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3 text-[11.5px]"
          style={{ color: REG.muted }}
        >
          <strong style={{ color: REG.body }}>Register capabilities:</strong>
          {' '}Grouping by discipline and revision history from filename stem — live.
          Permit expiry chips — needs <code className="rounded bg-[#F0EDE4] px-1">expires_at</code> column.
          Task-link badge — live (shows when <code className="rounded bg-[#F0EDE4] px-1">taskId</code> set on upload).
          Sheet discipline split — needs <code className="rounded bg-[#F0EDE4] px-1">sheet_discipline</code> column.
        </div>
      )}
    </>
  );
}
