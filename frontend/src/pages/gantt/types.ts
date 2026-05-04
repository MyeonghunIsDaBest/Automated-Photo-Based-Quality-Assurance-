// Tab IDs surfaced on the Gantt strip. Order here drives the strip order
// in Gantt.tsx — Overview is first because it's the default landing tab.
export type TabId =
  | 'overview'
  | 'tasks'
  | 'site_diary'
  | 'punch_list'
  | 'orders'
  | 'deliveries'
  | 'invoices'
  | 'warranties'
  | 'plans'
  | 'files'
  | 'messages'
  | 'uploads';

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

export interface DiaryEntry {
  id: string;
  projectId: string;
  date: string;           // ISO date — one entry per project per date (UI enforces)
  description: string;
  weather?: WeatherKind;
  temperatureF?: number;
  personnel: DiaryPersonnel[];
  photoIds: string[];     // refs into the documents store
  createdBy: string;
  createdAt: string;
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
  | 'comment_added';

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