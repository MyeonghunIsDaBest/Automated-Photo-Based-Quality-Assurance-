import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { useDashboardStats, useActiveJobs, useUpcomingTasks } from '../store/dashboard';
import {
  Image, CheckCircle2, Clock,
  ArrowUpRight, Briefcase, Users
} from 'lucide-react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer
} from 'recharts';
import { format, parseISO } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';

export default function Dashboard() {
  const navigate = useNavigate();
  const { activityFeed, users, zones } = useAppStore();
  const stats = useDashboardStats();
  const activeJobs = useActiveJobs(3);
  const upcomingTasks = useUpcomingTasks(4);
  const progressTrend = useFeatureStore((s) => s.progressHistory);

  const statCards = [
    {
      title: 'Tasks Complete',
      value: `${stats.tasksComplete}/${stats.totalTasks}`,
      change: `${stats.tasksInProgress} in progress`,
      trend: 'up',
      icon: Briefcase,
      bgColor: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Overall Progress',
      value: `${stats.overallProgress}%`,
      change: stats.delayedTasks > 0 ? `${stats.delayedTasks} delayed` : 'On track',
      trend: stats.delayedTasks > 0 ? 'down' : 'up',
      icon: CheckCircle2,
      bgColor: 'bg-amber-100',
      iconColor: 'text-amber-600',
    },
    {
      title: 'Photos This Week',
      value: stats.photosThisWeek.toString(),
      change: `+${stats.photosToday} today`,
      trend: 'up',
      icon: Image,
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      title: 'Days Remaining',
      value: stats.daysRemaining.toString(),
      change: stats.delayedTasks > 0 ? `${stats.delayedTasks} delayed` : 'On track',
      trend: stats.delayedTasks > 0 ? 'down' : 'neutral',
      icon: Clock,
      bgColor: stats.delayedTasks > 0 ? 'bg-red-100' : 'bg-amber-100',
      iconColor: stats.delayedTasks > 0 ? 'text-red-600' : 'text-amber-600',
    },
  ];

  return (
    <div className="p-6">
      {/* Stats Grid */}
      <div className="mb-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {statCards.map((stat) => {
          const Icon = stat.icon;
          return (
            <Card key={stat.title} className="relative overflow-hidden">
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-slate-500">{stat.title}</p>
                    <p className="mt-1 text-3xl font-bold text-slate-900">{stat.value}</p>
                    <div className="mt-2 flex items-center gap-1">
                      {stat.trend === 'up' && (
                        <ArrowUpRight className="h-4 w-4 text-emerald-600" />
                      )}
                      <span className={`text-sm ${
                        stat.change.includes('delayed') || stat.change.includes('urgent')
                          ? 'text-amber-600'
                          : 'text-slate-500'
                      }`}>
                        {stat.change}
                      </span>
                    </div>
                  </div>
                  <div className={`rounded-xl ${stat.bgColor} p-3`}>
                    <Icon className={`h-6 w-6 ${stat.iconColor}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Main Content Grid */}
      <div className="grid gap-6 lg:grid-cols-3">
        {/* Left Column - Active Jobs & Progress */}
        <div className="lg:col-span-2 space-y-6">
          {/* Active Jobs */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Active Jobs</CardTitle>
                  <CardDescription>Current construction projects</CardDescription>
                </div>
                <Button variant="ghost" size="sm" onClick={() => navigate('/gantt')}>
                  View All
                  <ArrowUpRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activeJobs.length === 0 && (
                  <p className="text-sm text-slate-500">No active tasks right now.</p>
                )}
                {activeJobs.map((job) => {
                  const zone = zones.find((z) => z.id === job.zoneId);
                  return (
                    <div
                      key={job.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 p-4 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-4">
                        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                          <Briefcase className="h-5 w-5 text-emerald-600" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{job.name}</p>
                          <p className="text-sm text-slate-500">{zone?.name ?? 'No zone'}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <p className="text-sm font-medium text-slate-900">{job.percentComplete}% Complete</p>
                          <p className="text-xs text-slate-500">Due: {format(parseISO(job.endDate), 'MMM d, yyyy')}</p>
                        </div>
                        <Badge variant={job.status === 'delayed' ? 'destructive' : 'default'}>
                          {job.status.replace('_', ' ').toUpperCase()}
                        </Badge>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Progress Chart */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Progress Trend</CardTitle>
                  <CardDescription>Overall project completion over time</CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={progressTrend}>
                    <defs>
                      <linearGradient id="colorProgress" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#10B981" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="#10B981" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                    <XAxis 
                      dataKey="date" 
                      tickFormatter={(date) => format(new Date(date), 'MMM d')}
                      stroke="#64748b"
                      fontSize={12}
                    />
                    <YAxis stroke="#64748b" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'white',
                        border: '1px solid #e2e8f0',
                        borderRadius: '8px',
                        boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="progress"
                      stroke="#10B981"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorProgress)"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* Upcoming Tasks */}
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-xl">Upcoming Tasks</CardTitle>
                  <CardDescription>Priority tasks and deadlines</CardDescription>
                </div>
                <Button variant="ghost" size="sm">
                  View All
                  <ArrowUpRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {upcomingTasks.length === 0 && (
                  <p className="text-sm text-slate-500">No upcoming tasks.</p>
                )}
                {upcomingTasks.map((task) => {
                  const zone = zones.find((z) => z.id === task.zoneId);
                  return (
                    <div
                      key={task.id}
                      className="flex items-center justify-between rounded-lg border border-slate-100 p-4 transition-colors hover:bg-slate-50"
                    >
                      <div className="flex items-center gap-3">
                        <div className="flex h-8 w-8 items-center justify-center rounded border border-slate-200">
                          <div className="h-4 w-4 rounded border-2 border-slate-300" />
                        </div>
                        <div>
                          <p className="font-medium text-slate-900">{task.name}</p>
                          <p className="text-sm text-slate-500">{zone?.name ?? 'No zone'} · {task.phase}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{task.phase}</Badge>
                        <span className="text-sm text-slate-500">
                          Starts {format(parseISO(task.startDate), 'MMM d')}
                        </span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Activity & Team */}
        <div className="space-y-6">
          {/* Recent Activity */}
          <Card>
            <CardHeader>
              <CardTitle className="text-xl">Recent Activity</CardTitle>
              <CardDescription>Latest project updates</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {activityFeed.slice(0, 6).map((activity) => {
                  const user = users.find(u => u.id === activity.userId);
                  return (
                    <div key={activity.id} className="flex gap-3">
                      <Avatar className="h-8 w-8">
                        <AvatarImage src={user?.avatar} />
                        <AvatarFallback>
                          {user?.fullName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div className="flex-1">
                        <p className="text-sm text-slate-900">
                          <span className="font-medium">{activity.userName}</span>{' '}
                          <span className="text-slate-600">{activity.message.split(' ')[0]}</span>
                        </p>
                        <p className="text-xs text-slate-500">
                          {format(new Date(activity.timestamp), 'MMM d, h:mm a')}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            </CardContent>
          </Card>

          {/* Team Members */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl">Team</CardTitle>
                <Button variant="ghost" size="sm">
                  <Users className="mr-1 h-4 w-4" />
                  View All
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {users.slice(0, 4).map((user) => (
                  <div key={user.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Avatar className="h-9 w-9">
                        <AvatarImage src={user.avatar} />
                        <AvatarFallback>
                          {user.fullName.split(' ').map(n => n[0]).join('')}
                        </AvatarFallback>
                      </Avatar>
                      <div>
                        <p className="text-sm font-medium text-slate-900">{user.fullName}</p>
                        <p className="text-xs text-slate-500 capitalize">{user.role}</p>
                      </div>
                    </div>
                    <div className="h-2 w-2 rounded-full bg-emerald-500" />
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
}
