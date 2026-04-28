import { useState } from 'react';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { Filter, Plus, Edit2 } from 'lucide-react';
import { format, differenceInDays, parseISO } from 'date-fns';
import { Task, TaskStatus } from '../types';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { getPhaseIcon } from '../store';
import TaskModal from '../components/tasks/TaskModal';
import CreateTaskModal from '../components/tasks/CreateTaskModal';

export default function Gantt() {
  const { tasks, zones, project } = useAppStore();
  const { updateTaskProgress, addTask, deleteTask } = useFeatureStore();
  const [filterZone, setFilterZone] = useState('');
  const [filterStatus, setFilterStatus] = useState('');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [isTaskModalOpen, setIsTaskModalOpen] = useState(false);
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const filteredTasks = tasks.filter(task => {
    if (filterZone && task.zoneId !== filterZone) return false;
    if (filterStatus && task.status !== filterStatus) return false;
    return true;
  });

  const startDate = parseISO(project.startDate);
  const endDate = parseISO(project.endDate);
  const totalDays = differenceInDays(endDate, startDate);
  
  const months: { name: string; start: number; width: number }[] = [];
  let currentDate = new Date(startDate);
  let dayOffset = 0;
  
  while (currentDate <= endDate) {
    const monthStart = new Date(currentDate);
    const monthEnd = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);
    const clampedEnd = monthEnd > endDate ? endDate : monthEnd;
    const daysInMonth = differenceInDays(clampedEnd, monthStart) + 1;
    
    months.push({
      name: format(monthStart, 'MMM yyyy'),
      start: dayOffset,
      width: (daysInMonth / totalDays) * 100,
    });
    
    currentDate = new Date(monthEnd);
    currentDate.setDate(currentDate.getDate() + 1);
    dayOffset += daysInMonth;
  }

  const getTaskPosition = (task: Task) => {
    const taskStart = parseISO(task.startDate);
    const taskEnd = parseISO(task.endDate);
    const startOffset = differenceInDays(taskStart, startDate);
    const duration = differenceInDays(taskEnd, taskStart) + 1;
    
    return {
      left: (startOffset / totalDays) * 100,
      width: (duration / totalDays) * 100,
    };
  };

  const getStatusColor = (status: TaskStatus) => {
    switch (status) {
      case 'not_started': return 'bg-slate-400';
      case 'in_progress': return 'bg-blue-500';
      case 'complete': return 'bg-emerald-500';
      case 'delayed': return 'bg-red-500';
      case 'blocked': return 'bg-gray-700';
    }
  };

  const getStatusBadgeVariant = (status: TaskStatus) => {
    switch (status) {
      case 'not_started': return 'secondary' as const;
      case 'in_progress': return 'blue' as const;
      case 'complete': return 'default' as const;
      case 'delayed': return 'destructive' as const;
      case 'blocked': return 'secondary' as const;
    }
  };

  const handleEditTask = (task: Task) => {
    setSelectedTask(task);
    setIsTaskModalOpen(true);
  };

  const handleSaveTask = (updatedTask: Task) => {
    // Update task in store
    updateTaskProgress(updatedTask.id, updatedTask.percentComplete, 'manual');
    setIsTaskModalOpen(false);
    setSelectedTask(null);
  };

  const handleDeleteTask = (taskId: string) => {
    deleteTask(taskId);
  };

  const handleCreateTask = (newTask: Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>) => {
    const task: Task = {
      ...newTask,
      id: `task_${Date.now()}`,
      photoCount: 0,
      lastUpdated: new Date().toISOString(),
      updateSource: 'manual',
    };
    addTask(task);
    setIsCreateModalOpen(false);
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Project Management</h1>
            <p className="text-slate-500">Track and manage project activities</p>
          </div>
          <Button onClick={() => setIsCreateModalOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Task
          </Button>
        </div>
      </div>

      {/* Tabs */}
      <Card className="mb-6">
        <CardContent className="p-2">
          <div className="flex gap-1">
            {['Schedule', 'Daily Logs', 'To-Dos', 'Tasks', 'Change Orders', 'Selections', 'Warranties', 'Plans'].map((tab, i) => (
              <button
                key={tab}
                className={`rounded-lg px-4 py-2 text-sm font-medium transition-colors ${
                  i === 0 ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:bg-slate-50'
                }`}
              >
                {tab}
              </button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Filters */}
      <Card className="mb-6">
        <CardContent className="p-4">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <Filter className="h-4 w-4 text-slate-400" />
              <select
                value={filterZone}
                onChange={(e) => setFilterZone(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">All Zones</option>
                {zones.map(zone => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </select>
              
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value)}
                className="rounded-lg border border-slate-200 px-3 py-2 text-sm focus:border-emerald-500 focus:outline-none"
              >
                <option value="">All Statuses</option>
                <option value="not_started">Not Started</option>
                <option value="in_progress">In Progress</option>
                <option value="complete">Complete</option>
                <option value="delayed">Delayed</option>
                <option value="blocked">Blocked</option>
              </select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Gantt Chart */}
      <Card>
        <CardHeader>
          <div>
            <CardTitle className="text-lg">Project Schedule</CardTitle>
            <p className="text-sm text-slate-500">Upcoming milestones and deadlines</p>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-hidden rounded-lg border border-slate-200">
            {/* Month Headers */}
            <div className="flex border-b border-slate-200 bg-slate-50">
              <div className="w-64 flex-shrink-0 border-r border-slate-200 p-3 text-sm font-medium text-slate-700">
                Task Name
              </div>
              <div className="flex-1">
                <div className="flex">
                  {months.map((month) => (
                    <div
                      key={month.name}
                      className="border-r border-slate-200 px-3 py-2 text-sm font-medium text-slate-700"
                      style={{ width: `${month.width}%` }}
                    >
                      {month.name}
                    </div>
                  ))}
                </div>
              </div>
            </div>
            
            {/* Task Rows */}
            <div className="max-h-[500px] overflow-auto">
              {filteredTasks.map((task) => {
                const position = getTaskPosition(task);
                const zone = zones.find(z => z.id === task.zoneId);
                
                return (
                  <div
                    key={task.id}
                    onClick={() => handleEditTask(task)}
                    className={`group flex cursor-pointer border-b border-slate-100 transition-colors hover:bg-slate-50 ${
                      selectedTask?.id === task.id ? 'bg-emerald-50' : ''
                    }`}
                  >
                    <div className="w-64 flex-shrink-0 border-r border-slate-200 p-3">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{getPhaseIcon(task.phase)}</span>
                        <div className="flex-1 overflow-hidden">
                          <p className="truncate text-sm font-medium text-slate-900">{task.name}</p>
                          <p className="text-xs text-slate-500">{format(parseISO(task.startDate), 'MMM d, yyyy')}</p>
                        </div>
                      </div>
                    </div>
                    
                    <div className="relative flex-1 py-4">
                      <div className="absolute inset-0 flex">
                        {months.map((month) => (
                          <div
                            key={month.name}
                            className="border-r border-slate-100"
                            style={{ width: `${month.width}%` }}
                          />
                        ))}
                      </div>
                      
                      <div
                        className="gantt-task-bar absolute top-1/2 h-8 -translate-y-1/2 rounded-md shadow-sm"
                        style={{
                          left: `${position.left}%`,
                          width: `${position.width}%`,
                          backgroundColor: zone?.colorCode || '#64748b',
                        }}
                      >
                        <div
                          className={`absolute inset-y-0 left-0 rounded-md ${getStatusColor(task.status)}`}
                          style={{ width: `${task.percentComplete}%`, opacity: 0.8 }}
                        />
                        <div className="absolute inset-0 flex items-center px-2">
                          <span className="truncate text-xs font-medium text-white drop-shadow">
                            {task.percentComplete}%
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pr-4 opacity-0 transition-opacity group-hover:opacity-100">
                      <Badge variant={getStatusBadgeVariant(task.status)}>
                        {task.status.replace('_', ' ')}
                      </Badge>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleEditTask(task);
                        }}
                        className="rounded p-1 text-slate-400 hover:bg-slate-200 hover:text-slate-600"
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Legend */}
          <div className="mt-4 flex flex-wrap items-center gap-4 text-sm">
            <span className="text-slate-500">Status:</span>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-slate-400" />
              <span>Not Started</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-blue-500" />
              <span>In Progress</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-emerald-500" />
              <span>Complete</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-3 w-3 rounded-full bg-red-500" />
              <span>Delayed</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Task Edit Modal */}
      <TaskModal
        task={selectedTask}
        isOpen={isTaskModalOpen}
        onClose={() => {
          setIsTaskModalOpen(false);
          setSelectedTask(null);
        }}
        onSave={handleSaveTask}
        onDelete={handleDeleteTask}
        zones={zones}
        allTasks={tasks}
      />

      {/* Create Task Modal */}
      <CreateTaskModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
        onCreate={handleCreateTask}
        zones={zones}
        allTasks={tasks}
        projectId={project.id}
      />
    </div>
  );
}
