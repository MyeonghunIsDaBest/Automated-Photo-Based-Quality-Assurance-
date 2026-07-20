// ─────────────────────────────────────────────────────────────────────────────
// lib/api/commercial.ts — CRUD helpers for quotes, customer invoices,
// variations, and commercial settings (Revenue Pack, migration 65).
//
// Conventions (mirrors materials.ts exactly):
//   - snake_case Row interfaces match the Supabase schema.
//   - camelCase domain interfaces used by the rest of the app.
//   - All write functions throw on error.
//   - Read functions return [] / null when Supabase is not configured.
//   - Every item-mutating function calls recomputeQuoteTotals /
//     recomputeInvoiceTotals / recomputeVariationTotals before returning.
//   - Snapshot-line copy: description/unit/unit_price_ex_gst are snapshotted
//     from the catalogue at add-time; material_id is stored for provenance.
// ─────────────────────────────────────────────────────────────────────────────

import { supabase, supabaseConfigured } from '../supabase';
import { docTotals, quoteFinancials, minSell } from '../commercial/money';
import { getPrebuildWithItems, getMaterialById } from './materials';
import { createServiceJob, getServiceJob, setContractValue, setMaterialsCost } from './serviceJobs';
import { ratesMap } from './labourRates';

// ---------------------------------------------------------------------------
// Error sentinel
// ---------------------------------------------------------------------------

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.'
);

// ---------------------------------------------------------------------------
// Row types (snake_case)
// ---------------------------------------------------------------------------

interface CommercialSettingsRow {
  id: number;
  business_name: string | null;
  abn: string | null;
  invoice_prefix: string;
  quote_prefix: string;
  gst_rate: number;
  payment_terms_days: number;
  variation_customer_approval_threshold: number | null;
  default_material_markup: number;
  default_labour_markup: number;
  stc_unit_price: number;
  veec_unit_value: number;
  default_labour_overhead: number;
  min_markup_pct: number;
  quote_terms: string | null;
  proposal_footer: string | null;
  print_tagline: string | null;
  rec_licence: string | null;
  contact_phone: string | null;
  contact_phone_alt: string | null;
  contact_email: string | null;
  website: string | null;
  logo_url: string | null;
}

