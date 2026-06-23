// ─────────────────────────────────────────────────────────────────────────────
// lib/api/vouchers.ts — customer discount vouchers (migration 79).
//
// A voucher is a percentage discount with a shareable code (e.g. a 5% service
// voucher "SVC5-AB12"). Applying one to a quote sets quotes.discount_pct +
// applied_voucher_code and bumps the voucher's used_count. Manager-only (RLS).
// House conventions: writes throw; reads return []/safe shapes when unconfigured.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';
import { recomputeQuoteTotals } from './commercial';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

// ─── types ──────────────────────────────────────────────────────────────────

interface VoucherRow {
  id: string;
  code: string;
  label: string | null;
  percent: number;
  is_active: boolean;
  expires_at: string | null;
  max_uses: number | null;
  used_count: number;
  created_by: string | null;
  created_at: string;
}

export interface Voucher {
  id: string;
  code: string;
  label: string | null;
  percent: number;
  isActive: boolean;
  expiresAt: string | null;
  maxUses: number | null;
  usedCount: number;
  createdBy: string | null;
  createdAt: string;
}

function rowToVoucher(r: VoucherRow): Voucher {
  return {
    id: r.id,
    code: r.code,
    label: r.label,
    percent: Number(r.percent),
    isActive: r.is_active,
    expiresAt: r.expires_at,
    maxUses: r.max_uses == null ? null : Number(r.max_uses),
    usedCount: Number(r.used_count ?? 0),
    createdBy: r.created_by,
    createdAt: r.created_at,
  };
}

export interface CreateVoucherInput {
  percent: number;
  label?: string | null;
  expiresAt?: string | null;
  maxUses?: number | null;
  /** Optional explicit code; a readable one is generated when omitted. */
  code?: string;
}

/** Generate a readable code like "SVC5-AB12" (SVC + whole-percent + 4 chars). */
function genCode(percent: number): string {
  const pct = Math.max(0, Math.round(percent));
  const rand = Math.random().toString(36).slice(2, 6).toUpperCase();
  return `SVC${pct}-${rand}`;
}

// ─── reads ──────────────────────────────────────────────────────────────────

export async function listVouchers(includeInactive = false): Promise<Voucher[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('discount_vouchers').select('*');
  if (!includeInactive) q = q.eq('is_active', true);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToVoucher(r as VoucherRow));
}

export interface VoucherValidation {
  ok: boolean;
  voucher?: Voucher;
  reason?: string;
}

/** Look a code up and validate it (active / not expired / uses left). */
export async function getVoucherByCode(code: string): Promise<VoucherValidation> {
  if (!supabaseConfigured()) return { ok: false, reason: 'Supabase not configured.' };
  const { data, error } = await supabase
    .from('discount_vouchers')
    .select('*')
    .eq('code', code.trim().toUpperCase())
    .maybeSingle();
  if (error) throw error;
  if (!data) return { ok: false, reason: 'No voucher with that code.' };
  const v = rowToVoucher(data as VoucherRow);
  if (!v.isActive) return { ok: false, voucher: v, reason: 'This voucher is inactive.' };
  const today = new Date().toISOString().slice(0, 10);
  if (v.expiresAt && v.expiresAt < today) return { ok: false, voucher: v, reason: 'This voucher has expired.' };
  if (v.maxUses != null && v.usedCount >= v.maxUses) return { ok: false, voucher: v, reason: 'This voucher has been fully used.' };
  return { ok: true, voucher: v };
}

// ─── writes ─────────────────────────────────────────────────────────────────

export async function createVoucher(input: CreateVoucherInput): Promise<Voucher> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const code = (input.code?.trim() || genCode(input.percent)).toUpperCase();
  const { data, error } = await supabase
    .from('discount_vouchers')
    .insert({
      code,
      label: input.label ?? null,
      percent: Math.max(0, Math.min(100, input.percent)),
      expires_at: input.expiresAt ?? null,
      max_uses: input.maxUses ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new Error('That voucher code already exists — try a different one.');
    }
    throw error;
  }
  return rowToVoucher(data as VoucherRow);
}

/** Apply a voucher to a quote: set the quote's discount % + record the code,
 *  bump the voucher's use count, and recompute the quote totals. Throws with a
 *  friendly message if the code is invalid/expired/used up. */
export async function applyVoucherToQuote(quoteId: string, code: string): Promise<Voucher> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const res = await getVoucherByCode(code);
  if (!res.ok || !res.voucher) throw new Error(res.reason ?? 'Invalid voucher.');
  const v = res.voucher;

  const { error: qErr } = await supabase
    .from('quotes')
    .update({ discount_pct: v.percent, applied_voucher_code: v.code })
    .eq('id', quoteId);
  if (qErr) throw qErr;

  const { error: vErr } = await supabase
    .from('discount_vouchers')
    .update({ used_count: v.usedCount + 1 })
    .eq('id', v.id);
  if (vErr) throw vErr;

  await recomputeQuoteTotals(quoteId);
  return v;
}
