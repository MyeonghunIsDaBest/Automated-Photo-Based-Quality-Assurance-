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
import {
  EditorialButton,
  ResponsiveDataTable,
  type ColumnDef,
} from '../../../components/editorial';

// Includes the Phase A additions so admins can assign every tier through the
// dropdown. canAssignSecurityGroup() still gates company_admin to company
// admins only — the option is just visible, not enabled.
const SECURITY_GROUPS: SecurityGroup[] = [
  'company_admin',
  'administrator',
  'construction_mgr',
  'project_manager',
  'site_manager',
  'worker',
  'stakeholder',
  'supplier',
];

const ADMIN_GROUPS: SecurityGroup[] = ['company_admin', 'administrator'];
const MANAGER_GROUPS: SecurityGroup[] = [
  'construction_mgr',
  'project_manager',
  'site_manager',
];

type FilterId = 'all' | 'managers' | 'workers' | 'partners' | 'disabled';

const FILTERS: { id: FilterId; label: string }[] = [
  { id: 'all',      label: 'All non-admins' },
  { id: 'managers', label: 'Managers' },
  { id: 'workers',  label: 'Workers' },
  { id: 'partners', label: 'Stakeholders + Suppliers' },
  { id: 'disabled', label: 'Disabled' },
];

const ROLE_BADGE: Record<SecurityGroup, string> = {
  company_admin:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  administrator:    'border-emerald-200 bg-emerald-50 text-emerald-700',
  construction_mgr: 'border-blue-200 bg-blue-50 text-blue-700',
  project_manager:  'border-blue-200 bg-blue-50 text-blue-700',
  site_manager:     'border-blue-200 bg-blue-50 text-blue-700',
  worker:           'border-slate-200 bg-slate-50 text-slate-600',
  stakeholder:      'border-violet-200 bg-violet-50 text-violet-700',
  supplier:         'border-amber-200 bg-amber-50 text-amber-700',
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
      if (filter === 'partners') return p.securityGroup === 'stakeholder' || p.securityGroup === 'supplier';
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
      {/* Toolbar — search, filter chips, add. Mobile-first: stacks vertically
          under sm so the search input gets a whole row, the filter chips wrap
          on a second row, and the Add User button anchors to the bottom. */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-center">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="h-10 w-full min-w-0 rounded-full border border-slate-200 bg-white px-4 text-sm shadow-sm focus:border-slate-900 focus:outline-none sm:max-w-md sm:flex-1"
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
        <EditorialButton
          variant="pill"
          trailingIcon="none"
          onClick={() => setCreating(true)}
          className="sm:ml-auto"
        >
          <Plus className="h-4 w-4" aria-hidden />
          Add User
        </EditorialButton>
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

  // Action buttons share a renderer between the table cell + mobile card so
  // the affordances stay identical across breakpoints.
  const renderActions = (p: Profile) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect(p); }}
        title="Documents"
        aria-label="Documents"
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <FileText className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(p); }}
        title="Edit"
        aria-label="Edit"
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <Edit className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleActive(p); }}
        title={p.isActive ? 'Disable' : 'Enable'}
        aria-label={p.isActive ? 'Disable' : 'Enable'}
        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
      >
        <Power className="h-4 w-4" />
      </button>
    </div>
  );

  const renderRoleControl = (p: Profile) => (
    <div className="flex flex-wrap items-center gap-2">
      <span
        className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider ${ROLE_BADGE[p.securityGroup]}`}
      >
        {SECURITY_GROUP_LABELS[p.securityGroup]}
      </span>
      <select
        value={p.securityGroup}
        onChange={(e) => onGroupChange(p, e.target.value as SecurityGroup)}
        onClick={(e) => e.stopPropagation()}
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
    </div>
  );

  const columns: ColumnDef<Profile>[] = [
    {
      key: 'name',
      header: 'Name',
      cell: (p) => (
        <span className="font-medium text-slate-900">
          {[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}
        </span>
      ),
    },
    { key: 'email', header: 'Email', cell: (p) => <span className="text-slate-600">{p.email}</span> },
    { key: 'role',  header: 'Security Group', cell: renderRoleControl },
    { key: 'mobile', header: 'Mobile', cell: (p) => <span className="text-slate-600">{p.mobile ?? '—'}</span> },
    {
      key: 'status',
      header: 'Status',
      cell: (p) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
          }`}
        >
          {p.isActive ? 'Active' : 'Disabled'}
        </span>
      ),
    },
    { key: 'actions', header: '', cell: renderActions, align: 'right' },
  ];

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

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-slate-400">Loading…</div>
        ) : (
          <ResponsiveDataTable<Profile>
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            empty={emptyHint}
            mobileCard={(p) => (
              <div
                className={`space-y-2 ${selectedId === p.id ? 'rounded-lg ring-2 ring-emerald-200' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}
                    </p>
                    <p className="truncate text-xs text-slate-500">{p.email}</p>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      p.isActive ? 'bg-emerald-100 text-emerald-700' : 'bg-slate-200 text-slate-600'
                    }`}
                  >
                    {p.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
                {renderRoleControl(p)}
                {p.mobile && (
                  <p className="text-[11px] text-slate-500">Mobile: {p.mobile}</p>
                )}
                <div className="flex justify-end pt-1">{renderActions(p)}</div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
