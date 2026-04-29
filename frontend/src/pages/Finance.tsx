import { Navigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { canViewFinance } from '../lib/permissions';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Badge } from '../components/ui/badge';
import { DollarSign, TrendingUp, AlertCircle, FileText, Lock } from 'lucide-react';

const mockBudget = {
  total: 4_250_000,
  spent: 2_847_500,
  committed: 612_000,
  remaining: 790_500,
};

const mockInvoices = [
  { id: 'inv_1', vendor: 'Steel & Sons Construction', amount: 184_500, status: 'paid',     due: '2024-02-15', category: 'Materials — Structural' },
  { id: 'inv_2', vendor: 'Pacific Roofing Co.',       amount: 96_000,  status: 'pending', due: '2024-03-05', category: 'Subcontractor — Roofing' },
  { id: 'inv_3', vendor: 'Lincoln Electric Supply',   amount: 42_300,  status: 'paid',     due: '2024-02-22', category: 'Materials — Electrical' },
  { id: 'inv_4', vendor: 'Garcia Plumbing LLC',       amount: 31_750,  status: 'overdue', due: '2024-02-25', category: 'Subcontractor — Plumbing' },
  { id: 'inv_5', vendor: 'Northern Lumber Yard',      amount: 67_400,  status: 'paid',     due: '2024-02-10', category: 'Materials — Framing' },
];

const fmt = (n: number) =>
  new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(n);

export default function Finance() {
  const { currentUser } = useAppStore();

  if (!currentUser) return <Navigate to="/login" replace />;

  // Defence in depth: even if the user navigates here directly, deny without
  // the finance permission — the same gate the backend will enforce.
  if (!canViewFinance(currentUser)) {
    return (
      <div className="flex h-full items-center justify-center p-6">
        <Card className="max-w-md">
          <CardContent className="flex flex-col items-center gap-3 p-8 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-full bg-red-50">
              <Lock className="h-6 w-6 text-red-500" />
            </div>
            <h2 className="text-lg font-semibold text-slate-900">Finance access required</h2>
            <p className="text-sm text-slate-500">
              Your account doesn't have the <span className="font-medium">Finance</span> permission.
              Ask an administrator to grant access if you need to view financial data.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const spentPct = Math.round((mockBudget.spent / mockBudget.total) * 100);

  return (
    <div className="p-6">
      <div className="mb-6 flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Finance</h1>
          <p className="text-slate-500">Budget, costs, and invoices for this project.</p>
        </div>
        <Badge variant="secondary" className="gap-1.5">
          <Lock className="h-3 w-3" />
          Restricted view
        </Badge>
      </div>

      {/* KPI cards */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Total Budget</p>
              <DollarSign className="h-4 w-4 text-slate-400" />
            </div>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{fmt(mockBudget.total)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Spent to Date</p>
              <TrendingUp className="h-4 w-4 text-emerald-500" />
            </div>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{fmt(mockBudget.spent)}</p>
            <p className="mt-0.5 text-xs text-slate-500">{spentPct}% of budget</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Committed</p>
              <FileText className="h-4 w-4 text-blue-500" />
            </div>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{fmt(mockBudget.committed)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Pending invoices</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <p className="text-xs font-medium text-slate-500">Remaining</p>
              <AlertCircle className="h-4 w-4 text-amber-500" />
            </div>
            <p className="mt-1 text-2xl font-semibold text-slate-900">{fmt(mockBudget.remaining)}</p>
            <p className="mt-0.5 text-xs text-slate-500">Available to allocate</p>
          </CardContent>
        </Card>
      </div>

      {/* Spend bar */}
      <Card className="mb-6">
        <CardHeader>
          <CardTitle className="text-base">Budget Utilisation</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-3 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full bg-emerald-500" style={{ width: `${spentPct}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs text-slate-500">
            <span>{fmt(mockBudget.spent)} spent</span>
            <span>{fmt(mockBudget.total)} total</span>
          </div>
        </CardContent>
      </Card>

      {/* Invoices */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Recent Invoices</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs font-medium text-slate-600">
                <tr>
                  <th className="px-4 py-2.5">Vendor</th>
                  <th className="px-4 py-2.5">Category</th>
                  <th className="px-4 py-2.5 text-right">Amount</th>
                  <th className="px-4 py-2.5">Due</th>
                  <th className="px-4 py-2.5">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockInvoices.map((inv) => (
                  <tr key={inv.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">{inv.vendor}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.category}</td>
                    <td className="px-4 py-3 text-right font-medium text-slate-900">{fmt(inv.amount)}</td>
                    <td className="px-4 py-3 text-slate-600">{inv.due}</td>
                    <td className="px-4 py-3">
                      <Badge
                        variant={
                          inv.status === 'paid'
                            ? 'default'
                            : inv.status === 'overdue'
                              ? 'destructive'
                              : 'secondary'
                        }
                        className="capitalize"
                      >
                        {inv.status}
                      </Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      <p className="mt-6 text-xs text-slate-400">
        Finance data is hidden from API responses for users without the Finance permission.
        This screen is for users on the Finance allowlist only.
      </p>
    </div>
  );
}
