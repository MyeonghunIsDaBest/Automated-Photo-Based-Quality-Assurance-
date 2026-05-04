import { useMemo, useState } from 'react';
import { CheckSquare, Plus, Trash2 } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useGanttSideStore } from '../store';

interface TodosTabProps {
  project: Project;
  canEdit: boolean;
}

type Filter = 'open' | 'done' | 'all';

const FILTERS: { id: Filter; label: string }[] = [
  { id: 'open', label: 'Open' },
  { id: 'done', label: 'Done' },
  { id: 'all',  label: 'All' },
];

export function TodosTab({ project, canEdit }: TodosTabProps) {
  const allTodos    = useGanttSideStore((s) => s.todos);
  const addTodo     = useGanttSideStore((s) => s.addTodo);
  const toggleTodo  = useGanttSideStore((s) => s.toggleTodo);
  const removeTodo  = useGanttSideStore((s) => s.removeTodo);
  const todos       = useMemo(() => allTodos?.[project.id] ?? [], [allTodos, project.id]);

  const [text, setText] = useState('');
  const [due, setDue] = useState('');
  const [filter, setFilter] = useState<Filter>('open');

  const visible = useMemo(() => {
    if (filter === 'open') return todos.filter((t) => !t.done);
    if (filter === 'done') return todos.filter((t) =>  t.done);
    return todos;
  }, [todos, filter]);

  const handleAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    addTodo(project.id, text.trim(), due || undefined);
    setText('');
    setDue('');
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · To-Dos · ${project.name}`}
        title="Loose ends."
        description="Quick captures that don't deserve a Gantt task. Tick the box when done."
      />

      {canEdit && (
        <Card className="mb-4">
          <CardContent className="p-3">
            <form onSubmit={handleAdd} className="flex items-center gap-2">
              <Input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="What needs doing?"
                className="flex-1"
              />
              <Input
                type="date"
                value={due}
                onChange={(e) => setDue(e.target.value)}
                className="w-44"
              />
              <Button type="submit" size="sm">
                <Plus className="h-4 w-4" />
              </Button>
            </form>
          </CardContent>
        </Card>
      )}

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {FILTERS.map((f) => (
          <button
            key={f.id}
            type="button"
            onClick={() => setFilter(f.id)}
            className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
              filter === f.id
                ? 'border-slate-900 bg-slate-900 text-white'
                : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
            }`}
          >
            {f.label}
          </button>
        ))}
        <span className="ml-auto text-xs text-slate-500">
          {visible.length} of {todos.length}
        </span>
      </div>

      {visible.length === 0 ? (
        <EmptyState
          icon={CheckSquare}
          title={
            todos.length === 0
              ? 'No to-dos yet.'
              : filter === 'done'
                ? 'Nothing finished here yet.'
                : 'Nothing open — nice work.'
          }
          description={
            todos.length === 0 && canEdit
              ? 'Add the first one with the input above.'
              : undefined
          }
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {visible.map((t) => (
                <li key={t.id} className="flex items-center gap-3 px-4 py-3">
                  <input
                    type="checkbox"
                    checked={t.done}
                    onChange={() => toggleTodo(project.id, t.id)}
                    disabled={!canEdit}
                    className="h-4 w-4 cursor-pointer accent-emerald-600"
                  />
                  <span
                    className={`flex-1 text-sm ${
                      t.done ? 'text-slate-400 line-through' : 'text-slate-800'
                    }`}
                  >
                    {t.text}
                  </span>
                  {t.dueDate && (
                    <span className="text-[11px] text-slate-500">
                      Due {format(parseISO(t.dueDate), 'MMM d')}
                    </span>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeTodo(project.id, t.id)}
                      className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                      title="Remove"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
