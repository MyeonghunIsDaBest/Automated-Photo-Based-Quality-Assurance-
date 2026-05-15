// Vitest setup — runs once before any test module loads.
//
// `lib/supabase.ts` calls `createClient()` at module top-level, which throws
// `supabaseUrl is required` when the env vars are unset. Suite files that
// don't pre-mock `lib/supabase` (e.g. `useProjectActivity.test.ts`) crash at
// import time before any test runs. Stub safe placeholders so the client
// constructs cleanly — every test that exercises Supabase still uses
// `vi.mock('../lib/supabase', …)` to inject the real test behaviour.

import.meta.env.VITE_SUPABASE_URL = 'http://localhost:54321';
import.meta.env.VITE_SUPABASE_ANON_KEY = 'test-anon-key';

import '@testing-library/jest-dom/vitest';
