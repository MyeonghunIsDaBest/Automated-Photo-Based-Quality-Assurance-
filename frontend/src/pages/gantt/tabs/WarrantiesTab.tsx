import { useMemo, useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { differenceInDays, format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useGanttSideStore } from '../store';

interface WarrantiesTabProps {
  project: Project;
  canEdit: boolean;
  // Skip the editorial TabHeader when nested inside SupplierTab.
  hideHeader?: boolean;
}

function expiryBadge(expiryDate: string): string {
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0)  return 'border-red-200 bg-red-50 text-red-700';
  if (days < 30) return 'border-amber-200 bg-amber-50 text-amber-700';
  return 'border-emerald-200 bg-emerald-50 text-emerald-700';
}

function expiryLabel(expiryDate: string): string {
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0)  return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  if (days < 30) return `Expires in ${days}d`;
  return `Valid ${days}d`;
}

export function WarrantiesTab({ project, canEdit, hideHeader = false }: WarrantiesTabProps) {
  const allWarranties  = useGanttSideStore((s) => s.warranties);
  const addWarranty    = useGanttSideStore((s) => s.addWarranty);
  const removeWarranty = useGanttSideStore((s) => s.removeWarranty);
  const warranties     = useMemo(() => allWarranties?.[project.id] ?? [], [allWarranties, project.id]);

  const [item, setItem] = useState('');
  const [supplier, setSupplier] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fileRef, setFileRef] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Sort by expiry ascending — soonest first.
  const sorted = useMemo(
    () =>
      [...warranties].sort(
        (a, b) => parseISO(a.expiryDate).getTime() - parseISO(b.expiryDate).getTime(),
      ),
    [warranties],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.trim() || !supplier.trim() || !expiryDate) return;
    // The store's Warranty shape uses description/supplierName/startDate
    // (post-schema-rewrite). Map the form's friendly field names onto the
    // canonical row.
    addWarranty(project.id, {
      description: item.trim(),
      supplierName: supplier.trim(),
      startDate: new Date().toISOString().slice(0, 10),
      expiryDate,
      fileRef: fileRef.trim() || undefined,
    });
    setItem('');
    setSupplier('');
    setExpiryDate('');
    setFileRef('');
    setShowForm(false);
  };

  return (
    <>
      {!hideHeader && (
        <TabHeader
          eyebrow={`Workspace · Warranties · ${project.name}`}
          title="What's covered, until when."
          description="Equipment + workmanship warranties with their expiry dates. Anything within 30 days lights up amber; expired items go red."
          action={
            canEdit && !showForm ? (
              <Button onClick={() => setShowForm(true)}>
                <Plus className="mr-2 h-4 w-4" />
                New warranty
              </Button>
            ) : null
          }
        />
      )}
      {hideHeader && canEdit && !showForm && (
        <div className="mb-4 flex justify-end">
          <Button onClick={() => setShowForm(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New warranty
          </Button>
        </div>
      )}

      {showForm && canEdit && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <Input
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="Item (e.g. Lift motor)"
                />
                <Input
                  value={supplier}
                  onChange={(e) => setSupplier(e.target.value)}
                  placeholder="Supplier"
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    Expiry date
                  </label>
                  <Input
                    type="date"
                    value={expiryDate}
                    onChange={(e) => setExpiryDate(e.target.value)}
                  />
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    File ref (optional)
                  </label>
                  <Input
                    value={fileRef}
                    onChange={(e) => setFileRef(e.target.value)}
                    placeholder="Drive link / filename"
                  />
                </div>
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

      {sorted.length === 0 ? (
        <EmptyState
          icon={ShieldCheck}
          title="No warranties yet."
          description={canEdit ? 'Click "New warranty" to log the first one.' : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {sorted.map((w) => (
                <li key={w.id} className="flex items-center gap-4 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="font-medium text-slate-900">{w.description}</p>
                    <p className="text-xs text-slate-500">
                      {w.supplierName}
                      {w.fileRef && <> · {w.fileRef}</>}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="tabular-nums text-xs text-slate-600">
                      {format(parseISO(w.expiryDate), 'MMM d, yyyy')}
                    </p>
                    <span
                      className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${expiryBadge(w.expiryDate)}`}
                    >
                      {expiryLabel(w.expiryDate)}
                    </span>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeWarranty(project.id, w.id)}
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
