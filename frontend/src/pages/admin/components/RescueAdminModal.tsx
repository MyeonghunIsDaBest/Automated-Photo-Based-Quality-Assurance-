// RescueAdminModal — owner-tier dialog for the four rescue actions on
// another user: send password-reset email, set a temporary password, edit
// profile fields, grant or revoke ownership.
//
// Opened from `UsersTab` via the per-row "Rescue" button (visible only when
// `canRescueAdmin(currentProfile)` returns true). The Edge function
// `admin-rescue-user` does the actual work; this component is the dialog +
// validation + audit-friendly confirmation.
//
// Safeguards in the UI (the Edge function has matching server-side guards):
//   • "Set temp password" requires typing the target's email to confirm.
//   • Revoking ownership when the user is the last owner is disabled here
//     too (the function would 409 anyway).

import { useState } from 'react';
import { AlertTriangle, Crown, KeyRound, Mail, ShieldCheck, User } from 'lucide-react';
import { EditorialModal, EditorialButton } from '../../../components/editorial';
import { rescueUser, type RescueAction } from '../../../lib/api/admin';
import { SECURITY_GROUP_LABELS } from '../../../lib/permissions';
import type { Profile, SecurityGroup } from '../../../types';

const ASSIGNABLE_GROUPS: SecurityGroup[] = [
  'company_admin',
  'administrator',
  'construction_mgr',
  'project_manager',
  'worker',
];

interface RescueAdminModalProps {
  target: Profile;
  ownerCount: number;            // total owners in the system — drives the "last owner" guard
  onClose: () => void;
  onResolved: (next: Partial<Profile>) => void; // notify UsersTab of changes
}

type Tab = 'reset' | 'temp' | 'edit' | 'owner';

