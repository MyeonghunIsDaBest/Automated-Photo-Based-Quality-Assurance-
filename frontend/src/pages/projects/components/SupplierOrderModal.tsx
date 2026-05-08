import { useEffect, useMemo, useState } from 'react';
import { Truck, X } from 'lucide-react';
import { Button } from '../../../components/ui/button';
import { Input } from '../../../components/ui/input';
import { useFeatureStore } from '../../../store/features';
import { listSuppliers } from '../../../lib/api/suppliers';
import { createTask, mapTaskRow } from '../../../lib/api/tasks';
import { supabaseConfigured } from '../../../lib/supabase';
import type { Supplier, ConstructionPhase } from '../../../types';
import type { Project } from '../types';

interface SupplierOrderModalProps {
  open: boolean;
  project: Project | null;
  onClose: () => void;
}

const PHASES: ConstructionPhase[] = [
  'excavation', 'foundation', 'framing', 'electrical',
  'plumbing', 'drywall', 'finishing', 'roofing',
];

const today = () => new Date().toISOString().slice(0, 10);
const inDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

// Place a supplier order against a project. The order materialises as a
// task on the Gantt chart with a "Order:" prefix and a supplier reference
// in the notes — that way the existing Gantt + photo upload flow can
// track delivery without introducing a separate orders table for the MVP.
export function SupplierOrderModal({ open, project, onClose }: SupplierOrderModalProps) {
  const addTask = useFeatureStore((s) => s.addTask);

  const [suppliers, setSuppliers] = useState<Supplier[]>([]);
  const [loadingSuppliers, setLoadingSuppliers] = useState(false);
  const [supplierId, setSupplierId] = useState<string>('');
  const [item, setItem] = useState('');
  const [quantity, setQuantity] = useState('');
  const [phase, setPhase] = useState<ConstructionPhase>('electrical');
  const [orderDate, setOrderDate] = useState(today());
  const [deliveryDate, setDeliveryDate] = useState(inDays(7));
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Pull suppliers when the modal opens. Cheap query (no children tables),
  // so we don't bother caching across opens.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingSuppliers(true);
    setError(null);
    (async () => {
      try {
        const list = supabaseConfigured() ? await listSuppliers() : [];
        if (!cancelled) {
          setSuppliers(list);
          setSupplierId(list[0]?.id ?? '');
          setLoadingSuppliers(false);
        }
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Could not load suppliers.');
          setLoadingSuppliers(false);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  // Reset transient form state every time the modal closes so the next
  // open starts fresh.
  useEffect(() => {
    if (!open) {
      setItem('');
      setQuantity('');
      setPhase('electrical');
      setOrderDate(today());
      setDeliveryDate(inDays(7));
      setSubmitting(false);
      setError(null);
    }
  }, [open]);

  const supplier = useMemo(
    () => suppliers.find((s) => s.id === supplierId) ?? null,
    [suppliers, supplierId],
  );

  if (!open || !project) return null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!supplier) return setError('Pick a supplier first.');
    if (!item.trim()) return setError('Item description is required.');
    if (new Date(orderDate) > new Date(deliveryDate)) {
      return setError('Delivery date must be on or after the order date.');
    }

    const qtyLabel = quantity.trim() ? ` (${quantity.trim()})` : '';
    const taskName = `Order: ${item.trim()}${qtyLabel} — ${supplier.name}`;
    const noteLine = JSON.stringify({
      kind: 'supplier_order',
      supplierId: supplier.id,
      supplierName: supplier.name,
      item: item.trim(),
      quantity: quantity.trim() || null,
      orderDate,
      deliveryDate,
    });

    setSubmitting(true);
    try {
      if (supabaseConfigured()) {
        const row = await createTask({
          project_id: project.id,
          zone_id: null,
          assignee_id: null,
          parent_task_id: null,
          name: taskName,
          phase,
          start_date: orderDate,
          end_date: deliveryDate,
          percent_complete: 0,
          status: 'not_started',
          notes: [noteLine],
          update_source: 'manual',
          dependencies: [],
        });
        // The Gantt page's realtime subscription will echo the INSERT back
        // into local state, but mirror it locally too so the row shows up
        // in the project preview's task list before the next round-trip.
        addTask(mapTaskRow(row));
      } else {
        addTask({
          id: `order_${Date.now()}`,
          projectId: project.id,
          name: taskName,
          phase,
          startDate: orderDate,
          endDate: deliveryDate,
          durationDays: Math.max(
            1,
            Math.round(
              (new Date(deliveryDate).getTime() - new Date(orderDate).getTime()) / 86_400_000,
            ),
          ),
          percentComplete: 0,
          status: 'not_started',
          dependencies: [],
          photoCount: 0,
          lastUpdated: new Date().toISOString(),
          updateSource: 'manual',
          notes: [noteLine],
        });
      }
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not place the order.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-slate-900/50 p-4">
      <form
        onSubmit={handleSubmit}
        className="flex max-h-[90dvh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-white shadow-xl"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        <div className="flex items-start justify-between border-b border-slate-200 px-6 py-5">
          <div>
            <div className="flex items-center gap-2">
              <Truck className="h-4 w-4 text-emerald-600" />
              <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
                Supplier order · {project.name}
              </p>
            </div>
            <h2
              className="mt-1 text-xl font-medium text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em' }}
            >
              Place a delivery order
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              Creates a Gantt task between the order and delivery dates so the team can
              track materials arriving on site.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="editorial-scrollbox flex-1 space-y-4 px-6 py-5">
          <div>
            <label className="mb-1 block text-xs font-medium text-slate-700">Supplier</label>
            {loadingSuppliers ? (
              <div className="h-9 animate-pulse rounded-md bg-slate-100" />
            ) : suppliers.length === 0 ? (
              <p className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-700">
                No suppliers yet. Add one under <strong>Admin → Suppliers</strong> first.
              </p>
            ) : (
              <select
                value={supplierId}
                onChange={(e) => setSupplierId(e.target.value)}
                className="block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.name}
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid gap-4 sm:grid-cols-[2fr_1fr]">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Item / Material
              </label>
              <Input
                value={item}
                onChange={(e) => setItem(e.target.value)}
                placeholder="e.g. 4-core 16mm² electrical cable"
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Quantity</label>
              <Input
                value={quantity}
                onChange={(e) => setQuantity(e.target.value)}
                placeholder="500m"
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Phase</label>
              <select
                value={phase}
                onChange={(e) => setPhase(e.target.value as ConstructionPhase)}
                className="block h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm capitalize shadow-sm focus:border-emerald-500 focus:outline-none focus:ring-1 focus:ring-emerald-500"
              >
                {PHASES.map((p) => (
                  <option key={p} value={p} className="capitalize">
                    {p}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">Order Date</label>
              <Input
                type="date"
                value={orderDate}
                onChange={(e) => setOrderDate(e.target.value)}
              />
            </div>
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-700">
                Delivery Date
              </label>
              <Input
                type="date"
                value={deliveryDate}
                onChange={(e) => setDeliveryDate(e.target.value)}
              />
            </div>
          </div>

          {error && (
            <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
              {error}
            </p>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 bg-slate-50/50 px-6 py-3">
          <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
            Cancel
          </Button>
          <Button type="submit" disabled={submitting || suppliers.length === 0}>
            {submitting ? 'Placing order…' : 'Place order & add to Gantt'}
          </Button>
        </div>
      </form>
    </div>
  );
}