interface QuoteRow {
  id: string;
  number: string | null;
  customer_id: string | null;
  client_name: string | null;
  client_email: string | null;
  property_id: string | null;
  service_job_id: string | null;
  title: string;
  status: string;
  notes: string | null;
  valid_until: string | null;
  subtotal_ex_gst: number;
  gst_amount: number;
  total_inc_gst: number;
  discount_ex_gst: number;
  stc_count: number;
  stc_unit_price_ex_gst: number;
  veec_rebate_ex_gst: number;
  sent_at: string | null;
  viewed_at: string | null;
  decided_at: string | null;
  converted_job_id: string | null;
  /** Shelf axis (mig 101): filed out of the working register. Absent pre-migration. */
  archived_at?: string | null;
  // Phase-1 quote-header fields (migration 79)
  quote_type: string;
  stage: string | null;
  cost_centre: string | null;
  order_number: string | null;
  due_date: string | null;
  description: string | null;
  salesperson_id: string | null;
  project_manager_id: string | null;
  technician_ids: string[];
  tags: string[];
  pricing_tier: string | null;
  labour_overhead: number | null;
  fee_pct: number;
  material_markup_pct: number | null;
  discount_pct: number;
  custom_fields: Record<string, unknown>;
  applied_voucher_code: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface QuoteItemRow {
  id: string;
  quote_id: string;
  material_id: string | null;
  prebuild_id: string | null;
  variation_id: string | null;
  section_id: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_price_ex_gst: number;
  cost_price_ex_gst: number | null;
  kind: string;
  sort_order: number;
}

// ── Quote sections (cost centres, migration 90) ──
interface QuoteSectionRow {
  id: string;
  quote_id: string;
  name: string;
  sort_order: number;
  created_at: string;
}

export interface QuoteSection {
  id: string;
  quoteId: string;
  name: string;
  sortOrder: number;
  createdAt: string;
}

function rowToQuoteSection(r: QuoteSectionRow): QuoteSection {
  return { id: r.id, quoteId: r.quote_id, name: r.name, sortOrder: r.sort_order, createdAt: r.created_at };
}

interface InvoiceRow {
  id: string;
  number: string | null;
  customer_id: string | null;
  client_name: string | null;
  client_email: string | null;
  property_id: string | null;
  service_job_id: string | null;
  quote_id: string | null;
  job_ref: string | null;
  status: string;
  issued_at: string | null;
  due_date: string | null;
  subtotal_ex_gst: number;
  gst_amount: number;
  total_inc_gst: number;
  paid_at: string | null;
  notes: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
}

interface InvoiceItemRow {
  id: string;
  invoice_id: string;
  material_id: string | null;
  prebuild_id: string | null;
  variation_id: string | null;
  cost_centre: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_price_ex_gst: number;
  cost_price_ex_gst: number | null;
  kind: string;
  sort_order: number;
}

interface VariationRow {
  id: string;
  service_job_id: string | null;
  project_id: string | null;
  title: string;
  description: string | null;
  status: string;
  raised_by: string;
  subtotal_ex_gst: number;
  gst_amount: number;
  total_inc_gst: number;
  approved_by: string | null;
  approved_at: string | null;
  customer_approved_at: string | null;
  sent_at: string | null;
  created_at: string;
  updated_at: string;
}

interface VariationItemRow {
  id: string;
  variation_id: string;
  material_id: string | null;
  prebuild_id: string | null;
  description: string;
  qty: number;
  unit: string;
  unit_price_ex_gst: number;
  cost_price_ex_gst: number | null;
  kind: string;
  sort_order: number;
}

// ---------------------------------------------------------------------------
// Domain types (camelCase)
// ---------------------------------------------------------------------------

export type QuoteStatus = 'draft' | 'sent' | 'viewed' | 'accepted' | 'declined' | 'expired';
export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'voided';
export type VariationStatus = 'draft' | 'priced' | 'sent' | 'approved' | 'declined';

// Line kind — shared across quote/invoice/variation items (migration 75).
//   material → from the catalogue (cost snapshotted from materials.cost_price)
//   labour   → role × hours (cost snapshotted from the role's loaded rate)
//   custom   → free-text line (cost optional)
export type QuoteItemKind = 'material' | 'labour' | 'custom';

export interface CommercialSettings {
  id: number;
  businessName: string | null;
  abn: string | null;
  invoicePrefix: string;
  quotePrefix: string;
  gstRate: number;
  paymentTermsDays: number;
  variationCustomerApprovalThreshold: number | null;
  /** Default sell markup for a material with no catalogue sell price (0.25 = +25%). */
  defaultMaterialMarkup: number;
  /** Default markup added to a labour line's prefill sell rate (0 = bill at cost). */
  defaultLabourMarkup: number;
  /** Current STC certificate price (AUD ex-GST), prefilled into solar quotes. */
  stcUnitPrice: number;
  /** Current VEEC certificate value (AUD ex-GST), prefilled into solar quotes. */
  veecUnitValue: number;
  /** Office-wide default labour overhead (AUD/hr), prefilled into a quote's Optional tab. */
  defaultLabourOverhead: number;
  /** The pricing floor: minimum markup ON COST (0.25 = sell never below cost × 1.25).
   *  Flags below-floor sells + powers "Revert to minimum pricing"; never auto-lowers. */
  minMarkupPct: number;
  /** Terms & conditions printed on every quote/proposal (migration 97; blank = hidden). */
  quoteTerms: string | null;
  /** One footer line under the proposal (licence no. / thank-you; blank = hidden). */
  proposalFooter: string | null;
  /** Print identity (migration 100) — the designer's branded template pulls
   *  these; all editable in Sales → Settings, never hard-coded. */
  printTagline: string | null;
  recLicence: string | null;
  contactPhone: string | null;
  contactPhoneAlt: string | null;
  contactEmail: string | null;
  website: string | null;
  logoUrl: string | null;
}

export interface Quote {
  id: string;
  number: string | null;
  customerId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  propertyId: string | null;
  serviceJobId: string | null;
  title: string;
  status: QuoteStatus;
  notes: string | null;
  validUntil: string | null;
  subtotalExGst: number;
  gstAmount: number;
  totalIncGst: number;
  discountExGst: number;
  stcCount: number;
  stcUnitPriceExGst: number;
  veecRebateExGst: number;
  sentAt: string | null;
  viewedAt: string | null;
  decidedAt: string | null;
  convertedJobId: string | null;
  /** Shelf axis (mig 101), orthogonal to status: NULL = active, set = filed
   *  under Closed/Archived. An accepted or declined quote can also be archived. */
  archivedAt: string | null;
  // Phase-1 quote-header fields (migration 79)
  quoteType: 'service' | 'project';
  stage: string | null;
  costCentre: string | null;
  orderNumber: string | null;
  dueDate: string | null;
  description: string | null;
  salespersonId: string | null;
  projectManagerId: string | null;
  technicianIds: string[];
  tags: string[];
  pricingTier: string | null;
  labourOverhead: number | null;
  feePct: number;
  materialMarkupPct: number | null;
  discountPct: number;
  customFields: Record<string, unknown>;
  appliedVoucherCode: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items?: QuoteItem[];
}

export interface QuoteItem {
  id: string;
  quoteId: string;
  materialId: string | null;
  prebuildId: string | null;
  variationId: string | null;
  /** Cost centre this line belongs to (quote_sections); null = General. */
  sectionId: string | null;
  description: string;
  qty: number;
  unit: string;
  unitPriceExGst: number;
  costPriceExGst: number | null;
  kind: QuoteItemKind;
  sortOrder: number;
}

export interface Invoice {
  id: string;
  number: string | null;
  customerId: string | null;
  clientName: string | null;
  clientEmail: string | null;
  propertyId: string | null;
  serviceJobId: string | null;
  quoteId: string | null;
  jobRef: string | null;
  status: InvoiceStatus;
  issuedAt: string | null;
  dueDate: string | null;
  subtotalExGst: number;
  gstAmount: number;
  totalIncGst: number;
  paidAt: string | null;
  notes: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
  items?: InvoiceItem[];
}

export interface InvoiceItem {
  id: string;
  invoiceId: string;
  materialId: string | null;
  prebuildId: string | null;
  variationId: string | null;
  /** Cost-centre label snapshot (grouped invoice subheadings); null = General. */
  costCentre: string | null;
  description: string;
  qty: number;
  unit: string;
  unitPriceExGst: number;
  costPriceExGst: number | null;
  kind: QuoteItemKind;
  sortOrder: number;
}

export interface Variation {
  id: string;
  serviceJobId: string | null;
  projectId: string | null;
  title: string;
  description: string | null;
  status: VariationStatus;
  raisedBy: string;
  subtotalExGst: number;
  gstAmount: number;
  totalIncGst: number;
  approvedBy: string | null;
  approvedAt: string | null;
  customerApprovedAt: string | null;
  sentAt: string | null;
  createdAt: string;
  updatedAt: string;
  items?: VariationItem[];
}

export interface VariationItem {
  id: string;
  variationId: string;
  materialId: string | null;
  prebuildId: string | null;
  description: string;
  qty: number;
  unit: string;
  unitPriceExGst: number;
  costPriceExGst: number | null;
  kind: QuoteItemKind;
  sortOrder: number;
}

// ---------------------------------------------------------------------------
// Input types
// ---------------------------------------------------------------------------

/** Phase-1 quote-header fields (migration 79). Shared by create + update. */
export interface QuoteHeaderInput {
  quoteType?: 'service' | 'project';
  stage?: string | null;
  costCentre?: string | null;
  orderNumber?: string | null;
  dueDate?: string | null;
  description?: string | null;
  salespersonId?: string | null;
  projectManagerId?: string | null;
  technicianIds?: string[];
  tags?: string[];
  pricingTier?: string | null;
  labourOverhead?: number | null;
  feePct?: number;
  materialMarkupPct?: number | null;
  discountPct?: number;
  customFields?: Record<string, unknown>;
}

export interface CreateQuoteInput extends QuoteHeaderInput {
  title: string;
  customerId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  propertyId?: string | null;
  serviceJobId?: string | null;
  notes?: string | null;
  validUntil?: string | null;
}

export interface UpdateQuoteInput extends QuoteHeaderInput {
  title?: string;
  customerId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  propertyId?: string | null;
  serviceJobId?: string | null;
  notes?: string | null;
  validUntil?: string | null;
}

// Maps QuoteHeaderInput camelCase keys to their snake_case DB columns; only
// keys present in the input are emitted (so create defaults / update patches
// stay sparse).
function quoteHeaderToRow(input: QuoteHeaderInput): Record<string, unknown> {
  const row: Record<string, unknown> = {};
  if (input.quoteType !== undefined) row.quote_type = input.quoteType;
  if (input.stage !== undefined) row.stage = input.stage;
  if (input.costCentre !== undefined) row.cost_centre = input.costCentre;
  if (input.orderNumber !== undefined) row.order_number = input.orderNumber;
  if (input.dueDate !== undefined) row.due_date = input.dueDate;
  if (input.description !== undefined) row.description = input.description;
  if (input.salespersonId !== undefined) row.salesperson_id = input.salespersonId;
  if (input.projectManagerId !== undefined) row.project_manager_id = input.projectManagerId;
  if (input.technicianIds !== undefined) row.technician_ids = input.technicianIds;
  if (input.tags !== undefined) row.tags = input.tags;
  if (input.pricingTier !== undefined) row.pricing_tier = input.pricingTier;
  if (input.labourOverhead !== undefined) row.labour_overhead = input.labourOverhead;
  if (input.feePct !== undefined) row.fee_pct = input.feePct;
  if (input.materialMarkupPct !== undefined) row.material_markup_pct = input.materialMarkupPct;
  if (input.discountPct !== undefined) row.discount_pct = input.discountPct;
  if (input.customFields !== undefined) row.custom_fields = input.customFields;
  return row;
}

export interface CreateInvoiceInput {
  title?: string;
  customerId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  propertyId?: string | null;
  serviceJobId?: string | null;
  quoteId?: string | null;
  jobRef?: string | null;
  notes?: string | null;
}

export interface UpdateInvoiceInput {
  customerId?: string | null;
  clientName?: string | null;
  clientEmail?: string | null;
  propertyId?: string | null;
  serviceJobId?: string | null;
  jobRef?: string | null;
  notes?: string | null;
}

export interface CreateVariationInput {
  title: string;
  description?: string | null;
  serviceJobId?: string | null;
  projectId?: string | null;
}

export interface AddItemFreeInput {
  description: string;
  qty: number;
  unit: string;
  unitPriceExGst: number;
  costPriceExGst?: number | null;
  sortOrder?: number;
  sectionId?: string | null;
}

export interface UpdateItemInput {
  description?: string;
  qty?: number;
  unit?: string;
  unitPriceExGst?: number;
  /** Editable per-line ex-GST cost (drives the Markup% column on the Billable
   *  tab). Doesn't affect customer totals — only sell does. */
  costPriceExGst?: number | null;
  sortOrder?: number;
  /** Move the line to another cost centre (null = General). */
  sectionId?: string | null;
}

// ---------------------------------------------------------------------------
// Mappers
// ---------------------------------------------------------------------------

function rowToSettings(r: CommercialSettingsRow): CommercialSettings {
  return {
    id: r.id,
    businessName: r.business_name,
    abn: r.abn,
    invoicePrefix: r.invoice_prefix,
    quotePrefix: r.quote_prefix,
    gstRate: Number(r.gst_rate),
    paymentTermsDays: r.payment_terms_days,
    variationCustomerApprovalThreshold: r.variation_customer_approval_threshold,
    defaultMaterialMarkup: Number(r.default_material_markup ?? 0),
    defaultLabourMarkup: Number(r.default_labour_markup ?? 0),
    stcUnitPrice: Number(r.stc_unit_price ?? 0),
    veecUnitValue: Number(r.veec_unit_value ?? 0),
    defaultLabourOverhead: Number(r.default_labour_overhead ?? 0),
    minMarkupPct: Number(r.min_markup_pct ?? 0.25),
    quoteTerms: r.quote_terms ?? null,
    printTagline: r.print_tagline ?? null,
    recLicence: r.rec_licence ?? null,
    contactPhone: r.contact_phone ?? null,
    contactPhoneAlt: r.contact_phone_alt ?? null,
    contactEmail: r.contact_email ?? null,
    website: r.website ?? null,
    logoUrl: r.logo_url ?? null,
    proposalFooter: r.proposal_footer ?? null,
  };
}

function rowToQuote(r: QuoteRow, items?: QuoteItem[]): Quote {
  const q: Quote = {
    id: r.id,
    number: r.number,
    customerId: r.customer_id,
    clientName: r.client_name,
    clientEmail: r.client_email,
    propertyId: r.property_id,
    serviceJobId: r.service_job_id,
    title: r.title,
    status: r.status as QuoteStatus,
    notes: r.notes,
    validUntil: r.valid_until,
    subtotalExGst: Number(r.subtotal_ex_gst),
    gstAmount: Number(r.gst_amount),
    totalIncGst: Number(r.total_inc_gst),
    discountExGst: Number(r.discount_ex_gst ?? 0),
    stcCount: Number(r.stc_count ?? 0),
    stcUnitPriceExGst: Number(r.stc_unit_price_ex_gst ?? 0),
    veecRebateExGst: Number(r.veec_rebate_ex_gst ?? 0),
    sentAt: r.sent_at,
    viewedAt: r.viewed_at,
    decidedAt: r.decided_at,
    convertedJobId: r.converted_job_id,
    archivedAt: r.archived_at ?? null,
    quoteType: (r.quote_type as 'service' | 'project') ?? 'service',
    stage: r.stage ?? null,
    costCentre: r.cost_centre ?? null,
    orderNumber: r.order_number ?? null,
    dueDate: r.due_date ?? null,
    description: r.description ?? null,
    salespersonId: r.salesperson_id ?? null,
    projectManagerId: r.project_manager_id ?? null,
    technicianIds: r.technician_ids ?? [],
    tags: r.tags ?? [],
    pricingTier: r.pricing_tier ?? null,
    labourOverhead: r.labour_overhead == null ? null : Number(r.labour_overhead),
    feePct: Number(r.fee_pct ?? 0),
    materialMarkupPct: r.material_markup_pct == null ? null : Number(r.material_markup_pct),
    discountPct: Number(r.discount_pct ?? 0),
    customFields: (r.custom_fields ?? {}) as Record<string, unknown>,
    appliedVoucherCode: r.applied_voucher_code ?? null,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (items !== undefined) q.items = items;
  return q;
}

function rowToQuoteItem(r: QuoteItemRow): QuoteItem {
  return {
    id: r.id,
    quoteId: r.quote_id,
    materialId: r.material_id,
    prebuildId: r.prebuild_id,
    variationId: r.variation_id,
    sectionId: r.section_id ?? null,
    description: r.description,
    qty: Number(r.qty),
    unit: r.unit,
    unitPriceExGst: Number(r.unit_price_ex_gst),
    costPriceExGst: r.cost_price_ex_gst === null ? null : Number(r.cost_price_ex_gst),
    kind: (r.kind as QuoteItemKind) ?? 'material',
    sortOrder: r.sort_order,
  };
}

function rowToInvoice(r: InvoiceRow, items?: InvoiceItem[]): Invoice {
  const inv: Invoice = {
    id: r.id,
    number: r.number,
    customerId: r.customer_id,
    clientName: r.client_name,
    clientEmail: r.client_email,
    propertyId: r.property_id,
    serviceJobId: r.service_job_id,
    quoteId: r.quote_id,
    jobRef: r.job_ref,
    status: r.status as InvoiceStatus,
    issuedAt: r.issued_at,
    dueDate: r.due_date,
    subtotalExGst: Number(r.subtotal_ex_gst),
    gstAmount: Number(r.gst_amount),
    totalIncGst: Number(r.total_inc_gst),
    paidAt: r.paid_at,
    notes: r.notes,
    createdBy: r.created_by,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (items !== undefined) inv.items = items;
  return inv;
}

function rowToInvoiceItem(r: InvoiceItemRow): InvoiceItem {
  return {
    id: r.id,
    invoiceId: r.invoice_id,
    materialId: r.material_id,
    prebuildId: r.prebuild_id,
    variationId: r.variation_id,
    costCentre: r.cost_centre ?? null,
    description: r.description,
    qty: Number(r.qty),
    unit: r.unit,
    unitPriceExGst: Number(r.unit_price_ex_gst),
    costPriceExGst: r.cost_price_ex_gst === null ? null : Number(r.cost_price_ex_gst),
    kind: (r.kind as QuoteItemKind) ?? 'material',
    sortOrder: r.sort_order,
  };
}

function rowToVariation(r: VariationRow, items?: VariationItem[]): Variation {
  const v: Variation = {
    id: r.id,
    serviceJobId: r.service_job_id,
    projectId: r.project_id,
    title: r.title,
    description: r.description,
    status: r.status as VariationStatus,
    raisedBy: r.raised_by,
    subtotalExGst: Number(r.subtotal_ex_gst),
    gstAmount: Number(r.gst_amount),
    totalIncGst: Number(r.total_inc_gst),
    approvedBy: r.approved_by,
    approvedAt: r.approved_at,
    customerApprovedAt: r.customer_approved_at,
    sentAt: r.sent_at ?? null,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
  if (items !== undefined) v.items = items;
  return v;
}

function rowToVariationItem(r: VariationItemRow): VariationItem {
  return {
    id: r.id,
    variationId: r.variation_id,
    materialId: r.material_id,
    prebuildId: r.prebuild_id,
    description: r.description,
    qty: Number(r.qty),
    unit: r.unit,
    unitPriceExGst: Number(r.unit_price_ex_gst),
    costPriceExGst: r.cost_price_ex_gst === null ? null : Number(r.cost_price_ex_gst),
    kind: (r.kind as QuoteItemKind) ?? 'material',
    sortOrder: r.sort_order,
  };
}

// ---------------------------------------------------------------------------
// Settings
// ---------------------------------------------------------------------------

export async function getCommercialSettings(): Promise<CommercialSettings | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('commercial_settings')
    .select('*')
    .eq('id', 1)
    .maybeSingle();
  if (error) throw error;
  return data ? rowToSettings(data as CommercialSettingsRow) : null;
}

export async function updateCommercialSettings(
  patch: Partial<Omit<CommercialSettings, 'id'>>,
): Promise<CommercialSettings> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.businessName !== undefined) update.business_name = patch.businessName;
  if (patch.abn !== undefined) update.abn = patch.abn;
  if (patch.invoicePrefix !== undefined) update.invoice_prefix = patch.invoicePrefix;
  if (patch.quotePrefix !== undefined) update.quote_prefix = patch.quotePrefix;
  if (patch.gstRate !== undefined) update.gst_rate = patch.gstRate;
  if (patch.paymentTermsDays !== undefined) update.payment_terms_days = patch.paymentTermsDays;
  if (patch.variationCustomerApprovalThreshold !== undefined) {
    update.variation_customer_approval_threshold = patch.variationCustomerApprovalThreshold;
  }
  if (patch.defaultMaterialMarkup !== undefined) update.default_material_markup = patch.defaultMaterialMarkup;
  if (patch.defaultLabourMarkup !== undefined) update.default_labour_markup = patch.defaultLabourMarkup;
  if (patch.stcUnitPrice !== undefined) update.stc_unit_price = patch.stcUnitPrice;
  if (patch.veecUnitValue !== undefined) update.veec_unit_value = patch.veecUnitValue;
  if (patch.defaultLabourOverhead !== undefined) update.default_labour_overhead = patch.defaultLabourOverhead;
  if (patch.minMarkupPct !== undefined) update.min_markup_pct = patch.minMarkupPct;
  if (patch.quoteTerms !== undefined) update.quote_terms = patch.quoteTerms;
  if (patch.proposalFooter !== undefined) update.proposal_footer = patch.proposalFooter;
  if (patch.printTagline !== undefined) update.print_tagline = patch.printTagline;
  if (patch.recLicence !== undefined) update.rec_licence = patch.recLicence;
  if (patch.contactPhone !== undefined) update.contact_phone = patch.contactPhone;
  if (patch.contactPhoneAlt !== undefined) update.contact_phone_alt = patch.contactPhoneAlt;
  if (patch.contactEmail !== undefined) update.contact_email = patch.contactEmail;
  if (patch.website !== undefined) update.website = patch.website;
  if (patch.logoUrl !== undefined) update.logo_url = patch.logoUrl;
  let { data, error } = await supabase
    .from('commercial_settings')
    .update(update)
    .eq('id', 1)
    .select('*')
    .single();
  // Pre-migration fallbacks: retry without columns the database doesn't have
  // yet (mig 94 floor, mig 97 terms/footer, mig 100 print identity) so every
  // OTHER setting still saves. PostgREST names the missing column in its
  // PGRST204 message ("Could not find the 'print_tagline' column …") — strip
  // EXACTLY the column each error names, never a different late column, so a
  // pre-mig-100 save can't silently drop floor/terms edits whose columns exist.
  const LATE_COLUMNS = [
    'min_markup_pct', 'quote_terms', 'proposal_footer',
    'print_tagline', 'rec_licence', 'contact_phone', 'contact_phone_alt',
    'contact_email', 'website', 'logo_url',
  ] as const;
  let retriesLeft = LATE_COLUMNS.length;
  while (error && retriesLeft-- > 0) {
    const errMsg = error.message ?? '';
    const named = LATE_COLUMNS.find(
      (col) => col in update && new RegExp(`'${col}'`, 'i').test(errMsg),
    );
    if (named) {
      delete update[named];
    } else if (error.code === 'PGRST204') {
      // Message didn't name a column we sent (older PostgREST wording) —
      // last resort: strip every late column in one go so the rest still saves.
      let any = false;
      for (const col of LATE_COLUMNS) {
        if (col in update) { delete update[col]; any = true; }
      }
      if (!any) break;
    } else {
      break; // a different error — surface it, don't mask it
    }
    ({ data, error } = await supabase.from('commercial_settings').update(update).eq('id', 1).select('*').single());
  }
  if (error) throw error;
  return rowToSettings(data as CommercialSettingsRow);
}

// ---------------------------------------------------------------------------
// Internal: fetch settings gst_rate (falls back to 0.10 if no row)
// ---------------------------------------------------------------------------

async function fetchGstRate(): Promise<number> {
  const settings = await getCommercialSettings();
  return settings ? settings.gstRate : 0.10;
}

/** Round to 2dp (half-up) — local to avoid importing the money module's private. */
function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/** Office-set pricing defaults (markup %s). Falls back to Sim-Pro-like defaults. */
async function fetchPricingDefaults(): Promise<{ materialMarkup: number; labourMarkup: number }> {
  const s = await getCommercialSettings();
  return {
    materialMarkup: s ? s.defaultMaterialMarkup : 0.25,
    labourMarkup: s ? s.defaultLabourMarkup : 0,
  };
}

/** Default sell for a material: its catalogue sell price if set, else cost × (1+markup). */
function materialSell(material: { sellPrice: number | null; costPrice: number | null }, markup: number): number {
  if (material.sellPrice != null) return material.sellPrice;
  if (material.costPrice != null) return round2(material.costPrice * (1 + markup));
  return 0;
}

// ---------------------------------------------------------------------------
// Quotes — read
// ---------------------------------------------------------------------------

export async function listQuotes(filters?: {
  status?: QuoteStatus;
  customerId?: string;
  serviceJobId?: string;
}): Promise<Quote[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('quotes').select('*');
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.customerId) q = q.eq('customer_id', filters.customerId);
  if (filters?.serviceJobId) q = q.eq('service_job_id', filters.serviceJobId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToQuote(r as QuoteRow));
}

