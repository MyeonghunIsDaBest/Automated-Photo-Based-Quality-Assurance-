// Typed CRUD helpers for the `maintenance_schedules` table (Maintenance domain).
//
// All write functions throw on error. Read functions return [] / null when
// Supabase is not configured so the UI can render empty states gracefully.

import { supabase, supabaseConfigured } from '../supabase';

// ---------------------------------------------------------------------------
// Literal union type
// ---------------------------------------------------------------------------

export type MaintenanceFrequency =
  | 'monthly'
  | 'quarterly'
  | 'half_yearly'
  | 'yearly';

// ---------------------------------------------------------------------------
// Row (snake_case — matches Supabase schema)
// ---------------------------------------------------------------------------

interface MaintenanceScheduleRow {
  id: string;
  property_id: string;
  title: string;
  category: string | null;
  frequency: MaintenanceFrequency;
  next_due: string;
  remind_days_before: number[];
  notify_customer: boolean;
  extra_notify_email: string | null;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  // Nested join — present only when requested via select
  properties?: {
    customer_id: string;
  } | null;
}

// ---------------------------------------------------------------------------
// Domain type (camelCase — used by the rest of the app)
// ---------------------------------------------------------------------------

export interface MaintenanceSchedule {
  id: string;
  propertyId: string;
  title: string;
  category: string | null;
  frequency: MaintenanceFrequency;
  /** DATE string 'YYYY-MM-DD' — passed through untouched. */
  nextDue: string;
  remindDaysBefore: number[];
  notifyCustomer: boolean;
  extraNotifyEmail: string | null;
  isActive: boolean;
  createdBy: string | null;
  createdAt: string;
}

// ---------------------------------------------------------------------------
// Mapper
// ---------------------------------------------------------------------------

function rowToSchedule(r: MaintenanceScheduleRow): MaintenanceSchedule {
  return {
    id: r.id,
    propertyId: r.property_id,
    title: r.title,
    category: r.category,
    frequency: r.frequency,
    nextDue: r.next_due,
    remindDaysBefore: Array.isArray(r.remind_days_before) ? r.remind_days_before : [],
    notifyCustomer: r.notify_customer,
    extraNotifyEmail: r.extra_notify_email,
    isActive: r.is_active,
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

// ---------------------------------------------------------------------------
// Error sentinel
// ---------------------------------------------------------------------------

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

// ---------------------------------------------------------------------------
// Read helpers
// ---------------------------------------------------------------------------

export async function listSchedulesForProperty(
  propertyId: string,
): Promise<MaintenanceSchedule[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .select('*')
    .eq('property_id', propertyId)
    .order('next_due', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToSchedule(r as MaintenanceScheduleRow));
}

/** All schedules across properties belonging to the given customer. */
export async function listSchedulesForCustomer(
  customerId: string,
): Promise<MaintenanceSchedule[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .select('*, properties!inner(customer_id)')
    .eq('properties.customer_id', customerId)
    .order('next_due', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToSchedule(r as MaintenanceScheduleRow));
}

// ---------------------------------------------------------------------------
// Write helpers
// ---------------------------------------------------------------------------

export interface CreateScheduleInput {
  propertyId: string;
  title: string;
  category?: string;
  frequency: MaintenanceFrequency;
  /** DATE string 'YYYY-MM-DD' — passed through untouched. */
  nextDue: string;
  remindDaysBefore?: number[];
  notifyCustomer?: boolean;
  extraNotifyEmail?: string;
}

export async function createSchedule(input: CreateScheduleInput): Promise<MaintenanceSchedule> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .insert({
      property_id: input.propertyId,
      title: input.title,
      category: input.category ?? null,
      frequency: input.frequency,
      next_due: input.nextDue,
      // Mirror the DB defaults (migration 60) rather than overriding them:
      // omitting these must NOT silently disable the reminder cadence.
      remind_days_before: input.remindDaysBefore ?? [30, 14],
      notify_customer: input.notifyCustomer ?? true,
      extra_notify_email: input.extraNotifyEmail ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToSchedule(data as MaintenanceScheduleRow);
}

/** Like CreateScheduleInput but optional text fields accept null so a cleared
 *  field actually clears in the DB (undefined = leave unchanged). */
export interface UpdateScheduleInput
  extends Omit<Partial<Omit<CreateScheduleInput, 'propertyId'>>, 'category' | 'extraNotifyEmail'> {
  category?: string | null;
  extraNotifyEmail?: string | null;
}

export async function updateSchedule(
  id: string,
  patch: UpdateScheduleInput,
): Promise<MaintenanceSchedule> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .update({
      ...(patch.title !== undefined && { title: patch.title }),
      ...(patch.category !== undefined && { category: patch.category }),
      ...(patch.frequency !== undefined && { frequency: patch.frequency }),
      ...(patch.nextDue !== undefined && { next_due: patch.nextDue }),
      ...(patch.remindDaysBefore !== undefined && { remind_days_before: patch.remindDaysBefore }),
      ...(patch.notifyCustomer !== undefined && { notify_customer: patch.notifyCustomer }),
      ...(patch.extraNotifyEmail !== undefined && { extra_notify_email: patch.extraNotifyEmail }),
    })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToSchedule(data as MaintenanceScheduleRow);
}

export async function setScheduleActive(id: string, active: boolean): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('maintenance_schedules')
    .update({ is_active: active })
    .eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// markScheduleDone — roll next_due forward by one frequency interval
// ---------------------------------------------------------------------------

/** Number of calendar months each frequency adds. */
const FREQUENCY_MONTHS: Record<MaintenanceFrequency, number> = {
  monthly: 1,
  quarterly: 3,
  half_yearly: 6,
  yearly: 12,
};

/**
 * Roll next_due forward by one frequency interval from its CURRENT value
 * (not from today) to keep anniversaries stable.
 *
 * Month arithmetic is done with `new Date(y, m + months, d)`.
 * JavaScript's Date auto-normalises out-of-range days, so e.g.
 * Jan 31 + 1 month becomes Mar 3 (in non-leap years) or Mar 2 (leap years).
 * This is acceptable for a field-services reminder cadence — the alternative
 * (clamping to the last day of the target month) would require a helper that
 * adds complexity for little real-world benefit. Callers should document this
 * behaviour if it surfaces in UI.
 */
export async function markScheduleDone(id: string): Promise<MaintenanceSchedule> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  // 1. Fetch the current schedule to read next_due and frequency
  const { data: existing, error: fetchError } = await supabase
    .from('maintenance_schedules')
    .select('*')
    .eq('id', id)
    .single();
  if (fetchError) throw fetchError;

  const schedule = rowToSchedule(existing as MaintenanceScheduleRow);

  // 2. Compute new next_due: advance from current next_due by frequency months
  const months = FREQUENCY_MONTHS[schedule.frequency];
  // next_due is a DATE string 'YYYY-MM-DD' — parse as local date components to
  // avoid UTC-vs-local midnight shifts (no time zone conversion desired)
  const [yearStr, monthStr, dayStr] = schedule.nextDue.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10) - 1; // JS months are 0-indexed
  const d = parseInt(dayStr, 10);
  const advanced = new Date(y, m + months, d);
  // Format back to 'YYYY-MM-DD'
  const newNextDue = [
    advanced.getFullYear(),
    String(advanced.getMonth() + 1).padStart(2, '0'),
    String(advanced.getDate()).padStart(2, '0'),
  ].join('-');

  // 3. Persist and return the updated schedule
  const { data, error } = await supabase
    .from('maintenance_schedules')
    .update({ next_due: newNextDue })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToSchedule(data as MaintenanceScheduleRow);
}
