import { useState } from 'react';
import { ShieldCheck, Users, Building, Truck } from 'lucide-react';
import { useAppStore } from '../store';
import { canSeeAdminDashboard } from '../lib/permissions';
import UsersTab from './admin/components/UsersTab';
import StakeholdersTab from './admin/components/StakeholdersTab';
import SuppliersTab from './admin/components/SuppliersTab';

type TabKey = 'users' | 'stakeholders' | 'suppliers';

const TABS: { key: TabKey; label: string; Icon: typeof Users }[] = [
  { key: 'users',        label: 'Users',        Icon: Users },
  { key: 'stakeholders', label: 'Stakeholders', Icon: Building },
  { key: 'suppliers',    label: 'Suppliers',    Icon: Truck },
];

export default function Admin() {
  const { currentProfile } = useAppStore();
  const [tab, setTab] = useState<TabKey>('users');

  if (!canSeeAdminDashboard(currentProfile)) {
    return null;
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <div className="border-b border-slate-200 bg-white">
        <div className="px-8 py-6">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-emerald-600 text-white">
              <ShieldCheck className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Administration</h1>
              <p className="text-sm text-slate-500">
                Manage users, stakeholders, and suppliers.
              </p>
            </div>
          </div>

          <div className="mt-6 flex gap-1 border-b border-slate-200 -mb-6">
            {TABS.map((t) => {
              const isActive = tab === t.key;
              return (
                <button
                  key={t.key}
                  onClick={() => setTab(t.key)}
                  className={`flex items-center gap-2 border-b-2 px-4 py-3 text-sm font-medium transition-colors ${
                    isActive
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <t.Icon className="h-4 w-4" />
                  {t.label}
                </button>
              );
            })}
          </div>
        </div>
      </div>

      <div className="px-8 py-6">
        {tab === 'users' && <UsersTab />}
        {tab === 'stakeholders' && <StakeholdersTab />}
        {tab === 'suppliers' && <SuppliersTab />}
      </div>
    </div>
  );
}