export async function getQuote(id: string): Promise<Quote | null> {
  if (!supabaseConfigured()) return null;
  const [quoteResult, itemsResult] = await Promise.all([
    supabase.from('quotes').select('*').eq('id', id).maybeSingle(),
    supabase.from('quote_items').select('*').eq('quote_id', id).order('sort_order', { ascending: true }),
  ]);
  if (quoteResult.error) throw quoteResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (!quoteResult.data) return null;
  const items = (itemsResult.data ?? []).map((r) => rowToQuoteItem(r as QuoteItemRow));
  return rowToQuote(quoteResult.data as QuoteRow, items);
}

// ---------------------------------------------------------------------------
// Quote sections (cost centres) — migration 90
// ---------------------------------------------------------------------------

export async function listQuoteSections(quoteId: string): Promise<QuoteSection[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('quote_sections')
    .select('*')
    .eq('quote_id', quoteId)
    .order('sort_order', { ascending: true })
    .order('created_at', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => rowToQuoteSection(r as QuoteSectionRow));
}

export async function createQuoteSection(quoteId: string, name: string, sortOrder = 0): Promise<QuoteSection> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('quote_sections')
    .insert({ quote_id: quoteId, name, sort_order: sortOrder })
    .select('*')
    .single();
  if (error) throw error;
  return rowToQuoteSection(data as QuoteSectionRow);
}

