import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ShieldCheck, ArrowUpRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { supabase, supabaseConfigured } from '../../lib/supabase';
import { canSeeAdminDashboard } from '../../lib/permissions';
import { FRAUNCES } from '../gantt/components/ledger';

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
    <div className="min-h-screen bg-[#FAF8F2] p-6">
      <div className="mx-auto flex min-h-[80vh] max-w-2xl items-center justify-center">
        <div className="relative w-full overflow-hidden rounded-[14px] border border-[#E6E1D4] bg-white p-10 text-center shadow-[0_8px_28px_rgba(20,20,20,0.08)]">
          {/* Warm sage glow instead of cold emerald blur */}
          <div className="absolute -right-20 -top-20 h-64 w-64 rounded-full bg-[#E5F2EA]/50 blur-3xl" />
          <div className="relative">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-[14px] bg-[#1A1A1A] text-white shadow-[0_4px_14px_rgba(20,20,20,0.20)]">
              <ShieldCheck className="h-6 w-6" />
            </div>
            <p className="mt-6 text-[11px] font-medium uppercase tracking-[0.2em] text-[#6B6B6B]">
              First-time setup
            </p>
            <h1
              className="mt-2 text-3xl font-semibold text-[#1A1A1A]"
              style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}
            >
              Claim the first admin seat.
            </h1>
            <p className="mt-3 text-sm leading-relaxed text-[#6B6B6B]">
              No admin account exists yet. Promote{' '}
              <span className="font-medium text-[#1A1A1A]">
                {currentProfile?.email ?? 'your account'}
              </span>{' '}
              to <span className="font-medium text-[#1A1A1A]">Company Admin</span> so you can manage users,
              projects, and roles. This works once — every later promotion goes through
              the admin dashboard.
            </p>

            {error && (
              <p className="mt-5 rounded-[14px] border border-[#C44545]/30 bg-[#FBE5E5] px-4 py-2.5 text-xs text-[#C44545]">
                {error}
              </p>
            )}

            <div className="mt-8 flex flex-wrap items-center justify-center gap-3">
              <button
                onClick={handleClaim}
                disabled={submitting || hasAdmin === null}
                className="group flex items-center gap-2 rounded-full bg-[#2F8F5C] px-5 py-2.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-[#246F47] hover:shadow-[0_6px_16px_rgba(47,143,92,0.28)] disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-[#2F8F5C] disabled:hover:shadow-none"
              >
                {submitting ? 'Promoting…' : 'Claim Company Admin'}
                <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
              </button>
              <button
                onClick={() => navigate('/dashboard')}
                className="rounded-full border border-[#E6E1D4] bg-white px-5 py-2.5 text-sm font-medium text-[#3A3A3A] transition-all hover:bg-[#FAF8F2] hover:border-[#D8D2C4]"
              >
                Skip for now
              </button>
            </div>

            <p className="mt-6 text-[11px] text-[#A0A0A0]">
              If you'd rather use SQL, see{' '}
              <code className="rounded bg-[#F0EDE4] px-1 py-0.5 text-[#3A3A3A]">
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
