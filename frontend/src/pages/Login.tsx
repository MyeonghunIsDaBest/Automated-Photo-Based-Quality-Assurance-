import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Building2,
  Camera,
  CheckCircle2,
  GanttChartSquare,
  HardHat,
  ClipboardList,
  Briefcase,
  Truck,
  Eye,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../store';
import type { SignupRole } from '../lib/api/auth';

const ROLE_OPTIONS: {
  value: SignupRole;
  label: string;
  Icon: LucideIcon;
  caption: string;
}[] = [
  { value: 'worker',          label: 'Worker',           Icon: HardHat,        caption: 'On-site labour. Upload photos, leave notes.' },
  { value: 'site_manager',    label: 'Site Manager',     Icon: ClipboardList,  caption: 'Run a site. Update tasks, manage photos.' },
  { value: 'project_manager', label: 'Project Manager',  Icon: Briefcase,      caption: 'Plan + scheduling. Edit Gantt + reports.' },
  { value: 'construction_mgr',label: 'Construction Mgr', Icon: Wrench,         caption: 'Multi-site oversight. Edit projects + tasks.' },
  { value: 'stakeholder',     label: 'Stakeholder',      Icon: Eye,            caption: 'Client / external. Read-only with comments.' },
  { value: 'supplier',        label: 'Supplier',         Icon: Truck,          caption: 'Vendor / supplier. Read-only with comments.' },
];

const FLOW_STEPS: { Icon: LucideIcon; label: string; caption: string }[] = [
  { Icon: Camera,            label: 'Upload',  caption: 'Drop a daily site photo from the field.' },
  { Icon: GanttChartSquare,  label: 'Update',  caption: 'The Gantt chart adjusts to what AI sees.' },
  { Icon: CheckCircle2,      label: 'Prove',   caption: 'Every change is logged for QA and liability.' },
];

const FONT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap');
  .login-root { font-family: 'DM Sans', system-ui, sans-serif; }
  .login-root .display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; letter-spacing: -0.02em; }
  .login-root .grid-bg {
    background-image:
      linear-gradient(to right, rgba(15, 23, 42, 0.05) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 23, 42, 0.05) 1px, transparent 1px);
    background-size: 32px 32px;
  }
