// Tab IDs surfaced on the Gantt strip. Order here drives the strip order
// in Gantt.tsx — Overview is first because it's the default landing tab.
//
// 'supplier' is a merged tab that hosts orders, deliveries, invoices, and
// warranties under one editorial header (see SupplierTab.tsx). The original
// TabIds for those four still live in the union — Overview's deep-link map
// consumes them and routes everything to 'supplier'.
//
// 'inventory' is the rebrand of the old 'selections' surface — same
// underlying selections store, refocused on procurement-state inventory.
export type TabId =
  | 'overview'
  | 'tasks'
  | 'review'        // AI analysis hub — Mock-AI runner + review queue
  | 'finance'       // money view — spend vs progress, budget, milestones, invoices
  | 'crew'          // legacy deep-link target → resolves to 'site_diary' (merged in)
  | 'site_diary'
  | 'reports'        // project-scoped Progress + Financial + Sign-offs (extracted from /reports)
  | 'punch_list'
  | 'supplier'      // merged: orders + deliveries + invoices + warranties
  | 'orders'        // legacy deep-link target → resolves to 'supplier'
  | 'deliveries'    // legacy deep-link target → resolves to 'supplier'
  | 'invoices'      // legacy deep-link target → resolves to 'supplier'
  | 'warranties'    // legacy deep-link target → resolves to 'supplier'
  | 'inventory'     // was 'selections'
  | 'plans'         // legacy deep-link target → resolves to 'files'
  | 'files'         // merged Plans + Uploads
  | 'uploads';      // legacy deep-link target → resolves to 'files'

// ─── Site Diary ──────────────────────────────────────────────────────────
// Replaces the old `DailyLog` shape. A single diary entry per project per
// day; personnel rows nest inside instead of being a flat hours/headcount.

export type WeatherKind = 'sunny' | 'cloudy' | 'rain' | 'storm';

export interface DiaryPersonnel {
  id: string;
  workerId: string;       // FK into the workers list (free-text fallback name OK for v1)
  workerName: string;     // denormalized for display when worker record is gone
  hours: number;
  role: string;           // 'electrician' | 'foreman' | 'apprentice' | …
  company: string;        // 'Casone Electrical' | subcontractor name
}

export type DiaryStatus = 'signed' | 'pending' | 'flagged';

export interface DiaryEntry {
  id: string;
  projectId: string;
  date: string;           // ISO date — one entry per project per date (UI enforces)
  description: string;
  weather?: WeatherKind;
  temperatureC?: number;
  personnel: DiaryPersonnel[];
  photoIds: string[];     // refs into the documents store
  createdBy: string;
  createdAt: string;
  // Site Diary v3 fields — all optional so the legacy migration (store.ts:migrate)
  // and any pre-v3 persisted rows continue to load. Defaults applied at render.
  startTime?: string;     // 'HH:mm' local — display only, never parsed to Date
  endTime?: string;       // 'HH:mm'
  status?: DiaryStatus;   // default 'pending' if absent
  tags?: string[];        // chip labels, usually drawn from Common Works names
}

// ─── Punch List ──────────────────────────────────────────────────────────
// Renamed from Todo. Adds zone/task linkage and an assignee so it ties back
// into the Gantt instead of floating loose.

export interface PunchItem {
  id: string;
  projectId: string;
  text: string;
  assigneeId?: string;
  zoneId?: string;
  taskId?: string;
  dueDate?: string;
  photoId?: string;
  status: 'open' | 'done';
  createdBy: string;
  createdAt: string;
  closedAt?: string;
}

// ─── Procurement ─────────────────────────────────────────────────────────
// Orders → Deliveries → Invoices → Warranties is the procurement chain.
// Each step references the previous so the Gantt and Overview tabs can
// roll up status (e.g. "task X is blocked: 2 line items unreceived").

