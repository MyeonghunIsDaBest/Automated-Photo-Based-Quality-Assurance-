// NewWorkModal — tabbed creation modal for the Jobs Board.
//
// Tabs:
//   "Service job" (Zap icon)   — ServiceJobForm (all logic from NewServiceJobModal)
//   "Project"     (FolderOpen) — ProjectCreateForm (extracted from NewProjectModal)
//
// Tab visibility rules:
//   • Project tab only when canCreateProject(principal).
//   • When initialStatus is defined: force Service tab, hide strip entirely
//     (composer intent is unambiguous).
//   • When only one tab is visible: hide the strip.
//
// Footer: shared across both tabs. Primary button uses form={activeFormId}
// so the correct <form> receives the submit event.
//
// initialStatus paths (all four preserved):
//   undefined / 'pending'  — default: no date required, creates as pending.
//   'scheduled'            — date field required + auto-focused.
//   'in_progress'          — create pending → updateServiceJobStatus → in_progress.
//   'done'                 — create pending → updateServiceJobStatus → done.
//
// Partial-failure path: if the secondary status update fails the job is still
// created; onServiceJobCreated fires so the board refreshes, but an error
// banner remains visible so the user knows the final status was not applied.

import { useCallback, useEffect, useRef, useState } from 'react';
import { FolderOpen, X, Zap, CalendarClock } from 'lucide-react';
import { Button } from '../../components/ui/button';
import { Input } from '../../components/ui/input';
import MotionDrawer from '../../components/ui/MotionDrawer';
import { FRAUNCES } from '../gantt/components/ledger';
import { canCreateProject } from '../../lib/permissions';
import { useAppStore } from '../../store';
import {
  createServiceJob,
  updateServiceJobStatus,
  type ServiceJobStatus,
  type ServiceJobKind,
} from '../../lib/api/serviceJobs';
import { createPrepaidInvoiceForJob } from '../../lib/api/commercial';
import { listCustomers, type Customer } from '../../lib/api/customers';
import { listPropertiesForCustomer, type Property } from '../../lib/api/properties';
import { listProfiles } from '../../lib/api/profiles';
import type { Profile } from '../../types';
import { ProjectCreateForm } from '../projects/components/ProjectCreateForm';

// ─── style constants ──────────────────────────────────────────────────────────

const SELECT_CLASS =
  'block w-full rounded-md border border-[#E6E1D4] px-3 py-2 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] disabled:opacity-50 bg-white';

// ─── internal roles allowed in the assignee picker ───────────────────────────

const INTERNAL_GROUPS = new Set([
  'company_admin',
  'administrator',
  'construction_mgr',
  'project_manager',
  'worker',
]);

function isInternalActive(p: Profile): boolean {
  return p.isActive && INTERNAL_GROUPS.has(p.securityGroup ?? '');
}

// ─── sub-components ───────────────────────────────────────────────────────────

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.22em] text-[#A0A0A0]">
      {children}
    </p>
  );
}

function FieldLabel({
  children,
  required,
}: {
  children: React.ReactNode;
  required?: boolean;
}) {
  return (
    <label className="mb-1 block text-[11px] font-medium uppercase tracking-wider text-[#6B6B6B]">
      {children}
      {required && <span className="ml-1 text-[#C44545]">*</span>}
    </label>
  );
}

function ErrorBanner({ msg }: { msg: string }) {
  return (
    <p className="rounded-md border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
      {msg}
    </p>
  );
}

// ─── tab types ────────────────────────────────────────────────────────────────

type ActiveTab = 'service' | 'project';

const SERVICE_FORM_ID = 'new-service-job-form';
const PROJECT_FORM_ID = 'new-project-form';

// ─── props ────────────────────────────────────────────────────────────────────

export interface NewWorkModalProps {
  open: boolean;
  onClose: () => void;
  onServiceJobCreated: () => void;
  onProjectCreated: (projectId: string) => void;
  /**
   * When set the Service tab is forced and the tab strip is hidden.
   * 'scheduled' → date required + auto-focused.
   * 'in_progress' / 'done' → create pending then chain status update.
   * undefined / 'pending' → default (no extra step).
   */
  initialStatus?: ServiceJobStatus;
  /** Open on this tab. 'project' = the Gantt-project tab (needs canCreateProject). */
  initialTab?: ActiveTab;
  /** Preset the service form's work register (a "Project Job" = kind 'project'
   *  service job, NOT a Gantt project). */
  initialKind?: ServiceJobKind;
  /** Preset the prepaid toggle (a "Prepaid Job" raises its invoice on save). */
  initialPrepaid?: boolean;
}

