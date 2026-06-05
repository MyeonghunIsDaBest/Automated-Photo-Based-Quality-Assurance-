import { useState } from 'react';
import { updateProfile } from '../../../lib/api/profiles';
import { adminCreateUser } from '../../../lib/api/admin';
import { SECURITY_GROUP_LABELS, canAssignSecurityGroup } from '../../../lib/permissions';
import { useAppStore } from '../../../store';
import type { Profile, SecurityGroup } from '../../../types';
import { EditorialButton, EditorialModal } from '../../../components/editorial';

interface Props {
  mode: 'create' | 'edit';
  profile: Profile | null;
  onClose: () => void;
  onSaved: () => void;
}

// Assignable roles. `administrator` is deprecated (consolidated into
// company_admin) and `dev` is a hidden superuser — neither is offered here.
const SECURITY_GROUPS: SecurityGroup[] = [
  'company_admin',
  'construction_mgr',
  'project_manager',
  'worker',
  'stakeholder',
  'supplier',
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
        // Server-side via the admin-create-user edge function. We deliberately
        // do NOT call the public auth.signUp here — that auto-signs the new
        // user in and replaces the admin's session in the same browser
        // context. The edge function uses the service role key on the server,
        // so the caller's session is never touched.
        await adminCreateUser({
          email,
          password,
          firstName,
          lastName,
          securityGroup,
          mobile: mobile || null,
          emergencyContactName: emergencyContactName || null,
          emergencyContactEmail: emergencyContactEmail || null,
          emergencyContactMobile: emergencyContactMobile || null,
        });
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
    <EditorialModal
      open
      onClose={onClose}
      eyebrow="Section · Users"
      title={mode === 'create' ? 'Add user' : 'Edit user'}
      size="lg"
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <EditorialButton type="button" variant="ghost" trailingIcon="none" onClick={onClose}>
            Cancel
          </EditorialButton>
          <EditorialButton
            type="submit"
            variant="pill"
            trailingIcon="none"
            form="user-form"
            disabled={saving}
          >
            {saving ? 'Saving…' : mode === 'create' ? 'Create user' : 'Save changes'}
          </EditorialButton>
        </div>
      }
    >
      <form id="user-form" onSubmit={handleSave} className="space-y-6">
        <section>
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]">
            Account
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="First name" required>
              <input
                type="text"
                required
                value={firstName}
                onChange={(e) => setFirstName(e.target.value)}
                className="editorial-input"
              />
            </Field>
            <Field label="Last name" required>
              <input
                type="text"
                required
                value={lastName}
                onChange={(e) => setLastName(e.target.value)}
                className="editorial-input"
              />
            </Field>
            <Field label="Email" required>
              <input
                type="email"
                required
                disabled={mode === 'edit'}
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="editorial-input"
              />
            </Field>
            <Field label="Mobile">
              <input
                type="tel"
                value={mobile}
                onChange={(e) => setMobile(e.target.value)}
                className="editorial-input"
              />
            </Field>
            {mode === 'create' && (
              <Field label="Initial password" required className="sm:col-span-2">
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="editorial-input"
                />
              </Field>
            )}
            <Field label="Security group" className="sm:col-span-2">
              <select
                value={securityGroup}
                onChange={(e) => setSecurityGroup(e.target.value as SecurityGroup)}
                className="editorial-input"
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
          <h3 className="mb-3 text-[11px] font-semibold uppercase tracking-[0.18em] text-[#6B6B6B]">
            Emergency contact
          </h3>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Contact name" className="sm:col-span-2">
              <input
                type="text"
                value={emergencyContactName}
                onChange={(e) => setEmergencyContactName(e.target.value)}
                className="editorial-input"
              />
            </Field>
            <Field label="Contact email">
              <input
                type="email"
                value={emergencyContactEmail}
                onChange={(e) => setEmergencyContactEmail(e.target.value)}
                className="editorial-input"
              />
            </Field>
            <Field label="Contact mobile">
              <input
                type="tel"
                value={emergencyContactMobile}
                onChange={(e) => setEmergencyContactMobile(e.target.value)}
                className="editorial-input"
              />
            </Field>
          </div>
        </section>

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
            {error}
          </div>
        )}
      </form>
    </EditorialModal>
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
      <span className="text-xs font-medium text-[#3A3A3A]">
        {label}
        {required && <span className="ml-0.5 text-red-500">*</span>}
      </span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
