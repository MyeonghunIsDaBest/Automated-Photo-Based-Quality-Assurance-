import { useEffect, useMemo, useState } from 'react';
import { AlertOctagon, AlertTriangle, Bug, CheckCircle2, Package, Plus, Search, Trash2, X } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import type { Project } from '../../../types';
import { useAppStore } from '../../../store';
import { useFeatureStore } from '../../../store/features';
import { useOrdersForProject } from '../store';
import {
  LedgerHeader, LedgerStatRow, StatusPill,
  TONE, FRAUNCES, cardShell, btnPrimary, btnGhost, type ToneKey,
} from '../components/ledger';
import {
  listDefects, createDefect, updateDefect, deleteDefect, subscribeToProjectDefects,
  type Defect, type DefectSeverity, type DefectStatus,
} from '../../../lib/api/defects';

// P4.3 — the QA defect register, presented in the same warm logbook as the Site
// Diary + the Materials ledger it now lives beside. Four lifecycle columns
// (open → triaged → fixed → verified); a defect carries a severity + optional
// links to a task, a photo, or a supply material (migration 43). Data flow,
// realtime, and CRUD are unchanged — this is the visual rework only.

interface DefectsBoardProps {
  project: Project;
  canEdit: boolean;
  canDelete: boolean;
}

const STATUSES: { id: DefectStatus; label: string; tone: ToneKey }[] = [
  { id: 'open',     label: 'Open',     tone: 'red' },
  { id: 'triaged',  label: 'Triaged',  tone: 'amber' },
  { id: 'fixed',    label: 'Fixed',    tone: 'slate' },
  { id: 'verified', label: 'Verified', tone: 'sage' },
];

const SEVERITY_TONE: Record<DefectSeverity, ToneKey> = {
  critical: 'red', high: 'orange', medium: 'amber', low: 'slate',
};
const SEVERITY_RANK: Record<DefectSeverity, number> = { critical: 0, high: 1, medium: 2, low: 3 };
const SEVERITY_FILTERS: ('all' | DefectSeverity)[] = ['all', 'critical', 'high', 'medium', 'low'];

