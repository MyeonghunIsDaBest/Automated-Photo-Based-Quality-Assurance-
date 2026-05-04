import { useMemo, useState } from 'react';
import {
  ArrowUpDown,
  Download,
  ExternalLink,
  FileBox,
  FileText,
  Grid3x3,
  Image as ImageIcon,
  Layers,
  List as ListIcon,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from 'lucide-react';
import { format, formatDistanceToNow, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useFeatureStore, type ProjectDocument } from '../../../store/features';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { InlineDropzone } from '../components/InlineDropzone';

interface PlansTabProps {
  project: Project;
  canEdit: boolean;
}

// ─── Types & constants ────────────────────────────────────────────────────

// Treat blueprints + drawings + permits as "plans" — anything a builder
// would file under "drawings" on a real job.
type PlanCategory = Extract<ProjectDocument['category'], 'blueprint' | 'permit'>;
type FilterKey = 'all' | PlanCategory;
type SortKey = 'newest' | 'oldest' | 'name' | 'largest';
type ViewMode = 'grid' | 'list';

const PLAN_CATEGORIES: PlanCategory[] = ['blueprint', 'permit'];

// Per-category visual tokens. Mirrors the rest of the workspace where each
// category gets a subtle hue accent without leaning into hard colors.
const CATEGORY_META: Record<
  PlanCategory,
  {
    label: string;
    shortLabel: string;
    icon: typeof FileBox;
    stripe: string;     // 1px accent stripe at the top of each card
    chip: string;       // small badge styling
    iconWrap: string;   // file-icon background tint
  }
> = {
  blueprint: {
    label: 'Blueprints & Drawings',
    shortLabel: 'Blueprint',
    icon: FileBox,
    stripe: 'bg-blue-500',
    chip: 'border-blue-200 bg-blue-50 text-blue-700',
    iconWrap: 'bg-blue-50 text-blue-600',
  },
  permit: {
    label: 'Permits',
    shortLabel: 'Permit',
    icon: ShieldCheck,
    stripe: 'bg-amber-500',
    chip: 'border-amber-200 bg-amber-50 text-amber-700',
    iconWrap: 'bg-amber-50 text-amber-700',
  },
};

const SORT_OPTIONS: { value: SortKey; label: string }[] = [
  { value: 'newest',  label: 'Newest first' },
  { value: 'oldest',  label: 'Oldest first' },
  { value: 'name',    label: 'Name (A → Z)' },
  { value: 'largest', label: 'Largest first' },
];

// ─── Helpers ──────────────────────────────────────────────────────────────

const formatBytes = (bytes: number): string => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.min(sizes.length - 1, Math.floor(Math.log(bytes) / Math.log(k)));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

const isImageDoc = (d: ProjectDocument) => d.type === 'photo';
const isPdfDoc   = (d: ProjectDocument) => /\.pdf$/i.test(d.name);

const fileStem = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(0, i) : name;
};
const fileExt = (name: string) => {
  const i = name.lastIndexOf('.');
  return i > 0 ? name.slice(i + 1).toUpperCase() : '';
};

const isLivePlan = (d: ProjectDocument): d is ProjectDocument & { category: PlanCategory } =>
  (PLAN_CATEGORIES as ProjectDocument['category'][]).includes(d.category);

// ─── Component ────────────────────────────────────────────────────────────