export async function renameQuoteSection(id: string, name: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_sections').update({ name }).eq('id', id);
  if (error) throw error;
}

/** Delete a cost centre — its lines fall back to General (section_id → null via FK). */
export async function deleteQuoteSection(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_sections').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Quotes — write
// ---------------------------------------------------------------------------

export async function createQuote(input: CreateQuoteInput): Promise<Quote> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data: numData, error: numError } = await supabase.rpc('next_quote_number');
  if (numError) throw numError;
  const { data, error } = await supabase
    .from('quotes')
    .insert({
      number: numData as string,
      title: input.title,
      customer_id: input.customerId ?? null,
      client_name: input.clientName ?? null,
      client_email: input.clientEmail ?? null,
      property_id: input.propertyId ?? null,
      service_job_id: input.serviceJobId ?? null,
      notes: input.notes ?? null,
      valid_until: input.validUntil ?? null,
      ...quoteHeaderToRow(input),
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToQuote(data as QuoteRow);
}

export async function updateQuote(id: string, patch: UpdateQuoteInput): Promise<Quote> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.title !== undefined) update.title = patch.title;
  if (patch.customerId !== undefined) update.customer_id = patch.customerId;
  if (patch.clientName !== undefined) update.client_name = patch.clientName;
  if (patch.clientEmail !== undefined) update.client_email = patch.clientEmail;
  if (patch.propertyId !== undefined) update.property_id = patch.propertyId;
  if (patch.serviceJobId !== undefined) update.service_job_id = patch.serviceJobId;
  if (patch.notes !== undefined) update.notes = patch.notes;
  if (patch.validUntil !== undefined) update.valid_until = patch.validUntil;
  Object.assign(update, quoteHeaderToRow(patch));
  const { data, error } = await supabase
    .from('quotes')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToQuote(data as QuoteRow);
}

export async function setQuoteStatus(
  id: string,
  status: QuoteStatus,
): Promise<Quote> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const patch: Record<string, unknown> = { status };
  if (status === 'sent') patch.sent_at = new Date().toISOString();
  if (status === 'accepted' || status === 'declined') patch.decided_at = new Date().toISOString();
  const { data, error } = await supabase
    .from('quotes')
    .update(patch)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToQuote(data as QuoteRow);
}

// ---------------------------------------------------------------------------
// Quotes — archive (shelf axis, orthogonal to status; mig 101)
// ---------------------------------------------------------------------------

/** File a quote out of the working register into Closed/Archived. Preserves
 *  status (won/lost is not destroyed) — the quote just leaves the active views. */
export async function archiveQuote(id: string): Promise<Quote> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('quotes')
    .update({ archived_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToQuote(data as QuoteRow);
}

/** Restore an archived quote to its status-derived working view. */
export async function unarchiveQuote(id: string): Promise<Quote> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('quotes')
    .update({ archived_at: null })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToQuote(data as QuoteRow);
}

// ---------------------------------------------------------------------------
// Quotes — mark viewed (fire-and-forget; swallows errors by contract)
// ---------------------------------------------------------------------------

/**
 * Stamp a quote as viewed via RPC. Fire-and-forget: errors are swallowed.
 * Do not await in UI hot-paths — call as `void markQuoteViewed(id)`.
 */
export async function markQuoteViewed(quoteId: string): Promise<void> {
  if (!supabaseConfigured()) return;
  try {
    await supabase.rpc('mark_quote_viewed', { p_quote_id: quoteId });
  } catch {
    // intentionally silent
  }
}

// ---------------------------------------------------------------------------
// Quotes — item ops (each calls recomputeQuoteTotals before returning)
// ---------------------------------------------------------------------------

export async function addQuoteItemFromMaterial(
  quoteId: string,
  materialId: string,
  qty: number,
  sectionId?: string | null,
): Promise<QuoteItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const material = await getMaterialById(materialId);
  if (!material) throw new Error("Material not found: " + materialId);
  const { materialMarkup } = await fetchPricingDefaults();
  const { data, error } = await supabase
    .from('quote_items')
    .insert({
      quote_id: quoteId,
      material_id: materialId,
      kind: 'material',
      description: material.name,
      qty,
      unit: material.unit,
      unit_price_ex_gst: materialSell(material, materialMarkup),
      cost_price_ex_gst: material.costPrice ?? null,
      sort_order: 0,
      section_id: sectionId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  await recomputeQuoteTotals(quoteId);
  return rowToQuoteItem(data as QuoteItemRow);
}

export async function addQuoteItemFromPrebuild(
  quoteId: string,
  prebuildId: string,
  qtyMultiplier = 1,
  sectionId?: string | null,
): Promise<QuoteItem[]> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const prebuild = await getPrebuildWithItems(prebuildId);
  if (!prebuild) throw new Error("Prebuild not found: " + prebuildId);
  if (prebuild.items.length === 0) return [];

  // How many of this prebuild to add (Simpro's per-part qty box). Each material
  // line's qty is scaled by it; clamp to a sane integer ≥ 1. Default 1 keeps the
  // existing callers (Billable "From prebuild", applyTemplateToQuote) unchanged.
  const mult = Number.isFinite(qtyMultiplier) && qtyMultiplier >= 1 ? Math.floor(qtyMultiplier) : 1;

  // Fetch all materials for the prebuild items in parallel
  const materialResults = await Promise.all(
    prebuild.items.map((item) => getMaterialById(item.materialId)),
  );

  const { materialMarkup } = await fetchPricingDefaults();
  const inserts = prebuild.items.map((item, idx) => {
    const mat = materialResults[idx];
    return {
      quote_id: quoteId,
      material_id: item.materialId,
      prebuild_id: prebuildId,
      kind: 'material',
      description: mat ? mat.name : item.materialId,
      qty: item.qty * mult,
      unit: mat ? mat.unit : 'ea',
      unit_price_ex_gst: mat ? materialSell(mat, materialMarkup) : 0,
      cost_price_ex_gst: mat ? (mat.costPrice ?? null) : null,
      sort_order: item.sortOrder,
      section_id: sectionId ?? null,
    };
  });

  const { data, error } = await supabase
    .from('quote_items')
    .insert(inserts)
    .select('*');
  if (error) throw error;
  await recomputeQuoteTotals(quoteId);
  return (data ?? []).map((r) => rowToQuoteItem(r as QuoteItemRow));
}

export async function addQuoteItemFree(
  quoteId: string,
  input: AddItemFreeInput,
): Promise<QuoteItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('quote_items')
    .insert({
      quote_id: quoteId,
      kind: 'custom',
      description: input.description,
      qty: input.qty,
      unit: input.unit,
      unit_price_ex_gst: input.unitPriceExGst,
      cost_price_ex_gst: input.costPriceExGst ?? null,
      sort_order: input.sortOrder ?? 0,
      section_id: input.sectionId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  await recomputeQuoteTotals(quoteId);
  return rowToQuoteItem(data as QuoteItemRow);
}

/**
 * Add a labour line to a quote: role × hours at the role's loaded rate.
 * The sell price prefills from the rate (cost = sell at add-time; the manager
 * marks it up inline). If the role has no rate set, the line is uncosted
 * (cost = null, sell = 0) and surfaces in the margin block's "uncosted" flag.
 * Snapshot semantics: the rate is frozen at add-time (later rate changes don't
 * retro-alter existing lines), matching the material snapshot behaviour.
 */
export async function addQuoteItemLabour(
  quoteId: string,
  role: string,
  hours: number,
  sortOrder?: number,
  sectionId?: string | null,
): Promise<QuoteItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const rates = await ratesMap();
  const rate = rates.get(role) ?? null;
  const { labourMarkup } = await fetchPricingDefaults();
  // Sell prefills at the loaded rate plus the office labour markup (still editable
  // inline). Cost stays the raw loaded rate. Null rate ⇒ uncosted (sell 0).
  const sell = rate === null ? 0 : round2(rate * (1 + labourMarkup));
  const { data, error } = await supabase
    .from('quote_items')
    .insert({
      quote_id: quoteId,
      kind: 'labour',
      description: role,
      qty: hours,
      unit: 'hr',
      unit_price_ex_gst: sell,
      cost_price_ex_gst: rate,
      sort_order: sortOrder ?? 0,
      section_id: sectionId ?? null,
    })
    .select('*')
    .single();
  if (error) throw error;
  await recomputeQuoteTotals(quoteId);
  return rowToQuoteItem(data as QuoteItemRow);
}

