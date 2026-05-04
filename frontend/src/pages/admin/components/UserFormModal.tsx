import { useState } from 'react';
import { X } from 'lucide-react';
import { updateProfile } from '../../../lib/api/profiles';
import { signUp } from '../../../lib/api/auth';
import { SECURITY_GROUP_LABELS, canAssignSecurityGroup } from '../../../lib/permissions';
import { useAppStore } from '../../../store';
import type { Profile, SecurityGroup } from '../../../types';

interface Props {
  mode: 'create' | 'edit';
  profile: Profile | null;
  onClose: () => void;
  onSaved: () => void;
}

const SECURITY_GROUPS: SecurityGroup[] = [
  'company_admin',
  'administrator',
  'construction_mgr',
  'project_manager',
  'site_manager',
  'worker',
];

export default function UserFormModal({ mode, profile, onClose, onSaved }: Props) {
  const { currentProfile } = useAppStore();
  const [email, setEmail] = useState(profile?.email ?? '');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState(profile?.firstName ?? '');
  const [lastName, setLastName] = useState(profile?.lastName ?? '');
  const [mobile, setMobile] = useState(profile?.mobile ?? '');
  const [emergencyContactName, setEmergencyContactName] = useState(
    profile?.emergencyContactName ?? '',
  );
  const [emergencyContactEmail, setEmergencyContactEmail] = useState(
    profile?.emergencyContactEmail ?? '',
  );
  const [emergencyContactMobile, setEmergencyContactMobile] = useState(
    profile?.emergencyContactMobile ?? '',
  );
  const [securityGroup, setSecurityGroup] = useState<SecurityGroup>(
    profile?.securityGroup ?? 'worker',
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (mode === 'create') {
        await signUp(email, password, firstName, lastName);
        // Note: the auth.users → profiles trigger creates the row at default
        // 'worker'. If the admin picked a different group + has permission,
        // promote it now. We can't update by email server-side without a
        // round-trip; UsersTab refreshes after onSaved and shows the new row.
        // The admin can then change the group inline via the table dropdown.
      } else if (profile) {
        await updateProfile(profile.id, {
          firstName,
          lastName,
          mobile: mobile || null,
          emergencyContactName: emergencyContactName || null,
          emergencyContactEmail: emergencyContactEmail || null,
          emergencyContactMobile: emergencyContactMobile || null,
          securityGroup,
        });
      }
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save user.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-2 sm:p-4">
      <div className="flex h-full max-h-[95vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-2xl sm:h-auto sm:max-h-[90vh]">
        <div className="flex flex-shrink-0 items-center justify-between border-b border-slate-200 px-4 py-3 sm:px-6 sm:py-4">
          <h2 className="text-lg font-semibold text-slate-900">
            {mode === 'create' ? 'Add User' : 'Edit User'}
          </h2>
          <button
            onClick={onClose}
            aria-label="Close"
            className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-md text-slate-500 hover:bg-slate-100 hover:text-slate-900 active:bg-slate-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSave} className="min-h-0 flex-1 space-y-6 overflow-y-auto p-4 sm:p-6">
          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Account
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First Name" required>
                <input
                  type="text"
                  required
                  value={firstName}
                  onChange={(e) => setFirstName(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Last Name" required>
                <input
                  type="text"
                  required
                  value={lastName}
                  onChange={(e) => setLastName(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Email" required>
                <input
                  type="email"
                  required
                  disabled={mode === 'edit'}
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input disabled:bg-slate-50 disabled:text-slate-500"
                />
              </Field>
              <Field label="Mobile">
                <input
                  type="tel"
                  value={mobile}
                  onChange={(e) => setMobile(e.target.value)}
                  className="input"
                />
              </Field>
              {mode === 'create' && (
                <Field label="Initial Password" required className="col-span-2">
                  <input
                    type="password"
                    required
                    minLength={6}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="input"
                  />
                </Field>
              )}
              <Field label="Security Group" className="col-span-2">
                <select
                  value={securityGroup}
                  onChange={(e) => setSecurityGroup(e.target.value as SecurityGroup)}
                  className="input"
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
              </Field>
            </div>
          </section>

          <section>
            <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-slate-500">
              Emergency Contact
            </h3>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="Contact Name" className="sm:col-span-2">
                <input
                  type="text"
                  value={emergencyContactName}
                  onChange={(e) => setEmergencyContactName(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Contact Email">
                <input
                  type="email"
                  value={emergencyContactEmail}
                  onChange={(e) => setEmergencyContactEmail(e.target.value)}
                  className="input"
                />
              </Field>
              <Field label="Contact Mobile">
                <input
                  type="tel"
                  value={emergencyContactMobile}
                  onChange={(e) => setEmergencyContactMobile(e.target.value)}
                  className="input"
                />
              </Field>
            </div>
          </section>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50"
            >
              {saving ? 'Saving…' : mode === 'create' ? 'Create User' : 'Save Changes'}
            </button>
          </div>
        </form>

        <style>{`
          .input {
            display: block;
            width: 100%;
            border-radius: 0.5rem;
            border: 1px solid rgb(203 213 225);
            padding: 0.5rem 0.75rem;
            font-size: 0.875rem;
            outline: none;
          }
          .input:focus { border-color: rgb(15 23 42); }
        `}</style>
      </div>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <label className={`block ${className ?? ''}`}>
      <span className="text-xs font-medium text-slate-600">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
