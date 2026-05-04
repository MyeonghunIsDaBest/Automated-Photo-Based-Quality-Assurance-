import { useMemo, useState } from 'react';
import { ClipboardEdit, Plus, Trash2 } from 'lucide-react';
import type { Project } from '../../../types';
import { Card, CardContent } from '../../../components/ui/card';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { Badge } from '../../../components/ui/badge';
import { TabHeader } from '../components/TabHeader';
import { EmptyState } from '../components/EmptyState';
import { useGanttSideStore } from '../store';
import type { ChangeOrderStatus } from '../types';

interface ChangeOrdersTabProps {
  project: Project;
  canEdit: boolean;
}

const STATUS_OPTS: { value: ChangeOrderStatus; label: string }[] = [
  { value: 'draft',    label: 'Draft' },
  { value: 'sent',     label: 'Sent' },
  { value: 'approved', label: 'Approved' },
  { value: 'rejected', label: 'Rejected' },
];

const STATUS_BADGE: Record<ChangeOrderStatus, string> = {
  draft:    'border-slate-200 bg-slate-50 text-slate-600',
  sent:     'border-blue-200 bg-blue-50 text-blue-700',
  approved: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  rejected: 'border-red-200 bg-red-50 text-red-700',
};

const fmtUSD = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export function ChangeOrdersTab({ project, canEdit }: ChangeOrdersTabProps) {
  const allOrders  = useGanttSideStore((s) => s.changeOrders);
  const addOrder   = useGanttSideStore((s) => s.addChangeOrder);
  const setStatus  = useGanttSideStore((s) => s.setChangeOrderStatus);
  const removeOrder = useGanttSideStore((s) => s.removeChangeOrder);
  const orders     = useMemo(() => allOrders?.[project.id] ?? [], [allOrders, project.id]);

  const [poNumber, setPoNumber] = useState('');
  const [description, setDescription] = useState('');
  const [amount, setAmount] = useState('');
  const [status, setStatusField] = useState<ChangeOrderStatus>('draft');
  const [showForm, setShowForm] = useState(false);

  const approvedNet = useMemo(
    () => orders.filter((o) => o.status === 'approved').reduce((sum, o) => sum + o.amount, 0),
    [orders],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!poNumber.trim() || !description.trim()) return;
    const amt = Number(amount.replace(/[,_\s]/g, ''));
    if (!Number.isFinite(amt)) return;
    addOrder(project.id, {
      poNumber: poNumber.trim(),
      description: description.trim(),
      amount: amt,
      status,
    });
    setPoNumber('');
    setDescription('');
    setAmount('');
    setStatusField('draft');
    setShowForm(false);
  };

  return (
    <>
      <TabHeader
        eyebrow={`Workspace · Change Orders · ${project.name}`}
        title="Scope changes, on the record."
        description="Track variations to the contract — PO #, description, ± amount, approval state. Approved net change rolls up at the top."
        action={
          canEdit && !showForm ? (
            <Button onClick={() => setShowForm(true)}>
              <Plus className="mr-2 h-4 w-4" />
              New change order
            </Button>
          ) : null
        }
      />

      <Card className="mb-6">
        <CardContent className="flex items-baseline justify-between p-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              Approved net change
            </p>
            <p
              className={`mt-1 text-2xl font-semibold tabular-nums ${
                approvedNet < 0 ? 'text-red-600' : 'text-emerald-600'
              }`}
              style={{ fontFamily: "'Fraunces', Georgia, serif" }}
            >
              {fmtUSD(approvedNet)}
            </p>
          </div>
          <p className="text-xs text-slate-500">
            {orders.filter((o) => o.status === 'approved').length} approved · {orders.length} total
          </p>
        </CardContent>
      </Card>

      {showForm && canEdit && (
        <Card className="mb-6">
          <CardContent className="p-4">
            <form onSubmit={handleSubmit} className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-[1fr_2fr_1fr]">
                <Input
                  value={poNumber}
                  onChange={(e) => setPoNumber(e.target.value)}
                  placeholder="PO #"
                />
                <Input
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Description"
                />
                <Input
                  value={amount}
                  onChange={(e) => setAmount(e.target.value)}
                  placeholder="Amount (e.g. 4500 or -1200)"
                  inputMode="numeric"
                />
              </div>
              <div className="flex items-center justify-between gap-3">
                <select
                  value={status}
                  onChange={(e) => setStatusField(e.target.value as ChangeOrderStatus)}
                  className="block h-9 rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
                >
                  {STATUS_OPTS.map((o) => (
                    <option key={o.value} value={o.value}>{o.label}</option>
                  ))}
                </select>
                <div className="flex items-center gap-2">
                  <Button type="button" variant="outline" onClick={() => setShowForm(false)}>
                    Cancel
                  </Button>
                  <Button type="submit">Save</Button>
                </div>
              </div>
            </form>
          </CardContent>
        </Card>
      )}

      {orders.length === 0 ? (
        <EmptyState
          icon={ClipboardEdit}
          title="No change orders yet."
          description={canEdit ? 'Click "New change order" to add the first one.' : undefined}
        />
      ) : (
        <Card>
          <CardContent className="p-0">
            <ul className="divide-y divide-slate-100">
              {orders.map((o) => (
                <li key={o.id} className="flex items-center gap-4 px-4 py-3">
                  <span className="rounded-md bg-slate-50 px-2 py-1 text-[11px] font-mono text-slate-700">
                    {o.poNumber}
                  </span>
                  <p className="min-w-0 flex-1 truncate text-sm text-slate-800">{o.description}</p>
                  <span
                    className={`tabular-nums text-sm font-medium ${
                      o.amount < 0 ? 'text-red-600' : 'text-emerald-600'
                    }`}
                  >
                    {o.amount >= 0 ? '+' : ''}{fmtUSD(o.amount)}
                  </span>
                  {canEdit ? (
                    <select
                      value={o.status}
                      onChange={(e) =>
                        setStatus(project.id, o.id, e.target.value as ChangeOrderStatus)
                      }
                      className={`rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${STATUS_BADGE[o.status]}`}
                    >
                      {STATUS_OPTS.map((opt) => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                      ))}
                    </select>
                  ) : (
                    <Badge variant="outline" className={STATUS_BADGE[o.status]}>
                      {o.status}
                    </Badge>
                  )}
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => removeOrder(project.id, o.id)}
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
