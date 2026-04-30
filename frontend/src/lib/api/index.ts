// Barrel for the Supabase data layer. Components should import from here
// (`import { listProjects } from '@/lib/api'`) so we can swap the
// underlying client without touching the call sites.

export * from './projects';
export * from './tasks';
export * from './photos';
export * from './realtime';
export * from './auth';
export * from './profiles';
export * from './stakeholders';
export * from './suppliers';
export * from './userDocuments';
