import { useState, useRef, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { uploadAvatar, updateProfile } from '../lib/api/profiles';
import { User, Bell, Shield, Mail, Phone, Globe, Lock, Key, Save, Eye, EyeOff, Camera, Loader2, Trash2, LayoutGrid, Building2 } from 'lucide-react';
import { EditorialPageHeader, PageContainer, StatStrip, StatCell } from '../components/editorial';
import { FRAUNCES, btnPrimary, btnGhost } from './gantt/components/ledger';

export default function Settings() {
  const { currentUser, currentProfile, setNotification, setCurrentAvatar } = useAppStore();
  const navigate = useNavigate();
  // The dev superuser can hop between the staff workspace and the customer portal.
  const isDev = currentProfile?.securityGroup === 'dev';
  const { userSettings, updateUserSettings, updatePassword, updateEmail } = useFeatureStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile');

  // Profile state. Prefer the real authenticated identity (currentUser) over
  // the store defaults so a live user never sees demo placeholder values.
  const [profileForm, setProfileForm] = useState({
    fullName: currentUser?.fullName || userSettings.profile.fullName,
    phone: userSettings.profile.phone || '',
    timezone: userSettings.profile.timezone,
    language: userSettings.profile.language,
  });

  // Security state
  const [securityForm, setSecurityForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    email: currentUser?.email || userSettings.email,
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notifications state
  const [notifications, setNotifications] = useState(userSettings.notifications);

  // Avatar / profile photo. Lives on the real Supabase profile (avatar_url),
  // mirrored into the store via setCurrentAvatar so the nav + directory update
  // immediately without a full refreshProfile (which is idempotent per user).
  const avatarInputRef = useRef<HTMLInputElement | null>(null);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const avatarUrl = currentUser?.avatar;
  const initials = (currentUser?.fullName || 'U')
    .split(' ')
    .map((n) => n[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

  const handleAvatarSelect = async (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // let the user re-pick the same file later
    if (!file || !currentUser) return;
    setAvatarBusy(true);
    try {
      const url = await uploadAvatar(currentUser.id, file);
      await updateProfile(currentUser.id, { avatarUrl: url });
      setCurrentAvatar(url);
      setNotification({ message: 'Profile photo updated!', type: 'success' });
    } catch (err) {
      setNotification({
        message: err instanceof Error ? err.message : 'Could not upload photo.',
        type: 'error',
      });
    } finally {
      setAvatarBusy(false);
    }
  };

  const handleAvatarRemove = async () => {
    if (!currentUser) return;
    setAvatarBusy(true);
    try {
      await updateProfile(currentUser.id, { avatarUrl: null });
      setCurrentAvatar(null);
      setNotification({ message: 'Profile photo removed.', type: 'success' });
    } catch (err) {
      setNotification({
        message: err instanceof Error ? err.message : 'Could not remove photo.',
        type: 'error',
      });
    } finally {
      setAvatarBusy(false);
    }
  };

  // At-a-glance account metrics for the header stat strip — all derived from
  // data already in scope (no new queries). Profile completion counts the
  // filled identity fields; notifications shows enabled / total.
  const profileFields = [
    profileForm.fullName, profileForm.phone, profileForm.timezone,
    profileForm.language, userSettings.email,
  ];
  const profilePct = Math.round(
    (profileFields.filter((v) => (v ?? '').toString().trim().length > 0).length / profileFields.length) * 100,
  );
  const notifsTotal = Object.keys(notifications).length;
  const notifsOn = Object.values(notifications).filter(Boolean).length;
  const TZ_LABEL: Record<string, string> = {
    'America/New_York': 'ET', 'America/Chicago': 'CT', 'America/Denver': 'MT',
    'America/Los_Angeles': 'PT', UTC: 'UTC',
  };
  const tzLabel = TZ_LABEL[profileForm.timezone] ?? (profileForm.timezone.split('/').pop() ?? '—');

  const handleProfileSave = () => {
    updateUserSettings({
      profile: {
        fullName: profileForm.fullName,
        phone: profileForm.phone,
        timezone: profileForm.timezone,
        language: profileForm.language,
      },
    });
    setNotification({ message: 'Profile updated successfully!', type: 'success' });
  };

  const handleEmailUpdate = async () => {
    setSecurityMessage(null);
    const result = await updateEmail(securityForm.email);
    if (result.success) {
      setSecurityMessage({ type: 'success', text: 'Email updated successfully!' });
    } else {
      setSecurityMessage({ type: 'error', text: result.error || 'Failed to update email' });
    }
  };

  const handlePasswordUpdate = async () => {
    setSecurityMessage(null);

    if (securityForm.newPassword !== securityForm.confirmPassword) {
      setSecurityMessage({ type: 'error', text: 'New passwords do not match' });
      return;
    }

    const result = await updatePassword(securityForm.currentPassword, securityForm.newPassword);
    if (result.success) {
      setSecurityMessage({ type: 'success', text: 'Password updated successfully!' });
      setSecurityForm({ ...securityForm, currentPassword: '', newPassword: '', confirmPassword: '' });
    } else {
      setSecurityMessage({ type: 'error', text: result.error || 'Failed to update password' });
    }
  };

  const handleNotificationToggle = (key: keyof typeof notifications) => {
    const updated = { ...notifications, [key]: !notifications[key] };
    setNotifications(updated);
    updateUserSettings({ notifications: updated });
  };

  const tabs = [
    { id: 'profile' as const, label: 'Profile', icon: User },
    { id: 'security' as const, label: 'Security', icon: Shield },
    { id: 'notifications' as const, label: 'Notifications', icon: Bell },
  ];

  return (
    <div className="editorial-root min-h-full bg-[#FAF8F2]">
      <EditorialPageHeader
        eyebrow="Workspace · Account"
        title="Your"
        accent="preferences"
        description="Profile, security, and the notification rules that decide which events page you."
      />

      <PageContainer className="space-y-6">
        {/* At-a-glance account health. */}
        <StatStrip>
          <StatCell label="Profile" value={`${profilePct}%`} caption="Complete" accent="emerald" />
          <StatCell label="Notifications" value={`${notifsOn}/${notifsTotal}`} caption="Enabled" accent="blue" />
          <StatCell label="Safety alerts" value={notifications.safetyAlerts ? 'On' : 'Off'} caption="Immediate pages" accent={notifications.safetyAlerts ? 'emerald' : 'rose'} />
          <StatCell label="Timezone" value={tzLabel} caption="Local time" accent="slate" />
        </StatStrip>

        {/* Dev-only — switch between the staff workspace and the customer portal. */}
        {isDev && (
          <div className="rounded-[14px] border border-[#E6E1D4] bg-white p-5 shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
            <div className="flex items-center gap-2">
              <span className="rounded-full bg-[#1A1A1A] px-2 py-0.5 text-[10px] font-bold uppercase tracking-[0.12em] text-white">Dev</span>
              <h2 className="text-[15px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Switch view</h2>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-[#6B6B6B]">
              You're a dev superuser — jump between the staff workspace and the customer portal to test both.
            </p>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" onClick={() => navigate('/dashboard')} className={btnPrimary}>
                <LayoutGrid className="h-4 w-4" />
                Staff dashboard
              </button>
              <button type="button" onClick={() => navigate('/customer')} className={btnGhost}>
                <Building2 className="h-4 w-4" />
                Customer portal
              </button>
            </div>
          </div>
        )}

        {/* Sidebar stacks above the panel on mobile; sits beside it on md+. */}
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Sidebar */}
          <div className="md:w-64 md:shrink-0">
            <div className="rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
              <div className="p-4">
                <nav className="space-y-1">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex w-full items-center gap-3 rounded-[9px] px-4 py-3 text-left text-sm font-medium transition-colors ${
                          activeTab === tab.id
                            ? 'bg-[#E5F2EA] text-[#246F47]'
                            : 'text-[#6B6B6B] hover:bg-[#FAF8F2]'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>

                <div className="my-4 h-px bg-[#E6E1D4]" />

                {/* User Info */}
                <div className="text-center">
                  {avatarUrl ? (
                    <img
                      src={avatarUrl}
                      alt={currentUser?.fullName || 'Profile photo'}
                      className="mx-auto h-20 w-20 rounded-full border-2 border-[#E6E1D4] object-cover"
                    />
                  ) : (
                    <div
                      className="mx-auto grid h-20 w-20 place-items-center rounded-full border-2 border-[#E6E1D4] bg-[#E5F2EA] text-2xl font-semibold text-[#246F47]"
                      style={{ fontFamily: FRAUNCES }}
                    >
                      {initials}
                    </div>
                  )}
                  <p className="mt-3 font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>{currentUser?.fullName}</p>
                  <p className="text-sm text-[#6B6B6B]">{currentUser?.email}</p>
                  <span className="mt-2 inline-flex items-center rounded-full bg-[#E5F2EA] px-2.5 py-0.5 text-xs font-medium text-[#246F47]">
                    {currentUser?.role}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Content */}
          <div className="flex-1">
            {activeTab === 'profile' && (
              <div className="rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                <div className="border-b border-[#EFEBE0] px-6 py-4">
                  <h3 className="text-base font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Profile Information</h3>
                  <p className="mt-0.5 text-sm text-[#6B6B6B]">Update your personal information and preferences</p>
                </div>
                <div className="p-6 space-y-6">
                  {/* Profile photo */}
                  <div className="flex flex-col gap-4 border-b border-[#EFEBE0] pb-6 sm:flex-row sm:items-center">
                    <div className="relative h-20 w-20 shrink-0">
                      {avatarUrl ? (
                        <img
                          src={avatarUrl}
                          alt={currentUser?.fullName || 'Profile photo'}
                          className="h-20 w-20 rounded-full border border-[#E6E1D4] object-cover"
                        />
                      ) : (
                        <div
                          className="grid h-20 w-20 place-items-center rounded-full bg-[#E5F2EA] text-2xl font-semibold text-[#246F47]"
                          style={{ fontFamily: FRAUNCES }}
                        >
                          {initials}
                        </div>
                      )}
                      {avatarBusy && (
                        <div className="absolute inset-0 grid place-items-center rounded-full bg-black/40">
                          <Loader2 className="h-6 w-6 animate-spin text-white" />
                        </div>
                      )}
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-[#1A1A1A]">Profile photo</p>
                      <p className="mt-0.5 text-xs text-[#6B6B6B]">JPG, PNG, GIF, or WebP — up to 5 MB.</p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        <button
                          type="button"
                          onClick={() => avatarInputRef.current?.click()}
                          disabled={avatarBusy}
                          className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#246F47] disabled:opacity-60"
                        >
                          <Camera className="h-4 w-4" />
                          {avatarUrl ? 'Change photo' : 'Upload photo'}
                        </button>
                        {avatarUrl && (
                          <button
                            type="button"
                            onClick={handleAvatarRemove}
                            disabled={avatarBusy}
                            className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-4 py-2 text-sm font-medium text-[#C44545] transition-colors hover:bg-[#FBE5E5] disabled:opacity-60"
                          >
                            <Trash2 className="h-4 w-4" />
                            Remove
                          </button>
                        )}
                      </div>
                    </div>
                    <input
                      ref={avatarInputRef}
                      type="file"
                      accept="image/*"
                      onChange={handleAvatarSelect}
                      className="hidden"
                    />
                  </div>

                  <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#3A3A3A]">
                        <User className="mr-2 inline h-4 w-4" />
                        Full Name
                      </label>
                      <input
                        value={profileForm.fullName}
                        onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-[#E6E1D4] bg-white px-3 py-2 text-base text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#3A3A3A]">
                        <Mail className="mr-2 inline h-4 w-4" />
                        Email
                      </label>
                      <input
                        value={userSettings.email}
                        disabled
                        className="flex h-10 w-full rounded-lg border border-[#E6E1D4] bg-[#FAF8F2] px-3 py-2 text-base text-[#6B6B6B] cursor-not-allowed sm:text-sm"
                      />
                      <p className="mt-1 text-xs text-[#6B6B6B]">Change email in Security tab</p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#3A3A3A]">
                        <Phone className="mr-2 inline h-4 w-4" />
                        Phone Number
                      </label>
                      <input
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="+1 (555) 123-4567"
                        className="flex h-10 w-full rounded-lg border border-[#E6E1D4] bg-white px-3 py-2 text-base text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#3A3A3A]">
                        <Globe className="mr-2 inline h-4 w-4" />
                        Timezone
                      </label>
                      <select
                        value={profileForm.timezone}
                        onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-[#E6E1D4] bg-white px-3 py-2 text-base text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                      >
                        <option value="America/New_York">Eastern Time (ET)</option>
                        <option value="America/Chicago">Central Time (CT)</option>
                        <option value="America/Denver">Mountain Time (MT)</option>
                        <option value="America/Los_Angeles">Pacific Time (PT)</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#3A3A3A]">
                        Language
                      </label>
                      <select
                        value={profileForm.language}
                        onChange={(e) => setProfileForm({ ...profileForm, language: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-[#E6E1D4] bg-white px-3 py-2 text-base text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <button
                      type="button"
                      className="inline-flex items-center gap-1.5 rounded-full border border-[#E6E1D4] bg-white px-4 py-2 text-sm font-medium text-[#3A3A3A] transition-colors hover:bg-[#FAF8F2]"
                    >
                      Cancel
                    </button>
                    <button
                      type="button"
                      onClick={handleProfileSave}
                      className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#246F47]"
                    >
                      <Save className="h-4 w-4" />
                      Save Changes
                    </button>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                {/* Email Update */}
                <div className="rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                  <div className="border-b border-[#EFEBE0] px-6 py-4">
                    <h3 className="text-base font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Email Address</h3>
                    <p className="mt-0.5 text-sm text-[#6B6B6B]">Update your email address for account notifications</p>
                  </div>
                  <div className="p-6">
                    <div className="flex flex-col gap-3 sm:flex-row sm:gap-4">
                      <input
                        type="email"
                        value={securityForm.email}
                        onChange={(e) => setSecurityForm({ ...securityForm, email: e.target.value })}
                        autoComplete="email"
                        className="flex h-10 flex-1 rounded-lg border border-[#E6E1D4] bg-white px-3 py-2 text-base text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                      />
                      <button
                        type="button"
                        onClick={handleEmailUpdate}
                        className="inline-flex min-h-11 items-center justify-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#246F47] sm:min-h-0"
                      >
                        Update Email
                      </button>
                    </div>
                    {securityMessage && (
                      <p className={`mt-2 text-sm ${securityMessage.type === 'success' ? 'text-[#246F47]' : 'text-[#C44545]'}`}>
                        {securityMessage.text}
                      </p>
                    )}
                  </div>
                </div>

                {/* Password Update */}
                <div className="rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                  <div className="border-b border-[#EFEBE0] px-6 py-4">
                    <h3 className="text-base font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Change Password</h3>
                    <p className="mt-0.5 text-sm text-[#6B6B6B]">Ensure your account is secure with a strong password</p>
                  </div>
                  <div className="p-6 space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#3A3A3A]">
                        <Lock className="mr-2 inline h-4 w-4" />
                        Current Password
                      </label>
                      <div className="relative">
                        <input
                          type={showPasswords ? 'text' : 'password'}
                          value={securityForm.currentPassword}
                          onChange={(e) => setSecurityForm({ ...securityForm, currentPassword: e.target.value })}
                          autoComplete="current-password"
                          className="flex h-10 w-full rounded-lg border border-[#E6E1D4] bg-white px-3 py-2 text-base text-[#1A1A1A] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(!showPasswords)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-[#A0A0A0] hover:text-[#6B6B6B]"
                        >
                          {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#3A3A3A]">
                        <Key className="mr-2 inline h-4 w-4" />
                        New Password
                      </label>
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={securityForm.newPassword}
                        onChange={(e) => setSecurityForm({ ...securityForm, newPassword: e.target.value })}
                        autoComplete="new-password"
                        placeholder="Minimum 8 characters"
                        className="flex h-10 w-full rounded-lg border border-[#E6E1D4] bg-white px-3 py-2 text-base text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-[#3A3A3A]">
                        Confirm New Password
                      </label>
                      <input
                        type={showPasswords ? 'text' : 'password'}
                        value={securityForm.confirmPassword}
                        onChange={(e) => setSecurityForm({ ...securityForm, confirmPassword: e.target.value })}
                        autoComplete="new-password"
                        placeholder="Re-enter new password"
                        className="flex h-10 w-full rounded-lg border border-[#E6E1D4] bg-white px-3 py-2 text-base text-[#1A1A1A] placeholder:text-[#A0A0A0] focus:border-[#2F8F5C] focus:outline-none focus:ring-1 focus:ring-[#2F8F5C] sm:text-sm"
                      />
                    </div>

                    {securityMessage && (
                      <p className={`text-sm ${securityMessage.type === 'success' ? 'text-[#246F47]' : 'text-[#C44545]'}`}>
                        {securityMessage.text}
                      </p>
                    )}

                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handlePasswordUpdate}
                        className="inline-flex items-center gap-1.5 rounded-full bg-[#2F8F5C] px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-[#246F47]"
                      >
                        <Lock className="h-4 w-4" />
                        Update Password
                      </button>
                    </div>
                  </div>
                </div>

                {/* Security Tips */}
                <div className="rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                  <div className="border-b border-[#EFEBE0] px-6 py-4">
                    <h3 className="text-base font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Security Tips</h3>
                  </div>
                  <div className="p-6">
                    <ul className="space-y-2 text-sm text-[#3A3A3A]">
                      <li className="flex items-start gap-2">
                        <span className="text-[#2F8F5C]">✓</span>
                        Use a password with at least 8 characters
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#2F8F5C]">✓</span>
                        Include a mix of letters, numbers, and symbols
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#2F8F5C]">✓</span>
                        Don't reuse passwords from other accounts
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-[#2F8F5C]">✓</span>
                        Change your password regularly
                      </li>
                    </ul>
                  </div>
                </div>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="rounded-[14px] border border-[#E6E1D4] bg-white shadow-[0_1px_2px_rgba(20,20,20,0.04)]">
                <div className="border-b border-[#EFEBE0] px-6 py-4">
                  <h3 className="text-base font-semibold text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>Notification Preferences</h3>
                  <p className="mt-0.5 text-sm text-[#6B6B6B]">Choose which notifications you want to receive</p>
                </div>
                <div className="p-6 grid gap-3 sm:grid-cols-2">
                  <div className="flex items-center justify-between gap-3 rounded-[11px] border border-[#E6E1D4] p-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="shrink-0 rounded-[9px] bg-[#FAF8F2] p-2 border border-[#E6E1D4]">
                        <Mail className="h-5 w-5 text-[#6B6B6B]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#1A1A1A]">Email Notifications</p>
                        <p className="text-sm text-[#6B6B6B]">Receive daily progress summaries via email</p>
                      </div>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.emailNotifications}
                        onChange={() => handleNotificationToggle('emailNotifications')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-[#E6E1D4] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#2F8F5C] peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-[11px] border border-[#E6E1D4] p-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="shrink-0 rounded-[9px] bg-[#FBE5E5] p-2 border border-[#F0BFBF]">
                        <Shield className="h-5 w-5 text-[#C44545]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#1A1A1A]">Safety Alerts</p>
                        <p className="text-sm text-[#6B6B6B]">Immediate notification for safety concerns</p>
                      </div>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.safetyAlerts}
                        onChange={() => handleNotificationToggle('safetyAlerts')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-[#E6E1D4] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#2F8F5C] peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-[11px] border border-[#E6E1D4] p-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="shrink-0 rounded-[9px] bg-[#EEF1F4] p-2 border border-[#D8D2C4]">
                        <Bell className="h-5 w-5 text-[#5B6B7B]" />
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#1A1A1A]">Task Updates</p>
                        <p className="text-sm text-[#6B6B6B]">Get notified when tasks are updated</p>
                      </div>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.taskUpdates}
                        onChange={() => handleNotificationToggle('taskUpdates')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-[#E6E1D4] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#2F8F5C] peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-[11px] border border-[#E6E1D4] p-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="shrink-0 rounded-[9px] bg-[#F0EDE4] p-2 border border-[#E6E1D4]">
                        <svg className="h-5 w-5 text-[#3A3A3A]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#1A1A1A]">Chat Messages</p>
                        <p className="text-sm text-[#6B6B6B]">Receive notifications for new messages</p>
                      </div>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.chatMessages}
                        onChange={() => handleNotificationToggle('chatMessages')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-[#E6E1D4] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#2F8F5C] peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-[11px] border border-[#E6E1D4] p-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="shrink-0 rounded-[9px] bg-[#F9EFD9] p-2 border border-[#F0D5A0]">
                        <svg className="h-5 w-5 text-[#C8841E]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#1A1A1A]">AI Analysis Alerts</p>
                        <p className="text-sm text-[#6B6B6B]">Get notified when AI completes analysis</p>
                      </div>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.aiAnalysis}
                        onChange={() => handleNotificationToggle('aiAnalysis')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-[#E6E1D4] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#2F8F5C] peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between gap-3 rounded-[11px] border border-[#E6E1D4] p-4">
                    <div className="flex min-w-0 flex-1 items-center gap-3">
                      <div className="shrink-0 rounded-[9px] bg-[#E5F2EA] p-2 border border-[#A8D0B8]">
                        <svg className="h-5 w-5 text-[#246F47]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div className="min-w-0">
                        <p className="font-medium text-[#1A1A1A]">Weekly Reports</p>
                        <p className="text-sm text-[#6B6B6B]">Auto-generated weekly progress reports</p>
                      </div>
                    </div>
                    <label className="relative inline-flex shrink-0 cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.weeklyReports}
                        onChange={() => handleNotificationToggle('weeklyReports')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-[#E6E1D4] after:absolute after:left-0.5 after:top-0.5 after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-[#2F8F5C] peer-checked:after:translate-x-full" />
                    </label>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      </PageContainer>
    </div>
  );
}
