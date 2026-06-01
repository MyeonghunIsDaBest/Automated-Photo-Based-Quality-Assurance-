import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { canSeeAdminDashboard } from '../../lib/permissions';

// Standalone page used to mint the very first admin on a fresh Supabase
// project. Calls the SECURITY DEFINER `claim_first_admin()` RPC defined
// in supabase/migrations/00_init.sql, which only succeeds when no active
// admin exists yet.
//
// FALLBACK PATH: with the auto-promote in `handle_new_user()`, the very
// first signup on a fresh database becomes company_admin automatically,
// so this page is rarely needed. It's kept as a safety net for cases
// where every existing admin has been deactivated and someone needs to
// re-claim the role from the UI.
export default function BootstrapAdmin() {
  const navigate = useNavigate();
  const { currentProfile, refreshProfile } = useAppStore();
  const [hasAdmin, setHasAdmin] = useState<boolean | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Probe: does the system already have at least one admin? If so, this
  // screen is a no-op — bounce the user straight to the dashboard.
  useEffect(() => {
    let cancelled = false;
    if (!supabaseConfigured()) {
      setHasAdmin(false);
      return;
    }
    (async () => {
      const { count, error: probeError } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .in('security_group', ['company_admin', 'administrator'])
        .eq('is_active', true);
      if (cancelled) return;
      if (probeError) {
        setError(probeError.message);
        setHasAdmin(false);
        return;
      }
      setHasAdmin((count ?? 0) > 0);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // If somebody else has already claimed admin, this screen has nothing to do.
  useEffect(() => {
    if (hasAdmin === true && canSeeAdminDashboard(currentProfile)) {
      navigate('/admin', { replace: true });
    } else if (hasAdmin === true) {
      navigate('/dashboard', { replace: true });
    }
  }, [hasAdmin, currentProfile, navigate]);

  const handleClaim = async () => {
    setError(null);
    setSubmitting(true);
    try {
      const { data, error: rpcError } = await supabase.rpc('claim_first_admin');
      if (rpcError) {
        setError(rpcError.message);
        return;
      }
      if (data !== true) {
        setError('Another account has already claimed admin. Refresh to continue.');
        return;
      }
      // Pull the freshly-promoted profile so security_group reflects
      // 'company_admin' before we route into the admin dashboard.
      await refreshProfile();
      navigate('/admin', { replace: true });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Something went wrong.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#FAFAF7] p-6">
      <div className="mx-auto flex min-h-[80vh] max-w-2xl items-center justify-center">
        <div className="relative w-full overflow-hidden rounded-2xl border border-slate-200 bg-white p-10 text-center shadow-sm">
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-emerald-100/60 blur-3xl" />
          <div className="relative">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-slate-900 text-white">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
              First-time setup
            </p>
            <h1
              className="mt-2 text-3xl font-semibold text-slate-900"
              style={{ fontFamily: "'Fraunces', Georgia, serif", letterSpacing: '-0.02em' }}
            >
              Claim the first admin seat.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-slate-500">
              No admin account exists yet. Promote{' '}
              <span className="font-medium text-slate-900">
                {currentProfile?.email ?? 'your account'}
              </span>{' '}
              to <span className="font-medium">Company Admin</span> so you can manage users,
              projects, and roles. This works once — every later promotion goes through
              the admin dashboard.
            </p>

            {error && (
              <p className="mt-5 rounded-2xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs text-red-700">
                {error}
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleClaim}
                disabled={submitting || hasAdmin === null}
                className="group flex items-center gap-2 rounded-full bg-slate-900 px-5 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-700/20 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-900 disabled:hover:shadow-none"
              >
                {submitting ? 'Promoting…' : 'Claim Company Admin'}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="rounded-full border border-slate-200 px-5 py-2.5 text-sm font-medium text-slate-600 transition-all hover:border-slate-300 hover:text-slate-900"
              >
                Skip for now
              </button>
            </div>

            <p className="mt-6 text-[11px] text-slate-400">
              If you'd rather use SQL, see{' '}
              <code className="rounded bg-slate-100 px-1 py-0.5 text-slate-600">
                supabase/migrations/0009_bootstrap_admin.sql.example
              </code>
              .
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
