import { create } from 'zustand';

export type InvoiceStatus = 'paid' | 'pending' | 'overdue' | 'draft';

export interface ProjectBudget {
  projectId: string;
  total: number;
  spent: number;
  committed: number;
}

export interface Invoice {
  id: string;
  projectId: string;
  vendor: string;
  category: string;
  amount: number;
  status: InvoiceStatus;
  issuedAt: string;
  dueAt: string;
  reference?: string;
}

interface FinanceState {
  budgets: Record<string, ProjectBudget>;
  invoices: Invoice[];
  setBudget: (budget: ProjectBudget) => void;
  addInvoice: (invoice: Omit<Invoice, 'id'>) => Invoice;
  updateInvoiceStatus: (id: string, status: InvoiceStatus) => void;
  getBudget: (projectId: string) => ProjectBudget | undefined;
  getInvoices: (projectId: string) => Invoice[];
}

const seedBudgets: Record<string, ProjectBudget> = {
  project_1: { projectId: 'project_1', total: 4_250_000, spent: 2_847_500, committed: 612_000 },
  proj_1: { projectId: 'proj_1', total: 4_250_000, spent: 2_847_500, committed: 612_000 },
  proj_2: { projectId: 'proj_2', total: 8_900_000, spent: 1_120_000, committed: 480_000 },
  proj_3: { projectId: 'proj_3', total: 1_650_000, spent: 1_488_000, committed: 42_000 },
  proj_4: { projectId: 'proj_4', total: 12_400_000, spent: 320_000, committed: 980_000 },
  proj_5: { projectId: 'proj_5', total: 2_300_000, spent: 2_300_000, committed: 0 },
  proj_6: { projectId: 'proj_6', total: 5_750_000, spent: 1_870_000, committed: 220_000 },
};

const seedInvoices: Invoice[] = [
  // project_1 (default active) — original mock invoices
  { id: 'inv_1', projectId: 'project_1', vendor: 'Steel & Sons Construction', category: 'Materials — Structural',  amount: 184_500, status: 'paid',     issuedAt: '2024-01-25', dueAt: '2024-02-15', reference: 'PO-1042' },
  { id: 'inv_2', projectId: 'project_1', vendor: 'Pacific Roofing Co.',       category: 'Subcontractor — Roofing', amount:  96_000, status: 'pending', issuedAt: '2024-02-12', dueAt: '2024-03-05', reference: 'PO-1058' },
  { id: 'inv_3', projectId: 'project_1', vendor: 'Lincoln Electric Supply',   category: 'Materials — Electrical',  amount:  42_300, status: 'paid',     issuedAt: '2024-02-01', dueAt: '2024-02-22', reference: 'PO-1063' },
  { id: 'inv_4', projectId: 'project_1', vendor: 'Garcia Plumbing LLC',       category: 'Subcontractor — Plumbing',amount:  31_750, status: 'overdue', issuedAt: '2024-02-04', dueAt: '2024-02-25', reference: 'PO-1071' },
  { id: 'inv_5', projectId: 'project_1', vendor: 'Northern Lumber Yard',      category: 'Materials — Framing',     amount:  67_400, status: 'paid',     issuedAt: '2024-01-20', dueAt: '2024-02-10', reference: 'PO-1029' },
  { id: 'inv_6', projectId: 'project_1', vendor: 'Climate Pro HVAC',          category: 'Subcontractor — HVAC',    amount:  54_900, status: 'pending', issuedAt: '2024-02-18', dueAt: '2024-03-12', reference: 'PO-1085' },

  // proj_2
  { id: 'inv_7', projectId: 'proj_2', vendor: 'Solid Foundations Co.', category: 'Subcontractor — Concrete', amount: 142_000, status: 'paid',    issuedAt: '2024-03-08', dueAt: '2024-03-30', reference: 'PO-2018' },
  { id: 'inv_8', projectId: 'proj_2', vendor: 'BuildCorp Site Services',category: 'Labor — Site Mgmt',       amount:  78_400, status: 'pending', issuedAt: '2024-03-15', dueAt: '2024-04-05', reference: 'PO-2025' },

  // proj_3
  { id: 'inv_9',  projectId: 'proj_3', vendor: 'Roof Masters',           category: 'Subcontractor — Roofing', amount: 88_500, status: 'paid', issuedAt: '2024-03-22', dueAt: '2024-04-12', reference: 'PO-3041' },
  { id: 'inv_10', projectId: 'proj_3', vendor: 'Wood Works Carpentry',   category: 'Subcontractor — Finish',  amount: 64_200, status: 'paid', issuedAt: '2024-04-02', dueAt: '2024-04-22', reference: 'PO-3052' },

  // proj_4
  { id: 'inv_11', projectId: 'proj_4', vendor: 'Geotech Surveys Inc.', category: 'Consulting — Geotech', amount: 38_750, status: 'paid', issuedAt: '2024-04-04', dueAt: '2024-04-25', reference: 'PO-4007' },
];

export const useFinanceStore = create<FinanceState>((set, get) => ({
  budgets: seedBudgets,
  invoices: seedInvoices,

  setBudget: (budget) =>
    set((state) => ({ budgets: { ...state.budgets, [budget.projectId]: budget } })),

  addInvoice: (invoice) => {
    const newInvoice: Invoice = {
      ...invoice,
      id: `inv_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    };
    set((state) => ({ invoices: [newInvoice, ...state.invoices] }));
    return newInvoice;
  },

  updateInvoiceStatus: (id, status) =>
    set((state) => ({
      invoices: state.invoices.map((inv) => (inv.id === id ? { ...inv, status } : inv)),
    })),

  getBudget: (projectId) => get().budgets[projectId],
  getInvoices: (projectId) => get().invoices.filter((inv) => inv.projectId === projectId),
}));