export async function updateQuoteItem(
  itemId: string,
  quoteId: string,
  patch: UpdateItemInput,
): Promise<QuoteItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.qty !== undefined) update.qty = patch.qty;
  if (patch.unit !== undefined) update.unit = patch.unit;
  if (patch.unitPriceExGst !== undefined) update.unit_price_ex_gst = patch.unitPriceExGst;
  if (patch.costPriceExGst !== undefined) update.cost_price_ex_gst = patch.costPriceExGst;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  if (patch.sectionId !== undefined) update.section_id = patch.sectionId;
  const { data, error } = await supabase
    .from('quote_items')
    .update(update)
    .eq('id', itemId)
    .select('*')
    .single();
  if (error) throw error;
  await recomputeQuoteTotals(quoteId);
  return rowToQuoteItem(data as QuoteItemRow);
}

export async function removeQuoteItem(itemId: string, quoteId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quote_items').delete().eq('id', itemId);
  if (error) throw error;
  await recomputeQuoteTotals(quoteId);
}

/** Recompute and persist a quote's money columns from its items, applying the
 *  document discount: subtotal(raw) − discount → GST on the net → total. The
 *  stored subtotal stays the raw line sum; the discount lives in its own column.
 *  Solar rebates (STC/VEEC) are NOT subtracted here — they're a customer-facing
 *  reduction computed on read (quoteFinancials), revenue-neutral to our totals. */
export async function recomputeQuoteTotals(quoteId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const [itemsResult, quoteResult, gstRate] = await Promise.all([
    supabase.from('quote_items').select('qty,unit_price_ex_gst').eq('quote_id', quoteId),
    supabase.from('quotes').select('discount_ex_gst,discount_pct').eq('id', quoteId).maybeSingle(),
    fetchGstRate(),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  if (quoteResult.error) throw quoteResult.error;
  const lines = (itemsResult.data ?? []).map((r) => ({
    qty: Number(r.qty),
    unitPriceExGst: Number(r.unit_price_ex_gst),
  }));
  const q = quoteResult.data as { discount_ex_gst?: number; discount_pct?: number } | null;
  const discountPct = Number(q?.discount_pct ?? 0);
  // A percentage discount (Simpro-style / voucher) wins when set: derive an
  // absolute ex-GST discount from the live line subtotal and persist it, so reads
  // (quoteFinancials / quoteCostMargin, which use discount_ex_gst) stay correct
  // as items change. With pct = 0 the absolute discount_ex_gst path is untouched.
  let discountExGst = Number(q?.discount_ex_gst ?? 0);
  if (discountPct > 0) {
    const subtotal = lines.reduce((s, l) => s + l.qty * l.unitPriceExGst, 0);
    discountExGst = round2(subtotal * (discountPct / 100));
  }
  const fin = quoteFinancials(lines, gstRate, { discountExGst });
  const { error } = await supabase
    .from('quotes')
    .update({
      subtotal_ex_gst: fin.subtotalExGst,
      gst_amount: fin.gstAmount,
      total_inc_gst: fin.totalIncGst,
      ...(discountPct > 0 && { discount_ex_gst: discountExGst }),
    })
    .eq('id', quoteId);
  if (error) throw error;
}

/**
 * Luke's "revert to minimum": reprice every costed MATERIAL line to the floor —
 * cost × (1 + min_markup_pct) — to sharpen a quote we're unlikely to win.
 * Materials only: labour is deliberately outside the floor (flooring a labour
 * line billed at its loaded rate would RAISE the price, not sharpen it).
 * Uncosted and already-at-floor lines are untouched and counted as skipped.
 * NOTE: a document discount still applies AFTER the floor — the UI warns when
 * one is set. Allowed on draft/sent/viewed quotes; locked quotes must reopen.
 */
export async function revertQuoteToMinimum(quoteId: string): Promise<{ repriced: number; skipped: number }> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const [quote, settings] = await Promise.all([getQuote(quoteId), getCommercialSettings()]);
  if (!quote) throw new Error('Quote not found: ' + quoteId);
  if (quote.status === 'accepted' || quote.status === 'declined' || quote.status === 'expired') {
    throw new Error('Quote is locked — reopen it before repricing.');
  }
  const minMarkup = settings?.minMarkupPct ?? 0.25;
  let skipped = 0;
  const writes: { id: string; floor: number }[] = [];
  for (const item of quote.items ?? []) {
    if (item.kind !== 'material') { skipped += 1; continue; }
    const floor = minSell(item.costPriceExGst, minMarkup);
    if (floor === null || item.unitPriceExGst === floor) { skipped += 1; continue; }
    writes.push({ id: item.id, floor });
  }
  let repriced = 0;
  try {
    // Direct line writes in parallel — updateQuoteItem would re-run the full
    // totals recompute per line (~5 round trips each on a big quote).
    const errors = await Promise.all(
      writes.map((w) =>
        supabase.from('quote_items').update({ unit_price_ex_gst: w.floor }).eq('id', w.id).then((r) => r.error),
      ),
    );
    const failures = errors.filter((e) => e != null);
    repriced = writes.length - failures.length;
    if (failures.length > 0) {
      throw new Error(`Repriced ${repriced} of ${writes.length} lines before an error — totals were recomputed; retry to finish.`);
    }
  } finally {
    // Keep totals consistent with whatever actually landed, success or not.
    await recomputeQuoteTotals(quoteId).catch(() => {});
  }
  return { repriced, skipped };
}

/** Set the document discount (ex-GST) and re-run totals so GST/total reflect it. */
export async function setQuoteDiscount(quoteId: string, discountExGst: number): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('quotes')
    .update({ discount_ex_gst: round2(Math.max(0, discountExGst)) })
    .eq('id', quoteId);
  if (error) throw error;
  await recomputeQuoteTotals(quoteId);
}

/** Set the solar rebate inputs (STC count × unit price, and a VEEC rebate amount).
 *  These reduce what the customer pays (computed on read) but don't change the
 *  stored subtotal/GST/total, so no recompute is needed. */
export async function setQuoteRebates(
  quoteId: string,
  input: { stcCount: number; stcUnitPriceExGst: number; veecRebateExGst: number },
): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('quotes')
    .update({
      stc_count: Math.max(0, Math.round(input.stcCount)),
      stc_unit_price_ex_gst: round2(Math.max(0, input.stcUnitPriceExGst)),
      veec_rebate_ex_gst: round2(Math.max(0, input.veecRebateExGst)),
    })
    .eq('id', quoteId);
  if (error) throw error;
}

/** Permanently delete a quote (cascades to quote_items via FK). */
export async function deleteQuote(id: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('quotes').delete().eq('id', id);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Quotes — status actions
// ---------------------------------------------------------------------------

/**
 * Convert an accepted quote to a service job. Patches converted_job_id, and
 * carries the quote's money through so the job's profit card works immediately:
 *   - contract_value = quote subtotal ex-GST (the revenue)
 *   - materials_cost = Σ (qty × cost) over material lines that have a cost
 * Line items are intentionally NOT copied — the job's logged time entries are
 * the source of truth for ACTUAL labour (quoted labour is only the estimate),
 * so copying labour lines would double-count against logged time.
 */
export async function convertQuoteToJob(quoteId: string) {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const quote = await getQuote(quoteId);
  if (!quote) throw new Error("Quote not found: " + quoteId);

  const job = await createServiceJob({
    title: quote.title,
    clientName: quote.clientName ?? undefined,
    customerId: quote.customerId ?? undefined,
    propertyId: quote.propertyId ?? undefined,
    // A project quote produces project work — the jobs board splits on this.
    kind: quote.quoteType === 'project' ? 'project' : undefined,
  });

  const { error } = await supabase
    .from('quotes')
    .update({ converted_job_id: job.id })
    .eq('id', quoteId);
  if (error) throw error;

  // Carry the quote's value onto the job's costing fields (net of any discount).
  await setContractValue(job.id, round2(quote.subtotalExGst - quote.discountExGst));

  const materialLines = (quote.items ?? []).filter(
    (it) => it.kind === 'material' && it.costPriceExGst !== null,
  );
  if (materialLines.length > 0) {
    const materialsCost = materialLines.reduce(
      (sum, it) => sum + it.qty * (it.costPriceExGst ?? 0),
      0,
    );
    await setMaterialsCost(job.id, Math.round(materialsCost * 100) / 100);
  }

  return job;
}

/** The quote a job was converted FROM (quotes.converted_job_id back-link),
 *  with its line items. Null when the job wasn't born from a quote. */
export async function getQuoteForJob(serviceJobId: string): Promise<Quote | null> {
  if (!supabaseConfigured()) return null;
  const { data, error } = await supabase
    .from('quotes')
    .select('id')
    .eq('converted_job_id', serviceJobId)
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  if (!data?.id) return null;
  return getQuote(data.id as string);
}

/** Service-job ids that have a variation SENT and awaiting the customer's
 *  decision — the board's "upsell in flight" indicator. */
export async function listJobIdsWithSentVariations(): Promise<Set<string>> {
  if (!supabaseConfigured()) return new Set();
  const { data, error } = await supabase
    .from('variations')
    .select('service_job_id')
    .eq('status', 'sent')
    .not('service_job_id', 'is', null);
  if (error) throw error;
  return new Set((data ?? []).map((r) => (r as { service_job_id: string }).service_job_id));
}

// ---------------------------------------------------------------------------
// Invoices — read
// ---------------------------------------------------------------------------

export async function listInvoices(filters?: {
  status?: InvoiceStatus;
  customerId?: string;
  serviceJobId?: string;
}): Promise<Invoice[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('customer_invoices').select('*');
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.customerId) q = q.eq('customer_id', filters.customerId);
  if (filters?.serviceJobId) q = q.eq('service_job_id', filters.serviceJobId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToInvoice(r as InvoiceRow));
}

