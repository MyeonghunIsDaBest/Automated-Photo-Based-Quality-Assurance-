import { useState } from 'react';
import { Activity, Calendar, FolderOpen, Plus, BarChart3, ScrollText } from 'lucide-react';
import { useAppStore } from '../store';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { GanttChart } from '../components/ui/GanttChart';
import { useProjectsListStore } from './projects/store';
import { ProjectsListTab } from './projects/components/ProjectsListTab';
import { ActivityTab } from './projects/components/ActivityTab';
import { DocumentsTab } from './projects/components/DocumentsTab';
import { LogsTab } from './projects/components/LogsTab';
import { ProjectSelector } from './projects/components/ProjectSelector';
import { NewProjectModal } from './projects/components/NewProjectModal';

type TabKey = 'list' | 'timeline' | 'activity' | 'documents' | 'logs';

const SCOPED_TABS: TabKey[] = ['activity', 'documents', 'logs'];

export default function Projects() {
  const { project, tasks } = useAppStore();
  const projects = useProjectsListStore((s) => s.projects);
  const [activeTab, setActiveTab] = useState<TabKey>('list');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [newProjectOpen, setNewProjectOpen] = useState(false);

  const showSelector = SCOPED_TABS.includes(activeTab);

  return (
    <div className="p-6">
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold text-slate-900">Projects</h1>
          <p className="text-slate-500">Manage and track all construction projects</p>
        </div>
        <div className="flex items-center gap-3">
          {showSelector && (
            <ProjectSelector
              projects={projects}
              value={selectedProjectId}
              onChange={setSelectedProjectId}
            />
          )}
          <Button onClick={() => setNewProjectOpen(true)}>
            <Plus className="mr-2 h-4 w-4" />
            New Project
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as TabKey)} className="mb-6">
        <TabsList className="grid grid-cols-5">
          <TabsTrigger value="list" className="text-xs">
            <BarChart3 className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Projects</span>
          </TabsTrigger>
          <TabsTrigger value="timeline" className="text-xs">
            <Calendar className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Timeline</span>
          </TabsTrigger>
          <TabsTrigger value="activity" className="text-xs">
            <Activity className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Activity</span>
          </TabsTrigger>
          <TabsTrigger value="documents" className="text-xs">
            <FolderOpen className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Documents</span>
          </TabsTrigger>
          <TabsTrigger value="logs" className="text-xs">
            <ScrollText className="mr-1.5 h-3.5 w-3.5" />
            <span className="hidden sm:inline">Logs</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="list">
          <ProjectsListTab projects={projects} />
        </TabsContent>

        <TabsContent value="timeline">
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

        <TabsContent value="activity">
          <ActivityTab projectId={selectedProjectId} />
        </TabsContent>

        <TabsContent value="documents">
          <DocumentsTab projectId={selectedProjectId} />
        </TabsContent>

        <TabsContent value="logs">
          <LogsTab projectId={selectedProjectId} />
        </TabsContent>
      </Tabs>

      <NewProjectModal
        open={newProjectOpen}
        onClose={() => setNewProjectOpen(false)}
        onCreated={() => setActiveTab('list')}
      />
    </div>
  );
}
