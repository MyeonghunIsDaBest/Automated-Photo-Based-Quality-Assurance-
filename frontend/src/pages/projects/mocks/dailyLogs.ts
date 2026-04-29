import { DailyLog } from '../types';

export const mockDailyLogs: DailyLog[] = [
  {
    id: 'log_1_28',
    projectId: 'proj_1',
    date: '2024-02-28',
    hours: 24.5,
    personnel: [
      { name: 'John Smith', role: 'Electrician', hours: 8, company: 'ABC Electric' },
      { name: 'Maria Garcia', role: 'Site Supervisor', hours: 9, company: 'BuildCorp' },
      { name: 'Mike Johnson', role: 'Plumber', hours: 7.5, company: 'Quick Plumbing' },
    ],
    photos: 23,
    description: 'North Wing framing 65% complete. Electrical rough-in started. Safety inspection passed.',
  },
  {
    id: 'log_1_27',
    projectId: 'proj_1',
    date: '2024-02-27',
    hours: 26,
    personnel: [
      { name: 'John Smith', role: 'Electrician', hours: 8, company: 'ABC Electric' },
      { name: 'Maria Garcia', role: 'Site Supervisor', hours: 9, company: 'BuildCorp' },
      { name: 'Lena Rodriguez', role: 'HVAC Technician', hours: 9, company: 'Climate Pro' },
    ],
    photos: 18,
    description: 'Excellent progress on framing. All safety protocols followed.',
  },
  {
    id: 'log_2_15',
    projectId: 'proj_2',
    date: '2024-03-15',
    hours: 21,
    personnel: [
      { name: 'Sarah Chen', role: 'Carpenter', hours: 8, company: 'Wood Works' },
      { name: 'Priya Patel', role: 'Project Manager', hours: 7, company: 'BuildCorp' },
      { name: 'Maria Garcia', role: 'Site Supervisor', hours: 6, company: 'BuildCorp' },
    ],
    photos: 12,
    description: 'Foundation forms placed. Inspection scheduled for next morning.',
  },
  {
    id: 'log_3_22',
    projectId: 'proj_3',
    date: '2024-04-22',
    hours: 17,
    personnel: [
      { name: 'David Brown', role: 'Roofer', hours: 8, company: 'Roof Masters' },
      { name: 'John Smith', role: 'Electrician', hours: 5, company: 'ABC Electric' },
      { name: 'Lena Rodriguez', role: 'HVAC Technician', hours: 4, company: 'Climate Pro' },
    ],
    photos: 9,
    description: 'Final walkthrough complete. Punch list cleared. Project closeout in progress.',
  },
  {
    id: 'log_4_10',
    projectId: 'proj_4',
    date: '2024-04-10',
    hours: 14,
    personnel: [
      { name: 'Tom Wilson', role: 'Concrete Specialist', hours: 8, company: 'Solid Foundations' },
      { name: 'Priya Patel', role: 'Project Manager', hours: 6, company: 'BuildCorp' },
    ],
    photos: 6,
    description: 'Site mobilization. Equipment staging on north end of lot.',
  },
];
