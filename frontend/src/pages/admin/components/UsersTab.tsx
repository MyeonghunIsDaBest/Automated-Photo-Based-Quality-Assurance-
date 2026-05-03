import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Power, FileText, ShieldCheck, Users as UsersIcon } from 'lucide-react';
import {
  listProfiles,
  setProfileSecurityGroup,
  deactivateProfile,
  reactivateProfile,
} from '../../../lib/api/profiles';
import { SECURITY_GROUP_LABELS, canAssignSecurityGroup } from '../../../lib/permissions';
import { useAppStore } from '../../../store';
import type { Profile, SecurityGroup } from '../../../types';
import UserFormModal from './UserFormModal';
import UserDocuments from './UserDocuments';

const SECURITY_GROUPS: SecurityGroup[] = [
  'company_admin',
  'administrator',
  'construction_mgr',
  'project_manager',
  'site_manager',
  'worker',
];

const ADMIN_GROUPS: SecurityGroup[] = ['company_admin', 'administrator'];
const MANAGER_GROUPS: SecurityGroup[] = [
  'construction_mgr',
  'project_manager',
  'site_manager',
];

type FilterId = 'all' | 'managers' | 'workers' | 'disabled';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all',      label: 'All non-admins' },
  { id: 'managers', label: 'Managers' },
  { id: 'workers',  label: 'Workers' },
  { id: 'disabled', label: 'Disabled' },
];

const ROLE_BADGE: Record<SecurityGroup, string> = {
  company_admin:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  administrator:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  construction_mgr: 'border-blue-200 bg-blue-50 text-blue-700',
  project_manager:  'border-blue-200 bg-blue-50 text-blue-700',
  site_manager:     'border-blue-200 bg-blue-50 text-blue-700',
  worker:           'border-slate-200 bg-slate-50 text-slate-600',
};

