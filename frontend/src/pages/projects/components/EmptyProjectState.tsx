import { FolderKanban } from 'lucide-react';
import { Card, CardContent } from '../../../components/ui/card';

interface EmptyProjectStateProps {
  message?: string;
}

export function EmptyProjectState({
  message = 'Select a project from the header to see scoped data here.',
}: EmptyProjectStateProps) {
  return (
    <Card>
      <CardContent className="flex flex-col items-center justify-center py-16 text-center">
        <FolderKanban className="h-10 w-10 text-slate-300" />
        <p className="mt-3 text-sm font-medium text-slate-900">No project selected</p>
        <p className="mt-1 max-w-sm text-xs text-slate-500">{message}</p>
      </CardContent>
    </Card>
  );
}
