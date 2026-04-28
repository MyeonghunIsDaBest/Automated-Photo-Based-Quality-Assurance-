import { useState } from 'react';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { FileText, Download, Calendar, Clock, Eye, FileUp, Printer, BarChart3, TrendingUp, Users, Shield, DollarSign, Activity } from 'lucide-react';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Badge } from '../components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { GanttChart } from '../components/ui/GanttChart';
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import { getProgressTrend } from '../data/mockData';
import { ScrollArea } from '../components/ui/scroll-area';
import { Separator } from '../components/ui/separator';

export default function Reports() {
  const { project, tasks, auditLogs, users } = useAppStore();
  const { reports, generateWeeklyReport } = useFeatureStore();
  const [isGenerating, setIsGenerating] = useState(false);
  const [reportType, setReportType] = useState<'daily' | 'weekly' | 'milestone'>('weekly');
  const [showPreview, setShowPreview] = useState(false);
  const [selectedReport, setSelectedReport] = useState<typeof reports[0] | null>(null);
  const [activeTab, setActiveTab] = useState<'progress' | 'financial' | 'audit' | 'safety'>('progress');

  const progressTrend = getProgressTrend();

  const handleGenerateReport = async () => {
    setIsGenerating(true);
    await new Promise(resolve => setTimeout(resolve, 2000));
    generateWeeklyReport(project.id);
    setIsGenerating(false);
  };

  const handleViewReport = (report: typeof reports[0]) => {
    setSelectedReport(report);
    setShowPreview(true);
  };

  const handlePrint = () => {
    window.print();
  };

  const handleDownload = () => {
    alert('PDF report downloaded!');
  };

  const getReportTypeLabel = (type: string) => {
    switch (type) {
      case 'daily': return 'Daily Report';
      case 'weekly': return 'Weekly Report';
      case 'milestone': return 'Milestone Report';
      default: return 'Report';
    }
  };

  const getReportTypeVariant = (type: string): 'default' | 'blue' | 'purple' | 'secondary' => {
    switch (type) {
      case 'daily': return 'blue';
      case 'weekly': return 'default';
      case 'milestone': return 'purple';
      default: return 'secondary';
    }
  };

  const getActionIcon = (action: string) => {
    if (action.includes('photo')) return '📷';
    if (action.includes('ai')) return '🤖';
    if (action.includes('task')) return '📋';
    if (action.includes('comment')) return '💬';
    if (action.includes('report')) return '📄';
    return '📌';
  };

  const getUserName = (userId: string) => {
    if (userId === 'system') return 'System';
    return users.find(u => u.id === userId)?.fullName || 'Unknown';
  };

  // Audit log statistics
  const auditStats = {
    total: auditLogs.length,
    photos: auditLogs.filter(l => l.action === 'photo_uploaded').length,
    aiAnalysis: auditLogs.filter(l => l.action === 'ai_analysis_completed').length,
    taskUpdates: auditLogs.filter(l => l.action === 'task_progress_updated').length,
  };

  return (
    <div className="p-6">
      {/* Page Header */}
      <div className="mb-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-semibold text-slate-900">Reports & Audit</h1>
            <p className="text-slate-500">Generate reports and view project audit trail</p>
          </div>
        </div>
      </div>

      {/* Main Tabs */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)} className="mb-6">
        <TabsList className="grid w-full grid-cols-4">
          <TabsTrigger value="progress">
            <BarChart3 className="mr-2 h-4 w-4" />
            Progress Reports
          </TabsTrigger>
          <TabsTrigger value="financial">
            <DollarSign className="mr-2 h-4 w-4" />
            Financial
          </TabsTrigger>
          <TabsTrigger value="audit">
            <Activity className="mr-2 h-4 w-4" />
            Audit Trail
          </TabsTrigger>
          <TabsTrigger value="safety">
            <Shield className="mr-2 h-4 w-4" />
            Safety
          </TabsTrigger>
        </TabsList>

        {/* Progress Reports Tab */}
        <TabsContent value="progress" className="space-y-6">
          {/* Generate New Report */}
          <Card>
            <CardHeader>
              <CardTitle>Generate Progress Report</CardTitle>
              <CardDescription>Create comprehensive reports with Gantt chart visualization</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap items-end gap-4">
                <div>
                  <label className="mb-2 block text-sm font-medium text-slate-700">Report Type</label>
                  <select
                    value={reportType}
                    onChange={(e) => setReportType(e.target.value as any)}
                    className="rounded-lg border border-slate-200 px-4 py-2.5 focus:border-emerald-500 focus:outline-none"
                  >
                    <option value="daily">Daily Report</option>
                    <option value="weekly">Weekly Report</option>
                    <option value="milestone">Milestone Report</option>
                  </select>
                </div>
                <Button onClick={handleGenerateReport} disabled={isGenerating}>
                  {isGenerating ? (
                    <>
                      <svg className="mr-2 h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                      </svg>
                      Generating...
                    </>
                  ) : (
                    <>
                      <FileUp className="mr-2 h-4 w-4" />
                      Generate Report
                    </>
                  )}
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Report List */}
          <Card>
            <CardHeader>
              <CardTitle>Generated Reports</CardTitle>
              <CardDescription>Project: {project.name}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-slate-100">
                {reports.map((report) => (
                  <div key={report.id} className="flex items-center justify-between py-6">
                    <div className="flex items-center gap-4">
                      <div className="rounded-xl bg-emerald-100 p-3">
                        <FileText className="h-6 w-6 text-emerald-600" />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="font-medium text-slate-900">{getReportTypeLabel(report.reportType)}</h4>
                          <Badge variant={getReportTypeVariant(report.reportType)}>{report.reportType}</Badge>
                        </div>
                        <div className="mt-1 flex items-center gap-4 text-sm text-slate-500">
                          <span className="flex items-center gap-1">
                            <Calendar className="h-4 w-4" />
                            {format(new Date(report.dateFrom), 'MMM d')} - {format(new Date(report.dateTo), 'MMM d, yyyy')}
                          </span>
                          <span className="flex items-center gap-1">
                            <Clock className="h-4 w-4" />
                            Generated {format(new Date(report.generatedAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <div className="mt-2 flex gap-4">
                          <span className="text-sm text-slate-600">
                            <strong className="font-medium text-slate-900">{report.summary.photosUploaded}</strong> photos
                          </span>
                          <span className="text-sm text-slate-600">
                            <strong className="font-medium text-slate-900">{report.summary.tasksUpdated}</strong> tasks updated
                          </span>
                          <span className="text-sm text-slate-600">
                            <strong className="font-medium text-slate-900">{report.summary.overallProgress}%</strong> progress
                          </span>
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => handleViewReport(report)}>
                        <Eye className="mr-2 h-4 w-4" />
                        Preview
                      </Button>
                      <Button size="sm" onClick={handleDownload}>
                        <Download className="mr-2 h-4 w-4" />
                        PDF
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Financial Tab */}
        <TabsContent value="financial">
          <Card>
            <CardHeader>
              <CardTitle>Financial Reports</CardTitle>
              <CardDescription>Track project budget, expenses, and financial metrics</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="rounded-xl bg-blue-50 p-6">
                  <p className="text-sm text-blue-700">Total Budget</p>
                  <p className="mt-2 text-3xl font-bold text-blue-900">$2,450,000</p>
                  <p className="mt-1 text-sm text-blue-600">Approved budget for Phase 2</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-6">
                  <p className="text-sm text-emerald-700">Spent to Date</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-900">$1,640,500</p>
                  <p className="mt-1 text-sm text-emerald-600">67% of budget utilized</p>
                </div>
                <div className="rounded-xl bg-purple-50 p-6">
                  <p className="text-sm text-purple-700">Remaining</p>
                  <p className="mt-2 text-3xl font-bold text-purple-900">$809,500</p>
                  <p className="mt-1 text-sm text-purple-600">33% available</p>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <div className="rounded-lg border border-slate-200">
                <table className="w-full text-sm">
                  <thead className="bg-slate-50">
                    <tr>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Category</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Budgeted</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Spent</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Remaining</th>
                      <th className="px-4 py-3 text-left font-medium text-slate-700">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    <tr>
                      <td className="px-4 py-3 font-medium">Foundation</td>
                      <td className="px-4 py-3">$450,000</td>
                      <td className="px-4 py-3">$450,000</td>
                      <td className="px-4 py-3">$0</td>
                      <td className="px-4 py-3"><Badge variant="default">Complete</Badge></td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium">Framing</td>
                      <td className="px-4 py-3">$680,000</td>
                      <td className="px-4 py-3">$442,000</td>
                      <td className="px-4 py-3">$238,000</td>
                      <td className="px-4 py-3"><Badge variant="blue">In Progress</Badge></td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium">Electrical</td>
                      <td className="px-4 py-3">$320,000</td>
                      <td className="px-4 py-3">$96,000</td>
                      <td className="px-4 py-3">$224,000</td>
                      <td className="px-4 py-3"><Badge variant="blue">In Progress</Badge></td>
                    </tr>
                    <tr>
                      <td className="px-4 py-3 font-medium">Plumbing</td>
                      <td className="px-4 py-3">$280,000</td>
                      <td className="px-4 py-3">$42,000</td>
                      <td className="px-4 py-3">$238,000</td>
                      <td className="px-4 py-3"><Badge variant="blue">In Progress</Badge></td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Audit Trail Tab */}
        <TabsContent value="audit">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>Audit Trail</CardTitle>
                  <CardDescription>Complete activity log for project accountability</CardDescription>
                </div>
                <div className="flex gap-2">
                  <Badge variant="secondary">Total: {auditStats.total}</Badge>
                  <Badge variant="blue">Photos: {auditStats.photos}</Badge>
                  <Badge variant="purple">AI: {auditStats.aiAnalysis}</Badge>
                  <Badge variant="default">Tasks: {auditStats.taskUpdates}</Badge>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <ScrollArea className="h-[600px]">
                <div className="space-y-4">
                  {auditLogs.map((log) => (
                    <div key={log.id} className="flex items-start gap-4 rounded-lg border border-slate-100 p-4">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-slate-100 text-xl">
                        {getActionIcon(log.action)}
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center justify-between">
                          <p className="font-medium text-slate-900">
                            {log.action.replace(/_/g, ' ')}
                          </p>
                          <span className="text-xs text-slate-500">
                            {format(new Date(log.createdAt), 'MMM d, h:mm:ss a')}
                          </span>
                        </div>
                        <p className="mt-1 text-sm text-slate-600">{log.notes || 'No details'}</p>
                        <div className="mt-2 flex items-center gap-2 text-xs text-slate-500">
                          <Users className="h-3 w-3" />
                          <span>{getUserName(log.userId)}</span>
                          {log.ipAddress && (
                            <>
                              <span>•</span>
                              <span className="font-mono">{log.ipAddress}</span>
                            </>
                          )}
                        </div>
                        {log.oldValue && log.newValue && (
                          <div className="mt-2 rounded bg-slate-50 p-2 text-xs">
                            <span className="text-red-500">Before: {JSON.stringify(log.oldValue)}</span>
                            <span className="mx-2">→</span>
                            <span className="text-emerald-500">After: {JSON.stringify(log.newValue)}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </ScrollArea>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Safety Tab */}
        <TabsContent value="safety">
          <Card>
            <CardHeader>
              <CardTitle>Safety Reports</CardTitle>
              <CardDescription>Safety flags and compliance tracking</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid gap-6 sm:grid-cols-3">
                <div className="rounded-xl bg-red-50 p-6">
                  <p className="text-sm text-red-700">Active Safety Flags</p>
                  <p className="mt-2 text-3xl font-bold text-red-900">3</p>
                  <p className="mt-1 text-sm text-red-600">Require immediate attention</p>
                </div>
                <div className="rounded-xl bg-amber-50 p-6">
                  <p className="text-sm text-amber-700">Resolved This Week</p>
                  <p className="mt-2 text-3xl font-bold text-amber-900">7</p>
                  <p className="mt-1 text-sm text-amber-600">Successfully addressed</p>
                </div>
                <div className="rounded-xl bg-emerald-50 p-6">
                  <p className="text-sm text-emerald-700">Days Without Incident</p>
                  <p className="mt-2 text-3xl font-bold text-emerald-900">45</p>
                  <p className="mt-1 text-sm text-emerald-600">Excellent safety record</p>
                </div>
              </div>
              
              <Separator className="my-6" />
              
              <h3 className="mb-4 text-lg font-semibold">Recent Safety Flags</h3>
              <div className="space-y-3">
                {[
                  { task: 'Gymnasium Roofing', flag: 'Workers at height - verify harness use', date: '2024-02-28', status: 'open' },
                  { task: 'Roof Replacement', flag: 'Debris falling zone - ensure barriers', date: '2024-02-28', status: 'open' },
                  { task: 'North Wing Framing', flag: 'Verify safety equipment usage', date: '2024-02-27', status: 'resolved' },
                ].map((item, i) => (
                  <div key={i} className="flex items-center justify-between rounded-lg border border-slate-200 p-4">
                    <div>
                      <p className="font-medium text-slate-900">{item.task}</p>
                      <p className="text-sm text-slate-600">{item.flag}</p>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-sm text-slate-500">{format(new Date(item.date), 'MMM d')}</span>
                      <Badge variant={item.status === 'open' ? 'destructive' : 'default'}>
                        {item.status.toUpperCase()}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Report Preview Modal */}
      {showPreview && selectedReport && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 overflow-auto">
          <div className="my-8 w-full max-w-6xl rounded-xl bg-white shadow-2xl">
            <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
              <h3 className="text-lg font-semibold text-slate-900">Report Preview</h3>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={handlePrint}>
                  <Printer className="mr-2 h-4 w-4" />
                  Print
                </Button>
                <Button variant="outline" size="sm" onClick={() => setShowPreview(false)}>
                  Close
                </Button>
              </div>
            </div>

            <div className="max-h-[calc(100vh-200px)] overflow-auto p-8">
              <div className="mb-8 border-b-2 border-emerald-600 pb-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-3xl font-bold text-slate-900">{getReportTypeLabel(selectedReport.reportType)}</h1>
                    <p className="mt-1 text-lg text-slate-600">{project.name}</p>
                    <p className="text-sm text-slate-500">{project.clientName}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-medium text-slate-700">
                      {format(new Date(selectedReport.generatedAt), 'MMMM d, yyyy')}
                    </p>
                    <p className="text-xs text-slate-500">
                      {format(new Date(selectedReport.dateFrom), 'MMM d')} - {format(new Date(selectedReport.dateTo), 'MMM d, yyyy')}
                    </p>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
                  <BarChart3 className="h-6 w-6 text-emerald-600" />
                  Executive Summary
                </h2>
                <div className="grid gap-4 sm:grid-cols-4">
                  <div className="rounded-xl bg-emerald-50 p-6 text-center">
                    <p className="text-4xl font-bold text-emerald-600">{selectedReport.summary.overallProgress}%</p>
                    <p className="mt-1 text-sm text-slate-600">Overall Progress</p>
                    <p className="mt-2 text-xs text-emerald-600">+{selectedReport.summary.progressChange}% this period</p>
                  </div>
                  <div className="rounded-xl bg-blue-50 p-6 text-center">
                    <p className="text-4xl font-bold text-blue-600">{selectedReport.summary.photosUploaded}</p>
                    <p className="mt-1 text-sm text-slate-600">Photos Uploaded</p>
                  </div>
                  <div className="rounded-xl bg-amber-50 p-6 text-center">
                    <p className="text-4xl font-bold text-amber-600">{selectedReport.summary.tasksUpdated}</p>
                    <p className="mt-1 text-sm text-slate-600">Tasks Updated</p>
                  </div>
                  <div className="rounded-xl bg-purple-50 p-6 text-center">
                    <p className="text-4xl font-bold text-purple-600">{selectedReport.summary.safetyFlags}</p>
                    <p className="mt-1 text-sm text-slate-600">Safety Flags</p>
                  </div>
                </div>
              </div>

              <div className="mb-8">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
                  <TrendingUp className="h-6 w-6 text-emerald-600" />
                  Progress Trend
                </h2>
                <Card>
                  <CardContent className="p-6">
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
                          <XAxis dataKey="date" tickFormatter={(date) => format(new Date(date), 'MMM d')} stroke="#64748b" fontSize={12} />
                          <YAxis stroke="#64748b" fontSize={12} />
                          <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #e2e8f0', borderRadius: '8px' }} />
                          <Area type="monotone" dataKey="progress" stroke="#10B981" strokeWidth={2} fillOpacity={1} fill="url(#colorProgress)" />
                        </AreaChart>
                      </ResponsiveContainer>
                    </div>
                  </CardContent>
                </Card>
              </div>

              <div className="mb-8">
                <h2 className="mb-4 flex items-center gap-2 text-xl font-semibold text-slate-900">
                  <Calendar className="h-6 w-6 text-emerald-600" />
                  Project Timeline (Gantt Chart)
                </h2>
                <GanttChart tasks={tasks} startDate={project.startDate} endDate={project.endDate} compact={false} />
              </div>

              <div className="mt-12 border-t border-slate-200 pt-6 text-center text-sm text-slate-500">
                <p className="font-medium text-slate-700">SiteProof - Automated Photo-Based QA System</p>
                <p>Report ID: {selectedReport.id}</p>
                <p>Generated on {format(new Date(selectedReport.generatedAt), 'MMMM d, yyyy \'at\' h:mm a')}</p>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