export default function UsersTab() {
  const { currentProfile } = useAppStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);
  const [filter, setFilter] = useState<FilterId>('all');
  const [search, setSearch] = useState('');

  const refresh = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await listProfiles();
      setProfiles(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load users.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void refresh();
  }, []);

  const handleGroupChange = async (p: Profile, group: SecurityGroup) => {
    if (!canAssignSecurityGroup(currentProfile, group)) {
      setError('You do not have permission to assign that role.');
      return;
    }
    try {
      const updated = await setProfileSecurityGroup(p.id, group);
      setProfiles((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to update role.');
    }
  };

  const handleToggleActive = async (p: Profile) => {
    try {
      const updated = p.isActive ? await deactivateProfile(p.id) : await reactivateProfile(p.id);
      setProfiles((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to toggle account.');
    }
  };

  // Pin admins at the top in a dedicated group; everyone else is filterable.
  const { admins, others } = useMemo(() => {
    const matchesSearch = (p: Profile) => {
      if (!search.trim()) return true;
      const q = search.trim().toLowerCase();
      return (
        p.email.toLowerCase().includes(q) ||
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q)
      );
    };

    const adminRows = profiles
      .filter((p) => ADMIN_GROUPS.includes(p.securityGroup))
      .filter(matchesSearch)
      .sort((a, b) => a.email.localeCompare(b.email));

    const nonAdmins = profiles
      .filter((p) => !ADMIN_GROUPS.includes(p.securityGroup))
      .filter(matchesSearch);

    const filtered = nonAdmins.filter((p) => {
      if (filter === 'all')      return true;
      if (filter === 'managers') return MANAGER_GROUPS.includes(p.securityGroup);
      if (filter === 'workers')  return p.securityGroup === 'worker';
      if (filter === 'disabled') return !p.isActive;
      return true;
    });

    return {
      admins: adminRows,
      others: filtered.sort((a, b) => a.email.localeCompare(b.email)),
    };
  }, [profiles, filter, search]);

  return (
    <div>
      {/* Toolbar — search, filter chips, add */}
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="h-9 flex-1 min-w-[200px] max-w-md rounded-full border border-slate-200 bg-white px-4 text-sm shadow-sm focus:border-slate-900 focus:outline-none"
        />
        <div className="flex flex-wrap items-center gap-2">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                filter === f.id
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-200 text-slate-600 hover:border-slate-300 hover:bg-slate-50'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <button
          onClick={() => setCreating(true)}
          className="ml-auto flex items-center gap-2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" />
          Add User
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {error}
        </div>
      )}

      {/* Pinned admins */}
      <Group
        icon={ShieldCheck}
        title="Admins"
        accent="emerald"
        count={admins.length}
        loading={loading}
        rows={admins}
        currentProfile={currentProfile}
        onGroupChange={handleGroupChange}
        onToggleActive={handleToggleActive}
        onSelect={setSelected}
        onEdit={setEditing}
        selectedId={selected?.id}
        emptyHint="No admins on the system. The first signup auto-promotes to Company Admin."
      />

      <div className="my-6 h-px bg-slate-200" />

      {/* Everyone else */}
      <Group
        icon={UsersIcon}
        title="Everyone else"
        accent="slate"
        count={others.length}
        loading={loading}
        rows={others}
        currentProfile={currentProfile}
        onGroupChange={handleGroupChange}
        onToggleActive={handleToggleActive}
        onSelect={setSelected}
        onEdit={setEditing}
        selectedId={selected?.id}
        emptyHint={
          search.trim() || filter !== 'all'
            ? 'No users match the current filter.'
            : 'No regular users yet — invite one with Add User.'
        }
      />

      {selected && <UserDocuments profile={selected} onClose={() => setSelected(null)} />}

      {(creating || editing) && (
        <UserFormModal
          mode={creating ? 'create' : 'edit'}
          profile={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={() => {
            setCreating(false);
            setEditing(null);
            void refresh();
          }}
        />
      )}
    </div>
  );
}

interface GroupProps {
  icon: typeof ShieldCheck;
  title: string;
  accent: 'emerald' | 'slate';
  count: number;
  loading: boolean;
  rows: Profile[];
  currentProfile: Profile | null;
  selectedId?: string;
  onGroupChange: (p: Profile, g: SecurityGroup) => void;
  onToggleActive: (p: Profile) => void;
  onSelect: (p: Profile) => void;
  onEdit: (p: Profile) => void;
  emptyHint: string;
}

function Group({
  icon: Icon, title, accent, count, loading, rows,
  currentProfile, selectedId, onGroupChange, onToggleActive, onSelect, onEdit,
  emptyHint,
}: GroupProps) {
  const accentClass = accent === 'emerald'
    ? 'bg-emerald-50 text-emerald-700'
    : 'bg-slate-100 text-slate-600';

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${accentClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-medium tabular-nums text-slate-600">
          {count}
        </span>
      </div>

      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <div className="inline-block min-w-full px-4 align-middle sm:px-0">
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[680px] text-left text-sm">
          <thead className="border-b border-slate-200 bg-slate-50/60 text-[11px] uppercase tracking-wider text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Email</th>
              <th className="px-4 py-3">Security Group</th>
              <th className="px-4 py-3">Mobile</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-sm text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-10 text-center text-sm text-slate-400">
                  {emptyHint}
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr
                  key={p.id}
                  className={`transition-colors hover:bg-slate-50 ${
                    selectedId === p.id ? 'bg-emerald-50/40' : ''
                  }`}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.email}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`mr-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${ROLE_BADGE[p.securityGroup]}`}
                    >
                      {SECURITY_GROUP_LABELS[p.securityGroup]}
                    </span>
                    <select
                      value={p.securityGroup}
                      onChange={(e) => onGroupChange(p, e.target.value as SecurityGroup)}
                      className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs focus:border-slate-900 focus:outline-none"
                    >
                      {SECURITY_GROUPS.map((g) => (
                        <option
                          key={g}
                          value={g}
                          disabled={!canAssignSecurityGroup(currentProfile, g)}
                        >
                          {SECURITY_GROUP_LABELS[g]}
                        </option>
                      ))}
                    </select>
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.mobile ?? '—'}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
                        p.isActive
                          ? 'bg-emerald-100 text-emerald-700'
                          : 'bg-slate-200 text-slate-600'
                      }`}
                    >
                      {p.isActive ? 'Active' : 'Disabled'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        onClick={() => onSelect(p)}
                        title="Documents"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onEdit(p)}
                        title="Edit"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => onToggleActive(p)}
                        title={p.isActive ? 'Disable' : 'Enable'}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Power className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        </div>
        </div>
      </div>
    </div>
  );
}
