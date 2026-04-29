import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store';
import { 
  Calendar, MessageSquare, Users, Clock, FileText, Image,
  FolderOpen, BookOpen, Shield, Package, FileCheck, ChevronRight,
  Search, Filter, Plus, BarChart3
} from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Input } from '../components/ui/input';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { Avatar, AvatarFallback, AvatarImage } from '../components/ui/avatar';
import { GanttChart } from '../components/ui/GanttChart';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceDot } from 'recharts';

// Mock Data
const mockProjects = [
  {
    id: 'proj_1',
    name: 'Lincoln Elementary School - Phase 2',
    client: 'Lincoln School District',
    percentComplete: 67,
    tasksComplete: 8,
    tasksPending: 4,
    tasksOutstanding: 0,
    startDate: '2024-01-15',
    endDate: '2024-06-30',
    status: 'active',
  },
  {
    id: 'proj_2',
    name: 'Westside Community Center',
    client: 'City of Portland',
    percentComplete: 34,
    tasksComplete: 5,
    tasksPending: 8,
    tasksOutstanding: 2,
    startDate: '2024-03-01',
    endDate: '2024-12-15',
    status: 'active',
  },
  {
    id: 'proj_3',
    name: 'Downtown Office Renovation',
    client: 'ABC Corporation',
    percentComplete: 89,
    tasksComplete: 15,
    tasksPending: 2,
    tasksOutstanding: 0,
    startDate: '2023-09-01',
    endDate: '2024-04-30',
    status: 'active',
  },
];

