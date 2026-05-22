// Supabase client — single shared instance for the whole app.
//
// Setup checklist (do these once, then this file works):
//   1. `npm install @supabase/supabase-js`
//   2. Add to `frontend/.env.local` (NOT committed):
//        VITE_SUPABASE_URL=https://<project-ref>.supabase.co
//        VITE_SUPABASE_ANON_KEY=eyJ...
//      Both values come from the Supabase dashboard → Project Settings → API.
//   3. Restart the Vite dev server so the env vars are picked up.
//
import { createClient, SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

if (!url || !anonKey) {
  // Fail loud in development. In production, the build won't ship without
  // these values — set them in Vercel / your host's env settings.
  // eslint-disable-next-line no-console
  console.warn(
    '[supabase] VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing — ' +
      'check frontend/.env.local against .env.local.example.'
  );
}

export const supabase: SupabaseClient = createClient(url ?? '', anonKey ?? '', {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
  },
});

// Tiny helper — true when the client has been configured with real values.
// Components can fall back to the local Zustand store when this is false,
// which keeps the demo working before the backend is wired up.
export function supabaseConfigured(): boolean {
  return Boolean(url && anonKey);
}

// Mock / demo project IDs are plain strings ("project_1", "project_demo_*").
// Any Supabase column typed `uuid` rejects those with "invalid input syntax"
// before RLS even runs. Helpers that query Postgres on a project_id should
// short-circuit at the API boundary so a non-UUID active project (e.g. the
// `mockProject` fallback during the auth bootstrap window) doesn't surface
// a red error banner on the Dashboard / Reports tiles.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(id: string | null | undefined): boolean {
  return typeof id === 'string' && UUID_RE.test(id);
}
