import { useEffect, useMemo, useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { differenceInDays, format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import type { Warranty } from '../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useAppStore } from '../../../store';
import {
  listWarranties,
  createWarranty,
  deleteWarranty,
  subscribeToProjectWarranties,
} from '../../../lib/api/warranties';

interface WarrantiesTabProps {
  project: Project;
  canEdit: boolean;
  // Skip the editorial TabHeader when nested inside SupplierTab.
  hideHeader?: boolean;
}

// Trade-flavoured warranty starters — tapping prefills the item field.
const ITEM_SUGGESTIONS: string[] = [
  'Main switchgear (MSB-1)',
  'Generator + ATS',
  'Variable speed drive (VSD)',
  'Lift / hoist motor',
  'UPS battery bank',
  'Exit & emergency lighting',
  'HVAC chiller compressor',
  'Excavation shoring',
];

// Common manufacturer warranty terms in years.
const EXPIRY_PRESETS: { years: number; label: string }[] = [
  { years: 1,  label: '1 year' },
  { years: 2,  label: '2 years' },
  { years: 5,  label: '5 years' },
  { years: 10, label: '10 years' },
];

function inYears(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
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
  const setNotification = useAppStore((s) => s.setNotification);

  // Persisted to Supabase (P1.5). Local state is the render source; the load
  // effect hydrates it and the realtime subscription keeps it in sync across
  // devices. Optimistic add/remove patch local state immediately; the realtime
  // echo is deduped by id.
  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [saving, setSaving] = useState(false);

  const [item, setItem] = useState('');
  const [supplier, setSupplier] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fileRef, setFileRef] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Load + subscribe per project.
  useEffect(() => {
    let cancelled = false;
    void listWarranties(project.id)
      .then((rows) => { if (!cancelled) setWarranties(rows); })
      .catch(() => { /* empty in mock mode / on error — surfaced on write */ });

    const unsubscribe = subscribeToProjectWarranties(project.id, {
      onInsert: (w) => setWarranties((prev) => (prev.some((x) => x.id === w.id) ? prev : [...prev, w])),
      onDelete: (id) => setWarranties((prev) => prev.filter((x) => x.id !== id)),
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [project.id]);

  // Sort by expiry ascending — soonest first.
  const sorted = useMemo(
    () =>
      [...warranties].sort(
        (a, b) => parseISO(a.expiryDate).getTime() - parseISO(b.expiryDate).getTime(),
      ),
    [warranties],
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!item.trim() || !supplier.trim() || !expiryDate || saving) return;
    setSaving(true);
    try {
      const created = await createWarranty(project.id, {
        description: item.trim(),
        supplierName: supplier.trim(),
        startDate: new Date().toISOString().slice(0, 10),
        expiryDate,
        fileRef: fileRef.trim() || undefined,
      });
      // Optimistic append (deduped against any realtime echo by id).
      setWarranties((prev) => (prev.some((x) => x.id === created.id) ? prev : [...prev, created]));
      setItem('');
      setSupplier('');
      setExpiryDate('');
      setFileRef('');
      setShowForm(false);
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : 'Could not save warranty.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    const prev = warranties;
    setWarranties((list) => list.filter((x) => x.id !== id)); // optimistic
    try {
      await deleteWarranty(id);
    } catch (err) {
      setWarranties(prev); // rollback
      setNotification({ message: err instanceof Error ? err.message : 'Could not remove warranty.', type: 'error' });
    }
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
              <div>
                <Input
                  value={item}
                  onChange={(e) => setItem(e.target.value)}
                  placeholder="e.g. Switchgear MSB-1 / Generator ATS / Conduit fittings"
                />
                {!item.trim() && (
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    {ITEM_SUGGESTIONS.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => setItem(s)}
                        className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-medium text-slate-600 transition-colors hover:border-emerald-300 hover:bg-emerald-50 hover:text-emerald-700"
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <Input
                value={supplier}
                onChange={(e) => setSupplier(e.target.value)}
                placeholder="e.g. Schneider Electric, Eaton, Klein Tools"
              />

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
                  <div className="mt-1.5 flex flex-wrap gap-1">
                    <span className="self-center text-[10px] font-medium uppercase tracking-wider text-slate-400">
                      Common terms
                    </span>
                    {EXPIRY_PRESETS.map((p) => (
                      <button
                        key={p.years}
                        type="button"
                        onClick={() => setExpiryDate(inYears(p.years))}
                        className={`rounded-full border px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          expiryDate === inYears(p.years)
                            ? 'border-slate-900 bg-slate-900 text-white'
                            : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">
                    File ref (optional)
                  </label>
                  <Input
                    value={fileRef}
                    onChange={(e) => setFileRef(e.target.value)}
                    placeholder="warranties/2026/MSB-1-schneider.pdf"
                  />
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                  Cancel
                </Button>
                <Button type="submit" disabled={saving}>{saving ? 'Saving…' : 'Save'}</Button>
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
                      onClick={() => handleRemove(w.id)}
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
