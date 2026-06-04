import { useEffect, useMemo, useState } from 'react';
import { Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { differenceInDays, format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import type { Warranty } from '../types';
import { LedgerHeader, StatusPill, FRAUNCES, cardShell, btnPrimary, btnGhost, type ToneKey } from '../components/ledger';
import { useAppStore } from '../../../store';
import {
  listWarranties, createWarranty, deleteWarranty, subscribeToProjectWarranties,
} from '../../../lib/api/warranties';

interface WarrantiesTabProps {
  project: Project;
  canEdit: boolean;
  hideHeader?: boolean;
}

const ITEM_SUGGESTIONS: string[] = [
  'Main switchgear (MSB-1)', 'Generator + ATS', 'Variable speed drive (VSD)', 'Lift / hoist motor',
  'UPS battery bank', 'Exit & emergency lighting', 'HVAC chiller compressor', 'Excavation shoring',
];
const EXPIRY_PRESETS: { years: number; label: string }[] = [
  { years: 1, label: '1 year' }, { years: 2, label: '2 years' }, { years: 5, label: '5 years' }, { years: 10, label: '10 years' },
];

const INPUT = 'w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13.5px] text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30';

function inYears(n: number): string {
  const d = new Date();
  d.setFullYear(d.getFullYear() + n);
  return d.toISOString().slice(0, 10);
}
function expiryTone(expiryDate: string): ToneKey {
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0)  return 'red';
  if (days < 30) return 'amber';
  return 'sage';
}
function expiryLabel(expiryDate: string): string {
  const days = differenceInDays(parseISO(expiryDate), new Date());
  if (days < 0)   return `Expired ${Math.abs(days)}d ago`;
  if (days === 0) return 'Expires today';
  if (days < 30)  return `Expires in ${days}d`;
  return `Valid ${days}d`;
}

export function WarrantiesTab({ project, canEdit, hideHeader = false }: WarrantiesTabProps) {
  const setNotification = useAppStore((s) => s.setNotification);

  const [warranties, setWarranties] = useState<Warranty[]>([]);
  const [saving, setSaving] = useState(false);
  const [item, setItem] = useState('');
  const [supplier, setSupplier] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [fileRef, setFileRef] = useState('');
  const [showForm, setShowForm] = useState(false);

  useEffect(() => {
    let cancelled = false;
    void listWarranties(project.id)
      .then((rows) => { if (!cancelled) setWarranties(rows); })
      .catch(() => { /* empty in mock mode / on error */ });
    const unsubscribe = subscribeToProjectWarranties(project.id, {
      onInsert: (w) => setWarranties((prev) => (prev.some((x) => x.id === w.id) ? prev : [...prev, w])),
      onDelete: (id) => setWarranties((prev) => prev.filter((x) => x.id !== id)),
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [project.id]);

  const sorted = useMemo(
    () => [...warranties].sort((a, b) => parseISO(a.expiryDate).getTime() - parseISO(b.expiryDate).getTime()),
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
      setWarranties((prev) => (prev.some((x) => x.id === created.id) ? prev : [...prev, created]));
      setItem(''); setSupplier(''); setExpiryDate(''); setFileRef(''); setShowForm(false);
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : 'Could not save warranty.', type: 'error' });
    } finally {
      setSaving(false);
    }
  };

  const handleRemove = async (id: string) => {
    const prev = warranties;
    setWarranties((list) => list.filter((x) => x.id !== id));
    try {
      await deleteWarranty(id);
    } catch (err) {
      setWarranties(prev);
      setNotification({ message: err instanceof Error ? err.message : 'Could not remove warranty.', type: 'error' });
    }
  };

  return (
    <>
      {!hideHeader && (
        <LedgerHeader
          kicker="WTY"
          icon={ShieldCheck}
          eyebrow={`Warranties · ${project.name}`}
          title="What's covered, until when."
          meta="Equipment + workmanship cover — within 30 days lights amber, expired goes red."
          actions={canEdit && !showForm
            ? <button type="button" onClick={() => setShowForm(true)} className={btnPrimary}><Plus className="h-3.5 w-3.5" /> New warranty</button>
            : undefined}
        />
      )}
      {hideHeader && canEdit && !showForm && (
        <div className="mb-4 flex justify-end">
          <button type="button" onClick={() => setShowForm(true)} className={btnPrimary}><Plus className="h-3.5 w-3.5" /> New warranty</button>
        </div>
      )}

      {showForm && canEdit && (
        <div className={`mb-4 p-4 ${cardShell}`}>
          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <input className={INPUT} value={item} onChange={(e) => setItem(e.target.value)} placeholder="e.g. Switchgear MSB-1 / Generator ATS / Conduit fittings" />
              {!item.trim() && (
                <div className="mt-1.5 flex flex-wrap gap-1">
                  {ITEM_SUGGESTIONS.map((s) => (
                    <button key={s} type="button" onClick={() => setItem(s)}
                      className="rounded-full border border-[#E6E1D4] bg-white px-2 py-0.5 text-[10px] font-medium text-[#6B6B6B] transition-colors hover:border-[#2F8F5C] hover:bg-[#E5F2EA] hover:text-[#246F47]">
                      {s}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <input className={INPUT} value={supplier} onChange={(e) => setSupplier(e.target.value)} placeholder="e.g. Schneider Electric, Eaton, Klein Tools" />

            <div className="grid gap-3 sm:grid-cols-2">
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">Expiry date</label>
                <input type="date" className={INPUT} value={expiryDate} onChange={(e) => setExpiryDate(e.target.value)} />
                <div className="mt-1.5 flex flex-wrap items-center gap-1">
                  <span className="self-center text-[10px] font-medium uppercase tracking-wider text-[#A0A0A0]">Common terms</span>
                  {EXPIRY_PRESETS.map((p) => {
                    const active = expiryDate === inYears(p.years);
                    return (
                      <button key={p.years} type="button" onClick={() => setExpiryDate(inYears(p.years))}
                        className={`rounded-full px-2 py-0.5 text-[10px] font-medium transition-colors ${
                          active ? 'bg-[#1A1A1A] text-white' : 'border border-[#E6E1D4] text-[#6B6B6B] hover:bg-[#FAF8F2]'
                        }`}>
                        {p.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">File ref <span className="font-normal normal-case tracking-normal text-[#A0A0A0]">(optional)</span></label>
                <input className={INPUT} value={fileRef} onChange={(e) => setFileRef(e.target.value)} placeholder="warranties/2026/MSB-1-schneider.pdf" />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button type="button" onClick={() => setShowForm(false)} className={btnGhost}>Cancel</button>
              <button type="submit" disabled={saving} className={btnPrimary}>{saving ? 'Saving…' : 'Save'}</button>
            </div>
          </form>
        </div>
      )}

      {sorted.length === 0 ? (
        <div className={`px-6 py-16 text-center ${cardShell}`}>
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#2F8F5C]">
            <ShieldCheck className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>No warranties yet.</h3>
          <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">
            {canEdit ? 'Click "New warranty" to log the first one — or mark an invoice paid to spawn one.' : 'Coverage appears here once logged.'}
          </p>
        </div>
      ) : (
        <div className={`overflow-hidden ${cardShell}`}>
          <ul className="divide-y divide-[#EFEBE0]">
            {sorted.map((w) => (
              <li key={w.id} className="flex items-center gap-4 px-5 py-3.5">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-semibold text-[#1A1A1A]">{w.description}</p>
                  <p className="text-[12px] text-[#6B6B6B]">{w.supplierName}{w.fileRef && <> · {w.fileRef}</>}</p>
                </div>
                <div className="text-right">
                  <p className="tabular-nums text-[12px] text-[#6B6B6B]">{format(parseISO(w.expiryDate), 'MMM d, yyyy')}</p>
                  <StatusPill tone={expiryTone(w.expiryDate)} className="mt-1 uppercase tracking-wider">
                    {expiryLabel(w.expiryDate)}
                  </StatusPill>
                </div>
                {canEdit && (
                  <button
                    type="button"
                    onClick={() => handleRemove(w.id)}
                    className="inline-flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-full text-[#A0A0A0] transition-colors hover:bg-[#FBE5E5] hover:text-[#C44545]"
                    title="Remove"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </>
  );
}