export function PlansTab({ project, canEdit }: PlansTabProps) {
  const documents = useFeatureStore((s) => s.documents);
  const uploadDoc = useFeatureStore((s) => s.uploadDocument);
  const deleteDoc = useFeatureStore((s) => s.deleteDocument);

  // ─── Local UI state ─────────────────────────────────────────────────────
  const [filter, setFilter] = useState<FilterKey>('all');
  const [sort, setSort]     = useState<SortKey>('newest');
  const [view, setView]     = useState<ViewMode>('grid');
  const [query, setQuery]   = useState('');
  const [uploadCategory, setUploadCategory] = useState<PlanCategory>('blueprint');

  // ─── Data slicing ───────────────────────────────────────────────────────
  const allPlans = useMemo(
    () => documents.filter((d) => d.projectId === project.id && isLivePlan(d)),
    [documents, project.id],
  );

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: allPlans.length, blueprint: 0, permit: 0 };
    for (const d of allPlans) c[d.category as PlanCategory] += 1;
    return c;
  }, [allPlans]);

  const totalSize = useMemo(
    () => allPlans.reduce((sum, d) => sum + (d.size ?? 0), 0),
    [allPlans],
  );

  const lastUpload = useMemo(() => {
    if (allPlans.length === 0) return null;
    return allPlans
      .map((d) => parseISO(d.uploadedAt).getTime())
      .reduce((a, b) => Math.max(a, b), 0);
  }, [allPlans]);

  const filteredSorted = useMemo(() => {
    const q = query.trim().toLowerCase();
    let list = allPlans.filter((d) => filter === 'all' || d.category === filter);
    if (q) list = list.filter((d) => d.name.toLowerCase().includes(q));

    const byDateDesc = (a: ProjectDocument, b: ProjectDocument) =>
      parseISO(b.uploadedAt).getTime() - parseISO(a.uploadedAt).getTime();

    switch (sort) {
      case 'newest':  return [...list].sort(byDateDesc);
      case 'oldest':  return [...list].sort((a, b) => -byDateDesc(a, b));
      case 'name':    return [...list].sort((a, b) => a.name.localeCompare(b.name));
      case 'largest': return [...list].sort((a, b) => b.size - a.size);
      default:        return list;
    }
  }, [allPlans, filter, sort, query]);

  // ─── Handlers ───────────────────────────────────────────────────────────
  const handleFiles = (files: File[]) => {
    files.forEach((file) => {
      uploadDoc({
        projectId:  project.id,
        name:       file.name,
        type:       file.type.startsWith('image/') ? 'photo' : 'document',
        category:   uploadCategory,
        size:       file.size,
        uploadedBy: 'me',
        url:        URL.createObjectURL(file),
      });
    });
  };

  const handleOpen = (d: ProjectDocument) => {
    if (d.url && d.url !== '#') window.open(d.url, '_blank', 'noopener,noreferrer');
  };

  const handleDownload = (d: ProjectDocument) => {
    if (!d.url || d.url === '#') return;
    const a = document.createElement('a');
    a.href = d.url;
    a.download = d.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const handleDelete = (d: ProjectDocument) => {
    if (!canEdit) return;
    // Native confirm is intentionally minimal — swap for a real modal once the
    // project-files page lands and deletes go through Storage.
    if (window.confirm(`Remove "${d.name}" from the plan set?`)) deleteDoc(d.id);
  };

  // ─── Header stats ───────────────────────────────────────────────────────
  const headerStats: { label: string; value: string }[] = [
    { label: 'Plans',      value: String(allPlans.length) },
    { label: 'Total size', value: formatBytes(totalSize) },
    {
      label: 'Last upload',
      value: lastUpload ? formatDistanceToNow(lastUpload, { addSuffix: true }) : '—',
    },
  ];

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Plans · ${project.name}`}
        title="Drawings, blueprints, permits."
        description="Drop a PDF or image and it lands in the plan set. Local-only for now — a real Storage path lands when the project-files page goes live."
        action={
          allPlans.length > 0 ? (
            <Badge variant="secondary" className="gap-1.5 px-2.5 py-1 text-[11px] font-medium">
              <Layers className="h-3 w-3" />
              {allPlans.length} {allPlans.length === 1 ? 'plan' : 'plans'}
            </Badge>
          ) : null
        }
      />

      {/* ─── Editorial stats strip ───────────────────────────────────────── */}
      {allPlans.length > 0 && (
        <div className="mb-6 grid grid-cols-3 gap-px overflow-hidden rounded-2xl border border-slate-200 bg-slate-200">
          {headerStats.map((s) => (
            <div key={s.label} className="bg-white px-4 py-4 sm:px-5">
              <div className="text-[10px] font-medium uppercase tracking-[0.2em] text-slate-500">
                {s.label}
              </div>
              <div
                className="mt-1.5 text-2xl text-slate-900"
                style={{
                  fontFamily: "'Fraunces', Georgia, serif",
                  fontFeatureSettings: "'ss01'",
                  fontVariantNumeric: 'tabular-nums',
                  letterSpacing: '-0.02em',
                }}
              >
                {s.value}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ─── Upload block with category selector ─────────────────────────── */}
      {canEdit && (
        <div className="mb-6">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-slate-500">
              File this drop as
            </span>
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-0.5">
              {PLAN_CATEGORIES.map((cat) => {
                const meta = CATEGORY_META[cat];
                const Icon = meta.icon;
                const active = uploadCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setUploadCategory(cat)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-3.5 w-3.5" />
                    {meta.shortLabel}
                  </button>
                );
              })}
            </div>
          </div>
          <InlineDropzone
            onFiles={handleFiles}
            accept={{
              'application/pdf': ['.pdf'],
              'image/*':         ['.png', '.jpg', '.jpeg', '.webp'],
            }}
            badges={['PDF', 'PNG', 'JPG']}
            helperText={`Drop a file — added to the plan set as a ${CATEGORY_META[uploadCategory].shortLabel.toLowerCase()}`}
          />
        </div>
      )}

      {/* ─── Toolbar: filter chips, search, sort, view ───────────────────── */}
      {allPlans.length > 0 && (
        <div className="mb-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          {/* Filter chips */}
          <div className="-mx-4 overflow-x-auto px-4 md:mx-0 md:overflow-visible md:px-0">
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1">
              {(
                [
                  { key: 'all',       label: 'All' },
                  { key: 'blueprint', label: 'Blueprints' },
                  { key: 'permit',    label: 'Permits' },
                ] as { key: FilterKey; label: string }[]
              ).map((c) => {
                const active = filter === c.key;
                const n = counts[c.key];
                return (
                  <button
                    key={c.key}
                    type="button"
                    onClick={() => setFilter(c.key)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
                      active
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    {c.label}
                    {n > 0 && (
                      <span
                        className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold tabular-nums ${
                          active ? 'bg-white/15 text-white' : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        {n}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Search */}
            <div className="relative flex-1 md:w-56 md:flex-none">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search plans…"
                className="h-9 w-full pl-8 pr-8 text-xs"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  aria-label="Clear search"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Sort */}
            <div className="relative">
              <ArrowUpDown className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
              <select
                value={sort}
                onChange={(e) => setSort(e.target.value as SortKey)}
                className="h-9 cursor-pointer appearance-none rounded-md border border-slate-200 bg-white pl-8 pr-7 text-xs font-medium text-slate-700 hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                {SORT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>

            {/* View toggle */}
            <div className="inline-flex items-center gap-0.5 rounded-md border border-slate-200 bg-white p-0.5">
              <button
                type="button"
                onClick={() => setView('grid')}
                aria-label="Grid view"
                aria-pressed={view === 'grid'}
                className={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${
                  view === 'grid'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <Grid3x3 className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => setView('list')}
                aria-label="List view"
                aria-pressed={view === 'list'}
                className={`inline-flex h-7 w-7 items-center justify-center rounded transition-colors ${
                  view === 'list'
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-500 hover:bg-slate-50 hover:text-slate-700'
                }`}
              >
                <ListIcon className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── Empty / results ─────────────────────────────────────────────── */}
      {allPlans.length === 0 ? (
        <EmptyState
          icon={FileBox}
          title="No plans yet."
          description={canEdit ? 'Drop one above to add it to the project.' : undefined}
        />
      ) : filteredSorted.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Nothing matches that filter."
          description={
            query
              ? `No plans contain "${query}". Try clearing the search or switching the filter.`
              : 'Try a different category or clear the filter to see everything.'
          }
          action={
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setFilter('all');
                setQuery('');
              }}
            >
              Reset filters
            </Button>
          }
        />
      ) : view === 'grid' ? (
        <GridView
          docs={filteredSorted}
          canEdit={canEdit}
          onOpen={handleOpen}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
      ) : (
        <ListView
          docs={filteredSorted}
          canEdit={canEdit}
          onOpen={handleOpen}
          onDownload={handleDownload}
          onDelete={handleDelete}
        />
      )}
    </>
  );
}

// ─── Subviews ─────────────────────────────────────────────────────────────

interface ViewProps {
  docs: (ProjectDocument & { category: PlanCategory })[];
  canEdit: boolean;
  onOpen: (d: ProjectDocument) => void;
  onDownload: (d: ProjectDocument) => void;
  onDelete: (d: ProjectDocument) => void;
}

function GridView({ docs, canEdit, onOpen, onDownload, onDelete }: ViewProps) {
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
      {docs.map((d) => (
        <PlanCard
          key={d.id}
          doc={d}
          canEdit={canEdit}
          onOpen={onOpen}
          onDownload={onDownload}
          onDelete={onDelete}
        />
      ))}
    </div>
  );
}

function ListView({ docs, canEdit, onOpen, onDownload, onDelete }: ViewProps) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <ul className="divide-y divide-slate-100">
        {docs.map((d) => {
          const meta = CATEGORY_META[d.category];
          const Icon = meta.icon;
          const isImg = isImageDoc(d);
          const isPdf = isPdfDoc(d);
          return (
            <li
              key={d.id}
              className="group flex items-center gap-4 px-4 py-3 transition-colors hover:bg-slate-50/70 sm:px-5"
            >
              {/* Thumbnail / icon */}
              <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-lg">
                <span className={`absolute inset-y-0 left-0 w-1 ${meta.stripe}`} aria-hidden />
                {isImg && d.url && d.url !== '#' ? (
                  <img
                    src={d.url}
                    alt=""
                    className="h-full w-full object-cover"
                    loading="lazy"
                  />
                ) : (
                  <div
                    className={`flex h-full w-full items-center justify-center ${meta.iconWrap}`}
                  >
                    {isPdf ? (
                      <FileText className="h-5 w-5" />
                    ) : isImg ? (
                      <ImageIcon className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                )}
              </div>

              {/* Filename + meta */}
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-slate-900">{d.name}</p>
                <p className="mt-0.5 truncate text-[11px] text-slate-500">
                  {formatBytes(d.size)} · {format(parseISO(d.uploadedAt), 'MMM d, yyyy')}
                  {d.uploadedBy ? ` · ${d.uploadedBy}` : ''}
                </p>
              </div>

              {/* Category chip */}
              <Badge
                variant="outline"
                className={`hidden flex-shrink-0 text-[10px] sm:inline-flex ${meta.chip}`}
              >
                {meta.shortLabel}
              </Badge>

              {/* Actions */}
              <div className="flex flex-shrink-0 items-center gap-1">
                <RowActionButton
                  label="Open"
                  icon={ExternalLink}
                  onClick={() => onOpen(d)}
                  disabled={!d.url || d.url === '#'}
                />
                <RowActionButton
                  label="Download"
                  icon={Download}
                  onClick={() => onDownload(d)}
                  disabled={!d.url || d.url === '#'}
                />
                {canEdit && (
                  <RowActionButton
                    label="Delete"
                    icon={Trash2}
                    onClick={() => onDelete(d)}
                    danger
                  />
                )}
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}

interface PlanCardProps {
  doc: ProjectDocument & { category: PlanCategory };
  canEdit: boolean;
  onOpen: (d: ProjectDocument) => void;
  onDownload: (d: ProjectDocument) => void;
  onDelete: (d: ProjectDocument) => void;
}

function PlanCard({ doc, canEdit, onOpen, onDownload, onDelete }: PlanCardProps) {
  const meta = CATEGORY_META[doc.category];
  const Icon = meta.icon;
  const isImg = isImageDoc(doc);
  const isPdf = isPdfDoc(doc);
  const ext = fileExt(doc.name);

  return (
    <Card className="group overflow-hidden border-slate-200 transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md">
      {/* Top accent stripe — hue keyed to category */}
      <div className={`h-1 w-full ${meta.stripe}`} aria-hidden />

      {/* Preview area: image, PDF placeholder, or category icon */}
      <button
        type="button"
        onClick={() => onOpen(doc)}
        className="relative flex h-32 w-full items-center justify-center overflow-hidden bg-slate-50 transition-colors hover:bg-slate-100"
      >
        {isImg && doc.url && doc.url !== '#' ? (
          <img
            src={doc.url}
            alt=""
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.02]"
            loading="lazy"
          />
        ) : (
          <>
            {/* Soft gradient backdrop using the category hue */}
            <div className={`absolute inset-0 opacity-40 ${meta.iconWrap}`} aria-hidden />
            <div className="relative flex h-14 w-14 items-center justify-center rounded-xl bg-white shadow-sm">
              {isPdf ? (
                <FileText className="h-6 w-6 text-rose-500" />
              ) : (
                <Icon className="h-6 w-6 text-slate-700" />
              )}
            </div>
          </>
        )}

        {/* Top-right ext chip */}
        {ext && (
          <span className="absolute right-2 top-2 rounded-md bg-white/90 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700 shadow-sm backdrop-blur">
            {ext}
          </span>
        )}

        {/* Top-left category chip */}
        <span
          className={`absolute left-2 top-2 rounded-md border px-1.5 py-0.5 text-[10px] font-medium ${meta.chip}`}
        >
          {meta.shortLabel}
        </span>
      </button>

      <CardContent className="p-3.5">
        <p className="truncate text-sm font-medium text-slate-900" title={doc.name}>
          {fileStem(doc.name)}
        </p>
        <p className="mt-1 text-[11px] tabular-nums text-slate-500">
          {formatBytes(doc.size)} · {format(parseISO(doc.uploadedAt), 'MMM d, yyyy')}
        </p>

        {/* Action row */}
        <div className="mt-3 flex items-center justify-between gap-1 border-t border-slate-100 pt-2.5">
          <button
            type="button"
            onClick={() => onOpen(doc)}
            disabled={!doc.url || doc.url === '#'}
            className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-600 hover:text-slate-900 disabled:opacity-40"
          >
            <ExternalLink className="h-3 w-3" />
            Open
          </button>
          <div className="flex items-center gap-0.5">
            <RowActionButton
              label="Download"
              icon={Download}
              onClick={() => onDownload(doc)}
              disabled={!doc.url || doc.url === '#'}
              compact
            />
            {canEdit && (
              <RowActionButton
                label="Delete"
                icon={Trash2}
                onClick={() => onDelete(doc)}
                danger
                compact
              />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

// Tiny row-action button — used in both list view and card footer.
interface RowActionButtonProps {
  label: string;
  icon: typeof Download;
  onClick: () => void;
  disabled?: boolean;
  danger?: boolean;
  compact?: boolean;
}

function RowActionButton({
  label,
  icon: Icon,
  onClick,
  disabled,
  danger,
  compact,
}: RowActionButtonProps) {
  const sizeCls = compact ? 'h-6 w-6' : 'h-8 w-8';
  const iconCls = compact ? 'h-3 w-3' : 'h-3.5 w-3.5';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={label}
      aria-label={label}
      className={`inline-flex ${sizeCls} items-center justify-center rounded-md text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 ${
        danger ? 'hover:bg-red-50 hover:text-red-600' : ''
      }`}
    >
      <Icon className={iconCls} />
    </button>
  );
}