export async function getInvoice(id: string): Promise<Invoice | null> {
  if (!supabaseConfigured()) return null;
  const [invResult, itemsResult] = await Promise.all([
    supabase.from('customer_invoices').select('*').eq('id', id).maybeSingle(),
    supabase.from('customer_invoice_items').select('*').eq('invoice_id', id).order('sort_order', { ascending: true }),
  ]);
  if (invResult.error) throw invResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (!invResult.data) return null;
  const items = (itemsResult.data ?? []).map((r) => rowToInvoiceItem(r as InvoiceItemRow));
  return rowToInvoice(invResult.data as InvoiceRow, items);
}

// ---------------------------------------------------------------------------
// Invoices — write
// ---------------------------------------------------------------------------

export async function createInvoice(input: CreateInvoiceInput): Promise<Invoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data: numData, error: numError } = await supabase.rpc('next_invoice_number');
  if (numError) throw numError;
  const { data, error } = await supabase
    .from('customer_invoices')
    .insert({
      number: numData as string,
      customer_id: input.customerId ?? null,
      client_name: input.clientName ?? null,
      client_email: input.clientEmail ?? null,
      property_id: input.propertyId ?? null,
      service_job_id: input.serviceJobId ?? null,
      quote_id: input.quoteId ?? null,
      job_ref: input.jobRef ?? null,
      notes: input.notes ?? null,
      created_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToInvoice(data as InvoiceRow);
}

/** Create an invoice from an accepted quote, copying all line items. */
export async function createInvoiceFromQuote(quoteId: string): Promise<Invoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const quote = await getQuote(quoteId);
  if (!quote) throw new Error("Quote not found: " + quoteId);

  const invoice = await createInvoice({
    customerId: quote.customerId,
    clientName: quote.clientName,
    clientEmail: quote.clientEmail,
    propertyId: quote.propertyId,
    serviceJobId: quote.serviceJobId,
    quoteId,
    jobRef: quote.title,
    notes: quote.notes,
  });

  if (quote.items && quote.items.length > 0) {
    // Cost-centre labels travel to the invoice as a NAME snapshot so the
    // invoice groups the same way the quote printed (mig 90).
    const sections = await listQuoteSections(quoteId).catch(() => [] as QuoteSection[]);
    const sectionName = new Map(sections.map((s) => [s.id, s.name]));
    const itemInserts = quote.items.map((item, idx) => ({
      invoice_id: invoice.id,
      material_id: item.materialId,
      prebuild_id: item.prebuildId,
      variation_id: item.variationId,
      kind: item.kind,
      description: item.description,
      qty: item.qty,
      unit: item.unit,
      unit_price_ex_gst: item.unitPriceExGst,
      cost_price_ex_gst: item.costPriceExGst,
      sort_order: idx,
      cost_centre: item.sectionId ? (sectionName.get(item.sectionId) ?? null) : null,
    }));
    const { error: itemsErr } = await supabase
      .from('customer_invoice_items')
      .insert(itemInserts);
    if (itemsErr) throw itemsErr;
    await recomputeInvoiceTotals(invoice.id);
  }

  return (await getInvoice(invoice.id)) as Invoice;
}

/** Create an invoice from a service job, appending approved-variation lines. */
/**
 * The boss's ONE-invoice: base scope (the originating quote's lines, grouped by
 * their cost centres) + every ACCEPTED variation (each under its own cost-centre
 * subheading = the variation's title). Pending/declined variations are excluded.
 */
export async function createInvoiceFromJob(serviceJobId: string): Promise<Invoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const job = await getServiceJob(serviceJobId);
  if (!job) throw new Error("Service job not found: " + serviceJobId);

  // Double-invoice guard (mig 103): a prepaid job already carries its upfront
  // invoice, and any job invoiced once shouldn't be silently invoiced again
  // from the "From job" picker. Voided invoices don't count (re-invoicing after
  // a void is legitimate). Surfaces as a toast in the caller.
  const priorInvoices = (await listInvoices({ serviceJobId })).filter((inv) => inv.status !== "voided");
  if (priorInvoices.length > 0) {
    const n = priorInvoices[0].number ? ` (${priorInvoices[0].number})` : "";
    throw new Error(`This job already has an invoice${n}. Void it before raising another.`);
  }

  const invoice = await createInvoice({
    customerId: job.customerId,
    clientName: job.clientName,
    propertyId: job.propertyId,
    serviceJobId,
    jobRef: job.title,
  });

  const allItemInserts: Array<Record<string, unknown>> = [];
  let sort = 0;

  // 1) Base scope — the quote this job was converted from (quotes.converted_job_id
  //    back-link), with each line's cost-centre name snapshot.
  const { data: srcQuote, error: srcErr } = await supabase
    .from('quotes')
    .select('id')
    .eq('converted_job_id', serviceJobId)
    .limit(1)
    .maybeSingle();
  if (srcErr) throw srcErr;
  if (srcQuote?.id) {
    const quote = await getQuote(srcQuote.id as string);
    if (quote?.items && quote.items.length > 0) {
      const sections = await listQuoteSections(quote.id).catch(() => [] as QuoteSection[]);
      const sectionName = new Map(sections.map((s) => [s.id, s.name]));
      for (const item of quote.items) {
        allItemInserts.push({
          invoice_id: invoice.id,
          material_id: item.materialId,
          prebuild_id: item.prebuildId,
          variation_id: item.variationId,
          kind: item.kind,
          description: item.description,
          qty: item.qty,
          unit: item.unit,
          unit_price_ex_gst: item.unitPriceExGst,
          cost_price_ex_gst: item.costPriceExGst,
          sort_order: sort++,
          cost_centre: item.sectionId ? (sectionName.get(item.sectionId) ?? null) : null,
        });
      }
    }
  }

  // 2) Accepted variations — each folds in as its own cost centre (its title).
  const { data: variations, error: varErr } = await supabase
    .from('variations')
    .select('id, title')
    .eq('service_job_id', serviceJobId)
    .eq('status', 'approved');
  if (varErr) throw varErr;

  for (const v of variations ?? []) {
    const vrow = v as { id: string; title: string };
    const { data: vitems, error: vitemsErr } = await supabase
      .from('variation_items')
      .select('*')
      .eq('variation_id', vrow.id)
      .order('sort_order', { ascending: true });
    if (vitemsErr) throw vitemsErr;
    (vitems ?? []).forEach((vi) => {
      const vr = vi as VariationItemRow;
      allItemInserts.push({
        invoice_id: invoice.id,
        material_id: vr.material_id,
        prebuild_id: vr.prebuild_id,
        variation_id: vrow.id,
        kind: vr.kind,
        description: vr.description,
        qty: vr.qty,
        unit: vr.unit,
        unit_price_ex_gst: vr.unit_price_ex_gst,
        cost_price_ex_gst: vr.cost_price_ex_gst,
        sort_order: sort++,
        cost_centre: `Variation — ${vrow.title}`,
      });
    });
  }

  if (allItemInserts.length > 0) {
    const { error: insertErr } = await supabase
      .from('customer_invoice_items')
      .insert(allItemInserts);
    if (insertErr) throw insertErr;
    await recomputeInvoiceTotals(invoice.id);
  }

  return (await getInvoice(invoice.id)) as Invoice;
}

/**
 * Raise the upfront invoice for a PREPAID job at creation (mig 103).
 * - Idempotent: if the job already has an invoice, returns it rather than
 *   creating a second (the creation-side double-invoice guard).
 * - If the job was converted from a quote, delegates to createInvoiceFromJob so
 *   the invoice carries the real scope + approved variations.
 * - Otherwise (a fresh prepaid job with no source quote) createInvoiceFromJob
 *   would produce a $0 invoice, so build a single line from the job's
 *   contract_value instead. The job's status is deliberately NOT touched — a
 *   prepaid job keeps working on the active board.
 */
export async function createPrepaidInvoiceForJob(serviceJobId: string): Promise<Invoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  const existing = await listInvoices({ serviceJobId });
  if (existing.length > 0) {
    return (await getInvoice(existing[0].id)) as Invoice;
  }

  // A quote-backed job has real scope — reuse the one-invoice builder.
  const source = await getQuoteForJob(serviceJobId);
  if (source) return createInvoiceFromJob(serviceJobId);

  // Fresh prepaid job: one line from the agreed contract value.
  const job = await getServiceJob(serviceJobId);
  if (!job) throw new Error('Service job not found: ' + serviceJobId);
  const invoice = await createInvoice({
    customerId: job.customerId,
    clientName: job.clientName,
    propertyId: job.propertyId,
    serviceJobId,
    jobRef: job.title,
  });
  const amount = job.contractValue ?? 0;
  const { error: itemErr } = await supabase.from('customer_invoice_items').insert({
    invoice_id: invoice.id,
    kind: 'custom',
    description: `Prepaid — ${job.title}`,
    qty: 1,
    unit: 'ea',
    unit_price_ex_gst: amount,
    cost_price_ex_gst: null,
    sort_order: 0,
  });
  if (itemErr) throw itemErr;
  await recomputeInvoiceTotals(invoice.id);
  return (await getInvoice(invoice.id)) as Invoice;
}

