import { useCallback, useMemo, useState } from 'react';
import { useDropzone } from 'react-dropzone';
import {
  File as FileIcon, FolderOpen, Image as ImageIcon, Layers, Plus,
  Trash2, Upload as UploadIcon, Video, X,
} from 'lucide-react';
import { format } from 'date-fns';
import type { Project, User } from '../../../types';
import {
  useFeatureStore,
  type ProjectDocument as Document,
} from '../../../store/features';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';

interface FilesTabProps {
  project: Project;
  currentUser: User | null;
  canUpload: boolean;
}

// Category metadata mirrors the standalone Files page so a project's archive
// looks the same wherever it's accessed from.
const CATEGORIES = [
  { value: 'contract',  label: 'Contracts',  hue: '#B45309' },
  { value: 'permit',    label: 'Permits',    hue: '#0E7490' },
  { value: 'blueprint', label: 'Blueprints', hue: '#1E40AF' },
  { value: 'invoice',   label: 'Invoices',   hue: '#9F1239' },
  { value: 'report',    label: 'Reports',    hue: '#5B21B6' },
  { value: 'other',     label: 'Other',      hue: '#475569' },
] as const;

const TYPES = [
  { key: 'all',      label: 'All',       Icon: Layers },
  { key: 'document', label: 'Documents', Icon: FileIcon },
  { key: 'photo',    label: 'Photos',    Icon: ImageIcon },
  { key: 'video',    label: 'Videos',    Icon: Video },
] as const;

const TYPE_TOKEN: Record<string, { bg: string; text: string }> = {
  document: { bg: 'bg-rose-50',   text: 'text-rose-700' },
  photo:    { bg: 'bg-sky-50',    text: 'text-sky-700' },
  video:    { bg: 'bg-violet-50', text: 'text-violet-700' },
};

const formatBytes = (bytes: number) => {
  if (!bytes) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
};

export function FilesTab({ project, currentUser, canUpload }: FilesTabProps) {
  const allDocuments = useFeatureStore((s) => s.documents);
  const uploadDocument = useFeatureStore((s) => s.uploadDocument);
  const deleteDocument = useFeatureStore((s) => s.deleteDocument);

  const [activeType, setActiveType] = useState<'all' | 'document' | 'photo' | 'video'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [filterCategory, setFilterCategory] = useState<Document['category'] | ''>('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadCategory, setUploadCategory] = useState<Document['category']>('other');

  // Project-scoped slice — every selector below works off this so we never
  // accidentally show another project's archive.
  const projectDocuments = useMemo(
    () => allDocuments.filter((d) => d.projectId === project.id),
    [allDocuments, project.id],
  );

  const filtered = useMemo(() => projectDocuments.filter((d) => {
    if (activeType !== 'all' && d.type !== activeType) return false;
    if (filterCategory && d.category !== filterCategory) return false;
    if (searchQuery && !d.name.toLowerCase().includes(searchQuery.toLowerCase())) return false;
    return true;
  }), [projectDocuments, activeType, filterCategory, searchQuery]);

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      uploadDocument({
        projectId: project.id,
        name: file.name,
        type: file.type.startsWith('image/') ? 'photo' : file.type.startsWith('video/') ? 'video' : 'document',
        category: uploadCategory,
        size: file.size,
        uploadedBy: currentUser?.id ?? 'user_1',
        url: URL.createObjectURL(file),
      });
    });
    setUploadOpen(false);
  }, [project.id, uploadCategory, uploadDocument, currentUser?.id]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'application/pdf': ['.pdf'],
      'image/*': ['.png', '.jpg', '.jpeg', '.webp'],
      'video/*': ['.mp4', '.mov'],
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': ['.xlsx'],
    },
  });

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Files · ${project.name}`}
        title="The project archive."
        description="Contracts, blueprints, daily photos, field reports — everything filed against this project, in one place."
        action={
          canUpload && (
            <Button onClick={() => setUploadOpen(true)} className="whitespace-nowrap">
              <UploadIcon className="mr-2 h-4 w-4" />
              Upload files
            </Button>
          )
        }
      />

      {/* Type tabs + search */}
      <Card className="mb-4">
        <CardContent className="flex flex-col gap-3 p-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-between">
          <div className="-mx-1 overflow-x-auto px-1">
            <div className="inline-flex items-center gap-1 rounded-full border border-slate-200 bg-white p-1 shadow-sm">
              {TYPES.map((t) => {
                const isActive = activeType === t.key;
                const count = t.key === 'all'
                  ? projectDocuments.length
                  : projectDocuments.filter((d) => d.type === t.key).length;
                return (
                  <button
                    key={t.key}
                    type="button"
                    onClick={() => setActiveType(t.key as typeof activeType)}
                    className={`flex flex-shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-900 text-white'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <t.Icon className="h-3.5 w-3.5" />
                    {t.label}
                    <span className={`tabular-nums text-[10px] ${isActive ? 'text-slate-300' : 'text-slate-400'}`}>
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          <Input
            placeholder="Search files…"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="h-9 w-full sm:w-64"
          />
        </CardContent>
      </Card>

      {/* Category chips */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => setFilterCategory('')}
          className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
            filterCategory === ''
              ? 'border-slate-900 bg-slate-900 text-white'
              : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
          }`}
        >
          All categories
        </button>
        {CATEGORIES.map((cat) => {
          const isActive = filterCategory === cat.value;
          return (
            <button
              key={cat.value}
              type="button"
              onClick={() => setFilterCategory(cat.value)}
              className={`flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                isActive
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.hue }} />
              {cat.label}
            </button>
          );
        })}
      </div>

      {/* Files grid */}
      {filtered.length === 0 ? (
        <EmptyState
          icon={FolderOpen}
          title={projectDocuments.length === 0 ? `Nothing filed for ${project.name}.` : 'No files match your filters.'}
          description={
            projectDocuments.length === 0
              ? canUpload
                ? 'Upload a contract, photo, or report to start the archive.'
                : 'Nothing has been uploaded for this project yet.'
              : 'Try a different category or clear the search.'
          }
          action={
            canUpload && projectDocuments.length === 0 ? (
              <Button onClick={() => setUploadOpen(true)}>
                <UploadIcon className="mr-2 h-4 w-4" />
                Upload first file
              </Button>
            ) : null
          }
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((doc) => (
            <FileCard
              key={doc.id}
              doc={doc}
              onDelete={() => deleteDocument(doc.id)}
              canDelete={canUpload}
            />
          ))}
        </div>
      )}

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
    </>
  );
}