// ─── ServiceJobForm (embedded in this file, self-contained) ──────────────────

interface ServiceJobFormProps {
  initialStatus: ServiceJobStatus | undefined;
  initialKind?: ServiceJobKind;
  initialPrepaid?: boolean;
  saving: boolean;
  setSaving: (v: boolean) => void;
  onCreated: () => void;
  /** External error fed from the footer-level save handler (unused — form owns its own errors). */
  formError: string | null;
  setFormError: (e: string | null) => void;
}

function ServiceJobForm({
  initialStatus,
  initialKind,
  initialPrepaid,
  saving,
  setSaving,
  onCreated,
  formError,
  setFormError,
}: ServiceJobFormProps) {
  const [title, setTitle] = useState('');
  const [clientName, setClientName] = useState('');
  const [phone, setPhone] = useState('');
  const [address, setAddress] = useState('');
  const [scheduledFor, setScheduledFor] = useState('');
  const [customerId, setCustomerId] = useState('');
  const [propertyId, setPropertyId] = useState('');
  const [assigneeId, setAssigneeId] = useState('');
  // SimPro register + billing options (migs 93 / 102 / 103).
  const [kind, setKind] = useState<ServiceJobKind>(initialKind ?? 'service');
  const [isContractor, setIsContractor] = useState(false);
  const [contractorName, setContractorName] = useState('');
  const [prepaid, setPrepaid] = useState(!!initialPrepaid);
  const [contractValue, setContractValue] = useState('');

  const [customers, setCustomers] = useState<Customer[]>([]);
  const [properties, setProperties] = useState<Property[]>([]);
  const [profiles, setProfiles] = useState<Profile[]>([]);

  const [loadingCustomers, setLoadingCustomers] = useState(false);
  const [loadingProps, setLoadingProps] = useState(false);

  const dateInputRef = useRef<HTMLInputElement>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // Load customers + profiles on mount
  useEffect(() => {
    setLoadingCustomers(true);
    Promise.all([listCustomers(), listProfiles()])
      .then(([c, p]) => {
        setCustomers(c);
        setProfiles(p.filter(isInternalActive));
      })
      .catch(() => {
        // Non-fatal — pickers will be empty
      })
      .finally(() => setLoadingCustomers(false));
  }, []);

  // Auto-focus: date when scheduled, title otherwise
  useEffect(() => {
    if (initialStatus === 'scheduled') {
      window.setTimeout(() => dateInputRef.current?.focus(), 80);
    } else {
      window.setTimeout(() => titleInputRef.current?.focus(), 80);
    }
  }, [initialStatus]);

  // Load properties when customer changes
  useEffect(() => {
    if (!customerId) {
      setProperties([]);
      setPropertyId('');
      return;
    }
    setLoadingProps(true);
    listPropertiesForCustomer(customerId)
      .then(setProperties)
      .catch(() => setProperties([]))
      .finally(() => setLoadingProps(false));
    setPropertyId('');
  }, [customerId]);

  // Column hint
  const columnHint =
    initialStatus === 'scheduled'
      ? 'Creating directly into Scheduled — a date is required.'
      : initialStatus === 'in_progress'
        ? 'Creating directly into In Progress.'
        : initialStatus === 'done'
          ? 'Creating directly into Done — job will be marked complete.'
          : null;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const trimmedTitle = title.trim();
    if (!trimmedTitle) {
      setFormError('Title is required.');
      return;
    }

    if (initialStatus === 'scheduled' && !scheduledFor) {
      setFormError('A scheduled date is required for this column.');
      dateInputRef.current?.focus();
      return;
    }

    const parsedContract = contractValue.trim() === '' ? null : Number(contractValue);
    if (prepaid && (parsedContract === null || !isFinite(parsedContract) || parsedContract <= 0)) {
      setFormError('A prepaid job needs a contract value so the upfront invoice isn’t $0.');
      return;
    }
    if (isContractor && !contractorName.trim()) {
      setFormError('Add the subcontractor’s name.');
      return;
    }

    if (saving) return;
    setSaving(true);

    try {
      const selectedProperty = properties.find((p) => p.id === propertyId);
      const resolvedAddress =
        address.trim() ||
        (selectedProperty
          ? [selectedProperty.address, selectedProperty.suburb]
              .filter(Boolean)
              .join(', ')
          : undefined);

      const useScheduledFor = scheduledFor || undefined;

      const created = await createServiceJob({
        title: trimmedTitle,
        clientName: clientName.trim() || undefined,
        clientPhone: phone.trim() || undefined,
        address: resolvedAddress || undefined,
        customerId: customerId || undefined,
        propertyId: propertyId || undefined,
        assignedTo: assigneeId || undefined,
        scheduledFor: useScheduledFor,
        kind,
        isContractor: isContractor || undefined,
        contractorName: isContractor ? contractorName.trim() : undefined,
        prepaid: prepaid || undefined,
        contractValue: parsedContract,
      });

      let chainWarning: string | null = null;
      if (initialStatus === 'in_progress' || initialStatus === 'done') {
        try {
          await updateServiceJobStatus(created.id, initialStatus);
        } catch (chainErr) {
          const chainMsg =
            chainErr instanceof Error ? chainErr.message : 'Unknown error';
          chainWarning = `Job created as pending — couldn't move it to ${initialStatus}: ${chainMsg}`;
        }
      }

      // Prepaid: raise the upfront invoice. Partial-failure safe — the job
      // exists regardless; a failed invoice only surfaces a warning.
      if (prepaid) {
        try {
          await createPrepaidInvoiceForJob(created.id);
        } catch (invErr) {
          const invMsg = invErr instanceof Error ? invErr.message : 'Unknown error';
          chainWarning = `Job created — couldn't raise the prepaid invoice: ${invMsg}. Raise it from Invoices → From job.`;
        }
      }

      // Reset form state
      setTitle('');
      setClientName('');
      setPhone('');
      setAddress('');
      setScheduledFor('');
      setCustomerId('');
      setPropertyId('');
      setAssigneeId('');
      setKind(initialKind ?? 'service');
      setIsContractor(false);
      setContractorName('');
      setPrepaid(!!initialPrepaid);
      setContractValue('');

      if (chainWarning) {
        // Job exists; notify caller so board refreshes, keep modal open to show warning
        setFormError(chainWarning);
        onCreated();
      } else {
        setFormError(null);
        onCreated();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to create job.';
      setFormError(msg);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form
      id={SERVICE_FORM_ID}
      onSubmit={handleSubmit}
      className="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="editorial-scrollbox flex-1 overflow-y-auto space-y-0 px-6 py-5">

        {/* ── THE JOB ──────────────────────────────────────────────────── */}
        <div className="pb-4">
          <SectionLabel>The Job</SectionLabel>

          {/* Column hint strip with CalendarClock glyph */}
          {columnHint && (
            <div className="mb-3 flex items-start gap-2 rounded-md border border-[#D8D2C4] bg-[#FAF8F2] px-3 py-2">
              <CalendarClock className="mt-0.5 h-3.5 w-3.5 flex-shrink-0 text-[#6B6B6B]" />
              <p className="text-[12px] text-[#6B6B6B]">{columnHint}</p>
            </div>
          )}

          <div>
            <FieldLabel required>Job title</FieldLabel>
            <Input
              ref={titleInputRef}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Install new power point — 14 Smith St"
              disabled={saving}
              className="text-base"
            />
            {formError && !title.trim() && <ErrorBanner msg={formError} />}
          </div>
        </div>

        <hr className="border-[#E6E1D4]" />

        {/* ── WHO IT'S FOR ─────────────────────────────────────────────── */}
        <div className="py-4">
          <SectionLabel>Who it&apos;s for</SectionLabel>

          {/* Customer select */}
          <div className="mb-3">
            <FieldLabel>Link to existing customer</FieldLabel>
            <select
              value={customerId}
              onChange={(e) => setCustomerId(e.target.value)}
              disabled={saving || loadingCustomers}
              className={SELECT_CLASS}
            >
              <option value="">— none —</option>
              {customers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* Inset panel — property picker when customer chosen, else free-text fields */}
          <div className="rounded-md border border-[#E6E1D4] bg-[#FAF8F2] p-3">
            {customerId ? (
              /* Chosen-customer mode: property picker */
              <div>
                <FieldLabel>Property</FieldLabel>
                <select
                  value={propertyId}
                  onChange={(e) => setPropertyId(e.target.value)}
                  disabled={saving || loadingProps}
                  className={SELECT_CLASS}
                >
                  <option value="">— none —</option>
                  {properties.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name}
                      {p.address ? ` — ${p.address}` : ''}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              /* None-mode: client name / phone / address grid */
              <div className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <FieldLabel>Client name</FieldLabel>
                    <Input
                      value={clientName}
                      onChange={(e) => setClientName(e.target.value)}
                      placeholder="e.g. John Smith"
                      disabled={saving}
                    />
                  </div>
                  <div>
                    <FieldLabel>Phone</FieldLabel>
                    <Input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g. 0412 345 678"
                      disabled={saving}
                    />
                  </div>
                </div>
                <div>
                  <FieldLabel>Address</FieldLabel>
                  <Input
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    placeholder="Street address"
                    disabled={saving}
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        <hr className="border-[#E6E1D4]" />

        {/* ── SCHEDULING ───────────────────────────────────────────────── */}
        <div className="pt-4">
          <SectionLabel>Scheduling</SectionLabel>
          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <FieldLabel>Assign to</FieldLabel>
              <select
                value={assigneeId}
                onChange={(e) => setAssigneeId(e.target.value)}
                disabled={saving}
                className={SELECT_CLASS}
              >
                <option value="">— unassigned —</option>
                {profiles.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.firstName} {p.lastName}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel required={initialStatus === 'scheduled'}>
                Scheduled date
              </FieldLabel>
              <Input
                ref={dateInputRef}
                type="date"
                value={scheduledFor}
                onChange={(e) => setScheduledFor(e.target.value)}
                disabled={saving}
              />
              {initialStatus !== 'scheduled' && (
                <p className="mt-0.5 text-[11px] text-[#A0A0A0]">
                  Leave blank to create as Pending.
                </p>
              )}
            </div>
          </div>

          {/* Non-title errors */}
          {formError && title.trim() && (
            <div className="mt-3">
              <ErrorBanner msg={formError} />
            </div>
          )}
        </div>

        <hr className="border-[#E6E1D4]" />

        {/* ── REGISTER & BILLING ───────────────────────────────────────── */}
        <div className="pt-4">
          <SectionLabel>Register &amp; billing</SectionLabel>

          {/* Work register: Service | Project (mig 93) */}
          <div className="mb-3">
            <FieldLabel>Work register</FieldLabel>
            <div className="inline-flex rounded-md border border-[#E6E1D4] bg-[#FAF8F2] p-0.5">
              {(['service', 'project'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  onClick={() => setKind(k)}
                  disabled={saving}
                  className={`rounded px-3 py-1 text-[12px] font-semibold capitalize transition-colors ${
                    kind === k ? 'bg-[#1A1A1A] text-white' : 'text-[#6B6B6B] hover:text-[#1A1A1A]'
                  }`}
                >
                  {k}
                </button>
              ))}
            </div>
            <p className="mt-1 text-[11px] text-[#A0A0A0]">
              Project = project-register work on the jobs board. For a full Gantt project, use the Gantt project tab.
            </p>
          </div>

          {/* Subcontractor (mig 102) */}
          <label className="mb-2 flex items-center gap-2 text-[13px] text-[#3A3A3A]">
            <input
              type="checkbox"
              checked={isContractor}
              disabled={saving}
              onChange={(e) => setIsContractor(e.target.checked)}
              className="h-4 w-4 accent-[#2F8F5C]"
            />
            Subcontractor job
          </label>
          {isContractor && (
            <div className="mb-3">
              <FieldLabel required>Subcontractor name</FieldLabel>
              <Input
                value={contractorName}
                onChange={(e) => setContractorName(e.target.value)}
                placeholder="e.g. Volt Bros Electrical"
                disabled={saving}
              />
            </div>
          )}

          {/* Prepaid (mig 103) */}
          <label className="mb-2 flex items-center gap-2 text-[13px] text-[#3A3A3A]">
            <input
              type="checkbox"
              checked={prepaid}
              disabled={saving}
              onChange={(e) => setPrepaid(e.target.checked)}
              className="h-4 w-4 accent-[#2F8F5C]"
            />
            Prepaid — customer pays upfront (raises an invoice now)
          </label>
          {prepaid && (
            <div>
              <FieldLabel required>Contract value (ex GST)</FieldLabel>
              <Input
                type="number"
                min="0"
                step="0.01"
                inputMode="decimal"
                value={contractValue}
                onChange={(e) => setContractValue(e.target.value)}
                placeholder="0.00"
                disabled={saving}
              />
              <p className="mt-0.5 text-[11px] text-[#A0A0A0]">
                The job stays on the active board; an invoice is raised now.
              </p>
            </div>
          )}
        </div>
      </div>
    </form>
  );
}

// ─── NewWorkModal ─────────────────────────────────────────────────────────────

export function NewWorkModal({
  open,
  onClose,
  onServiceJobCreated,
  onProjectCreated,
  initialStatus,
  initialTab,
  initialKind,
  initialPrepaid,
}: NewWorkModalProps) {
  const currentProfile = useAppStore((s) => s.currentProfile);
  const canProject = canCreateProject(currentProfile);

  // When initialStatus is set: always service; strip hidden.
  // Otherwise: honour initialTab (Gantt project only when allowed), else service.
  const [activeTab, setActiveTab] = useState<ActiveTab>(
    initialTab === 'project' && canProject && !initialStatus ? 'project' : 'service',
  );

  // Shared busy state fed to the active form
  const [saving, setSaving] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  // Derive which tabs are visible
  const showProjectTab = canProject && !initialStatus;
  const showStrip = showProjectTab; // strip only when both tabs possible

  // Active form id for footer's form= attribute
  const activeFormId =
    activeTab === 'service' ? SERVICE_FORM_ID : PROJECT_FORM_ID;

  // Primary button label
  const primaryLabel =
    saving
      ? activeTab === 'service'
        ? 'Creating...'
        : 'Creating...'
      : activeTab === 'service'
        ? 'Create job'
        : 'Create project';

  // Reset tab + errors on close
  const handleClose = useCallback(() => {
    setActiveTab('service');
    setSaving(false);
    setFormError(null);
    onClose();
  }, [onClose]);

  // E10 busy-guard: Esc / backdrop / X all funnel through here — no-op while a
  // create is in flight so the modal can't vanish mid-save. (Esc + backdrop
  // handling itself now lives in MotionDrawer.)
  const guardedClose = useCallback(() => {
    if (saving) return;
    handleClose();
  }, [saving, handleClose]);

  const handleServiceJobCreated = () => {
    // For partial-failure the form keeps itself open with an error banner;
    // onCreated() was already called by ServiceJobForm in that path.
    // For success we close the modal.
    if (!formError) {
      handleClose();
    }
    onServiceJobCreated();
  };

  const handleProjectCreated = (projectId: string) => {
    handleClose();
    onProjectCreated(projectId);
  };

  return (
    <MotionDrawer
      open={open}
      onClose={guardedClose}
      variant="modal"
      ariaLabel="New work"
      sizeClass="max-w-lg"
      className="rounded-[14px] border border-[#E6E1D4] shadow-[0_8px_28px_rgba(20,20,20,0.12)]"
    >
      <div
        className="flex min-h-0 flex-1 flex-col overflow-hidden"
        style={{ fontFamily: "'DM Sans', system-ui, sans-serif" }}
      >
        {/* ── Header ──────────────────────────────────────────────────── */}
        <div className="flex items-start justify-between border-b border-[#E6E1D4] px-6 py-4">
          <div>
            <p className="text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
              Jobs Board
            </p>
            <h2
              className="mt-1 text-xl font-medium text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
            >
              New work.
            </h2>
          </div>
          <button
            type="button"
            onClick={guardedClose}
            className="rounded-md p-2 text-[#A0A0A0] hover:bg-[#F0EDE4] hover:text-[#3A3A3A]"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* ── Tab strip ───────────────────────────────────────────────── */}
        {showStrip && (
          <div className="flex items-center gap-1.5 border-b border-[#E6E1D4] px-6 py-3">
            <button
              type="button"
              onClick={() => {
                setActiveTab('service');
                setFormError(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                activeTab === 'service'
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-transparent text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]'
              }`}
            >
              <Zap className="h-3.5 w-3.5" />
              Service job
            </button>
            <button
              type="button"
              onClick={() => {
                setActiveTab('project');
                setFormError(null);
              }}
              className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[12px] font-semibold transition-colors ${
                activeTab === 'project'
                  ? 'bg-[#1A1A1A] text-white'
                  : 'bg-transparent text-[#6B6B6B] hover:bg-[#F0EDE4] hover:text-[#1A1A1A]'
              }`}
            >
              <FolderOpen className="h-3.5 w-3.5" />
              Gantt project
            </button>
          </div>
        )}

        {/* ── Form area ───────────────────────────────────────────────── */}
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeTab === 'service' && (
            <ServiceJobForm
              initialStatus={initialStatus}
              initialKind={initialKind}
              initialPrepaid={initialPrepaid}
              saving={saving}
              setSaving={setSaving}
              onCreated={handleServiceJobCreated}
              formError={formError}
              setFormError={setFormError}
            />
          )}
          {activeTab === 'project' && (
            <ProjectCreateForm
              id={PROJECT_FORM_ID}
              onCreated={handleProjectCreated}
              hideFooter
            />
          )}
        </div>

        {/* ── Shared footer ────────────────────────────────────────────── */}
        <div className="flex items-center justify-end gap-2 border-t border-[#E6E1D4] bg-[#FAF8F2] px-6 py-3">
          <Button
            type="button"
            variant="outline"
            onClick={handleClose}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button
            form={activeFormId}
            type="submit"
            disabled={saving}
            className="bg-[#2F8F5C] text-white hover:bg-[#246F47]"
          >
            {primaryLabel}
          </Button>
        </div>
      </div>
    </MotionDrawer>
  );
}