export async function updateInvoice(id: string, patch: UpdateInvoiceInput): Promise<Invoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.customerId !== undefined) update.customer_id = patch.customerId;
  if (patch.clientName !== undefined) update.client_name = patch.clientName;
  if (patch.clientEmail !== undefined) update.client_email = patch.clientEmail;
  if (patch.propertyId !== undefined) update.property_id = patch.propertyId;
  if (patch.serviceJobId !== undefined) update.service_job_id = patch.serviceJobId;
  if (patch.jobRef !== undefined) update.job_ref = patch.jobRef;
  if (patch.notes !== undefined) update.notes = patch.notes;
  const { data, error } = await supabase
    .from('customer_invoices')
    .update(update)
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToInvoice(data as InvoiceRow);
}

/** Mark a draft invoice as sent; set issued_at = today, due_date = today + terms. */
export async function issueInvoice(id: string): Promise<Invoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const settings = await getCommercialSettings();
  const terms = settings ? settings.paymentTermsDays : 14;

  // Date math on YYYY-MM-DD parts without TZ pitfalls
  const now = new Date();
  const todayParts = [
    now.getFullYear(),
    String(now.getMonth() + 1).padStart(2, '0'),
    String(now.getDate()).padStart(2, '0'),
  ];
  const todayIso = todayParts.join('-');

  const dueMs = new Date(todayIso).getTime() + terms * 24 * 60 * 60 * 1000;
  const dueDate = new Date(dueMs);
  const dueParts = [
    dueDate.getUTCFullYear(),
    String(dueDate.getUTCMonth() + 1).padStart(2, '0'),
    String(dueDate.getUTCDate()).padStart(2, '0'),
  ];
  const dueDateIso = dueParts.join('-');

  const { data, error } = await supabase
    .from('customer_invoices')
    .update({ status: 'sent', issued_at: todayIso, due_date: dueDateIso })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToInvoice(data as InvoiceRow);
}

export async function recordPayment(id: string): Promise<Invoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('customer_invoices')
    .update({ status: 'paid', paid_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToInvoice(data as InvoiceRow);
}

export async function voidInvoice(id: string): Promise<Invoice> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('customer_invoices')
    .update({ status: 'voided' })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToInvoice(data as InvoiceRow);
}

// ---------------------------------------------------------------------------
// Invoices — item ops (each calls recomputeInvoiceTotals before returning)
// ---------------------------------------------------------------------------

export async function addInvoiceItemFromMaterial(
  invoiceId: string,
  materialId: string,
  qty: number,
): Promise<InvoiceItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const material = await getMaterialById(materialId);
  if (!material) throw new Error("Material not found: " + materialId);
  const { data, error } = await supabase
    .from('customer_invoice_items')
    .insert({
      invoice_id: invoiceId,
      material_id: materialId,
      kind: 'material',
      description: material.name,
      qty,
      unit: material.unit,
      unit_price_ex_gst: material.sellPrice ?? 0,
      cost_price_ex_gst: material.costPrice ?? null,
      sort_order: 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  await recomputeInvoiceTotals(invoiceId);
  return rowToInvoiceItem(data as InvoiceItemRow);
}

export async function addInvoiceItemFromPrebuild(
  invoiceId: string,
  prebuildId: string,
): Promise<InvoiceItem[]> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const prebuild = await getPrebuildWithItems(prebuildId);
  if (!prebuild) throw new Error("Prebuild not found: " + prebuildId);
  if (prebuild.items.length === 0) return [];

  const materialResults = await Promise.all(
    prebuild.items.map((item) => getMaterialById(item.materialId)),
  );

  const inserts = prebuild.items.map((item, idx) => {
    const mat = materialResults[idx];
    return {
      invoice_id: invoiceId,
      material_id: item.materialId,
      prebuild_id: prebuildId,
      kind: 'material',
      description: mat ? mat.name : item.materialId,
      qty: item.qty,
      unit: mat ? mat.unit : 'ea',
      unit_price_ex_gst: mat ? (mat.sellPrice ?? 0) : 0,
      cost_price_ex_gst: mat ? (mat.costPrice ?? null) : null,
      sort_order: item.sortOrder,
    };
  });

  const { data, error } = await supabase
    .from('customer_invoice_items')
    .insert(inserts)
    .select('*');
  if (error) throw error;
  await recomputeInvoiceTotals(invoiceId);
  return (data ?? []).map((r) => rowToInvoiceItem(r as InvoiceItemRow));
}

export async function addInvoiceItemFree(
  invoiceId: string,
  input: AddItemFreeInput,
): Promise<InvoiceItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('customer_invoice_items')
    .insert({
      invoice_id: invoiceId,
      kind: 'custom',
      description: input.description,
      qty: input.qty,
      unit: input.unit,
      unit_price_ex_gst: input.unitPriceExGst,
      cost_price_ex_gst: input.costPriceExGst ?? null,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  await recomputeInvoiceTotals(invoiceId);
  return rowToInvoiceItem(data as InvoiceItemRow);
}

export async function updateInvoiceItem(
  itemId: string,
  invoiceId: string,
  patch: UpdateItemInput,
): Promise<InvoiceItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.qty !== undefined) update.qty = patch.qty;
  if (patch.unit !== undefined) update.unit = patch.unit;
  if (patch.unitPriceExGst !== undefined) update.unit_price_ex_gst = patch.unitPriceExGst;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { data, error } = await supabase
    .from('customer_invoice_items')
    .update(update)
    .eq('id', itemId)
    .select('*')
    .single();
  if (error) throw error;
  await recomputeInvoiceTotals(invoiceId);
  return rowToInvoiceItem(data as InvoiceItemRow);
}

export async function removeInvoiceItem(itemId: string, invoiceId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('customer_invoice_items').delete().eq('id', itemId);
  if (error) throw error;
  await recomputeInvoiceTotals(invoiceId);
}

