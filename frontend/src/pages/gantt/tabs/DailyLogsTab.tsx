import { useState } from 'react';
import { Calendar, Clock, Image as ImageIcon, Trash2, Users } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Project, User } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useGanttSideStore } from '../store';

interface DailyLogsTabProps {
  project: Project;
  currentUser: User | null;
  canEdit: boolean;
}

const today = () => new Date().toISOString().slice(0, 10);

export function DailyLogsTab({ project, currentUser, canEdit }: DailyLogsTabProps) {
  const logs = useGanttSideStore((s) => s.dailyLogs[project.id] ?? []);
  const addLog    = useGanttSideStore((s) => s.addDailyLog);
  const removeLog = useGanttSideStore((s) => s.removeDailyLog);

  const [date, setDate] = useState(today());
  const [hours, setHours] = useState('');
  const [personnelCount, setPersonnelCount] = useState('');
  const [photosCount, setPhotosCount] = useState('');
  const [description, setDescription] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!description.trim()) return;
    addLog(project.id, {
      date,
      hours: Number(hours) || 0,
      personnelCount: Number(personnelCount) || 0,
      photosCount: Number(photosCount) || 0,
      description: description.trim(),
    });
    setDate(today());
    setHours('');
    setPersonnelCount('');
    setPhotosCount('');
    setDescription('');
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Daily Logs · ${project.name}`}
        title="What happened on site."
        description="Quick end-of-day notes — hours, headcount, photos, and what got done. Stays in your browser; promote to a real schema when ready."
      />

      {canEdit && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-4">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Date</label>
                  <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Hours</label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={hours}
                    onChange={(e) => setHours(e.target.value)}
                    placeholder="8"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Personnel</label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={personnelCount}
                    onChange={(e) => setPersonnelCount(e.target.value)}
                    placeholder="6"
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Photos</label>
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={0}
                    value={photosCount}
                    onChange={(e) => setPhotosCount(e.target.value)}
                    placeholder="12"
                  />
                </div>
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  rows={2}
                  required
                  className="block w-full rounded-md border border-slate-200 px-3 py-2 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  placeholder="What got done today?"
                />
              </div>
              <div className="flex justify-end">
                <Button type="submit">Log entry</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {logs.length === 0 ? (
        <EmptyState
          icon={Calendar}
          title="No daily logs yet."
          description={canEdit ? 'Use the form above to log today.' : 'Nothing has been logged for this project yet.'}
        />
      ) : (
        <div className="space-y-3">
          {logs.map((log) => (
            <Card key={log.id}>
              <CardContent className="flex items-start gap-4 p-4">
                <div className="flex-shrink-0 rounded-lg bg-slate-50 px-3 py-2 text-center">
                  <p className="text-[10px] font-medium uppercase tracking-wider text-slate-500">
                    {format(parseISO(log.date), 'MMM')}
                  </p>
                  <p
                    className="text-2xl font-semibold tabular-nums leading-none text-slate-900"
                    style={{ fontFamily: "'Fraunces', Georgia, serif" }}
                  >
                    {format(parseISO(log.date), 'd')}
                  </p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm text-slate-800">{log.description}</p>
                  <div className="mt-2 flex flex-wrap items-center gap-4 text-xs text-slate-500">
                    <span className="inline-flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {log.hours} h
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="h-3 w-3" />
                      {log.personnelCount}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <ImageIcon className="h-3 w-3" />
                      {log.photosCount}
                    </span>
                  </div>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => removeLog(project.id, log.id)}
                    className="rounded-md p-1.5 text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500"
                    title="Delete"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {currentUser ? null : null}
    </>
  );
}
