import { useEffect, useMemo, useState } from 'react';
import { Plus, Edit, Power, FileText } from 'lucide-react';
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

export default function UsersTab() {
  const { currentProfile } = useAppStore();
  const [profiles, setProfiles] = useState<Profile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<Profile | null>(null);
  const [creating, setCreating] = useState(false);
  const [selected, setSelected] = useState<Profile | null>(null);

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

  const sorted = useMemo(
    () => [...profiles].sort((a, b) => a.email.localeCompare(b.email)),
    [profiles],
  );

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">All users ({profiles.length})</h2>
          <p className="text-sm text-slate-500">
            Click a row to manage attached documents. Use the dropdown to change a user's
            security group.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700"
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

      <div className="rounded-xl border border-slate-200 bg-white">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-slate-200 text-xs uppercase tracking-wider text-slate-500">
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
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  Loading…
                </td>
              </tr>
            ) : sorted.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-4 py-8 text-center text-slate-400">
                  No users yet.
                </td>
              </tr>
            ) : (
              sorted.map((p) => (
                <tr
                  key={p.id}
                  className={`hover:bg-slate-50 ${selected?.id === p.id ? 'bg-emerald-50/40' : ''}`}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {[p.firstName, p.lastName].filter(Boolean).join(' ') || '—'}
                  </td>
                  <td className="px-4 py-3 text-slate-600">{p.email}</td>
                  <td className="px-4 py-3">
                    <select
                      value={p.securityGroup}
                      onChange={(e) => handleGroupChange(p, e.target.value as SecurityGroup)}
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
                        onClick={() => setSelected(p)}
                        title="Documents"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <FileText className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => setEditing(p)}
                        title="Edit"
                        className="rounded-md p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900"
                      >
                        <Edit className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleToggleActive(p)}
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

      {selected && (
        <UserDocuments profile={selected} onClose={() => setSelected(null)} />
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