/** Recompute and persist the three money columns on an invoice. */
export async function recomputeInvoiceTotals(invoiceId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const [itemsResult, gstRate] = await Promise.all([
    supabase.from('customer_invoice_items').select('qty,unit_price_ex_gst').eq('invoice_id', invoiceId),
    fetchGstRate(),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  const lines = (itemsResult.data ?? []).map((r) => ({
    qty: Number(r.qty),
    unitPriceExGst: Number(r.unit_price_ex_gst),
  }));
  const totals = docTotals(lines, gstRate);
  const { error } = await supabase
    .from('customer_invoices')
    .update({
      subtotal_ex_gst: totals.subtotalExGst,
      gst_amount: totals.gstAmount,
      total_inc_gst: totals.totalIncGst,
    })
    .eq('id', invoiceId);
  if (error) throw error;
}

// ---------------------------------------------------------------------------
// Invoices — overdue helper (pure, no I/O)
// ---------------------------------------------------------------------------

/** Returns true if the invoice is in 'sent' status and its due_date is before todayIso. */
export function isOverdue(invoice: Invoice, todayIso: string): boolean {
  if (invoice.status !== 'sent') return false;
  if (!invoice.dueDate) return false;
  return invoice.dueDate < todayIso;
}

// ---------------------------------------------------------------------------
// Invoices — CSV export (Xero-shaped)
// ---------------------------------------------------------------------------

/** CSV-escape a single field: wrap in quotes if it contains comma, quote, or newline;
 *  double any internal quotes. */
function csvEscape(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return '"' + str.replace(/"/g, '""') + '"';
  }
  return str;
}

export interface InvoiceWithItemsForCsv extends Invoice {
  items: InvoiceItem[];
}

/**
 * Build a Xero-shaped CSV blob from a list of invoices (each must have items populated).
 * Columns: ContactName, InvoiceNumber, InvoiceDate, DueDate, Description,
 *          Quantity, UnitAmount, AccountCode, TaxType
 *
 * Dates are emitted as DD/MM/YYYY — Xero AU expects DD/MM/YYYY by default.
 * Returns { csv, skippedNumbers } so callers can toast about invoices with zero items.
 * Prepends UTF-8 BOM so Excel opens without an import wizard.
 */
export function exportInvoicesCsv(
  invoices: InvoiceWithItemsForCsv[],
  customersById?: Map<string, string>,
): { csv: string; skippedNumbers: string[] } {
  /** Convert YYYY-MM-DD to DD/MM/YYYY using string parts — no Date object. */
  function isoToDmY(iso: string | null | undefined): string {
    if (!iso) return '';
    const s = iso.slice(0, 10);
    const [y, m, d] = s.split('-');
    if (!y || !m || !d) return s;
    return `${d}/${m}/${y}`;
  }

  const header = [
    'ContactName',
    'InvoiceNumber',
    'InvoiceDate',
    'DueDate',
    'Description',
    'Quantity',
    'UnitAmount',
    'AccountCode',
    'TaxType',
  ].join(',');

  const rows: string[] = [header];
  const skippedNumbers: string[] = [];

  for (const inv of invoices) {
    // Resolve contact name: map lookup → clientName → "Unknown customer" (never a raw UUID)
    const resolvedName =
      (inv.customerId && customersById?.get(inv.customerId)) ??
      inv.clientName ??
      'Unknown customer';
    const contactName = csvEscape(resolvedName);
    const invNumber = csvEscape(inv.number ?? '');
    const invDate = csvEscape(isoToDmY(inv.issuedAt));
    const dueDate = csvEscape(isoToDmY(inv.dueDate));

    const items = inv.items && inv.items.length > 0 ? inv.items : [];
    if (items.length === 0) {
      // Skip invoices with zero items; report them so the UI can toast
      skippedNumbers.push(inv.number ?? inv.id);
      continue;
    }

    for (const item of items) {
      rows.push([
        contactName,
        invNumber,
        invDate,
        dueDate,
        csvEscape(item.description),
        csvEscape(item.qty),
        csvEscape(item.unitPriceExGst),
        '',
        'GST on Income',
      ].join(','));
    }
  }

  // UTF-8 BOM so Excel opens without an import wizard
  const csv = '﻿' + rows.join('\n');
  return { csv, skippedNumbers };
}

// ---------------------------------------------------------------------------
// Variations — read
// ---------------------------------------------------------------------------

export async function listVariations(filters?: {
  status?: VariationStatus;
  serviceJobId?: string;
}): Promise<Variation[]> {
  if (!supabaseConfigured()) return [];
  let q = supabase.from('variations').select('*');
  if (filters?.status) q = q.eq('status', filters.status);
  if (filters?.serviceJobId) q = q.eq('service_job_id', filters.serviceJobId);
  const { data, error } = await q.order('created_at', { ascending: false });
  if (error) throw error;
  return (data ?? []).map((r) => rowToVariation(r as VariationRow));
}

export async function getVariation(id: string): Promise<Variation | null> {
  if (!supabaseConfigured()) return null;
  const [varResult, itemsResult] = await Promise.all([
    supabase.from('variations').select('*').eq('id', id).maybeSingle(),
    supabase.from('variation_items').select('*').eq('variation_id', id).order('sort_order', { ascending: true }),
  ]);
  if (varResult.error) throw varResult.error;
  if (itemsResult.error) throw itemsResult.error;
  if (!varResult.data) return null;
  const items = (itemsResult.data ?? []).map((r) => rowToVariationItem(r as VariationItemRow));
  return rowToVariation(varResult.data as VariationRow, items);
}

// ---------------------------------------------------------------------------
// Variations — write
// ---------------------------------------------------------------------------

export async function createVariation(input: CreateVariationInput): Promise<Variation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  if (!uid) throw new Error("Must be authenticated to create a variation");
  const { data, error } = await supabase
    .from('variations')
    .insert({
      title: input.title,
      description: input.description ?? null,
      service_job_id: input.serviceJobId ?? null,
      project_id: input.projectId ?? null,
      raised_by: uid,
    })
    .select('*')
    .single();
  if (error) throw error;
  return rowToVariation(data as VariationRow);
}

export async function addVariationItemFromMaterial(
  variationId: string,
  materialId: string,
  qty: number,
): Promise<VariationItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const material = await getMaterialById(materialId);
  if (!material) throw new Error("Material not found: " + materialId);
  const { data, error } = await supabase
    .from('variation_items')
    .insert({
      variation_id: variationId,
      material_id: materialId,
      kind: 'material',
      description: material.name,
      qty,
      unit: material.unit,
      unit_price_ex_gst: material.sellPrice ?? 0,
      cost_price_ex_gst: material.costPrice ?? null,
      sort_order: 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  await recomputeVariationTotals(variationId);
  return rowToVariationItem(data as VariationItemRow);
}

export async function addVariationItemFromPrebuild(
  variationId: string,
  prebuildId: string,
): Promise<VariationItem[]> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const prebuild = await getPrebuildWithItems(prebuildId);
  if (!prebuild) throw new Error("Prebuild not found: " + prebuildId);
  if (prebuild.items.length === 0) return [];

  const materialResults = await Promise.all(
    prebuild.items.map((item) => getMaterialById(item.materialId)),
  );

  const inserts = prebuild.items.map((item, idx) => {
    const mat = materialResults[idx];
    return {
      variation_id: variationId,
      material_id: item.materialId,
      prebuild_id: prebuildId,
      kind: 'material',
      description: mat ? mat.name : item.materialId,
      qty: item.qty,
      unit: mat ? mat.unit : 'ea',
      unit_price_ex_gst: mat ? (mat.sellPrice ?? 0) : 0,
      cost_price_ex_gst: mat ? (mat.costPrice ?? null) : null,
      sort_order: item.sortOrder,
    };
  });

  const { data, error } = await supabase
    .from('variation_items')
    .insert(inserts)
    .select('*');
  if (error) throw error;
  await recomputeVariationTotals(variationId);
  return (data ?? []).map((r) => rowToVariationItem(r as VariationItemRow));
}

export async function addVariationItemFree(
  variationId: string,
  input: AddItemFreeInput,
): Promise<VariationItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('variation_items')
    .insert({
      variation_id: variationId,
      kind: 'custom',
      description: input.description,
      qty: input.qty,
      unit: input.unit,
      unit_price_ex_gst: input.unitPriceExGst,
      cost_price_ex_gst: input.costPriceExGst ?? null,
      sort_order: input.sortOrder ?? 0,
    })
    .select('*')
    .single();
  if (error) throw error;
  await recomputeVariationTotals(variationId);
  return rowToVariationItem(data as VariationItemRow);
}

export async function updateVariationItem(
  itemId: string,
  variationId: string,
  patch: UpdateItemInput,
): Promise<VariationItem> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const update: Record<string, unknown> = {};
  if (patch.description !== undefined) update.description = patch.description;
  if (patch.qty !== undefined) update.qty = patch.qty;
  if (patch.unit !== undefined) update.unit = patch.unit;
  if (patch.unitPriceExGst !== undefined) update.unit_price_ex_gst = patch.unitPriceExGst;
  if (patch.sortOrder !== undefined) update.sort_order = patch.sortOrder;
  const { data, error } = await supabase
    .from('variation_items')
    .update(update)
    .eq('id', itemId)
    .select('*')
    .single();
  if (error) throw error;
  await recomputeVariationTotals(variationId);
  return rowToVariationItem(data as VariationItemRow);
}

export async function removeVariationItem(itemId: string, variationId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase.from('variation_items').delete().eq('id', itemId);
  if (error) throw error;
  await recomputeVariationTotals(variationId);
}

/** Recompute and persist the three money columns on a variation. */
export async function recomputeVariationTotals(variationId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const [itemsResult, gstRate] = await Promise.all([
    supabase.from('variation_items').select('qty,unit_price_ex_gst').eq('variation_id', variationId),
    fetchGstRate(),
  ]);
  if (itemsResult.error) throw itemsResult.error;
  const lines = (itemsResult.data ?? []).map((r) => ({
    qty: Number(r.qty),
    unitPriceExGst: Number(r.unit_price_ex_gst),
  }));
  const totals = docTotals(lines, gstRate);
  const { error } = await supabase
    .from('variations')
    .update({
      subtotal_ex_gst: totals.subtotalExGst,
      gst_amount: totals.gstAmount,
      total_inc_gst: totals.totalIncGst,
    })
    .eq('id', variationId);
  if (error) throw error;
}

/** Advance a variation to 'priced' status. */
export async function priceVariation(id: string): Promise<Variation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('variations')
    .update({ status: 'priced' })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToVariation(data as VariationRow);
}

/** Mark a variation sent to the customer (quote-format PDF/email shown on site). */
export async function sendVariation(id: string): Promise<Variation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('variations')
    .update({ status: 'sent', sent_at: new Date().toISOString() })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToVariation(data as VariationRow);
}

/** Accept ("approve") a variation. Stamps approved_by + approved_at, and — the
 *  boss's fold-into-the-job — when it's linked to a service job, bumps that
 *  job's contract_value (+subtotal ex GST) and materials_cost (+Σ qty×cost of
 *  its material lines) so the ONE job's numbers carry the upsell immediately.
 *  The line-level merge happens at invoicing (createInvoiceFromJob). */
export async function approveVariation(id: string): Promise<Variation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { data, error } = await supabase
    .from('variations')
    .update({
      status: 'approved',
      approved_by: uid,
      approved_at: new Date().toISOString(),
    })
    .eq('id', id)
    // Idempotency guard: a second accept (double-click, retry) matches no row
    // and errors out instead of re-running the job rollup bump below.
    .neq('status', 'approved')
    .select('*')
    .single();
  if (error) throw error;
  const variation = rowToVariation(data as VariationRow);

  if (variation.serviceJobId) {
    try {
      const [job, full] = await Promise.all([
        getServiceJob(variation.serviceJobId),
        getVariation(id),
      ]);
      if (job) {
        await setContractValue(variation.serviceJobId, round2((job.contractValue ?? 0) + variation.subtotalExGst));
        const addedMaterials = (full?.items ?? [])
          .filter((it) => it.kind === 'material' && it.costPriceExGst != null)
          .reduce((s, it) => s + it.qty * (it.costPriceExGst as number), 0);
        if (addedMaterials > 0) {
          await setMaterialsCost(variation.serviceJobId, round2((job.materialsCost ?? 0) + addedMaterials));
        }
      }
    } catch {
      // Rollup bump is best-effort — the invoice merge (createInvoiceFromJob)
      // remains the financial source of truth even if this fails.
    }
  }

  return variation;
}

/** Decline a variation. */
export async function declineVariation(id: string): Promise<Variation> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { data, error } = await supabase
    .from('variations')
    .update({ status: 'declined' })
    .eq('id', id)
    .select('*')
    .single();
  if (error) throw error;
  return rowToVariation(data as VariationRow);
}
