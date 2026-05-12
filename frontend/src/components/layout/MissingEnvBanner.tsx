// MissingEnvBanner — visible warning rendered at the top of the app when
// VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY is missing.
//
// Today's `lib/supabase.ts` only logs a console.warn when the env vars are
// missing — easy to miss in a Vercel deploy. This banner surfaces the
// misconfiguration to whoever opens the app, which is the right escalation
// path for a deploy that's silently running on the mock-data fallback.
//
// In dev (import.meta.env.DEV) the banner stays muted so developers running
// with mock data intentionally don't get nagged on every reload.

import { AlertTriangle } from 'lucide-react';
import { supabaseConfigured } from '../../lib/supabase';

export default function MissingEnvBanner() {
  if (supabaseConfigured()) return null;

  // Dev path: stay quiet. Production / preview path: shout.
  if (import.meta.env.DEV) return null;

  return (
    <div
      role="alert"
      className="border-b border-amber-300 bg-amber-50 px-4 py-2 text-xs text-amber-900"
    >
      <div className="mx-auto flex max-w-6xl items-center gap-2">
        <AlertTriangle className="h-4 w-4 flex-shrink-0" />
        <p className="min-w-0 flex-1">
          <span className="font-semibold">Supabase env vars missing.</span>{' '}
          This deploy is running on the mock-data fallback (no real persistence).
          Set <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">VITE_SUPABASE_URL</code> and{' '}
          <code className="rounded bg-amber-100 px-1 py-0.5 font-mono">VITE_SUPABASE_ANON_KEY</code>{' '}
          in your hosting environment and redeploy.
        </p>
      </div>
    </div>
  );
}