export type OrderStatus =
  | 'draft'        // PM is building the order; not sent to supplier yet
  | 'submitted'    // sent to supplier, awaiting confirmation
  | 'confirmed'    // supplier accepted, ETA set
  | 'partial'      // some line items received, others outstanding
  | 'received'     // all line items received in full
  | 'cancelled';

// Supplier-side response to a PO (role-experiences) — DECOUPLED from the
// procurement OrderStatus above. The PM still drives confirmed/partial/received;
// this captures whether the supplier has Accepted / put on Hold / Declined the
// order addressed to them. Persisted via `updateOrderResponse` (migration 47).
export type SupplierResponse = 'pending' | 'accepted' | 'held' | 'declined';

export interface OrderLineItem {
  id: string;
  description: string;
  qty: number;
  unitCost: number;
  unit: string;          // 'ea' | 'm' | 'kg' | 'box' | 'lf' | 'sf' …
  qtyReceived: number;   // 0 until delivery; drives partial/received status
  warrantyMonths?: number;
  notes?: string;
}

export interface Order {
  id: string;
  projectId: string;
  poNumber: string;
  supplierId?: string;     // FK into suppliers; free-text supplier name allowed for v1
  supplierName: string;    // denormalized
  zoneId?: string;
  taskId?: string;         // ties to Gantt — this is what enables roll-up status
  orderedDate: string;
  expectedDelivery?: string;
  status: OrderStatus;
  notes?: string;
  lineItems: OrderLineItem[];
  // totalAmount is derived (sum of qty × unitCost); not stored.
  // Supplier response (read path always safe; write is deploy-gated to migration 47).
  supplierResponse?: SupplierResponse;
  supplierRespondedAt?: string;
  supplierResponseNote?: string;
}

export interface DeliveryLineItem {
  lineItemId: string;
  qtyReceived: number;
}

export interface Delivery {
  id: string;
  projectId: string;
  orderId: string;
  receivedDate: string;
  receivedBy: string;
  items: DeliveryLineItem[];
  photoIds: string[];        // proof-of-delivery photos
  notes?: string;
  createdAt: string;
}

export type InvoiceStatus = 'pending' | 'paid' | 'overdue' | 'disputed';

export interface Invoice {
  id: string;
  projectId: string;
  orderId: string;
  invoiceNumber: string;
  invoiceDate: string;
  dueDate: string;
  amount: number;
  status: InvoiceStatus;
  paidDate?: string;
  fileRef?: string;          // PDF attachment / drive link
  notes?: string;
  createdAt: string;
}

export interface Warranty {
  id: string;
  projectId: string;
  description: string;
  supplierName: string;      // denormalized; or pull via order.supplierName
  startDate: string;         // usually = delivery date
  expiryDate: string;        // = startDate + warrantyMonths
  // Linkage — one of these is usually set. Manual one-off warranties have none.
  invoiceId?: string;
  orderId?: string;
  lineItemId?: string;
  fileRef?: string;
  notes?: string;
  createdAt: string;
}

// ─── Recent activity (derived, not stored) ───────────────────────────────
// Synthesised at read-time from tasks/photos/orders/diary/comments by
// useProjectActivity(projectId). When we move to Supabase, replace with a
// real audit_log query — same shape, real source.

export type ActivityKind =
  | 'task_progress'
  | 'task_created'
  | 'photo_upload'
  | 'order_placed'
  | 'order_received'
  | 'delivery_received'
  | 'invoice_paid'
  | 'punch_item_added'
  | 'punch_item_closed'
  | 'diary_entry'
  | 'comment_added'
  | 'ai_analysed'
  | 'safety_flag';

export interface ActivityEvent {
  id: string;                  // synthesized: `${kind}:${entityId}:${timestamp}`
  kind: ActivityKind;
  actorId: string;
  actorName: string;
  targetLabel: string;         // human-readable: "Frame inspection — L1"
  targetTabId: TabId;          // for deep-linking from the activity feed
  targetEntityId: string;
  timestamp: string;
}

export interface ChecklistItem {
  id: string;
  text: string;
  done: boolean;
  createdAt: string;
  closedAt?: string;
}