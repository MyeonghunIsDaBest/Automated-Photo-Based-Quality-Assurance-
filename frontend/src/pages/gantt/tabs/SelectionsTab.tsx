import { useMemo, useState } from 'react';
import { Palette, Plus, Trash2 } from 'lucide-react';
import type { Project, Zone } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useGanttSideStore } from '../store';
import type { SelectionStatus } from '../types';

interface SelectionsTabProps {
  project: Project;
  zones: Zone[];
  canEdit: boolean;
}

const STATUS_OPTS: { value: SelectionStatus; label: string }[] = [
  { value: 'pending',   label: 'Pending' },
  { value: 'selected',  label: 'Selected' },
  { value: 'ordered',   label: 'Ordered' },
  { value: 'delivered', label: 'Delivered' },
];

const STATUS_BADGE: Record<SelectionStatus, string> = {
  pending:   'border-amber-200 bg-amber-50 text-amber-700',
  selected:  'border-blue-200 bg-blue-50 text-blue-700',
  ordered:   'border-purple-200 bg-purple-50 text-purple-700',
  delivered: 'border-emerald-200 bg-emerald-50 text-emerald-700',
};

export function SelectionsTab({ project, zones, canEdit }: SelectionsTabProps) {
  const allSelections = useGanttSideStore((s) => s.selections);
  const addSelection  = useGanttSideStore((s) => s.addSelection);
  const setStatus     = useGanttSideStore((s) => s.setSelectionStatus);
  const removeSel     = useGanttSideStore((s) => s.removeSelection);
  const selections    = useMemo(() => allSelections?.[project.id] ?? [], [allSelections, project.id]);

  const [zoneId, setZoneId] = useState('');
  const [item, setItem] = useState('');
  const [supplier, setSupplier] = useState('');
  const [status, setStatusField] = useState<SelectionStatus>('pending');
  const [showForm, setShowForm] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.trim() || !supplier.trim()) return;
    addSelection(project.id, {
      zoneId: zoneId || undefined,
      item: item.trim(),
      supplier: supplier.trim(),
      status,
    });
    setItem('');
    setSupplier('');
    setZoneId('');
    setStatusField('pending');
    setShowForm(false);
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Selections · ${project.name}`}
        title="Materials & finishes."
        description="Track every material pick from spec to delivery — by zone, by supplier."
        action={
          canEdit && !showForm ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add selection
            </Button>
          ) : null
        }
      />

      {showForm && canEdit && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Zone</label>
                  <select
                    value={zoneId}
                    onChange={(e) => setZoneId(e.target.value)}
                    className="block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    <option value="">Project-wide</option>
                    {zones.map((z) => (
                      <option key={z.id} value={z.id}>{z.name}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">Status</label>
                  <select
                    value={status}
                    onChange={(e) => setStatusField(e.target.value as SelectionStatus)}
                    className="block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                  >
                    {STATUS_OPTS.map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="Item (e.g. Brushed nickel handles)"
                />
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Supplier"
                />
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit">Save</Button>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {selections.length === 0 ? (
        <EmptyState
          icon={Palette}
          title="No selections yet."
          description={canEdit ? 'Click "Add selection" to log the first one.' : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {selections.map((s) => {
                const zone = zones.find((z) => z.id === s.zoneId);
                return (
                  <li key={s.id} className="flex items-center gap-4 px-4 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-900">{s.item}</p>
                      <p className="text-xs text-slate-500">
                        {s.supplier} · {zone?.name ?? 'Project-wide'}
                      </p>
                    </div>
                    {canEdit ? (
                      <select
                        value={s.status}
                        onChange={(e) =>
                          setStatus(project.id, s.id, e.target.value as SelectionStatus)
                        }
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_BADGE[s.status]}`}
                      >
                        {STATUS_OPTS.map((opt) => (
                          <option key={opt.value} value={opt.value}>{opt.label}</option>
                        ))}
                      </select>
                    ) : (
                      <Badge variant="outline" className={STATUS_BADGE[s.status]}>
                        {s.status}
                      </Badge>
                    )}
                    {canEdit && (
                      <button
                        type="button"
                        onClick={() => removeSel(project.id, s.id)}
                        className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-md text-slate-400 transition-colors hover:bg-red-50 hover:text-red-500 active:bg-red-100"
                        title="Remove"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </CardContent>
        </Card>
      )}
    </>
  );
}
