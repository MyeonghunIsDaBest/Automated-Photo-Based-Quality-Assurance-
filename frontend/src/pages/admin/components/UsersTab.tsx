import { useEffect, useMemo, useState } from 'react';
import {
  ArrowDown, ArrowUp, ArrowUpDown,
  Crown, Edit, FileText, LifeBuoy, Plus, Power, Search,
  ShieldCheck, Users as UsersIcon, X,
} from 'lucide-react';
import {
  listProfiles,
  setProfileSecurityGroup,
  deactivateProfile,
  reactivateProfile,
} from '../../../lib/api/profiles';
import { SECURITY_GROUP_LABELS, canAssignSecurityGroup, canRescueAdmin } from '../../../lib/permissions';
import { useAppStore } from '../../../store';
import type { Profile, SecurityGroup } from '../../../types';
import UserFormModal from './UserFormModal';
import UserDocuments from './UserDocuments';
import RescueAdminModal from './RescueAdminModal';
import {
  EditorialButton,
  ResponsiveDataTable,
  type ColumnDef,
} from '../../../components/editorial';

// Every security group available in the role-change dropdown. Order doubles
// as the natural sort order for the Role column header.
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

// The chip strip shows ONLY non-admin roles because admins are pinned in
// their own section above. Order mirrors the org chart.
const NON_ADMIN_GROUPS: SecurityGroup[] = [
  'construction_mgr',
  'project_manager',
  'site_manager',
  'worker',
  'stakeholder',
  'supplier',
];

const ROLE_BADGE: Record<SecurityGroup, string> = {
  company_admin:    'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  administrator:    'border-[#A8D0B8] bg-[#E5F2EA] text-[#246F47]',
  construction_mgr: 'border-[#D8D2C4] bg-[#EEF1F4] text-[#5B6B7B]',
  project_manager:  'border-[#D8D2C4] bg-[#EEF1F4] text-[#5B6B7B]',
  site_manager:     'border-[#D8D2C4] bg-[#EEF1F4] text-[#5B6B7B]',
  worker:           'border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]',
  stakeholder:      'border-[#E6E1D4] bg-[#F0EDE4] text-[#1A1A1A]',
  supplier:         'border-[#F0D5A0] bg-[#F9EFD9] text-[#C8841E]',
  dev:              'border-[#1A1A1A] bg-[#1A1A1A] text-white',
};

type FilterId = 'all' | SecurityGroup | 'disabled';
type SortCol = 'name' | 'role' | 'status' | 'joined';
interface SortState {
  col: SortCol;
  dir: 'asc' | 'desc';
}

function fullName(p: Profile): string {
  return `${p.firstName ?? ''} ${p.lastName ?? ''}`.trim() || p.email;
}

function fmtJoined(iso: string | undefined): string {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('en-US', {
      year: 'numeric', month: 'short', day: 'numeric',
    });
  } catch { return '—'; }
}

