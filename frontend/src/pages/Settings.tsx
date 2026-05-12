import { useState } from 'react';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { User, Bell, Shield, Mail, Phone, Globe, Lock, Key, Save, Eye, EyeOff } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Badge } from '../components/ui/badge';
import { Separator } from '../components/ui/separator';
import { EditorialPageHeader } from '../components/editorial';

export default function Settings() {
  const { currentUser } = useAppStore();
  const { userSettings, updateUserSettings, updatePassword, updateEmail } = useFeatureStore();
  const [activeTab, setActiveTab] = useState<'profile' | 'security' | 'notifications'>('profile');
  
  // Profile state
  const [profileForm, setProfileForm] = useState({
    fullName: userSettings.profile.fullName,
    phone: userSettings.profile.phone || '',
    timezone: userSettings.profile.timezone,
    language: userSettings.profile.language,
  });

  // Security state
  const [securityForm, setSecurityForm] = useState({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
    email: userSettings.email,
  });
  const [showPasswords, setShowPasswords] = useState(false);
  const [securityMessage, setSecurityMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Notifications state
  const [notifications, setNotifications] = useState(userSettings.notifications);

  const handleProfileSave = () => {
    updateUserSettings({
      profile: {
        fullName: profileForm.fullName,
        phone: profileForm.phone,
        timezone: profileForm.timezone,
        language: profileForm.language,
      },
    });
    alert('Profile updated successfully!');
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
    <div className="editorial-root min-h-full bg-[#FAFAF7]">
      <EditorialPageHeader
        eyebrow="Workspace · Account"
        title="Your"
        accent="preferences"
        description="Profile, security, and the notification rules that decide which events page you."
      />

      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-8 sm:py-10">
        {/* Sidebar stacks above the panel on mobile; sits beside it on md+. */}
        <div className="flex flex-col gap-6 md:flex-row">
          {/* Sidebar */}
          <div className="md:w-64 md:flex-shrink-0">
            <Card>
              <CardContent className="p-4">
                <nav className="space-y-1">
                  {tabs.map((tab) => {
                    const Icon = tab.icon;
                    return (
                      <button
                        key={tab.id}
                        onClick={() => setActiveTab(tab.id)}
                        className={`flex w-full items-center gap-3 rounded-lg px-4 py-3 text-left text-sm font-medium transition-colors ${
                          activeTab === tab.id
                            ? 'bg-emerald-50 text-emerald-700'
                            : 'text-slate-600 hover:bg-slate-50'
                        }`}
                      >
                        <Icon className="h-5 w-5" />
                        {tab.label}
                      </button>
                    );
                  })}
                </nav>

                <Separator className="my-4" />

                {/* User Info */}
                <div className="text-center">
                  {currentUser?.avatar && (
                    <img
                      src={currentUser.avatar}
                      alt={currentUser.fullName}
                      className="mx-auto h-20 w-20 rounded-full"
                    />
                  )}
                  <p className="mt-3 font-medium text-slate-900">{currentUser?.fullName}</p>
                  <p className="text-sm text-slate-500">{currentUser?.email}</p>
                  <Badge className="mt-2" variant="default">
                    {currentUser?.role}
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Content */}
          <div className="flex-1">
            {activeTab === 'profile' && (
              <Card>
                <CardHeader>
                  <CardTitle>Profile Information</CardTitle>
                  <CardDescription>Update your personal information and preferences</CardDescription>
                </CardHeader>
                <CardContent className="space-y-6">
                  <div className="grid gap-6 sm:grid-cols-2">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        <User className="mr-2 inline h-4 w-4" />
                        Full Name
                      </label>
                      <Input
                        value={profileForm.fullName}
                        onChange={(e) => setProfileForm({ ...profileForm, fullName: e.target.value })}
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        <Mail className="mr-2 inline h-4 w-4" />
                        Email
                      </label>
                      <Input value={userSettings.email} disabled className="bg-slate-50" />
                      <p className="mt-1 text-xs text-slate-500">Change email in Security tab</p>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        <Phone className="mr-2 inline h-4 w-4" />
                        Phone Number
                      </label>
                      <Input
                        value={profileForm.phone}
                        onChange={(e) => setProfileForm({ ...profileForm, phone: e.target.value })}
                        placeholder="+1 (555) 123-4567"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        <Globe className="mr-2 inline h-4 w-4" />
                        Timezone
                      </label>
                      <select
                        value={profileForm.timezone}
                        onChange={(e) => setProfileForm({ ...profileForm, timezone: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="America/New_York">Eastern Time (ET)</option>
                        <option value="America/Chicago">Central Time (CT)</option>
                        <option value="America/Denver">Mountain Time (MT)</option>
                        <option value="America/Los_Angeles">Pacific Time (PT)</option>
                        <option value="UTC">UTC</option>
                      </select>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Language
                      </label>
                      <select
                        value={profileForm.language}
                        onChange={(e) => setProfileForm({ ...profileForm, language: e.target.value })}
                        className="flex h-10 w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none focus:ring-2 focus:ring-emerald-500/20"
                      >
                        <option value="en">English</option>
                        <option value="es">Spanish</option>
                        <option value="fr">French</option>
                      </select>
                    </div>
                  </div>

                  <div className="flex justify-end gap-3">
                    <Button variant="outline">Cancel</Button>
                    <Button onClick={handleProfileSave}>
                      <Save className="mr-2 h-4 w-4" />
                      Save Changes
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}

            {activeTab === 'security' && (
              <div className="space-y-6">
                {/* Email Update */}
                <Card>
                  <CardHeader>
                    <CardTitle>Email Address</CardTitle>
                    <CardDescription>Update your email address for account notifications</CardDescription>
                  </CardHeader>
                  <CardContent>
                    <div className="flex gap-4">
                      <Input
                        type="email"
                        value={securityForm.email}
                        onChange={(e) => setSecurityForm({ ...securityForm, email: e.target.value })}
                        className="flex-1"
                      />
                      <Button onClick={handleEmailUpdate}>
                        Update Email
                      </Button>
                    </div>
                    {securityMessage && (
                      <p className={`mt-2 text-sm ${securityMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {securityMessage.text}
                      </p>
                    )}
                  </CardContent>
                </Card>

                {/* Password Update */}
                <Card>
                  <CardHeader>
                    <CardTitle>Change Password</CardTitle>
                    <CardDescription>Ensure your account is secure with a strong password</CardDescription>
                  </CardHeader>
                  <CardContent className="space-y-4">
                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        <Lock className="mr-2 inline h-4 w-4" />
                        Current Password
                      </label>
                      <div className="relative">
                        <Input
                          type={showPasswords ? 'text' : 'password'}
                          value={securityForm.currentPassword}
                          onChange={(e) => setSecurityForm({ ...securityForm, currentPassword: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => setShowPasswords(!showPasswords)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
                        >
                          {showPasswords ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                        </button>
                      </div>
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        <Key className="mr-2 inline h-4 w-4" />
                        New Password
                      </label>
                      <Input
                        type={showPasswords ? 'text' : 'password'}
                        value={securityForm.newPassword}
                        onChange={(e) => setSecurityForm({ ...securityForm, newPassword: e.target.value })}
                        placeholder="Minimum 8 characters"
                      />
                    </div>

                    <div>
                      <label className="mb-2 block text-sm font-medium text-slate-700">
                        Confirm New Password
                      </label>
                      <Input
                        type={showPasswords ? 'text' : 'password'}
                        value={securityForm.confirmPassword}
                        onChange={(e) => setSecurityForm({ ...securityForm, confirmPassword: e.target.value })}
                        placeholder="Re-enter new password"
                      />
                    </div>

                    {securityMessage && (
                      <p className={`text-sm ${securityMessage.type === 'success' ? 'text-emerald-600' : 'text-red-600'}`}>
                        {securityMessage.text}
                      </p>
                    )}

                    <div className="flex justify-end">
                      <Button onClick={handlePasswordUpdate}>
                        <Lock className="mr-2 h-4 w-4" />
                        Update Password
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                {/* Security Tips */}
                <Card>
                  <CardHeader>
                    <CardTitle>Security Tips</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ul className="space-y-2 text-sm text-slate-600">
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500">✓</span>
                        Use a password with at least 8 characters
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500">✓</span>
                        Include a mix of letters, numbers, and symbols
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500">✓</span>
                        Don't reuse passwords from other accounts
                      </li>
                      <li className="flex items-start gap-2">
                        <span className="text-emerald-500">✓</span>
                        Change your password regularly
                      </li>
                    </ul>
                  </CardContent>
                </Card>
              </div>
            )}

            {activeTab === 'notifications' && (
              <Card>
                <CardHeader>
                  <CardTitle>Notification Preferences</CardTitle>
                  <CardDescription>Choose which notifications you want to receive</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-slate-100 p-2">
                        <Mail className="h-5 w-5 text-slate-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Email Notifications</p>
                        <p className="text-sm text-slate-500">Receive daily progress summaries via email</p>
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.emailNotifications}
                        onChange={() => handleNotificationToggle('emailNotifications')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-600 peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-red-100 p-2">
                        <Shield className="h-5 w-5 text-red-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Safety Alerts</p>
                        <p className="text-sm text-slate-500">Immediate notification for safety concerns</p>
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.safetyAlerts}
                        onChange={() => handleNotificationToggle('safetyAlerts')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-600 peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-blue-100 p-2">
                        <Bell className="h-5 w-5 text-blue-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Task Updates</p>
                        <p className="text-sm text-slate-500">Get notified when tasks are updated</p>
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.taskUpdates}
                        onChange={() => handleNotificationToggle('taskUpdates')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-600 peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-purple-100 p-2">
                        <svg className="h-5 w-5 text-purple-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 12h.01M12 12h.01M16 12h.01M21 12c0 4.418-4.03 8-9 8a9.863 9.863 0 01-4.255-.949L3 20l1.395-3.72C3.512 15.042 3 13.574 3 12c0-4.418 4.03-8 9-8s9 3.582 9 8z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Chat Messages</p>
                        <p className="text-sm text-slate-500">Receive notifications for new messages</p>
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.chatMessages}
                        onChange={() => handleNotificationToggle('chatMessages')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-600 peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-amber-100 p-2">
                        <svg className="h-5 w-5 text-amber-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">AI Analysis Alerts</p>
                        <p className="text-sm text-slate-500">Get notified when AI completes analysis</p>
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.aiAnalysis}
                        onChange={() => handleNotificationToggle('aiAnalysis')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-600 peer-checked:after:translate-x-full" />
                    </label>
                  </div>

                  <div className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center gap-3">
                      <div className="rounded-lg bg-green-100 p-2">
                        <svg className="h-5 w-5 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">Weekly Reports</p>
                        <p className="text-sm text-slate-500">Auto-generated weekly progress reports</p>
                      </div>
                    </div>
                    <label className="relative inline-flex cursor-pointer items-center">
                      <input
                        type="checkbox"
                        checked={notifications.weeklyReports}
                        onChange={() => handleNotificationToggle('weeklyReports')}
                        className="peer sr-only"
                      />
                      <div className="peer h-6 w-11 rounded-full bg-slate-200 after:absolute after:left-[2px] after:top-[2px] after:h-5 after:w-5 after:rounded-full after:bg-white after:transition-all peer-checked:bg-emerald-600 peer-checked:after:translate-x-full" />
                    </label>
                  </div>
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