const mockWorkers = [
  { id: 'w1', name: 'John Smith', role: 'Electrician', company: 'ABC Electric', totalHours: 156, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=john' },
  { id: 'w2', name: 'Maria Garcia', role: 'Site Supervisor', company: 'BuildCorp', totalHours: 180, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=maria' },
  { id: 'w3', name: 'Mike Johnson', role: 'Plumber', company: 'Quick Plumbing', totalHours: 142, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=mike' },
  { id: 'w4', name: 'Sarah Chen', role: 'Carpenter', company: 'Wood Works', totalHours: 168, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=sarah' },
  { id: 'w5', name: 'David Brown', role: 'Roofer', company: 'Roof Masters', totalHours: 134, avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=david' },
];

const mockMessages = [
  { id: 'm1', from: 'John Smith', message: 'Electrical work completed on North Wing', time: '10:30 AM', type: 'individual' },
  { id: 'm2', from: 'Maria Garcia', message: 'Safety inspection scheduled for tomorrow', time: '9:15 AM', type: 'group' },
  { id: 'm3', from: 'Mike Johnson', message: 'Plumbing materials delivered', time: 'Yesterday', type: 'individual' },
];

const mockSiteDiary = [
  { date: '2024-02-28', weather: 'Partly Cloudy', temp: '18°C', workers: 24, notes: 'Framing continued on North Wing. Electrical rough-in started.' },
  { date: '2024-02-27', weather: 'Sunny', temp: '20°C', workers: 26, notes: 'Excellent progress on framing. All safety protocols followed.' },
  { date: '2024-02-26', weather: 'Rainy', temp: '15°C', workers: 18, notes: 'Reduced workforce due to weather. Indoor work prioritized.' },
];

const mockTodaysProgress = {
  date: '2024-02-28',
  personnel: [
    { name: 'John Smith', role: 'Electrician', hours: 8, company: 'ABC Electric' },
    { name: 'Maria Garcia', role: 'Site Supervisor', hours: 9, company: 'BuildCorp' },
    { name: 'Mike Johnson', role: 'Plumber', hours: 7.5, company: 'Quick Plumbing' },
  ],
  photos: 23,
  description: 'North Wing framing 65% complete. Electrical rough-in started. Safety inspection passed.',
};

export default function Projects() {
  const navigate = useNavigate();
  const { project, tasks } = useAppStore();
  const [activeTab, setActiveTab] = useState('list');
  const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [messageType, setMessageType] = useState<'individual' | 'group'>('individual');

  const filteredProjects = mockProjects.filter(p =>
    p.name.toLowerCase().includes(searchQuery.toLowerCase())
  );

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
            <p className="text-slate-500">Manage and track all construction projects</p>
          </div>
          <Button>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="mb-6">
        <TabsList className="grid grid-cols-4 lg:grid-cols-8">
          <TabsTrigger value="list" className="text-xs">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Projects List</span>
          </TabsTrigger>
          <TabsTrigger value="gantt" className="text-xs">
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Gantt</span>
          </TabsTrigger>
          <TabsTrigger value="messaging" className="text-xs">
            <MessageSquare className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Messages</span>
          </TabsTrigger>
          <TabsTrigger value="diary" className="text-xs">
            <BookOpen className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Site Diary</span>
          </TabsTrigger>
          <TabsTrigger value="workers" className="text-xs">
            <Users className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Workers</span>
          </TabsTrigger>
          <TabsTrigger value="progress" className="text-xs">
            <Clock className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Today</span>
          </TabsTrigger>
          <TabsTrigger value="history" className="text-xs">
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">History</span>
          </TabsTrigger>
          <TabsTrigger value="docs" className="text-xs">
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Documents</span>
          </TabsTrigger>
        </TabsList>

        {/* Projects List Tab */}
        <TabsContent value="list">
          <Card>
            <CardHeader className="pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-lg">All Projects</CardTitle>
                  <CardDescription>Overview of all active construction projects</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <Input
                      placeholder="Search projects..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="w-64 pl-10"
                    />
                  </div>
                  <Button variant="outline" size="sm">
                    <Filter className="mr-2 h-3.5 w-3.5" />
                    Filter
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Project Name</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">% Complete</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Tasks Complete</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Tasks Pending</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Tasks Outstanding</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {filteredProjects.map((proj) => (
                      <tr key={proj.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div>
                            <p className="font-medium text-slate-900">{proj.name}</p>
                            <p className="text-xs text-slate-500">{proj.client}</p>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-2 w-24 rounded-full bg-slate-100">
                              <div
                                className="h-2 rounded-full bg-emerald-500"
                                style={{ width: `${proj.percentComplete}%` }}
                              />
                            </div>
                            <span className="text-sm font-medium">{proj.percentComplete}%</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="default" className="text-xs">{proj.tasksComplete}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="warning" className="text-xs">{proj.tasksPending}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant="destructive" className="text-xs">{proj.tasksOutstanding}</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Badge variant={proj.status === 'active' ? 'default' : 'secondary'} className="text-xs">
                            {proj.status.toUpperCase()}
                          </Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm" onClick={() => navigate(`/projects/${proj.id}`)}>
                            View
                            <ChevronRight className="ml-1 h-3.5 w-3.5" />
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Gantt Chart Tab */}
        <TabsContent value="gantt">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Project Timeline</CardTitle>
              <CardDescription>Visual project schedule and task dependencies</CardDescription>
            </CardHeader>
            <CardContent>
              <GanttChart 
                tasks={tasks} 
                startDate={project.startDate} 
                endDate={project.endDate}
                compact={false}
              />
            </CardContent>
          </Card>
        </TabsContent>

        {/* Messaging Tab */}
        <TabsContent value="messaging">
          <div className="grid gap-6 lg:grid-cols-3">
            {/* Message List */}
            <Card className="lg:col-span-1">
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg">Messages</CardTitle>
                  <Button size="sm">
                    <Plus className="mr-1.5 h-3.5 w-3.5" />
                    New
                  </Button>
                </div>
                <div className="mt-3 flex gap-2">
                  <Button
                    variant={messageType === 'individual' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMessageType('individual')}
                    className="flex-1"
                  >
                    Individual
                  </Button>
                  <Button
                    variant={messageType === 'group' ? 'default' : 'outline'}
                    size="sm"
                    onClick={() => setMessageType('group')}
                    className="flex-1"
                  >
                    Groups
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockMessages.filter(m => m.type === messageType).map((msg) => (
                    <div key={msg.id} className="rounded-lg border border-slate-100 p-3 hover:bg-slate-50 cursor-pointer">
                      <div className="flex items-center justify-between">
                        <p className="text-sm font-medium text-slate-900">{msg.from}</p>
                        <span className="text-xs text-slate-500">{msg.time}</span>
                      </div>
                      <p className="mt-1 text-sm text-slate-600 truncate">{msg.message}</p>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Chat Area */}
            <Card className="lg:col-span-2">
              <CardHeader className="pb-4">
                <CardTitle className="text-lg">Select a conversation</CardTitle>
                <CardDescription>Choose a message thread from the list</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex h-96 items-center justify-center text-center">
                  <div>
                    <MessageSquare className="mx-auto h-12 w-12 text-slate-300" />
                    <h3 className="mt-4 text-lg font-medium text-slate-900">No conversation selected</h3>
                    <p className="text-slate-500">Select a message from the list or start a new conversation</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        </TabsContent>

        {/* Site Diary Tab */}
        <TabsContent value="diary">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Site Diary</CardTitle>
              <CardDescription>Daily site records and observations</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {mockSiteDiary.map((entry, index) => (
                  <div key={index} className="rounded-lg border border-slate-200 p-4">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Calendar className="h-5 w-5 text-slate-400" />
                        <div>
                          <p className="font-medium text-slate-900">{format(new Date(entry.date), 'EEEE, MMMM d, yyyy')}</p>
                          <p className="text-sm text-slate-500">{entry.weather} • {entry.temp} • {entry.workers} workers</p>
                        </div>
                      </div>
                    </div>
                    <p className="mt-3 text-sm text-slate-700">{entry.notes}</p>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Workers Tab */}
        <TabsContent value="workers">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Worker Times</CardTitle>
              <CardDescription>Track worker hours on project</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-hidden rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Worker</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Role</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Company</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Total Hours</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {mockWorkers.map((worker) => (
                      <tr key={worker.id} className="hover:bg-slate-50">
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-3">
                            <Avatar className="h-9 w-9">
                              <AvatarImage src={worker.avatar} />
                              <AvatarFallback>{worker.name.split(' ').map(n => n[0]).join('')}</AvatarFallback>
                            </Avatar>
                            <span className="font-medium text-slate-900">{worker.name}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3 text-slate-600">{worker.role}</td>
                        <td className="px-4 py-3 text-slate-600">{worker.company}</td>
                        <td className="px-4 py-3">
                          <Badge variant="default">{worker.totalHours} hrs</Badge>
                        </td>
                        <td className="px-4 py-3">
                          <Button variant="ghost" size="sm">
                            View Details
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Today's Progress Tab */}
        <TabsContent value="progress">
          <div className="grid gap-6 lg:grid-cols-2">
            {/* Personnel */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Today's Personnel</CardTitle>
                <CardDescription>{format(new Date(mockTodaysProgress.date), 'MMMM d, yyyy')}</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {mockTodaysProgress.personnel.map((person, index) => (
                    <div key={index} className="flex items-center justify-between rounded-lg border border-slate-100 p-3">
                      <div>
                        <p className="font-medium text-slate-900">{person.name}</p>
                        <p className="text-sm text-slate-500">{person.role} • {person.company}</p>
                      </div>
                      <Badge variant="default">{person.hours} hrs</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Photos & Description */}
            <div className="space-y-6">
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Today's Photos</CardTitle>
                  <CardDescription>{mockTodaysProgress.photos} photos uploaded</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-3 gap-2">
                    {[1, 2, 3, 4, 5, 6].map((i) => (
                      <div key={i} className="aspect-square rounded-lg bg-slate-100 flex items-center justify-center">
                        <Image className="h-8 w-8 text-slate-400" />
                      </div>
                    ))}
                  </div>
                  <Button variant="outline" className="mt-4 w-full" size="sm">
                    View All Photos
                  </Button>
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Description of Works</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-sm text-slate-700">{mockTodaysProgress.description}</p>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* History Tab */}
        <TabsContent value="history">
          <div className="space-y-6">
            {/* Histogram Chart */}
            <Card>
              <CardHeader className="pb-4">
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle className="text-lg">Worker Hours Trend</CardTitle>
                    <CardDescription>Daily hours logged over the past 30 days</CardDescription>
                  </div>
                  <Badge variant="default" className="text-sm">
                    +21.6% vs last month
                  </Badge>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-64">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={[
                        { day: 25, hours: 342, date: 'Mon 25' },
                        { day: 26, hours: 156, date: 'Tue 26' },
                        { day: 27, hours: 512, date: 'Wed 27' },
                        { day: 28, hours: 198, date: 'Thu 28' },
                        { day: 1, hours: 145, date: 'Fri 01' },
                        { day: 2, hours: 234, date: 'Sat 02' },
                        { day: 3, hours: 67, date: 'Sun 03' },
                        { day: 4, hours: 256, date: 'Mon 04' },
                        { day: 5, hours: 223, date: 'Tue 05' },
                        { day: 6, hours: 267, date: 'Wed 06' },
                        { day: 7, hours: 234, date: 'Thu 07' },
                        { day: 8, hours: 289, date: 'Fri 08' },
                        { day: 9, hours: 312, date: 'Sat 09' },
                        { day: 10, hours: 456, date: 'Sun 10' },
                        { day: 11, hours: 278, date: 'Mon 11' },
                        { day: 12, hours: 189, date: 'Tue 12' },
                      ]}
                    >
                      <defs>
                        <linearGradient id="colorHours1" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#8B5CF6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#8B5CF6" stopOpacity={0} />
                        </linearGradient>
                        <linearGradient id="colorHours2" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3B82F6" stopOpacity={0.3} />
                          <stop offset="95%" stopColor="#3B82F6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" vertical={false} />
                      <XAxis 
                        dataKey="day" 
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis 
                        stroke="#94a3b8"
                        fontSize={11}
                        tickLine={false}
                        axisLine={false}
                        tickFormatter={(value) => `${value/100}k`}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: 'white',
                          border: '1px solid #e2e8f0',
                          borderRadius: '8px',
                          boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                        }}
                        formatter={(value: any) => [`${value} hrs`, 'Worker Hours']}
                        labelFormatter={(label: any) => `Day ${label}`}
                      />
                      <Area
                        type="monotone"
                        dataKey="hours"
                        stroke="#8B5CF6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorHours1)"
                      />
                      <Area
                        type="monotone"
                        dataKey="hours"
                        stroke="#3B82F6"
                        strokeWidth={2}
                        fillOpacity={1}
                        fill="url(#colorHours2)"
                        connectNulls
                      />
                      <ReferenceDot x={2} y={234} r={5} fill="#3B82F6" stroke="white" strokeWidth={2} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>

            {/* Month Selection */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">Select Month</CardTitle>
                <CardDescription>View detailed daily breakdown</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-6">
                  {['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'].map((month) => (
                    <button
                      key={month}
                      onClick={() => setSelectedMonth(month)}
                      className={`rounded-lg border p-4 text-center transition-colors ${
                        selectedMonth === month
                          ? 'border-emerald-500 bg-emerald-50'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <p className="font-medium text-slate-900">{month} 2024</p>
                      <p className="text-xs text-slate-500">24 days logged</p>
                    </button>
                  ))}
                </div>
              </CardContent>
            </Card>

            {/* Day Selection & Details */}
            {selectedMonth && (
              <Card>
                <CardHeader>
                  <CardTitle className="text-lg">Days in {selectedMonth}</CardTitle>
                  <CardDescription>Select a day to view personnel details</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="mb-6 grid gap-2 sm:grid-cols-7 lg:grid-cols-14">
                    {Array.from({ length: 28 }, (_, i) => i + 1).map((day) => (
                      <button
                        key={day}
                        onClick={() => setSelectedDay(`${selectedMonth}-${day}`)}
                        className={`rounded-md p-2 text-center text-sm font-medium transition-colors ${
                          selectedDay === `${selectedMonth}-${day}`
                            ? 'bg-emerald-500 text-white'
                            : 'bg-slate-100 hover:bg-slate-200 text-slate-700'
                        }`}
                      >
                        {day}
                      </button>
                    ))}
                  </div>

                  {selectedDay && (
                    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
                      <h4 className="mb-3 text-sm font-semibold text-slate-900">
                        Personnel for {selectedDay}
                      </h4>
                      <div className="space-y-2">
                        {mockTodaysProgress.personnel.map((person, index) => (
                          <div key={index} className="flex items-center justify-between rounded-md bg-white p-2">
                            <div className="flex items-center gap-3">
                              <Avatar className="h-8 w-8">
                                <AvatarFallback className="text-xs">
                                  {person.name.split(' ').map(n => n[0]).join('')}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <p className="text-sm font-medium text-slate-900">{person.name}</p>
                                <p className="text-xs text-slate-500">{person.role}</p>
                              </div>
                            </div>
                            <Badge variant="default">{person.hours} hrs</Badge>
                          </div>
                        ))}
                      </div>
                      <div className="mt-4 flex items-center justify-between border-t border-slate-200 pt-3">
                        <span className="text-sm font-medium text-slate-700">Total Hours</span>
                        <Badge variant="default" className="text-sm">
                          {mockTodaysProgress.personnel.reduce((sum, p) => sum + p.hours, 0)} hrs
                        </Badge>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </TabsContent>

        {/* Documents Tab */}
        <TabsContent value="docs">
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              { name: 'Tasks', icon: FileCheck, count: 24, color: 'bg-blue-100 text-blue-600' },
              { name: 'Photos / Videos', icon: Image, count: 201, color: 'bg-purple-100 text-purple-600' },
              { name: 'Files / Docs', icon: FolderOpen, count: 45, color: 'bg-emerald-100 text-emerald-600' },
              { name: 'Drawings', icon: FileText, count: 12, color: 'bg-amber-100 text-amber-600' },
              { name: 'Warranties', icon: Shield, count: 8, color: 'bg-red-100 text-red-600' },
              { name: 'Products', icon: Package, count: 34, color: 'bg-pink-100 text-pink-600' },
              { name: 'Documents', icon: BookOpen, count: 18, color: 'bg-indigo-100 text-indigo-600' },
              { name: 'Specifications', icon: FileCheck, count: 6, color: 'bg-cyan-100 text-cyan-600' },
            ].map((item) => {
              const Icon = item.icon;
              return (
                <Card key={item.name} className="cursor-pointer transition-colors hover:bg-slate-50">
                  <CardContent className="p-6">
                    <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-lg ${item.color}`}>
                      <Icon className="h-6 w-6" />
                    </div>
                    <h3 className="font-medium text-slate-900">{item.name}</h3>
                    <p className="text-sm text-slate-500">{item.count} items</p>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
