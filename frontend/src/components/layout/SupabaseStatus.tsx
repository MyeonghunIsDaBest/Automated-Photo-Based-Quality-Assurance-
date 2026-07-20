import { useEffect, useState } from 'react';
import { Database, Loader2 } from 'lucide-react';
import { supabase, supabaseConfigured } from '../../lib/supabase';

// Dev-only pill that pings Supabase on mount and shows the result.
// Hidden in production builds (gated by `import.meta.env.DEV`).

type Health =
  | { kind: 'checking' }
  | { kind: 'unconfigured' }
  | { kind: 'ok'; rowCount: number }
  | { kind: 'error'; message: string };

export function SupabaseStatus() {
  const [health, setHealth] = useState<Health>({ kind: 'checking' });

  useEffect(() => {
    if (!import.meta.env.DEV) return;

    if (!supabaseConfigured()) {
      setHealth({ kind: 'unconfigured' });
      return;
    }

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('projects')
        .select('id', { count: 'exact', head: true });
      if (cancelled) return;
      if (error) {
        setHealth({ kind: 'error', message: error.message });
      } else {
        setHealth({ kind: 'ok', rowCount: data?.length ?? 0 });
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  if (!import.meta.env.DEV) return null;

  const palette = (() => {
    switch (health.kind) {
      case 'checking':     return 'border-[#E6E1D4] bg-[#FAF8F2] text-[#6B6B6B]';
      case 'unconfigured': return 'border-amber-200 bg-amber-50 text-amber-700';
      case 'ok':           return 'border-emerald-200 bg-emerald-50 text-emerald-700';
      case 'error':        return 'border-red-200 bg-red-50 text-red-700';
    }
  })();

  const label = (() => {
    switch (health.kind) {
      case 'checking':     return 'Checking Supabase…';
      case 'unconfigured': return 'Supabase: no env';
      case 'ok':           return 'Supabase: connected';
      case 'error':        return 'Supabase: error';
    }
  })();

  const tooltip = (() => {
    switch (health.kind) {
      case 'unconfigured':
        return 'VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY missing in frontend/.env.local';
      case 'error':
        return health.message;
      case 'ok':
        return 'projects table reachable';
      default:
        return undefined;
    }
  })();

  return (
    <div
      title={tooltip}
      className={`hidden md:inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${palette}`}
    >
      {health.kind === 'checking' ? (
        <Loader2 className="h-3 w-3 animate-spin" />
      ) : (
        <Database className="h-3 w-3" />
      )}
      {label}
    </div>
  );
}
