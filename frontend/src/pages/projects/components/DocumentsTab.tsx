import {
  BookOpen,
  FileCheck,
  FileText,
  FolderOpen,
  Image,
  Package,
  Shield,
} from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';
import { useProjectData } from '../hooks/useProjectData';
import { DocumentCategory } from '../types';
import { EmptyProjectState } from './EmptyProjectState';

interface DocumentsTabProps {
  projectId: string | null;
}

interface CategoryDef {
  key: DocumentCategory;
  name: string;
  icon: typeof FileCheck;
  color: string;
}

const CATEGORIES: CategoryDef[] = [
  { key: 'tasks', name: 'Tasks', icon: FileCheck, color: 'bg-blue-100 text-blue-600' },
  { key: 'photos', name: 'Photos / Videos', icon: Image, color: 'bg-purple-100 text-purple-600' },
  { key: 'files', name: 'Files / Docs', icon: FolderOpen, color: 'bg-emerald-100 text-emerald-600' },
  { key: 'drawings', name: 'Drawings', icon: FileText, color: 'bg-amber-100 text-amber-600' },
  { key: 'warranties', name: 'Warranties', icon: Shield, color: 'bg-red-100 text-red-600' },
  { key: 'products', name: 'Products', icon: Package, color: 'bg-pink-100 text-pink-600' },
  { key: 'documents', name: 'Documents', icon: BookOpen, color: 'bg-indigo-100 text-indigo-600' },
  { key: 'specifications', name: 'Specifications', icon: FileCheck, color: 'bg-cyan-100 text-cyan-600' },
];

export function DocumentsTab({ projectId }: DocumentsTabProps) {
  const { documentCounts } = useProjectData(projectId);

  if (!projectId) {
    return (
      <EmptyProjectState message="Document counts are per project — pick a project to see its files, drawings, and specs." />
    );
  }

  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
      {CATEGORIES.map((cat) => {
        const Icon = cat.icon;
        const count = documentCounts[cat.key];
        return (
          <Card key={cat.key} className="cursor-pointer transition-colors hover:bg-slate-50">
            <CardContent className="p-6">
              <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${cat.color}`}>
                <Icon className="h-6 w-6" />
              </div>
              <h3 className="font-medium text-slate-900">{cat.name}</h3>
              <p className="text-sm text-slate-500 tabular-nums">
                {count} {count === 1 ? 'item' : 'items'}
              </p>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
