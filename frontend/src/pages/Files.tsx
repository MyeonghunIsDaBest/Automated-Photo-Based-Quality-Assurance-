import { useState, useCallback, useMemo } from 'react';
import { useDropzone } from 'react-dropzone';
import { useFeatureStore } from '../store/features';
import type { ProjectDocument as Document } from '../store/features';
import {
  Upload, File as FileIcon, Image as ImageIcon, Video, Trash2, Download,
  Search, X, Grid3x3, List, MoreHorizontal, FileText, Clock, ArrowUpRight,
  Layers, FolderOpen,
} from 'lucide-react';
import { format, formatDistanceToNow } from 'date-fns';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';

// ─────────────────────────────────────────────────────────────────────────────

const CATEGORIES = [
  { value: 'contract',  label: 'Contracts',  hue: '#B45309' }, // amber
  { value: 'permit',    label: 'Permits',    hue: '#0E7490' }, // cyan
  { value: 'blueprint', label: 'Blueprints', hue: '#1E40AF' }, // blue
  { value: 'invoice',   label: 'Invoices',   hue: '#9F1239' }, // rose
  { value: 'report',    label: 'Reports',    hue: '#5B21B6' }, // violet
  { value: 'other',     label: 'Other',      hue: '#475569' }, // slate
] as const;

const TYPES = [
  { key: 'all',      label: 'All files',  Icon: Layers },
  { key: 'document', label: 'Documents',  Icon: FileText },
  { key: 'photo',    label: 'Photos',     Icon: ImageIcon },
  { key: 'video',    label: 'Videos',     Icon: Video },
] as const;

const TYPE_TOKEN: Record<string, { bg: string; text: string; soft: string }> = {
  document: { bg: 'bg-rose-50',    text: 'text-rose-700',    soft: 'bg-rose-100' },
  photo:    { bg: 'bg-sky-50',     text: 'text-sky-700',     soft: 'bg-sky-100' },
  video:    { bg: 'bg-violet-50',  text: 'text-violet-700',  soft: 'bg-violet-100' },
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

// ─── Fonts ────────────────────────────────────────────────────────────────────

const FONT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap');
  .files-root { font-family: 'DM Sans', system-ui, sans-serif; }
  .files-root .display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; letter-spacing: -0.02em; }
  .files-root .num    { font-family: 'Fraunces', Georgia, serif; font-variant-numeric: tabular-nums; letter-spacing: -0.04em; }
  .files-root .grid-bg {
    background-image:
      linear-gradient(to right, rgba(15, 23, 42, 0.04) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 23, 42, 0.04) 1px, transparent 1px);
    background-size: 32px 32px;
  }
  .files-root .scrollbar-thin::-webkit-scrollbar { width: 6px; height: 6px; }
  .files-root .scrollbar-thin::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 9999px; }