`;

type Mode = 'signin' | 'register';

export default function Login() {
  const navigate = useNavigate();
  const { login, register } = useAppStore();
  const [mode, setMode] = useState<Mode>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [role, setRole] = useState<SignupRole>('worker');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError('');
    try {
      const result =
        mode === 'signin'
          ? await login(email, password)
          : await register(email, password, firstName, lastName, role);
      if (result.error) {
        setError(result.error);
        return;
      }
      navigate('/dashboard');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="login-root min-h-screen bg-[#FAFAF7]">
      <style>{FONT_STYLES}</style>

      <div className="grid min-h-screen lg:grid-cols-2">
        {/* ─── Left: brand + value prop ─── */}
        <aside className="relative hidden overflow-hidden border-r border-slate-200/70 bg-white lg:block">
          <div className="grid-bg absolute inset-0 opacity-60" />
          <div className="absolute -left-24 -top-24 h-80 w-80 rounded-full bg-emerald-100/50 blur-3xl" />
          <div className="absolute -bottom-32 -right-20 h-96 w-96 rounded-full bg-blue-100/40 blur-3xl" />

          <div className="relative flex h-full flex-col justify-between px-12 py-12">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="display text-xl font-medium text-slate-900">SiteProof</span>
            </div>

            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                <span className="inline-block h-px w-6 bg-slate-400" />
                Photo · Progress · Proof
              </div>
              <h1 className="display max-w-md text-5xl font-medium leading-[1.05] text-slate-900">
                One photo a day —{' '}
                <em className="font-normal italic text-emerald-700">the rest writes itself</em>.
              </h1>
              <p className="mt-5 max-w-md text-[15px] leading-relaxed text-slate-500">
                Upload a daily site photo. The Gantt updates automatically and a
                permanent record is filed for quality assurance and liability protection.
              </p>
            </div>

            <ol className="grid max-w-md gap-3">
              {FLOW_STEPS.map((step, i) => (
                <li
                  key={step.label}
                  className="flex items-start gap-4 rounded-xl border border-slate-200 bg-white/70 px-4 py-3 backdrop-blur-sm"
                >
                  <div className="flex h-9 w-9 flex-shrink-0 items-center justify-center rounded-lg bg-slate-900 text-white">
                    <step.Icon className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="text-[10px] font-medium uppercase tracking-[0.15em] text-slate-400">
                        Step {i + 1}
                      </span>
                      <span className="display text-base font-medium text-slate-900">{step.label}</span>
                    </div>
                    <p className="mt-0.5 text-sm leading-snug text-slate-500">{step.caption}</p>
                  </div>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        {/* ─── Right: sign-in / register ─── */}
        <section className="relative flex flex-col px-6 py-10 sm:px-10 lg:px-16">
          <div className="lg:hidden">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-900">
                <Building2 className="h-5 w-5 text-white" />
              </div>
              <span className="display text-xl font-medium text-slate-900">SiteProof</span>
            </div>
          </div>

          <div className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center py-10">
            <div>
              <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
                <span className="inline-block h-px w-6 bg-slate-400" />
                {mode === 'signin' ? 'Welcome back' : 'Create your account'}
              </div>
              <h2 className="display text-4xl font-medium leading-tight text-slate-900">
                {mode === 'signin' ? (
                  <>Sign <em className="font-normal italic text-emerald-700">in</em>.</>
                ) : (
                  <>Get <em className="font-normal italic text-emerald-700">started</em>.</>
                )}
              </h2>
              <p className="mt-2 text-[15px] leading-relaxed text-slate-500">
                {mode === 'signin'
                  ? 'Use the credentials provided by your administrator.'
                  : 'New accounts default to the Worker security group — your administrator can promote you afterward.'}
              </p>
            </div>

            {/* Tabs */}
            <div className="mt-8 inline-flex rounded-full border border-slate-200 bg-white p-1 self-start">
              {(['signin', 'register'] as const).map((m) => (
                <button
                  key={m}
                  type="button"
                  onClick={() => {
                    setMode(m);
                    setError('');
                  }}
                  className={`rounded-full px-4 py-1.5 text-sm font-medium transition-colors ${
                    mode === m
                      ? 'bg-slate-900 text-white'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  {m === 'signin' ? 'Sign in' : 'Create account'}
                </button>
              ))}
            </div>

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {mode === 'register' && (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">First name</span>
                      <input
                        type="text"
                        required
                        value={firstName}
                        onChange={(e) => setFirstName(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                        placeholder="Jordan"
                      />
                    </label>
                    <label className="block">
                      <span className="text-xs font-medium text-slate-600">Last name</span>
                      <input
                        type="text"
                        required
                        value={lastName}
                        onChange={(e) => setLastName(e.target.value)}
                        className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                        placeholder="Casone"
                      />
                    </label>
                  </div>

                  <div>
                    <span className="text-xs font-medium text-slate-600">Your role</span>
                    <p className="mt-0.5 text-[11px] text-slate-400">
                      Sets your starting permissions. Admin can promote you afterward.
                    </p>
                    <div className="mt-2 grid grid-cols-2 gap-2">
                      {ROLE_OPTIONS.map((opt) => {
                        const active = role === opt.value;
                        return (
                          <button
                            key={opt.value}
                            type="button"
                            onClick={() => setRole(opt.value)}
                            className={`flex items-start gap-2 rounded-lg border px-3 py-2.5 text-left transition-all ${
                              active
                                ? 'border-slate-900 bg-slate-900 text-white shadow-sm'
                                : 'border-slate-200 bg-white text-slate-700 hover:border-slate-300'
                            }`}
                          >
                            <opt.Icon
                              className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                                active ? 'text-emerald-300' : 'text-slate-500'
                              }`}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold leading-tight">
                                {opt.label}
                              </span>
                              <span
                                className={`mt-0.5 block text-[10px] leading-tight ${
                                  active ? 'text-slate-300' : 'text-slate-500'
                                }`}
                              >
                                {opt.caption}
                              </span>
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </>
              )}

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Email</span>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  autoComplete="email"
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                  placeholder="you@example.com"
                />
              </label>

              <label className="block">
                <span className="text-xs font-medium text-slate-600">Password</span>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                  className="mt-1 block w-full rounded-lg border border-slate-300 px-3 py-2.5 text-sm focus:border-slate-900 focus:outline-none"
                  placeholder="••••••••"
                />
              </label>

              {error && (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  {error}
                </p>
              )}

              <button
                type="submit"
                disabled={isLoading}
                className="group flex w-full items-center justify-center gap-2 rounded-full bg-slate-900 px-6 py-3.5 text-sm font-medium text-white transition-all hover:-translate-y-0.5 hover:bg-emerald-700 hover:shadow-lg hover:shadow-emerald-700/20 disabled:translate-y-0 disabled:cursor-not-allowed disabled:opacity-50 disabled:hover:bg-slate-900 disabled:hover:shadow-none"
              >
                {isLoading ? (
                  <>
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="3" fill="none" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    {mode === 'signin' ? 'Signing in…' : 'Creating account…'}
                  </>
                ) : (
                  <>
                    {mode === 'signin' ? 'Sign in' : 'Create account'}
                    <ArrowUpRight className="h-3.5 w-3.5 transition-transform group-hover:-translate-y-0.5 group-hover:translate-x-0.5" />
                  </>
                )}
              </button>

              <p className="text-center text-xs text-slate-400">
                {mode === 'signin' ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setMode('register'); setError(''); }}
                      className="font-medium text-slate-700 hover:text-emerald-700"
                    >
                      Create one
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      type="button"
                      onClick={() => { setMode('signin'); setError(''); }}
                      className="font-medium text-slate-700 hover:text-emerald-700"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </form>
          </div>
        </section>
      </div>
    </div>
  );
}