function compareProfiles(a: Profile, b: Profile, col: SortCol, dir: 'asc' | 'desc'): number {
  const sign = dir === 'asc' ? 1 : -1;
  switch (col) {
    case 'name':
      return sign * fullName(a).toLowerCase().localeCompare(fullName(b).toLowerCase());
    case 'role':
      return sign * SECURITY_GROUP_LABELS[a.securityGroup]
        .localeCompare(SECURITY_GROUP_LABELS[b.securityGroup]);
    case 'status': {
      // Active first when ascending.
      const av = a.isActive ? 0 : 1;
      const bv = b.isActive ? 0 : 1;
      return sign * (av - bv);
    }
    case 'joined': {
      const at = Date.parse(a.createdAt || '');
      const bt = Date.parse(b.createdAt || '');
      return sign * ((isNaN(at) ? 0 : at) - (isNaN(bt) ? 0 : bt));
    }
  }
}

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
  const [sort, setSort] = useState<SortState>({ col: 'name', dir: 'asc' });

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

  useEffect(() => { void refresh(); }, []);

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

  const toggleSort = (col: SortCol) => {
    setSort((prev) => prev.col === col
      ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' }
      : { col, dir: 'asc' });
  };

  // Counts driving the filter chips. Admins are excluded from the chip
  // strip because they're rendered in a separate pinned section.
  const counts = useMemo(() => {
    const c: Record<string, number> = { all: 0, disabled: 0 };
    for (const g of NON_ADMIN_GROUPS) c[g] = 0;
    for (const p of profiles) {
      if (ADMIN_GROUPS.includes(p.securityGroup)) continue;
      c.all++;
      c[p.securityGroup] = (c[p.securityGroup] ?? 0) + 1;
      if (!p.isActive) c.disabled++;
    }
    return c;
  }, [profiles]);

  const { owners, admins, others } = useMemo(() => {
    const q = search.trim().toLowerCase();
    const matchesSearch = (p: Profile) => {
      if (!q) return true;
      return (
        p.email.toLowerCase().includes(q) ||
        p.firstName.toLowerCase().includes(q) ||
        p.lastName.toLowerCase().includes(q) ||
        (p.mobile ?? '').toLowerCase().includes(q)
      );
    };
    const matchesFilter = (p: Profile) => {
      if (filter === 'all') return true;
      if (filter === 'disabled') return !p.isActive;
      return p.securityGroup === filter;
    };

    // Owners get their own pinned section above admins. An admin who is
    // ALSO an owner appears in the Owners group only (not double-listed).
    const ownerRows = profiles
      .filter((p) => p.isOwner)
      .filter(matchesSearch)
      .sort((a, b) => compareProfiles(a, b, sort.col, sort.dir));

    const adminRows = profiles
      .filter((p) => !p.isOwner && ADMIN_GROUPS.includes(p.securityGroup))
      .filter(matchesSearch)
      .sort((a, b) => compareProfiles(a, b, sort.col, sort.dir));

    const otherRows = profiles
      .filter((p) => !p.isOwner && !ADMIN_GROUPS.includes(p.securityGroup))
      .filter(matchesSearch)
      .filter(matchesFilter)
      .sort((a, b) => compareProfiles(a, b, sort.col, sort.dir));

    return { owners: ownerRows, admins: adminRows, others: otherRows };
  }, [profiles, filter, search, sort]);

  // Total owner count drives the "last owner" guard inside the rescue modal.
  const ownerCount = useMemo(() => profiles.filter((p) => p.isOwner).length, [profiles]);

  const clearFilters = () => { setFilter('all'); setSearch(''); };
  const filtersActive = filter !== 'all' || search.trim() !== '';

  // Rescue modal state — only owners can open it. Self-rescue is allowed
  // (typing your own email lets you set your own temp password / edit your
  // own profile), but the button is hidden on your own row to keep the
  // common case clean.
  const [rescuing, setRescuing] = useState<Profile | null>(null);
  const ownerViewing = canRescueAdmin(currentProfile);

  const onRescueResolved = (next: Partial<Profile>) => {
    if (!rescuing) return;
    setProfiles((prev) =>
      prev.map((p) => (p.id === rescuing.id ? { ...p, ...next } : p)),
    );
    // Refresh from server to pull canonical state (audit row + updated_at).
    void refresh();
  };

  return (
    <div>
      {/* ─── Toolbar: search + add ─── */}
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="relative flex-1 sm:max-w-md">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[#A0A0A0]" />
          <input
            type="search"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by name, email, or mobile…"
            className="h-10 w-full rounded-lg border border-[#E6E1D4] bg-white pl-10 pr-10 text-sm shadow-sm focus:border-[#2F8F5C] focus:outline-none"
          />
          {search && (
            <button
              type="button"
              onClick={() => setSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-full p-1 text-[#A0A0A0] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
              aria-label="Clear search"
            >
              <X className="h-3.5 w-3.5" />
            </button>
          )}
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

      {/* ─── Per-role filter chips ─── */}
      <div className="mb-5">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-[10px] font-medium uppercase tracking-[0.18em] text-[#6B6B6B]">
            Filter by role
          </span>
          <span className="text-[11px] text-[#A0A0A0]">
            <span className="tabular-nums text-[#1A1A1A]">{admins.length + others.length}</span>
            {' '}of{' '}
            <span className="tabular-nums">{profiles.length}</span> shown
          </span>
        </div>
        <div className="flex flex-wrap gap-1.5">
          <FilterChip
            label="All non-admins"
            count={counts.all}
            active={filter === 'all'}
            onClick={() => setFilter('all')}
          />
          {NON_ADMIN_GROUPS.filter((g) => counts[g] > 0).map((g) => (
            <FilterChip
              key={g}
              label={SECURITY_GROUP_LABELS[g]}
              count={counts[g]}
              active={filter === g}
              onClick={() => setFilter(g)}
            />
          ))}
          {counts.disabled > 0 && (
            <FilterChip
              label="Disabled"
              count={counts.disabled}
              active={filter === 'disabled'}
              onClick={() => setFilter('disabled')}
              tone="danger"
            />
          )}
        </div>
      </div>

      {error && (
        <div className="mb-4 rounded-[14px] border border-[#F0BFBF] bg-[#FBE5E5] px-3 py-2 text-sm text-[#C44545]">
          {error}
        </div>
      )}

      {/* ─── Pinned owners (founding / rescue-tier) ─── */}
      {(owners.length > 0 || ownerViewing) && (
        <>
          <Group
            icon={Crown}
            title="Owners"
            accent="amber"
            count={owners.length}
            loading={loading}
            rows={owners}
            currentProfile={currentProfile}
            sort={sort}
            onToggleSort={toggleSort}
            onGroupChange={handleGroupChange}
            onToggleActive={handleToggleActive}
            onSelect={setSelected}
            onEdit={setEditing}
            onRescue={ownerViewing ? setRescuing : undefined}
            selectedId={selected?.id}
            emptyHint="No owners yet — first signup is auto-promoted, or grant via Rescue tools."
          />
          <div className="my-6 h-px bg-[#E6E1D4]" />
        </>
      )}

      {/* ─── Pinned admins (non-owner) ─── */}
      <Group
        icon={ShieldCheck}
        title="Admins"
        accent="emerald"
        count={admins.length}
        loading={loading}
        rows={admins}
        currentProfile={currentProfile}
        sort={sort}
        onToggleSort={toggleSort}
        onGroupChange={handleGroupChange}
        onToggleActive={handleToggleActive}
        onSelect={setSelected}
        onEdit={setEditing}
        onRescue={ownerViewing ? setRescuing : undefined}
        selectedId={selected?.id}
        emptyHint="No admins on the system. The first signup auto-promotes to Company Admin."
      />

      <div className="my-6 h-px bg-[#E6E1D4]" />

      {/* ─── Everyone else ─── */}
      <Group
        icon={UsersIcon}
        title="Everyone else"
        accent="slate"
        count={others.length}
        loading={loading}
        rows={others}
        currentProfile={currentProfile}
        sort={sort}
        onToggleSort={toggleSort}
        onGroupChange={handleGroupChange}
        onToggleActive={handleToggleActive}
        onSelect={setSelected}
        onEdit={setEditing}
        onRescue={ownerViewing ? setRescuing : undefined}
        selectedId={selected?.id}
        emptyHint={
          filtersActive ? (
            <div className="py-6 text-center">
              <p className="display text-base text-[#1A1A1A]">No users match.</p>
              <p className="mt-1 text-xs text-[#6B6B6B]">Try a different role or clear the search.</p>
              <button
                type="button"
                onClick={clearFilters}
                className="mt-3 text-xs font-medium text-[#246F47] hover:underline"
              >
                Clear filters
              </button>
            </div>
          ) : 'No regular users yet — invite one with Add User.'
        }
      />

      {selected && <UserDocuments profile={selected} onClose={() => setSelected(null)} />}

      {rescuing && (
        <RescueAdminModal
          target={rescuing}
          ownerCount={ownerCount}
          onClose={() => setRescuing(null)}
          onResolved={onRescueResolved}
        />
      )}

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

// ─── Pieces ─────────────────────────────────────────────────────────────

function FilterChip({
  label, count, active, onClick, tone = 'default',
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: 'default' | 'danger';
}) {
  const activeClass = tone === 'danger'
    ? 'border-[#C44545] bg-[#C44545] text-white'
    : 'border-[#1A1A1A] bg-[#1A1A1A] text-white';
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
        active
          ? activeClass
          : 'border-[#E6E1D4] bg-white text-[#3A3A3A] hover:border-[#D8D2C4]'
      }`}
    >
      {label}
      <span className={`text-[10px] tabular-nums ${active ? 'text-white/70' : 'text-[#A0A0A0]'}`}>
        {count}
      </span>
    </button>
  );
}

function SortBtn({
  col, sort, onToggle, children,
}: {
  col: SortCol;
  sort: SortState;
  onToggle: (c: SortCol) => void;
  children: React.ReactNode;
}) {
  const active = sort.col === col;
  return (
    <button
      type="button"
      onClick={() => onToggle(col)}
      className="group inline-flex items-center gap-1 transition-colors hover:text-[#1A1A1A]"
    >
      {children}
      {active ? (
        sort.dir === 'asc'
          ? <ArrowUp className="h-3 w-3 text-[#246F47]" />
          : <ArrowDown className="h-3 w-3 text-[#246F47]" />
      ) : (
        <ArrowUpDown className="h-3 w-3 text-[#D8D2C4] opacity-0 transition-opacity group-hover:opacity-100" />
      )}
    </button>
  );
}

interface GroupProps {
  icon: typeof ShieldCheck;
  title: string;
  accent: 'emerald' | 'slate' | 'amber';
  count: number;
  loading: boolean;
  rows: Profile[];
  currentProfile: Profile | null;
  selectedId?: string;
  sort: SortState;
  onToggleSort: (c: SortCol) => void;
  onGroupChange: (p: Profile, g: SecurityGroup) => void;
  onToggleActive: (p: Profile) => void;
  onSelect: (p: Profile) => void;
  onEdit: (p: Profile) => void;
  /** Owner-only: open the rescue modal for this profile. Omitted when the
   *  current viewer isn't an owner — the action button is hidden. */
  onRescue?: (p: Profile) => void;
  emptyHint: React.ReactNode;
}

function Group({
  icon: Icon, title, accent, count, loading, rows,
  currentProfile, selectedId, sort, onToggleSort,
  onGroupChange, onToggleActive, onSelect, onEdit, onRescue,
  emptyHint,
}: GroupProps) {
  const accentClass = accent === 'emerald'
    ? 'bg-[#E5F2EA] text-[#246F47]'
    : accent === 'amber'
      ? 'bg-[#F9EFD9] text-[#C8841E]'
      : 'bg-[#FAF8F2] text-[#6B6B6B]';

  const renderActions = (p: Profile) => (
    <div className="flex items-center gap-1">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onSelect(p); }}
        title="Documents"
        aria-label="Documents"
        className="rounded-md p-1.5 text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
      >
        <FileText className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onEdit(p); }}
        title="Edit"
        aria-label="Edit"
        className="rounded-md p-1.5 text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]"
      >
        <Edit className="h-4 w-4" />
      </button>
      {onRescue && p.id !== currentProfile?.id && (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onRescue(p); }}
          title="Owner rescue: reset password, edit profile, manage ownership"
          aria-label="Rescue"
          className="rounded-md p-1.5 text-amber-600 hover:bg-amber-50"
        >
          <LifeBuoy className="h-4 w-4" />
        </button>
      )}
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onToggleActive(p); }}
        title={p.isActive ? 'Disable' : 'Enable'}
        aria-label={p.isActive ? 'Disable' : 'Enable'}
        className={`rounded-md p-1.5 transition-colors ${
          p.isActive
            ? 'text-[#6B6B6B] hover:bg-[#FAF8F2] hover:text-[#1A1A1A]'
            : 'text-[#2F8F5C] hover:bg-[#E5F2EA]'
        }`}
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
        className="rounded-md border border-[#E6E1D4] bg-white px-2 py-1 text-xs focus:border-[#2F8F5C] focus:outline-none"
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
      header: <SortBtn col="name" sort={sort} onToggle={onToggleSort}>Name</SortBtn>,
      cell: (p) => (
        <div className="flex items-center gap-3">
          <div className="relative">
            <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#E5F2EA] text-[11px] font-medium text-[#246F47]">
              {(p.firstName?.[0] ?? '?')}{(p.lastName?.[0] ?? '')}
            </div>
            {p.isOwner && (
              <span
                className="absolute -right-1 -top-1 grid h-3.5 w-3.5 place-items-center rounded-full bg-amber-500 ring-1 ring-white"
                title="Owner"
                aria-label="Owner"
              >
                <Crown className="h-2 w-2 text-white" />
              </span>
            )}
          </div>
          <div className="min-w-0">
            <p className="truncate font-medium text-[#1A1A1A]">
              {[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}
              {p.isOwner && (
                <span className="ml-1.5 inline-flex items-center gap-0.5 rounded-full border border-amber-200 bg-amber-50 px-1.5 py-px text-[9px] font-medium uppercase tracking-wider text-amber-700">
                  <Crown className="h-2 w-2" />Owner
                </span>
              )}
            </p>
            <p className="truncate text-[12px] text-[#6B6B6B]">{p.email}</p>
          </div>
        </div>
      ),
    },
    {
      key: 'role',
      header: <SortBtn col="role" sort={sort} onToggle={onToggleSort}>Security Group</SortBtn>,
      cell: renderRoleControl,
    },
    {
      key: 'mobile',
      header: 'Mobile',
      cell: (p) => <span className="text-[#3A3A3A]">{p.mobile ?? '—'}</span>,
      desktopOnly: true,
    },
    {
      key: 'status',
      header: <SortBtn col="status" sort={sort} onToggle={onToggleSort}>Status</SortBtn>,
      cell: (p) => (
        <span
          className={`inline-flex rounded-full px-2 py-0.5 text-xs font-medium ${
            p.isActive ? 'bg-[#E5F2EA] text-[#246F47]' : 'bg-[#F0EDE4] text-[#6B6B6B]'
          }`}
        >
          {p.isActive ? 'Active' : 'Disabled'}
        </span>
      ),
    },
    {
      key: 'joined',
      header: <SortBtn col="joined" sort={sort} onToggle={onToggleSort}>Joined</SortBtn>,
      cell: (p) => (
        <span className="tabular-nums text-[12px] text-[#6B6B6B]">
          {fmtJoined(p.createdAt)}
        </span>
      ),
      desktopOnly: true,
    },
    { key: 'actions', header: '', cell: renderActions, align: 'right' },
  ];

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className={`flex h-7 w-7 items-center justify-center rounded-lg ${accentClass}`}>
          <Icon className="h-4 w-4" />
        </div>
        <h3 className="text-sm font-semibold text-[#1A1A1A]">{title}</h3>
        <span className="rounded-full bg-[#F0EDE4] px-2 py-0.5 text-[10px] font-medium tabular-nums text-[#6B6B6B]">
          {count}
        </span>
      </div>

      <div className="overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
        {loading ? (
          <div className="px-4 py-8 text-center text-sm text-[#A0A0A0]">Loading…</div>
        ) : (
          <ResponsiveDataTable<Profile>
            columns={columns}
            rows={rows}
            rowKey={(p) => p.id}
            empty={emptyHint}
            mobileCard={(p) => (
              <div
                className={`space-y-2 ${selectedId === p.id ? 'rounded-lg ring-2 ring-[#A8D0B8]' : ''}`}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-2">
                    <div className="grid h-8 w-8 flex-shrink-0 place-items-center rounded-full bg-[#E5F2EA] text-[11px] font-medium text-[#246F47]">
                      {(p.firstName?.[0] ?? '?')}{(p.lastName?.[0] ?? '')}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-[#1A1A1A]">
                        {[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}
                      </p>
                      <p className="truncate text-xs text-[#6B6B6B]">{p.email}</p>
                    </div>
                  </div>
                  <span
                    className={`flex-shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                      p.isActive ? 'bg-[#E5F2EA] text-[#246F47]' : 'bg-[#F0EDE4] text-[#6B6B6B]'
                    }`}
                  >
                    {p.isActive ? 'Active' : 'Disabled'}
                  </span>
                </div>
                {renderRoleControl(p)}
                {p.mobile && (
                  <p className="text-[11px] text-[#6B6B6B]">Mobile: {p.mobile}</p>
                )}
                <p className="text-[10px] text-[#A0A0A0]">Joined {fmtJoined(p.createdAt)}</p>
                <div className="flex justify-end pt-1">{renderActions(p)}</div>
              </div>
            )}
          />
        )}
      </div>
    </div>
  );
}