export function DefectsBoard({ project, canEdit, canDelete }: DefectsBoardProps) {
  const [defects, setDefects] = useState<Defect[]>([]);
  const currentUser = useAppStore((s) => s.currentUser);
  const setNotification = useAppStore((s) => s.setNotification);
  const tasks = useFeatureStore((s) => s.tasks);
  const [addOpen, setAddOpen] = useState(false);

  const [severityFilter, setSeverityFilter] = useState<'all' | DefectSeverity>('all');
  const [query, setQuery] = useState('');

  const projectTasks = useMemo(
    () => tasks.filter((t) => t.projectId === project.id),
    [tasks, project.id],
  );
  const taskName = (id?: string) => (id ? projectTasks.find((t) => t.id === id)?.name : undefined);

  // Supply-material labels for defects raised from Inventory (migration 43).
  const orders = useOrdersForProject(project.id);
  const materialByKey = useMemo(() => {
    const m = new Map<string, string>();
    for (const o of orders as Array<{ id: string; poNumber: string; lineItems: Array<{ id: string; description: string }> }>) {
      for (const li of o.lineItems) m.set(`${o.id}:${li.id}`, `PO ${o.poNumber} · ${li.description}`);
    }
    return m;
  }, [orders]);
  const materialName = (d: Defect) =>
    d.orderId && d.lineItemId ? materialByKey.get(`${d.orderId}:${d.lineItemId}`) : undefined;

  // Hydrate + realtime (dedupe echoes by id).
  useEffect(() => {
    let cancelled = false;
    void listDefects(project.id)
      .then((rows) => { if (!cancelled) setDefects(rows); })
      .catch(() => { /* empty in mock mode / on error */ });
    const unsubscribe = subscribeToProjectDefects(project.id, {
      onInsert: (d) => setDefects((prev) => (prev.some((x) => x.id === d.id) ? prev : [d, ...prev])),
      onUpdate: (d) => setDefects((prev) => prev.map((x) => (x.id === d.id ? d : x))),
      onDelete: (id) => setDefects((prev) => prev.filter((x) => x.id !== id)),
    });
    return () => { cancelled = true; unsubscribe(); };
  }, [project.id]);

  const handleCreate = async (input: {
    title: string; description?: string; severity: DefectSeverity; taskId?: string; assigneeId?: string;
  }) => {
    try {
      const created = await createDefect(project.id, { ...input, createdBy: currentUser?.id ?? 'system' });
      setDefects((prev) => (prev.some((x) => x.id === created.id) ? prev : [created, ...prev]));
      setNotification({ message: `Defect logged: "${created.title}"`, type: 'success' });
    } catch (err) {
      setNotification({ message: err instanceof Error ? err.message : 'Could not log defect.', type: 'error' });
    }
  };

  const handleStatus = (d: Defect, status: DefectStatus) => {
    const verifiedAt = status === 'verified' ? new Date().toISOString() : undefined;
    setDefects((prev) => prev.map((x) => (x.id === d.id ? { ...x, status, verifiedAt } : x)));
    void updateDefect(d.id, { status }).then(
      () => { if (status === 'verified') setNotification({ message: `Defect verified: "${d.title}"`, type: 'success' }); },
      (err) => setNotification({ message: err instanceof Error ? err.message : 'Could not update defect.', type: 'error' }),
    );
  };

  const handleDelete = (d: Defect) => {
    const prev = defects;
    setDefects((list) => list.filter((x) => x.id !== d.id));
    void deleteDefect(d.id).catch((err) => {
      setDefects(prev);
      setNotification({ message: err instanceof Error ? err.message : 'Could not delete defect.', type: 'error' });
    });
  };

  const counts = useMemo(() => {
    const c: Record<DefectStatus, number> = { open: 0, triaged: 0, fixed: 0, verified: 0 };
    for (const d of defects) c[d.status] += 1;
    return c;
  }, [defects]);
  const outstanding = counts.open + counts.triaged + counts.fixed;

  const openCriticalOrHigh = useMemo(
    () => defects.filter((d) => d.status !== 'verified' && (d.severity === 'critical' || d.severity === 'high')).length,
    [defects],
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return defects.filter((d) => {
      if (severityFilter !== 'all' && d.severity !== severityFilter) return false;
      if (!q) return true;
      const tn = d.taskId ? (projectTasks.find((t) => t.id === d.taskId)?.name ?? '') : '';
      const hay = `${d.title} ${d.description ?? ''} ${tn} ${d.assigneeId ?? ''}`.toLowerCase();
      return hay.includes(q);
    });
  }, [defects, severityFilter, query, projectTasks]);

  const byStatus = useMemo(() => {
    const cols: Record<DefectStatus, Defect[]> = { open: [], triaged: [], fixed: [], verified: [] };
    for (const d of visible) cols[d.status].push(d);
    for (const k of Object.keys(cols) as DefectStatus[]) {
      cols[k].sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity]);
    }
    return cols;
  }, [visible]);

  const filtersActive = severityFilter !== 'all' || query.trim() !== '';
  const filteredToZero = defects.length > 0 && visible.length === 0;
  const clearFilters = () => { setSeverityFilter('all'); setQuery(''); };

  return (
    <>
      <LedgerHeader
        kicker="QA"
        icon={Bug}
        eyebrow={`Defect register · ${project.name}`}
        title="Raise, triage, fix, verify."
        meta={
          <>
            {outstanding} outstanding · {defects.length} total
            <span className="mx-2 text-[#A0A0A0]">·</span>
            <span className="font-medium text-[#246F47]">nothing closes without a sign-off</span>
          </>
        }
        actions={
          <>
            {openCriticalOrHigh > 0 && (
              <StatusPill tone="red" className="px-3 py-1.5">
                <AlertOctagon className="h-3.5 w-3.5" /> {openCriticalOrHigh} high/critical
              </StatusPill>
            )}
            {canEdit ? (
              <button type="button" onClick={() => setAddOpen(true)} className={btnPrimary}>
                <Plus className="h-3.5 w-3.5" /> New defect
              </button>
            ) : (
              <StatusPill tone="slate" className="px-3 py-1.5">
                <Bug className="h-3.5 w-3.5" /> Read-only
              </StatusPill>
            )}
          </>
        }
      />

      <LedgerStatRow
        stats={[
          { value: outstanding,       label: 'Outstanding',     sub: 'open · triaged · fixed', tone: 'ink' },
          { value: openCriticalOrHigh, label: 'High / critical', sub: 'needs priority',          tone: 'red' },
          { value: counts.fixed,      label: 'Awaiting verify', sub: 'ready for sign-off',      tone: 'amber' },
          { value: counts.verified,   label: 'Verified',        sub: 'closed out',              tone: 'sage' },
        ]}
      />

      {/* Filter + search */}
      <div className={`mb-4 flex flex-col gap-3 p-2.5 sm:flex-row sm:items-center sm:justify-between ${cardShell}`}>
        <div className="-mx-1 flex flex-wrap items-center gap-1 px-1">
          {SEVERITY_FILTERS.map((f) => {
            const active = severityFilter === f;
            const t = f !== 'all' ? TONE[SEVERITY_TONE[f]] : null;
            return (
              <button
                key={f}
                type="button"
                onClick={() => setSeverityFilter(f)}
                className="rounded-full px-3.5 py-1.5 text-[12.5px] font-medium capitalize transition-colors"
                style={active
                  ? (t ? { backgroundColor: t.bg, color: t.fg } : { backgroundColor: '#1A1A1A', color: '#fff' })
                  : { color: '#6B6B6B' }}
              >
                {f === 'all' ? 'All severities' : f}
              </button>
            );
          })}
        </div>
        <div className="relative sm:w-72">
          <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search defects, tasks…"
            aria-label="Search defects"
            className="w-full rounded-full border border-[#E6E1D4] bg-white py-2 pl-10 pr-3 text-[13px] text-[#3A3A3A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
          />
        </div>
      </div>

      {defects.length === 0 ? (
        <div className={`px-6 py-16 text-center ${cardShell}`}>
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-[#FAF8F2] text-[#2F8F5C]">
            <Bug className="h-7 w-7" strokeWidth={1.5} />
          </div>
          <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
            No defects on {project.name}.
          </h3>
          <p className="mx-auto mt-2 max-w-sm text-[13px] text-[#6B6B6B]">
            {canEdit
              ? "Log a defect when something needs re-work and a sign-off — it moves Open → Triaged → Fixed → Verified so nothing closes without a check."
              : 'Nothing has been raised yet.'}
          </p>
          {canEdit && (
            <button type="button" onClick={() => setAddOpen(true)} className={`mt-5 ${btnPrimary}`}>
              <Plus className="h-3.5 w-3.5" /> First defect
            </button>
          )}
        </div>
      ) : (
        <>
          {filteredToZero && (
            <div className={`mb-3 flex items-center justify-between px-4 py-3 text-[13px] text-[#6B6B6B] ${cardShell}`}>
              <span>No defects match these filters.</span>
              <button type="button" onClick={clearFilters} className="font-semibold text-[#246F47] hover:text-[#2F8F5C]">
                Clear filters
              </button>
            </div>
          )}

          <div className="-mx-4 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0">
            <div className="grid min-w-max grid-cols-4 gap-3 sm:min-w-0">
              {STATUSES.map((col) => (
                <section key={col.id} className="w-72 sm:w-auto">
                  <div className="mb-2.5 flex items-center gap-2">
                    <StatusPill tone={col.tone} className="uppercase tracking-[0.08em]">{col.label}</StatusPill>
                    <span className="text-[12px] tabular-nums text-[#A0A0A0]">{byStatus[col.id].length}</span>
                  </div>
                  <div className="space-y-2.5">
                    {byStatus[col.id].map((d) => (
                      <DefectCard
                        key={d.id}
                        defect={d}
                        taskName={taskName(d.taskId)}
                        materialName={materialName(d)}
                        canEdit={canEdit}
                        canDelete={canDelete}
                        onStatus={(s) => handleStatus(d, s)}
                        onDelete={() => handleDelete(d)}
                      />
                    ))}
                    {byStatus[col.id].length === 0 && (
                      <p className="rounded-[10px] border border-dashed border-[#E6E1D4] bg-[#FAF8F2]/60 px-3 py-6 text-center text-[12px] text-[#A0A0A0]">
                        {filtersActive ? 'No match' : 'None'}
                      </p>
                    )}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </>
      )}

      {addOpen && (
        <NewDefectModal
          tasks={projectTasks.map((t) => ({ id: t.id, name: t.name }))}
          onClose={() => setAddOpen(false)}
          onCreate={async (input) => { await handleCreate(input); setAddOpen(false); }}
        />
      )}
    </>
  );
}

// ─── Defect card ────────────────────────────────────────────────────────────

function DefectCard({
  defect, taskName, materialName, canEdit, canDelete, onStatus, onDelete,
}: {
  defect: Defect;
  taskName?: string;
  materialName?: string;
  canEdit: boolean;
  canDelete: boolean;
  onStatus: (s: DefectStatus) => void;
  onDelete: () => void;
}) {
  const t = TONE[SEVERITY_TONE[defect.severity]];
  return (
    <div className="group rounded-[12px] border border-[#E6E1D4] bg-white p-3 shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition hover:border-[#D8D2C2] hover:shadow-md">
      <div className="flex items-start justify-between gap-2">
        <StatusPill tone={SEVERITY_TONE[defect.severity]} className="uppercase tracking-[0.06em]">
          <span className="h-1.5 w-1.5 rounded-full" style={{ background: t.dot }} />
          {defect.severity}
        </StatusPill>
        {canDelete && (
          <button
            type="button"
            onClick={onDelete}
            className="invisible inline-flex h-6 w-6 items-center justify-center rounded-full text-[#A0A0A0] transition hover:bg-[#FBE5E5] hover:text-[#C44545] focus:visible group-hover:visible"
            aria-label={`Delete ${defect.title}`}
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="mt-1.5 text-[13.5px] font-semibold text-[#1A1A1A]">{defect.title}</p>
      {defect.description && (
        <p className="mt-0.5 line-clamp-2 text-[12px] leading-relaxed text-[#6B6B6B]">{defect.description}</p>
      )}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {taskName && (
          <span className="inline-flex items-center rounded-[7px] border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[11px] text-[#3A3A3A]">
            {taskName}
          </span>
        )}
        {materialName && (
          <span className="inline-flex items-center gap-1 rounded-[7px] border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[11px] text-[#3A3A3A]">
            <Package className="h-3 w-3" /> {materialName}
          </span>
        )}
        {defect.assigneeId && (
          <span className="inline-flex items-center rounded-[7px] border border-[#E6E1D4] bg-[#FAF8F2] px-2 py-0.5 text-[11px] text-[#3A3A3A]">
            {defect.assigneeId}
          </span>
        )}
        {defect.verifiedAt && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-[#246F47]">
            <CheckCircle2 className="h-3 w-3" />
            {format(parseISO(defect.verifiedAt), 'MMM d')}
          </span>
        )}
      </div>
      {canEdit && (
        <select
          value={defect.status}
          onChange={(e) => onStatus(e.target.value as DefectStatus)}
          className="mt-2.5 w-full rounded-[8px] border border-[#E6E1D4] bg-white px-2 py-1.5 text-[12px] text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
          aria-label={`Move ${defect.title} to a different status`}
        >
          {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
        </select>
      )}
    </div>
  );
}

// ─── New-defect modal ────────────────────────────────────────────────────────

function NewDefectModal({
  tasks, onClose, onCreate,
}: {
  tasks: { id: string; name: string }[];
  onClose: () => void;
  onCreate: (input: {
    title: string; description?: string; severity: DefectSeverity; taskId?: string; assigneeId?: string;
  }) => void | Promise<void>;
}) {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [severity, setSeverity] = useState<DefectSeverity>('medium');
  const [taskId, setTaskId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) return setError('A title is required.');
    setSaving(true);
    setError(null);
    try {
      await onCreate({
        title: title.trim(),
        description: description.trim() || undefined,
        severity,
        taskId: taskId || undefined,
        assigneeId: assigneeId.trim() || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not log defect.');
      setSaving(false);
    }
  };

  return (
    <div className="editorial-root fixed inset-0 z-50 grid place-items-center bg-[#1A1A1A]/40 p-4 backdrop-blur-sm">
      <div className="flex w-full max-w-lg flex-col overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-2xl">
        <div className="flex items-start justify-between border-b border-[#EFEBE0] px-6 py-5">
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[#6B6B6B]">Quality · Defect register</p>
            <h2 className="mt-1 text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Log a defect</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" className="rounded-full p-2 text-[#6B6B6B] hover:bg-[#FAF8F2]">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={submit} className="space-y-4 px-6 py-5">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Switchboard label missing on C12"
              className="block w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13.5px] text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
            />
          </Field>
          <Field label="Description" optional>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="What's wrong, and what does 'fixed' look like?"
              className="block w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13.5px] text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
            />
          </Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1.5 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">Severity</label>
              <div className="flex flex-wrap gap-2">
                {(['low', 'medium', 'high', 'critical'] as DefectSeverity[]).map((s) => {
                  const active = severity === s;
                  const t = TONE[SEVERITY_TONE[s]];
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setSeverity(s)}
                      aria-pressed={active}
                      className="inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-semibold capitalize transition-colors"
                      style={active
                        ? { backgroundColor: t.bg, color: t.fg, borderColor: t.dot }
                        : { backgroundColor: '#fff', color: '#6B6B6B', borderColor: '#E6E1D4' }}
                    >
                      <span className="h-2 w-2 rounded-full" style={{ background: t.dot }} />
                      {s}
                    </button>
                  );
                })}
              </div>
            </div>
            <Field label="Link task" optional>
              <select
                value={taskId}
                onChange={(e) => setTaskId(e.target.value)}
                className="block w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13.5px] text-[#3A3A3A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
              >
                <option value="">None</option>
                {tasks.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
              </select>
            </Field>
          </div>
          <Field label="Assignee" optional>
            <input
              value={assigneeId}
              onChange={(e) => setAssigneeId(e.target.value)}
              placeholder="Name or role"
              className="block w-full rounded-[10px] border border-[#E6E1D4] bg-white px-3 py-2 text-[13.5px] text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C]/30"
            />
          </Field>

          {error && (
            <p className="flex items-center gap-1.5 rounded-[10px] border border-[#F3CFCF] bg-[#FBE5E5] px-3 py-2 text-[12px] text-[#C44545]">
              <AlertTriangle className="h-3.5 w-3.5" /> {error}
            </p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <button type="button" onClick={onClose} disabled={saving} className={btnGhost}>Cancel</button>
            <button type="submit" disabled={saving || !title.trim()} className={btnPrimary}>
              {saving ? 'Logging…' : 'Log defect'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function Field({ label, optional, children }: { label: string; optional?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.1em] text-[#6B6B6B]">
        {label}{optional && <span className="ml-1 font-normal normal-case tracking-normal text-[#A0A0A0]">(optional)</span>}
      </label>
      {children}
    </div>
  );
}
