import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { 
  Image, CheckCircle2, Clock,
  ArrowUpRight, Briefcase, Users
} from 'lucide-react';
import { 
  AreaChart, Area, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer 
} from 'recharts';
import { format } from 'date-fns';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { getProgressTrend } from '../data/mockData';

export default function Dashboard() {
  const navigate = useNavigate();
  const { dashboardStats, activityFeed, users } = useAppStore();
  
  const progressTrend = getProgressTrend();

  const statCards = [
    {
      title: 'Active Jobs',
      value: '12',
      change: '+2 from last month',
      trend: 'up',
      icon: Briefcase,
      color: 'emerald',
      bgColor: 'bg-emerald-100',
      iconColor: 'text-emerald-600',
    },
    {
      title: 'Pending Tasks',
      value: '24',
      change: '5 urgent',
      trend: 'warning',
      icon: CheckCircle2,
      color: 'amber',
      bgColor: 'bg-amber-100',
      iconColor: 'text-amber-600',
    },
    {
      title: 'Photos This Week',
      value: dashboardStats.photosThisWeek.toString(),
      change: `+${dashboardStats.photosToday} today`,
      trend: 'up',
      icon: Image,
      color: 'blue',
      bgColor: 'bg-blue-100',
      iconColor: 'text-blue-600',
    },
    {
      title: 'Days Remaining',
      value: dashboardStats.daysRemaining.toString(),
      change: dashboardStats.delayedTasks > 0 ? `${dashboardStats.delayedTasks} delayed` : 'On track',
      trend: dashboardStats.delayedTasks > 0 ? 'down' : 'neutral',
      icon: Clock,
      color: dashboardStats.delayedTasks > 0 ? 'red' : 'amber',
      bgColor: dashboardStats.delayedTasks > 0 ? 'bg-red-100' : 'bg-amber-100',
      iconColor: dashboardStats.delayedTasks > 0 ? 'text-red-600' : 'text-amber-600',
    },
  ];

  const activeJobs = [
    {
      name: 'North Wing Construction',
      address: 'Lincoln Elementary School',
      progress: 65,
      dueDate: '2024-06-30',
      status: 'active',
    },
    {
      name: 'Gymnasium Renovation',
      address: 'South Building',
      progress: 45,
      dueDate: '2024-05-15',
      status: 'delayed',
    },
    {
      name: 'Parking Lot Expansion',
      address: 'East Campus',
      progress: 0,
      dueDate: '2024-08-30',
      status: 'pending',
    },
  ];

  const upcomingTasks = [
    {
      title: 'Review AI analysis results',
      assigned: 'Maria Garcia',
      priority: 'high',
      dueDate: '2024-04-25',
    },
    {
      title: 'Approve framing inspection',
      assigned: 'John Anderson',
      priority: 'high',
      dueDate: '2024-04-26',
    },
    {
      title: 'Schedule site inspection',
      assigned: 'Mike Thompson',
      priority: 'medium',
      dueDate: '2024-04-28',
    },
    {
      title: 'Update project timeline',
      assigned: 'You',
      priority: 'medium',
      dueDate: '2024-04-24',
      completed: true,
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
                {activeJobs.map((job, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between rounded-lg border border-slate-100 p-4 transition-colors hover:bg-slate-50"
                  >
                    <div className="flex items-center gap-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-emerald-100">
                        <Briefcase className="h-5 w-5 text-emerald-600" />
                      </div>
                      <div>
                        <p className="font-medium text-slate-900">{job.name}</p>
                        <p className="text-sm text-slate-500">{job.address}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right">
                        <p className="text-sm font-medium text-slate-900">{job.progress}% Complete</p>
                        <p className="text-xs text-slate-500">Due: {format(new Date(job.dueDate), 'MMM d, yyyy')}</p>
                      </div>
                      <Badge variant={job.status === 'active' ? 'default' : job.status === 'delayed' ? 'destructive' : 'secondary'}>
                        {job.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
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
                {upcomingTasks.map((task, index) => (
                  <div
                    key={index}
                    className={`flex items-center justify-between rounded-lg border p-4 transition-colors ${
                      task.completed 
                        ? 'border-slate-100 bg-slate-50' 
                        : 'border-slate-100 hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className={`flex h-8 w-8 items-center justify-center rounded ${
                        task.completed ? 'bg-emerald-100' : 'border border-slate-200'
                      }`}>
                        {task.completed ? (
                          <CheckCircle2 className="h-5 w-5 text-emerald-600" />
                        ) : (
                          <div className="h-4 w-4 rounded border-2 border-slate-300" />
                        )}
                      </div>
                      <div className={task.completed ? 'opacity-60' : ''}>
                        <p className={`font-medium ${task.completed ? 'text-slate-500 line-through' : 'text-slate-900'}`}>
                          {task.title}
                        </p>
                        <p className="text-sm text-slate-500">Assigned to: {task.assigned}</p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge variant={task.priority === 'high' ? 'destructive' : 'warning'}>
                        {task.priority.toUpperCase()}
                      </Badge>
                      <span className="text-sm text-slate-500">
                        {format(new Date(task.dueDate), 'MMM d')}
                      </span>
                    </div>
                  </div>
                ))}
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
