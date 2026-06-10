// Shared "set project budget" modal. Warm replacement for the old
// window.prompt() flow — validates a positive number client-side and hands the
// parsed total back to the caller. Used by Reports → Financial and the project
// Finance panel (ProjectFinancePanel) so both edit the budget the same way.

import { useState } from 'react';
import { X } from 'lucide-react';
import { FRAUNCES } from '../../pages/gantt/components/ledger';

export function SetBudgetModal({
  projectName, current, onClose, onSave,
}: {
  projectName: string;
  current?: number;
  onClose: () => void;
  onSave: (total: number) => void | Promise<void>;
}) {
  const [raw, setRaw] = useState(current ? String(current) : '');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    const total = Number(raw.replace(/[,_$\s]/g, ''));
    if (!Number.isFinite(total) || total <= 0) {
      setError('Enter a positive dollar amount.');
      return;
    }
    setSaving(true);
    try {
      await onSave(total);
    } finally {
      setSaving(false);
    }
  };

  return (
    // Overlay scrolls itself so the modal stays reachable on small screens /
    // with the keyboard up (min-h-full wrapper centres it when it fits).
    <div className="editorial-root fixed inset-0 z-50 overflow-y-auto overscroll-contain bg-[#1A1A1A]/50 backdrop-blur-sm" onClick={onClose}>
      <div className="flex min-h-full items-center justify-center p-4">
        <div className="w-full max-w-md overflow-hidden rounded-[14px] bg-white shadow-[0_8px_28px_rgba(20,20,20,0.12)]" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between border-b border-[#EFEBE0] px-6 py-4">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-[#246F47]">Finance</p>
            <h3 className="display mt-0.5 text-xl font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
              Set project budget
            </h3>
          </div>
          <button onClick={onClose} className="rounded-full p-2 text-[#A0A0A0] hover:bg-[#FAF8F2] hover:text-[#3A3A3A]">
            <X className="h-4 w-4" />
          </button>
        </div>
        <form onSubmit={submit} className="px-6 py-5">
          <p className="text-sm text-[#6B6B6B]">
            Total budget for <span className="font-medium text-[#1A1A1A]">{projectName}</span>. This seeds spend
            tracking and the invoice ledger.
          </p>
          <label className="mt-4 block">
            <span className="text-[11px] font-medium uppercase tracking-[0.15em] text-[#6B6B6B]">Amount (AUD)</span>
            <div className="relative mt-1.5">
              <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-sm text-[#A0A0A0]">$</span>
              <input
                autoFocus
                inputMode="decimal"
                value={raw}
                onChange={(e) => { setRaw(e.target.value); setError(''); }}
                placeholder="250000"
                className="w-full rounded-[10px] border border-[#E6E1D4] bg-white py-2.5 pl-7 pr-3 text-sm text-[#1A1A1A] tabular-nums focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]"
              />
            </div>
          </label>
          {error && <p className="mt-2 text-xs text-[#C44545]">{error}</p>}
          <div className="mt-6 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-full border border-[#E6E1D4] bg-white px-4 py-2 text-sm font-medium text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2]"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-full bg-[#2F8F5C] px-5 py-2 text-sm font-medium text-white transition-colors hover:bg-[#246F47] disabled:cursor-not-allowed disabled:opacity-50"
            >
              {saving ? 'Saving…' : 'Save budget'}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
}