// ─── Subcomponents ────────────────────────────────────────────────────────

function FileCard({
  doc, onDelete, canDelete,
}: { doc: Document; onDelete: () => void; canDelete: boolean }) {
  const Icon = doc.type === 'photo' ? ImageIcon : doc.type === 'video' ? Video : FileIcon;
  const tok = TYPE_TOKEN[doc.type];
  const cat = CATEGORIES.find((c) => c.value === doc.category);
  const isVisual = doc.type === 'photo' && doc.url && doc.url !== '#';

  return (
    <article className="group relative overflow-hidden rounded-xl border border-slate-200 bg-white transition-all hover:shadow-md">
      <div className={`relative aspect-[5/3] overflow-hidden ${isVisual ? '' : tok.bg}`}>
        {isVisual ? (
          <img
            src={doc.url}
            alt={doc.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-105"
            onError={(e) => { (e.currentTarget.style.display = 'none'); }}
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <Icon className={`h-12 w-12 ${tok.text} opacity-70`} strokeWidth={1.25} />
          </div>
        )}

        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/85 text-rose-600 opacity-0 backdrop-blur-md transition-opacity hover:bg-rose-600 hover:text-white group-hover:opacity-100"
            aria-label="Delete file"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <div className="p-3">
        <h4 className="truncate text-sm font-medium text-slate-900" title={doc.name}>
          {doc.name}
        </h4>
        <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-500">
          <span className="flex items-center gap-1.5">
            {cat && <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.hue }} />}
            <span className="capitalize">{doc.category}</span>
            <span className="text-slate-300">·</span>
            <span className="tabular-nums">{formatBytes(doc.size)}</span>
          </span>
          <span className="tabular-nums text-slate-400">{format(new Date(doc.uploadedAt), 'MMM d')}</span>
        </div>
      </div>
    </article>
  );
}

function UploadModal({
  isDragActive, getRootProps, getInputProps, uploadCategory, setUploadCategory, onClose,
}: {
  isDragActive: boolean;
  getRootProps: () => Record<string, unknown>;
  getInputProps: () => Record<string, unknown>;
  uploadCategory: Document['category'];
  setUploadCategory: (c: Document['category']) => void;
  onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-2 sm:p-4">
      <div className="flex h-full max-h-[95vh] w-full max-w-xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-auto">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-100 px-5 py-4">
          <h3 className="text-base font-semibold text-slate-900">Upload to project</h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 active:bg-slate-200"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-5">
          <p className="mb-2 text-xs font-medium uppercase tracking-wider text-slate-500">Category</p>
          <div className="mb-5 flex flex-wrap gap-2">
            {CATEGORIES.map((cat) => {
              const isActive = uploadCategory === cat.value;
              return (
                <button
                  key={cat.value}
                  type="button"
                  onClick={() => setUploadCategory(cat.value)}
                  className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
                    isActive
                      ? 'border-slate-900 bg-slate-900 text-white'
                      : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                  }`}
                >
                  <span className="inline-block h-1.5 w-1.5 rounded-full" style={{ backgroundColor: cat.hue }} />
                  {cat.label}
                </button>
              );
            })}
          </div>

          <div
            {...getRootProps()}
            className={`flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed p-10 text-center transition-colors ${
              isDragActive
                ? 'border-emerald-500 bg-emerald-50'
                : 'border-slate-300 bg-slate-50/60 hover:border-slate-400'
            }`}
          >
            <input {...getInputProps()} />
            <UploadIcon className="mb-3 h-8 w-8 text-slate-400" />
            <p className="text-sm font-medium text-slate-900">
              {isDragActive ? 'Drop the files…' : 'Drag & drop, or click to browse'}
            </p>
            <p className="mt-1 text-xs text-slate-500">
              PDFs, images, videos, spreadsheets — anything you'd attach to the job.
            </p>
          </div>
        </div>

        <div className="flex flex-shrink-0 justify-end border-t border-slate-100 px-5 py-3">
          <Button variant="outline" size="sm" onClick={onClose}>
            <Plus className="mr-1.5 h-3.5 w-3.5 rotate-45" />
            Done
          </Button>
        </div>
      </div>
    </div>
  );
}
