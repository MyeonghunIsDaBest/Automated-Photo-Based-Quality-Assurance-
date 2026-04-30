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

// Single seed budget for the live pilot — fresh project, no spend booked yet.
const seedBudgets: Record<string, ProjectBudget> = {
  project_1: { projectId: 'project_1', total: 150_000, spent: 0, committed: 0 },
};

// Empty seed — invoices will be authored against the live pilot project.
const seedInvoices: Invoice[] = [];

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
