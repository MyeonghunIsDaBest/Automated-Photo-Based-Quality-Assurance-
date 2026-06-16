// TimeEntriesSection — Time log for a service job.
// Workers add entries for themselves; managers can pick any active tech.
// Displays tech name resolved from a profiles map, date, hours, note.
// Running total shown at the bottom via totalHours().

import { useState } from 'react';
import { Trash2, Plus, Loader2, Clock } from 'lucide-react';
import {
  addTimeEntry,
  deleteTimeEntry,
  totalHours,
  type ServiceJobTimeEntry,
} from '../../lib/api/serviceJobs';
import type { Profile } from '../../types';

interface Props {
  jobId: string;
  entries: ServiceJobTimeEntry[];
  profiles: Profile[];
  /** The currently signed-in user's profile id. */
  currentUserId: string | null;
  canLog: boolean;
  canManage: boolean;
  onChanged: () => void;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function TimeEntriesSection({
  jobId,
  entries,
  profiles,
  currentUserId,
  canLog,
  canManage,
  onChanged,
}: Props) {
  const profileMap = new Map(profiles.map((p) => [p.id, p]));

  const [formDate,  setFormDate]  = useState(todayISO);
  const [formHours, setFormHours] = useState('');
  const [formNote,  setFormNote]  = useState('');
  // Manager-only: tech picker. Defaults to '' (will use currentUserId for workers).
  const [formUserId, setFormUserId] = useState('');

  const [saving,      setSaving]      = useState(false);
  const [saveError,   setSaveError]   = useState<string | null>(null);
  const [deletingId,  setDeletingId]  = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);

  // Active internal profiles for the manager tech-picker — same exclusion rule
  // as NewServiceJobModal/ServiceJobDrawer (externals + hidden dev superuser).
  const internalProfiles = profiles.filter(
    (p) => p.isActive !== false &&
      !['customer', 'supplier', 'stakeholder', 'dev'].includes(p.securityGroup ?? ''),
  );

  const resolvedUserId = canManage
    ? (formUserId || currentUserId || '')
    : (currentUserId || '');

  const handleAdd = async () => {
    const hours = parseFloat(formHours);
    if (!formHours || isNaN(hours) || hours < 0.25) {
      setSaveError('Hours must be at least 0.25.');
      return;
    }
    if (!resolvedUserId) {
      setSaveError('Cannot determine user — please refresh.');
      return;
    }
    setSaving(true);
    setSaveError(null);
    try {
      await addTimeEntry(jobId, {
        userId: resolvedUserId,
        date: formDate,
        hours,
        note: formNote.trim() || undefined,
      });
      // Reset form
      setFormDate(todayISO);
      setFormHours('');
      setFormNote('');
      setFormUserId('');
      onChanged();
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : 'Could not add entry.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    setDeletingId(id);
    setDeleteError(null);
    try {
      await deleteTimeEntry(id);
      onChanged();
    } catch (e) {
      setDeleteError(e instanceof Error ? e.message : 'Delete failed.');
    } finally {
      setDeletingId(null);
    }
  };

  const total = totalHours(entries);

  return (
    <section className="space-y-3">
      <div className="flex items-center justify-between">
        <label className="text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-500">
          Time Entries
        </label>
        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-0.5 text-[11px] font-semibold text-slate-700">
          <Clock className="h-3 w-3" />
          {total} h total
        </span>
      </div>

      {deleteError && (
        <p className="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
          {deleteError}
        </p>
      )}

      {/* Entry list */}
      {entries.length === 0 ? (
        <p className="text-[11px] text-slate-400">No time logged yet.</p>
      ) : (
        <div className="space-y-1.5">
          {entries.map((entry) => {
            const profile = profileMap.get(entry.userId);
            const techName = profile
              ? `${profile.firstName} ${profile.lastName}`.trim() || profile.email || 'Unknown'
              : entry.userId.slice(0, 8) + '…';
            const isOwn = entry.userId === currentUserId;
            const canDeleteEntry = isOwn || canManage;

            return (
              <div
                key={entry.id}
                className="flex items-start gap-2 rounded-md border border-slate-200 bg-white px-3 py-2"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-[12px] font-semibold text-slate-900 truncate">
                      {techName}
                    </span>
                    <span className="text-[11px] text-slate-500">·</span>
                    <span className="text-[11px] text-slate-600">{entry.date}</span>
                    <span className="ml-auto text-[12px] font-semibold text-slate-900 flex-shrink-0">
                      {entry.hours} h
                    </span>
                  </div>
                  {entry.note && (
                    <p className="mt-0.5 text-[11px] text-slate-500 line-clamp-2">
                      {entry.note}
                    </p>
                  )}
                </div>
                {canDeleteEntry && (
                  <button
                    type="button"
                    onClick={() => void handleDelete(entry.id)}
                    disabled={deletingId === entry.id}
                    className="flex-shrink-0 rounded p-1 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                    aria-label="Delete time entry"
                  >
                    {deletingId === entry.id ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Trash2 className="h-3.5 w-3.5" />
                    )}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Add form (workers + managers) */}
      {canLog && (
        <div className="rounded-md border border-dashed border-slate-300 bg-slate-50 px-3 py-2.5 space-y-2">
          <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-[0.1em]">
            Log time
          </p>

          {/* Manager tech picker */}
          {canManage && internalProfiles.length > 0 && (
            <select
              value={formUserId}
              onChange={(e) => setFormUserId(e.target.value)}
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs bg-white"
              aria-label="Select technician"
            >
              <option value="">My entry (myself)</option>
              {internalProfiles.map((p) => {
                const name = `${p.firstName} ${p.lastName}`.trim() || p.email || p.id;
                const isSelf = p.id === currentUserId;
                return (
                  <option key={p.id} value={p.id}>
                    {name}{isSelf ? ' (me)' : ''}
                  </option>
                );
              })}
            </select>
          )}

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="block mb-0.5 text-[10px] font-medium text-slate-500">Date</label>
              <input
                type="date"
                value={formDate}
                onChange={(e) => setFormDate(e.target.value)}
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
              />
            </div>
            <div>
              <label className="block mb-0.5 text-[10px] font-medium text-slate-500">Hours</label>
              <input
                type="number"
                inputMode="decimal"
                min={0.25}
                step={0.25}
                value={formHours}
                onChange={(e) => setFormHours(e.target.value)}
                placeholder="0.25"
                className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs text-right"
              />
            </div>
          </div>

          <div>
            <label className="block mb-0.5 text-[10px] font-medium text-slate-500">Note (optional)</label>
            <input
              type="text"
              value={formNote}
              onChange={(e) => setFormNote(e.target.value)}
              placeholder="e.g. Board installation, rough-in"
              className="w-full rounded border border-slate-200 px-2 py-1.5 text-xs"
            />
          </div>

          {saveError && (
            <p className="text-[11px] text-red-600">{saveError}</p>
          )}

          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => void handleAdd()}
              disabled={saving || !formHours}
              className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-3.5 py-1.5 text-[12px] font-semibold text-white hover:bg-[#246F47] disabled:opacity-50"
            >
              {saving ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Plus className="h-3 w-3" />
              )}
              {saving ? 'Saving…' : 'Add entry'}
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
