import { useMemo } from 'react';
import { FileBox } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Badge } from '../../../components/ui/badge';
import { useFeatureStore, type ProjectDocument } from '../../../store/features';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { InlineDropzone } from '../components/InlineDropzone';

interface PlansTabProps {
  project: Project;
  canEdit: boolean;
}

// Treat blueprints + drawings + permits as "plans" — anything a builder
// would file under "drawings" on a real job.
const PLAN_CATEGORIES: ProjectDocument['category'][] = ['blueprint', 'permit'];

const CATEGORY_LABEL: Partial<Record<ProjectDocument['category'], string>> = {
  blueprint: 'Blueprints & Drawings',
  permit:    'Permits',
};

export function PlansTab({ project, canEdit }: PlansTabProps) {
  const documents = useFeatureStore((s) => s.documents);
  const uploadDoc = useFeatureStore((s) => s.uploadDocument);

  const plans = useMemo(
    () =>
      documents.filter(
        (d) => d.projectId === project.id && PLAN_CATEGORIES.includes(d.category),
      ),
    [documents, project.id],
  );

  const grouped = useMemo(() => {
    const map = new Map<ProjectDocument['category'], ProjectDocument[]>();
    for (const cat of PLAN_CATEGORIES) map.set(cat, []);
    for (const d of plans) map.get(d.category)?.push(d);
    return map;
  }, [plans]);

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

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Plans · ${project.name}`}
        title="Drawings, blueprints, permits."
        description="Drop a PDF or image and it lands in the plan set. Local-only for now — a real Storage path lands when the project-files page goes live."
      />

      {canEdit && (
        <div className="mb-6">
          <InlineDropzone
            onFiles={handleFiles}
            accept={{
              'application/pdf': ['.pdf'],
              'image/*':         ['.png', '.jpg', '.jpeg', '.webp'],
            }}
            badges={['PDF', 'PNG', 'JPG']}
            helperText="Drop blueprints, drawings, or permits — added to the plan set"
          />
        </div>
      )}

      {plans.length === 0 ? (
        <EmptyState
          icon={FileBox}
          title="No plans yet."
          description={canEdit ? 'Drop one above to add it to the project.' : undefined}
        />
      ) : (
        <div className="space-y-6">
          {Array.from(grouped.entries()).map(([cat, docs]) =>
            docs.length === 0 ? null : (
              <div key={cat}>
                <div className="mb-3 flex items-baseline justify-between">
                  <h3 className="text-sm font-medium text-slate-900">
                    {CATEGORY_LABEL[cat] ?? cat}
                  </h3>
                  <Badge variant="secondary" className="text-[10px]">
                    {docs.length}
                  </Badge>
                </div>
                <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  {docs.map((d) => (
                    <Card key={d.id}>
                      <CardContent className="p-3">
                        <div className="flex items-start gap-3">
                          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-lg bg-slate-100">
                            <FileBox className="h-5 w-5 text-slate-500" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium text-slate-900">
                              {d.name}
                            </p>
                            <p className="mt-0.5 text-[11px] text-slate-500">
                              {(d.size / 1024).toFixed(0)} KB ·{' '}
                              {format(parseISO(d.uploadedAt), 'MMM d, yyyy')}
                            </p>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  ))}
                </div>
              </div>
            ),
          )}
        </div>
      )}
    </>
  );
}
