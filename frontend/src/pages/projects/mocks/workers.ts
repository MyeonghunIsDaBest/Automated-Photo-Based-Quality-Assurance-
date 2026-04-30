import { Worker } from '../types';

// Starter team for the live pilot. Replace these with real Casone Electrical
// crew records once user accounts and assignments come online.
export const mockWorkers: Worker[] = [
  {
    id: 'w1',
    name: 'Jordan Casone',
    role: 'Project Lead',
    company: 'Casone Electrical Pty Ltd',
    totalHours: 0,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=jordan',
    projectIds: ['project_1'],
  },
  {
    id: 'w2',
    name: 'Site Electrician',
    role: 'Electrician',
    company: 'Casone Electrical Pty Ltd',
    totalHours: 0,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=electrician1',
    projectIds: ['project_1'],
  },
  {
    id: 'w3',
    name: 'Site Apprentice',
    role: 'Apprentice',
    company: 'Casone Electrical Pty Ltd',
    totalHours: 0,
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=apprentice1',
    projectIds: ['project_1'],
  },
];
