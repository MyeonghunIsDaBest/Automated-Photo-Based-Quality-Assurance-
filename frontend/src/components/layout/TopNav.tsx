import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store';
import { useNotificationStore } from '../../store/notifications';
import { 
  LayoutDashboard, FolderOpen, FileText, MessageSquare, 
  DollarSign, Search, Bell, Settings, LogOut, Building2,
  Menu, X, Shield, MessageCircle, TrendingUp, FileCheck
} from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Input } from '../ui/input';
import { Badge } from '../ui/badge';
import { ScrollArea } from '../ui/scroll-area';
import { format } from 'date-fns';

const navItems = [
  { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
  { label: 'Projects', icon: FolderOpen, path: '/gantt' },
  { label: 'Files', icon: FileText, path: '/files' },
  { label: 'Messages', icon: MessageSquare, path: '/messages' },
  { label: 'Reports', icon: DollarSign, path: '/reports' },
];

const getNotificationIcon = (type: string) => {
  switch (type) {
    case 'safety_alert': return Shield;
    case 'task_update': return TrendingUp;
    case 'chat_message': return MessageCircle;
    case 'ai_analysis': return Building2;
    case 'weekly_report': return FileCheck;
    default: return Bell;
  }
};

const getNotificationColor = (type: string) => {
  switch (type) {
    case 'safety_alert': return 'bg-red-100 text-red-600';
    case 'task_update': return 'bg-blue-100 text-blue-600';
    case 'chat_message': return 'bg-purple-100 text-purple-600';
    case 'ai_analysis': return 'bg-amber-100 text-amber-600';
    case 'weekly_report': return 'bg-green-100 text-green-600';
    default: return 'bg-slate-100 text-slate-600';
  }
};

export default function TopNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, logout, project, dashboardStats } = useAppStore();
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotificationStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [notificationsOpen, setNotificationsOpen] = useState(false);

  if (!currentUser) return null;

  return (
    <>
      {/* Top Navigation Bar */}
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur">
        <div className="flex h-16 items-center justify-between px-6">
          {/* Left Section */}
          <div className="flex items-center gap-6">
            {/* Logo */}
            <Link to="/dashboard" className="flex items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-emerald-600">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="text-lg font-bold text-slate-900">SiteProof</span>
            </Link>

            {/* Navigation */}
            <nav className="hidden md:flex items-center gap-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    className={`flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                      isActive
                        ? 'bg-slate-100 text-emerald-600'
                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900'
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* Right Section */}
          <div className="flex items-center gap-4">
            {/* Search */}
            <div className="hidden lg:block relative">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                type="text"
                placeholder="Search..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-64 pl-10"
              />
            </div>

            {/* Notifications */}
            <div className="relative">
              <button
                onClick={() => setNotificationsOpen(!notificationsOpen)}
                className="relative rounded-lg p-2 text-slate-500 hover:bg-slate-100"
              >
                <Bell className="h-5 w-5" />
                {unreadCount > 0 && (
                  <span className="absolute -right-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-500 text-xs text-white">
                    {unreadCount}
                  </span>
                )}
              </button>

              {/* Notifications Dropdown */}
              {notificationsOpen && (
                <>
                  <div
                    className="fixed inset-0 z-40"
                    onClick={() => setNotificationsOpen(false)}
                  />
                  <div className="absolute right-0 mt-2 w-96 rounded-xl border border-slate-200 bg-white shadow-lg z-50">
                    <div className="flex items-center justify-between border-b border-slate-200 p-4">
                      <h3 className="font-semibold text-slate-900">Notifications</h3>
                      {unreadCount > 0 && (
                        <button
                          onClick={() => {
                            markAllAsRead();
                            setNotificationsOpen(false);
                          }}
                          className="text-sm text-emerald-600 hover:text-emerald-700"
                        >
                          Mark all read
                        </button>
                      )}
                    </div>
                    
                    <ScrollArea className="h-96">
                      {notifications.length === 0 ? (
                        <div className="p-8 text-center">
                          <Bell className="mx-auto h-12 w-12 text-slate-300" />
                          <p className="mt-3 text-sm text-slate-500">No notifications yet</p>
                        </div>
                      ) : (
                        <div className="divide-y divide-slate-100">
                          {notifications.map((notification) => {
                            const Icon = getNotificationIcon(notification.type);
                            const colorClass = getNotificationColor(notification.type);
                            
                            return (
                              <button
                                key={notification.id}
                                onClick={() => {
                                  markAsRead(notification.id);
                                  setNotificationsOpen(false);
                                }}
                                className={`flex w-full items-start gap-3 p-4 text-left transition-colors hover:bg-slate-50 ${
                                  !notification.read ? 'bg-slate-50' : ''
                                }`}
                              >
                                <div className={`rounded-lg p-2 ${colorClass}`}>
                                  <Icon className="h-5 w-5" />
                                </div>
                                <div className="flex-1">
                                  <p className="text-sm font-medium text-slate-900">
                                    {notification.title}
                                  </p>
                                  <p className="mt-1 text-sm text-slate-600">
                                    {notification.message}
                                  </p>
                                  <p className="mt-2 text-xs text-slate-400">
                                    {format(new Date(notification.createdAt), 'MMM d, h:mm a')}
                                  </p>
                                </div>
                                {!notification.read && (
                                  <div className="h-2 w-2 rounded-full bg-emerald-500" />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </ScrollArea>
                    
                    <div className="border-t border-slate-200 p-4">
                      <button
                        onClick={() => navigate('/dashboard')}
                        className="w-full text-center text-sm font-medium text-emerald-600 hover:text-emerald-700"
                      >
                        View all notifications
                      </button>
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Settings */}
            <button 
              onClick={() => navigate('/settings')}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              <Settings className="h-5 w-5" />
            </button>

            {/* User Menu */}
            <div className="flex items-center gap-3 border-l border-slate-200 pl-4">
              <Avatar className="h-8 w-8">
                <AvatarImage src={currentUser.avatar} />
                <AvatarFallback>
                  {currentUser.fullName.split(' ').map(n => n[0]).join('')}
                </AvatarFallback>
              </Avatar>
              <div className="hidden lg:block">
                <p className="text-sm font-medium text-slate-900">{currentUser.fullName}</p>
                <p className="text-xs text-slate-500 capitalize">{currentUser.role}</p>
              </div>
              <button
                onClick={logout}
                className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
                title="Logout"
              >
                <LogOut className="h-4 w-4" />
              </button>
            </div>

            {/* Mobile Menu Button */}
            <button
              onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
              className="md:hidden rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="border-t border-slate-200 bg-white md:hidden">
            <nav className="space-y-1 p-4">
              {navItems.map((item) => {
                const Icon = item.icon;
                const isActive = location.pathname === item.path;
                return (
                  <Link
                    key={item.path}
                    to={item.path}
                    onClick={() => setMobileMenuOpen(false)}
                    className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium ${
                      isActive
                        ? 'bg-slate-100 text-emerald-600'
                        : 'text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Icon className="h-5 w-5" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          </div>
        )}
      </header>

      {/* Subheader with Project Info */}
      <div className="border-b border-slate-200 bg-slate-50/50 px-6 py-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm font-medium text-slate-900">{project.name}</p>
            <p className="text-xs text-slate-500">{project.clientName}</p>
          </div>
          <div className="flex items-center gap-2">
            <Badge variant="default">Active</Badge>
            <Badge variant="blue">{dashboardStats.overallProgress}% Complete</Badge>
          </div>
        </div>
      </div>
    </>
  );
}