export default function RescueAdminModal({ target, ownerCount, onClose, onResolved }: RescueAdminModalProps) {
  const [tab, setTab] = useState<Tab>('reset');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Temp-password tab
  const [tempPw, setTempPw] = useState('');
  const [confirmEmail, setConfirmEmail] = useState('');

  // Edit-profile tab
  const [firstName, setFirstName] = useState(target.firstName);
  const [lastName, setLastName] = useState(target.lastName);
  const [email, setEmail] = useState(target.email);
  const [mobile, setMobile] = useState(target.mobile ?? '');
  const [securityGroup, setSecurityGroup] = useState<SecurityGroup>(target.securityGroup);

  const isLastOwner = target.isOwner && ownerCount <= 1;

  const fullName = `${target.firstName || ''} ${target.lastName || ''}`.trim() || target.email;

  const wrap = async (action: RescueAction, payload: Partial<Parameters<typeof rescueUser>[0]>) => {
    setBusy(true);
    setError(null);
    setSuccess(null);
    try {
      await rescueUser({ targetUserId: target.id, action, ...payload });
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      return false;
    } finally {
      setBusy(false);
    }
  };

  const onSendReset = async () => {
    const ok = await wrap('send_reset', {});
    if (ok) setSuccess(`Password-reset email sent to ${target.email}.`);
  };

  const onSetTempPassword = async () => {
    if (tempPw.length < 8) {
      setError('Temporary password must be at least 8 characters.');
      return;
    }
    if (confirmEmail.trim().toLowerCase() !== target.email.toLowerCase()) {
      setError('Type the user’s email to confirm.');
      return;
    }
    const ok = await wrap('set_temp_password', { tempPassword: tempPw });
    if (ok) {
      setSuccess('Temporary password set. Share it with the user via a secure channel.');
      setTempPw('');
      setConfirmEmail('');
    }
  };

  const onEditProfile = async () => {
    const patch: Record<string, string> = {};
    if (firstName !== target.firstName) patch.first_name = firstName;
    if (lastName !== target.lastName) patch.last_name = lastName;
    if (email.trim() !== target.email) patch.email = email.trim();
    if ((mobile.trim() || '') !== (target.mobile ?? '')) patch.mobile = mobile.trim();
    if (securityGroup !== target.securityGroup) patch.security_group = securityGroup;
    if (Object.keys(patch).length === 0) {
      setError('Nothing changed.');
      return;
    }
    const ok = await wrap('edit_profile', { profilePatch: patch });
    if (ok) {
      setSuccess(`Updated: ${Object.keys(patch).join(', ')}.`);
      onResolved({
        firstName: patch.first_name ?? target.firstName,
        lastName: patch.last_name ?? target.lastName,
        email: patch.email ?? target.email,
        mobile: patch.mobile ?? target.mobile,
        securityGroup: (patch.security_group as SecurityGroup) ?? target.securityGroup,
      });
    }
  };

  const onToggleOwnership = async () => {
    const next = !target.isOwner;
    if (!next && isLastOwner) {
      setError('Cannot revoke the last owner. Promote another admin first.');
      return;
    }
    const ok = await wrap('set_owner', { isOwner: next });
    if (ok) {
      setSuccess(next ? `${fullName} is now an owner.` : `Owner role revoked from ${fullName}.`);
      onResolved({ isOwner: next });
    }
  };

  return (
    <EditorialModal
      open
      onClose={onClose}
      eyebrow="Owner tools"
      title={`Rescue ${fullName}`}
      size="lg"
      footer={
        <div className="flex w-full items-center justify-between gap-3">
          {error && (
            <p className="flex items-center gap-1.5 text-xs text-[#C44545]">
              <AlertTriangle className="h-3.5 w-3.5" />
              {error}
            </p>
          )}
          {success && !error && (
            <p className="text-xs text-[#246F47]">{success}</p>
          )}
          <EditorialButton variant="ghost" onClick={onClose} disabled={busy}>
            Close
          </EditorialButton>
        </div>
      }
    >
      {/* Tab strip */}
      <div className="mb-5 flex flex-wrap gap-1.5">
        <TabPill icon={Mail}        label="Reset password"   active={tab === 'reset'} onClick={() => setTab('reset')} />
        <TabPill icon={KeyRound}    label="Temp password"    active={tab === 'temp'}  onClick={() => setTab('temp')} />
        <TabPill icon={User}        label="Edit profile"     active={tab === 'edit'}  onClick={() => setTab('edit')} />
        <TabPill icon={Crown}       label="Ownership"        active={tab === 'owner'} onClick={() => setTab('owner')} />
      </div>

      {/* Target summary */}
      <div className="mb-5 rounded-[9px] border border-[#E6E1D4] bg-[#FAF8F2] px-4 py-3 text-xs">
        <p className="font-medium text-[#1A1A1A]">{fullName}</p>
        <p className="text-[#6B6B6B]">{target.email}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <span className="rounded-full border border-[#E6E1D4] bg-white px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#6B6B6B]">
            {SECURITY_GROUP_LABELS[target.securityGroup]}
          </span>
          {target.isOwner && (
            <span className="inline-flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[10px] uppercase tracking-wider text-amber-700">
              <Crown className="h-2.5 w-2.5" /> Owner
            </span>
          )}
          {!target.isActive && (
            <span className="rounded-full border border-[#F0BFBF] bg-[#FBE5E5] px-2 py-0.5 text-[10px] uppercase tracking-wider text-[#C44545]">
              Disabled
            </span>
          )}
        </div>
      </div>

      {tab === 'reset' && (
        <div className="space-y-3">
          <p className="text-sm text-[#3A3A3A]">
            Sends Supabase&apos;s standard password-reset email to <strong>{target.email}</strong>. The user clicks the link and chooses their own new password. No temporary password leaves your hands.
          </p>
          <EditorialButton variant="pill" onClick={onSendReset} disabled={busy}>
            <Mail className="h-4 w-4" /> Send reset email
          </EditorialButton>
        </div>
      )}

      {tab === 'temp' && (
        <div className="space-y-3">
          <p className="text-sm text-[#3A3A3A]">
            Sets a temporary password you choose. Use this when the user can&apos;t access their email. Share via a secure channel and ask them to change it on next login.
          </p>
          <Field label="Temporary password (≥ 8 chars)">
            <input
              type="text"
              value={tempPw}
              onChange={(e) => setTempPw(e.target.value)}
              placeholder="e.g. TempPass2026!"
              className="h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm focus:border-[#2F8F5C] focus:outline-none"
            />
          </Field>
          <Field label={`Type "${target.email}" to confirm`}>
            <input
              type="text"
              value={confirmEmail}
              onChange={(e) => setConfirmEmail(e.target.value)}
              className="h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm focus:border-[#2F8F5C] focus:outline-none"
            />
          </Field>
          <EditorialButton variant="pill" onClick={onSetTempPassword} disabled={busy}>
            <KeyRound className="h-4 w-4" /> Set temporary password
          </EditorialButton>
        </div>
      )}

      {tab === 'edit' && (
        <div className="space-y-3">
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="First name">
              <input value={firstName} onChange={(e) => setFirstName(e.target.value)} className="h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm focus:border-[#2F8F5C] focus:outline-none" />
            </Field>
            <Field label="Last name">
              <input value={lastName} onChange={(e) => setLastName(e.target.value)} className="h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm focus:border-[#2F8F5C] focus:outline-none" />
            </Field>
          </div>
          <Field label="Email">
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm focus:border-[#2F8F5C] focus:outline-none" />
          </Field>
          <Field label="Mobile">
            <input value={mobile} onChange={(e) => setMobile(e.target.value)} className="h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm focus:border-[#2F8F5C] focus:outline-none" />
          </Field>
          <Field label="Security group">
            <select
              value={securityGroup}
              onChange={(e) => setSecurityGroup(e.target.value as SecurityGroup)}
              className="h-9 w-full rounded-md border border-[#E6E1D4] bg-white px-3 text-sm focus:border-[#2F8F5C] focus:outline-none"
            >
              {ASSIGNABLE_GROUPS.map((g) => (
                <option key={g} value={g}>{SECURITY_GROUP_LABELS[g]}</option>
              ))}
            </select>
          </Field>
          <EditorialButton variant="pill" onClick={onEditProfile} disabled={busy}>
            <ShieldCheck className="h-4 w-4" /> Save changes
          </EditorialButton>
        </div>
      )}

      {tab === 'owner' && (
        <div className="space-y-3">
          <p className="text-sm text-[#3A3A3A]">
            {target.isOwner
              ? 'Currently an owner — can rescue other admins and grant ownership.'
              : 'Not currently an owner. Promote to grant rescue + grant-ownership powers.'}
          </p>
          {isLastOwner && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <AlertTriangle className="mr-1 inline-block h-3.5 w-3.5" />
              This is the last owner. Promote another admin before you can revoke this one.
            </div>
          )}
          <EditorialButton
            variant="pill"
            onClick={onToggleOwnership}
            disabled={busy || (target.isOwner && isLastOwner)}
          >
            <Crown className="h-4 w-4" />
            {target.isOwner ? 'Revoke ownership' : 'Grant ownership'}
          </EditorialButton>
        </div>
      )}
    </EditorialModal>
  );
}

function TabPill({
  icon: Icon, label, active, onClick,
}: {
  icon: typeof Mail;
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${
        active
          ? 'border-[#1A1A1A] bg-[#1A1A1A] text-white'
          : 'border-[#E6E1D4] bg-white text-[#6B6B6B] hover:border-[#D8D2C4]'
      }`}
    >
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-[11px] font-medium text-[#3A3A3A]">{label}</label>
      {children}
    </div>
  );
}