`;

// ─── Component ────────────────────────────────────────────────────────────────

export default function Files() {
  const { documents, uploadDocument, deleteDocument } = useFeatureStore();
  const [activeTab, setActiveTab] = useState<'all' | 'document' | 'photo' | 'video'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState('');
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<Document['category']>('other');

  // ── Stats ──
  const stats = useMemo(() => {
    const total = documents.length;
    const totalSize = documents.reduce((s, d) => s + (d.size || 0), 0);
    const byType = (t: string) => documents.filter(d => d.type === t);
    return {
      total,
      totalSize,
      docs: byType('document'),
      photos: byType('photo'),
      videos: byType('video'),
    };
  }, [documents]);

  const categoryCounts = useMemo(() => {
    const map: Record<string, number> = {};
    documents.forEach(d => { map[d.category] = (map[d.category] || 0) + 1; });
    return map;
  }, [documents]);

  // ── Upload ──
  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach(file => {
      uploadDocument({
        projectId: 'project_1',
        name: file.name,
        type: file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : 'document',
        category: uploadCategory,
        size: file.size,
        uploadedBy: 'user_1',
        url: URL.createObjectURL(file),
      });
    });
    setUploadOpen(false);
  }, [uploadDocument, uploadCategory]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'video/*': ['.mp4', '.mov'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  });

  // ── Filtering ──
  const filtered = documents.filter(doc => {
    if (activeTab !== 'all' && doc.type !== activeTab) return false;
    if (filterCategory && doc.category !== filterCategory) return false;
    if (searchQuery && !doc.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  });

  const recent = useMemo(
    () => [...documents]
      .sort((a, b) => new Date(b.uploadedAt).getTime() - new Date(a.uploadedAt).getTime())
      .slice(0, 4),
    [documents]
  );

  // ─────────────────────────────────────────────────────────────

  return (
    <div className="files-root min-h-full bg-[#FAFAF7]">
      <style>{FONT_STYLES}</style>

      {/* ─── Editorial Header ─── */}
      <header className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />

        <div className="relative px-8 pt-10 pb-6">
          <div className="flex items-end justify-between gap-6 flex-wrap">
            <div>
              <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500 mb-3">
                <span className="inline-block h-px w-6 bg-slate-400" />
                Workspace · Project Files
              </div>
              <h1 className="display text-5xl font-medium text-slate-900 leading-none">
                The <em className="italic font-normal text-emerald-700">archive</em>.
              </h1>
              <p className="mt-3 max-w-md text-[15px] text-slate-500 leading-relaxed">
                Every contract, blueprint, photo, and field report — kept, searchable,
                and one click from where you need it.
              </p>
            </div>

            <button
              onClick={() => setUploadOpen(true)}
              className="group flex items-center gap-2.5 rounded-full bg-slate-900 px-5 py-3 text-sm font-medium text-white transition-all hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-700/20 hover:-translate-y-0.5"
            >
              <Upload className="h-4 w-4 transition-transform group-hover:-translate-y-px" />
              Upload files
              <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </button>
          </div>

          {/* ── Stat strip ── */}
          <div className="mt-10 grid grid-cols-2 gap-px rounded-2xl border border-slate-200 bg-slate-200 overflow-hidden md:grid-cols-4">
            <StatCell
              label="Total files"
              value={stats.total.toString()}
              caption={formatBytes(stats.totalSize) + ' archived'}
              accent="#0F172A"
            />
            <StatCell
              label="Documents"
              value={stats.docs.length.toString()}
              caption={formatBytes(stats.docs.reduce((s, d) => s + d.size, 0))}
              accent="#BE123C"
            />
            <StatCell
              label="Photos"
              value={stats.photos.length.toString()}
              caption={formatBytes(stats.photos.reduce((s, d) => s + d.size, 0))}
              accent="#0369A1"
            />
            <StatCell
              label="Videos"
              value={stats.videos.length.toString()}
              caption={formatBytes(stats.videos.reduce((s, d) => s + d.size, 0))}
              accent="#6D28D9"
            />
          </div>
        </div>
      </header>

      {/* ─── Body ─── */}
      <div className="px-8 py-8 grid gap-8 lg:grid-cols-[1fr_280px]">

        {/* ── Main column ── */}
        <main>
          {/* Type tabs + tools */}
          <div className="flex items-center justify-between gap-4 flex-wrap mb-6">
            <div className="flex items-center gap-1 rounded-full bg-white p-1 border border-slate-200 shadow-sm">
              {TYPES.map(t => {
                const isActive = activeTab === t.key;
                const count = t.key === 'all' ? documents.length : documents.filter(d => d.type === t.key).length;
                return (
                  <button
                    key={t.key}
                    onClick={() => setActiveTab(t.key)}
                    className={`flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-medium transition-all ${
                      isActive
                        ? 'bg-slate-900 text-white shadow-sm'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <t.Icon className="h-3.5 w-3.5" />
                    {t.label}
                    <span className={`tabular-nums text-[11px] ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>

            <div className="flex items-center gap-2">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  type="text"
                  placeholder="Search archive…"
                  value={searchQuery}
                  onChange={e => setSearchQuery(e.target.value)}
                  className="w-56 pl-9 h-9 rounded-full border-slate-200 bg-white"
                />
              </div>
              <div className="flex items-center rounded-full bg-white border border-slate-200 p-0.5 shadow-sm">
                <button
                  onClick={() => setView('grid')}
                  className={`rounded-full p-1.5 transition-colors ${view === 'grid' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}
                  aria-label="Grid view"
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                </button>
                <button
                  onClick={() => setView('list')}
                  className={`rounded-full p-1.5 transition-colors ${view === 'list' ? 'bg-slate-900 text-white' : 'text-slate-400 hover:text-slate-700'}`}
                  aria-label="List view"
                >
                  <List className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          </div>

          {/* Active filter chip */}
          {(filterCategory || searchQuery) && (
            <div className="flex items-center gap-2 mb-4 text-sm">
              <span className="text-slate-500">Filtered:</span>
              {filterCategory && (
                <Chip onRemove={() => setFilterCategory('')}>
                  {CATEGORIES.find(c => c.value === filterCategory)?.label}
                </Chip>
              )}
              {searchQuery && (
                <Chip onRemove={() => setSearchQuery('')}>
                  "{searchQuery}"
                </Chip>
              )}
              <span className="text-slate-400 ml-1">· {filtered.length} results</span>
            </div>
          )}

          {/* Files */}
          {filtered.length === 0 ? (
            <EmptyState onUpload={() => setUploadOpen(true)} />
          ) : view === 'grid' ? (
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
              {filtered.map(doc => (
                <FileCard key={doc.id} doc={doc} onDelete={() => deleteDocument(doc.id)} />
              ))}
            </div>
          ) : (
            <FileList docs={filtered} onDelete={deleteDocument} />
          )}
        </main>

        {/* ── Sidebar ── */}
        <aside className="space-y-6">
          {/* Categories */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="display text-lg font-medium text-slate-900">Categories</h3>
              <span className="text-xs text-slate-400">{documents.length} total</span>
            </div>
            <div className="space-y-1">
              <button
                onClick={() => setFilterCategory('')}
                className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                  filterCategory === '' ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                <span className="flex items-center gap-2.5">
                  <FolderOpen className="h-3.5 w-3.5" />
                  All
                </span>
                <span className={`tabular-nums text-xs ${filterCategory === '' ? 'text-slate-300' : 'text-slate-400'}`}>
                  {documents.length}
                </span>
              </button>
              {CATEGORIES.map(cat => {
                const isActive = filterCategory === cat.value;
                const count = categoryCounts[cat.value] || 0;
                return (
                  <button
                    key={cat.value}
                    onClick={() => setFilterCategory(cat.value)}
                    className={`flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm transition-colors ${
                      isActive ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="flex items-center gap-2.5">
                      <span className="inline-block h-2 w-2 rounded-full" style={{ backgroundColor: cat.hue }} />
                      {cat.label}
                    </span>
                    <span className={`tabular-nums text-xs ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          {/* Recent activity */}
          <section className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex items-center gap-2 mb-4">
              <Clock className="h-4 w-4 text-slate-400" />
              <h3 className="display text-lg font-medium text-slate-900">Recent</h3>
            </div>
            {recent.length === 0 ? (
              <p className="text-sm text-slate-400 italic">Nothing yet.</p>
            ) : (
              <ul className="space-y-3">
                {recent.map(doc => {
                  const Icon = doc.type === 'photo' ? ImageIcon : doc.type === 'video' ? Video : FileIcon;
                  const tok = TYPE_TOKEN[doc.type];
                  return (
                    <li key={doc.id} className="flex items-start gap-3">
                      <div className={`flex h-8 w-8 flex-shrink-0 items-center justify-center rounded-lg ${tok.bg} ${tok.text}`}>
                        <Icon className="h-3.5 w-3.5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-800">{doc.name}</p>
                        <p className="text-[11px] text-slate-400">
                          {formatDistanceToNow(new Date(doc.uploadedAt), { addSuffix: true })}
                        </p>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}
          </section>
        </aside>
      </div>

      {/* ─── Upload Modal ─── */}
      {uploadOpen && (
        <UploadModal
          isDragActive={isDragActive}
          getRootProps={getRootProps}
          getInputProps={getInputProps}
          uploadCategory={uploadCategory}
          setUploadCategory={setUploadCategory}
          onClose={() => setUploadOpen(false)}
        />
      )}
    </div>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────────

function StatCell({ label, value, caption, accent }: { label: string; value: string; caption: string; accent: string }) {
  return (
    <div className="bg-white p-5 relative overflow-hidden">
      <div className="absolute top-0 left-0 h-px w-8" style={{ backgroundColor: accent }} />
      <p className="text-[11px] font-medium uppercase tracking-[0.15em] text-slate-500">{label}</p>
      <p className="num mt-2 text-4xl font-medium text-slate-900">{value}</p>
      <p className="mt-1 text-xs text-slate-400">{caption}</p>
    </div>
  );
}

function Chip({ children, onRemove }: { children: React.ReactNode; onRemove: () => void }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-3 py-1 text-xs font-medium text-white">
      {children}
      <button onClick={onRemove} className="hover:text-slate-300">
        <X className="h-3 w-3" />
      </button>
    </span>
  );
}

function FileCard({ doc, onDelete }: { doc: Document; onDelete: () => void }) {
  const Icon = doc.type === 'photo' ? ImageIcon : doc.type === 'video' ? Video : FileIcon;
  const tok = TYPE_TOKEN[doc.type];
  const cat = CATEGORIES.find(c => c.value === doc.category);
  const isVisual = doc.type === 'photo' && doc.url;

  return (
    <article className="group relative overflow-hidden rounded-2xl border border-slate-200 bg-white transition-all hover:shadow-lg hover:shadow-slate-200/60 hover:-translate-y-0.5">
      {/* Preview */}
      <div className={`relative aspect-[5/3] overflow-hidden ${isVisual ? '' : tok.bg}`}>
        {isVisual ? (
          <img
            src={doc.url}
            alt={doc.name}
            className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
            onError={e => { (e.currentTarget.style.display = 'none'); }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className={`h-14 w-14 ${tok.text} opacity-60`} strokeWidth={1.25} />
          </div>
        )}

        {/* Hover actions */}
        <div className="absolute inset-x-0 top-0 flex items-center justify-between p-3 opacity-0 translate-y-1 transition-all group-hover:opacity-100 group-hover:translate-y-0">
          <span className={`rounded-full backdrop-blur-md bg-white/85 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider ${tok.text}`}>
            {doc.type}
          </span>
          <div className="flex gap-1">
            <IconAction title="Download"><Download className="h-3.5 w-3.5" /></IconAction>
            <IconAction title="Delete" onClick={onDelete} danger><Trash2 className="h-3.5 w-3.5" /></IconAction>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="p-4">
        <h4 className="font-medium text-slate-900 truncate" title={doc.name}>{doc.name}</h4>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className="flex items-center gap-1.5 text-slate-500">
            {cat && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.hue }} />}
            <span className="capitalize">{doc.category}</span>
            <span className="text-slate-300">·</span>
            <span className="tabular-nums">{formatBytes(doc.size)}</span>
          </span>
          <span className="text-slate-400 tabular-nums">{format(new Date(doc.uploadedAt), 'MMM d')}</span>
        </div>
      </div>
    </article>
  );
}

function IconAction({ children, onClick, danger, title }: { children: React.ReactNode; onClick?: () => void; danger?: boolean; title: string }) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={`flex h-7 w-7 items-center justify-center rounded-full backdrop-blur-md transition-colors ${
        danger
          ? 'bg-white/85 text-rose-600 hover:bg-rose-600 hover:text-white'
          : 'bg-white/85 text-slate-700 hover:bg-slate-900 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

function FileList({ docs, onDelete }: { docs: Document[]; onDelete: (id: string) => void }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white">
      <div className="grid grid-cols-[1fr_120px_140px_100px_60px] gap-4 px-5 py-3 border-b border-slate-100 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        <span>Name</span>
        <span>Category</span>
        <span>Uploaded</span>
        <span className="text-right">Size</span>
        <span></span>
      </div>
      {docs.map(doc => {
        const Icon = doc.type === 'photo' ? ImageIcon : doc.type === 'video' ? Video : FileIcon;
        const tok = TYPE_TOKEN[doc.type];
        const cat = CATEGORIES.find(c => c.value === doc.category);
        return (
          <div
            key={doc.id}
            className="grid grid-cols-[1fr_120px_140px_100px_60px] items-center gap-4 border-b border-slate-50 px-5 py-3 text-sm transition-colors hover:bg-slate-50/70 last:border-0"
          >
            <div className="flex items-center gap-3 min-w-0">
              <div className={`flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg ${tok.bg} ${tok.text}`}>
                <Icon className="h-4 w-4" />
              </div>
              <span className="truncate font-medium text-slate-900">{doc.name}</span>
            </div>
            <span className="flex items-center gap-1.5 text-slate-600">
              {cat && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.hue }} />}
              <span className="capitalize">{doc.category}</span>
            </span>
            <span className="text-slate-500 text-xs">{format(new Date(doc.uploadedAt), 'MMM d, yyyy')}</span>
            <span className="text-right tabular-nums text-slate-500 text-xs">{formatBytes(doc.size)}</span>
            <div className="flex justify-end">
              <button
                onClick={() => onDelete(doc.id)}
                className="rounded-lg p-1.5 text-slate-300 hover:text-rose-600 hover:bg-rose-50 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function EmptyState({ onUpload }: { onUpload: () => void }) {
  return (
    <div className="rounded-2xl border-2 border-dashed border-slate-200 bg-white py-20 text-center">
      <div className="mx-auto mb-5 flex h-16 w-16 items-center justify-center rounded-2xl bg-slate-50 border border-slate-200">
        <FolderOpen className="h-7 w-7 text-slate-400" strokeWidth={1.5} />
      </div>
      <h3 className="display text-2xl font-medium text-slate-900">Nothing here — yet.</h3>
      <p className="mt-2 text-sm text-slate-500 max-w-xs mx-auto">
        Drop a contract, photo, or report. Your archive starts the moment you do.
      </p>
      <button
        onClick={onUpload}
        className="mt-6 inline-flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 transition-colors"
      >
        <Upload className="h-4 w-4" />
        Upload first file
      </button>
    </div>
  );
}

function UploadModal({
  isDragActive, getRootProps, getInputProps, uploadCategory, setUploadCategory, onClose,
}: {
  isDragActive: boolean;
  getRootProps: any;
  getInputProps: any;
  uploadCategory: Document['category'];
  setUploadCategory: (c: Document['category']) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm" onClick={onClose} />

      <div className="relative w-full max-w-xl rounded-3xl bg-white shadow-2xl overflow-hidden files-root">
        <div className="px-7 pt-6 pb-4 border-b border-slate-100 flex items-center justify-between">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-emerald-700">Upload</p>
            <h3 className="display text-2xl font-medium text-slate-900 mt-0.5">Add to the archive</h3>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-7">
          {/* Category selector */}
          <p className="text-xs font-medium uppercase tracking-wider text-slate-500 mb-3">Category</p>
          <div className="flex flex-wrap gap-2 mb-6">
            {CATEGORIES.map(cat => {
              const isActive = uploadCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  onClick={() => setUploadCategory(cat.value as Document['category'])}
                  className={`flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-all border ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 bg-white text-slate-600 hover:border-slate-400'
                  }`}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.hue }} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          {/* Dropzone */}
          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-2xl border-2 border-dashed py-14 px-6 text-center transition-all ${
              isDragActive
                ? 'border-emerald-500 bg-emerald-50/70 scale-[1.01]'
                : 'border-slate-200 bg-slate-50/50 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            <input {...getInputProps()} />
            <div className={`mb-4 flex h-14 w-14 items-center justify-center rounded-2xl ${isDragActive ? 'bg-emerald-100' : 'bg-white border border-slate-200'}`}>
              <Upload className={`h-6 w-6 ${isDragActive ? 'text-emerald-700' : 'text-slate-500'}`} />
            </div>
            <p className="display text-xl font-medium text-slate-900">
              {isDragActive ? 'Drop them here.' : 'Drag files in.'}
            </p>
            <p className="mt-1.5 text-sm text-slate-500">
              or <span className="text-emerald-700 font-medium underline underline-offset-2">browse</span> from your machine
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-1.5 text-[10px] font-medium uppercase tracking-wider text-slate-400">
              {['PDF', 'JPG', 'PNG', 'MP4', 'XLSX'].map(ext => (
                <span key={ext} className="rounded-full border border-slate-200 px-2 py-0.5">{ext}</span>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}