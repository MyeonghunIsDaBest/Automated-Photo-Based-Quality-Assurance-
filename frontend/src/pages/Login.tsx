import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Camera,
  CheckCircle2,
  GanttChartSquare,
  HardHat,
  ClipboardList,
  Briefcase,
  Wrench,
  Eye,
  EyeOff,
  type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../store';
import type { SignupRole } from '../lib/api/auth';

// Stakeholder + Supplier accounts are admin-created only — see
// `admin-create-user` Edge Function. They never appear here.
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
];

const FLOW_STEPS: { Icon: LucideIcon; label: string; caption: string }[] = [
  { Icon: Camera,            label: 'Upload',  caption: 'Drop a daily site photo from the field.' },
  { Icon: GanttChartSquare,  label: 'Update',  caption: 'The Gantt re-aligns to what AI sees.' },
  { Icon: CheckCircle2,      label: 'Prove',   caption: 'Every change is logged for QA and liability.' },
];

type Mode = 'signin' | 'register';

const todayLabel = new Date()
  .toLocaleDateString('en-AU', { day: '2-digit', month: 'long', year: 'numeric' })
  .toUpperCase();

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
  const [showPassword, setShowPassword] = useState(false);

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
      // Land on the index route so RoleHomeRedirect picks the role-correct
      // home (worker / stakeholder / supplier → /home; admin/PM → /dashboard).
      // Hardcoding `/dashboard` here bypassed the role split and dumped field
      // roles on the data-dense panel.
      navigate('/', { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="editorial-root relative min-h-screen overflow-hidden bg-[#F4F0E5] text-slate-900 antialiased">
      <style>{`
        @keyframes editorialRise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rise { animation: editorialRise 720ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .rise-1 { animation-delay:  60ms; }
        .rise-2 { animation-delay: 180ms; }
        .rise-3 { animation-delay: 300ms; }
        .rise-4 { animation-delay: 420ms; }
        .rise-5 { animation-delay: 540ms; }
        .rise-6 { animation-delay: 680ms; }

        .ed-label {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.6875rem;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: rgb(100 116 139);
        }
        .hairline { height: 1px; background-color: rgb(15 23 42 / 0.12); }

        .field-input {
          display: block;
          width: 100%;
          min-width: 0;
          border: 1px solid rgb(15 23 42 / 0.14);
          background-color: white;
          padding-top: 0.625rem;
          padding-right: 0.875rem;
          padding-bottom: 0.625rem;
          padding-left: 0.875rem;
          font-size: 0.875rem;
          color: rgb(15 23 42);
          border-radius: 2px;
          transition: border-color 200ms ease, box-shadow 200ms ease;
        }
        .field-input:focus {
          border-color: rgb(15 23 42);
          outline: none;
          box-shadow:
            inset 2px 0 0 0 rgb(4 120 87),
            0 0 0 3px rgb(15 23 42 / 0.06);
        }
        .field-input::placeholder { color: rgb(148 163 184); }
        @media (max-width: 640px) { .field-input { font-size: 16px; } }

        .field-num {
          font-family: 'Fraunces', serif;
          font-feature-settings: 'ss01';
          font-size: 0.8125rem;
          font-weight: 500;
          color: rgb(203 213 225);
          font-variant-numeric: tabular-nums;
          letter-spacing: -0.02em;
        }
        .field-row { display: flex; align-items: baseline; gap: 0.625rem; }

        .pw-toggle {
          position: absolute;
          right: 0.625rem;
          top: 50%;
          transform: translateY(-50%);
          padding: 0.25rem;
          color: rgb(148 163 184);
          transition: color 180ms ease;
        }
        .pw-toggle:hover { color: rgb(15 23 42); }
        .pw-toggle:focus-visible { color: rgb(4 120 87); outline: none; }

        .ed-tab {
          padding: 0.5rem 0;
          font-size: 0.8125rem;
          font-weight: 500;
          color: rgb(100 116 139);
          border-bottom: 1.5px solid transparent;
          transition: color 200ms ease, border-color 200ms ease;
        }
        .ed-tab:hover { color: rgb(15 23 42); }
        .ed-tab.active { color: rgb(15 23 42); border-bottom-color: rgb(15 23 42); }

        .role-tile {
          border: 1px solid rgb(15 23 42 / 0.12);
          background-color: white;
          padding: 0.5rem 0.75rem;
          text-align: left;
          border-radius: 2px;
          transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease;
        }
        .role-tile:hover { border-color: rgb(15 23 42 / 0.4); }
        .role-tile.active {
          background-color: rgb(15 23 42);
          border-color: rgb(15 23 42);
          color: white;
        }

        .submit-btn {
          position: relative;
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.75rem 1.25rem;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.875rem;
          font-weight: 500;
          color: white;
          background-color: rgb(15 23 42);
          border-radius: 2px;
          transition: background-color 220ms ease, box-shadow 220ms ease, transform 220ms ease;
          overflow: hidden;
        }
        .submit-btn:not(:disabled):hover {
          background-color: rgb(4 120 87);
          box-shadow: 0 14px 36px -14px rgb(4 120 87 / 0.55);
          transform: translateY(-1px);
        }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .submit-btn .arrow { transition: transform 220ms ease; }
        .submit-btn:not(:disabled):hover .arrow { transform: translate(2px, -2px); }
      `}</style>

      {/* Paper-grain noise overlay — gives the cream background a printed feel. */}
      <div
        className="pointer-events-none absolute inset-0 mix-blend-multiply opacity-[0.04]"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      {/* ─────────── MASTHEAD ─────────── */}
      <header className="relative z-10 mx-auto max-w-[1400px] px-6 pt-6 sm:px-10 lg:px-12">
        <div className="hairline" />
        <div className="grid grid-cols-3 items-baseline gap-4 py-4">
          <div className="rise rise-1 ed-label">Doc SP-001 · Rev 04</div>
          <div className="rise rise-1 text-center">
            <span className="display text-lg font-semibold tracking-tight sm:text-xl">SiteProof</span>
            <span className="ed-label ml-3 hidden sm:inline">Photo-based QA</span>
          </div>
          <div className="rise rise-1 ed-label text-right">{todayLabel}</div>
        </div>
        <div className="hairline" />
        <div className="rise rise-1 py-2 text-center">
          <span className="ed-label text-slate-500">
            Quality assurance for the construction trades
            <span className="mx-2 text-slate-300">·</span>
            Authorized users only
          </span>
        </div>
        <div className="hairline" />
      </header>

      {/* ─────────── MAIN GRID ─────────── */}
      <main className="relative z-10 mx-auto grid max-w-[1400px] grid-cols-1 gap-12 px-6 pt-12 sm:px-10 lg:grid-cols-12 lg:gap-20 lg:px-12 lg:pt-20 lg:pb-16">

        {/* LEFT — Editorial panel */}
        <section className="relative lg:col-span-7">
          <div className="relative">
            <div className="rise rise-2 mb-7 flex items-center gap-4">
              <span className="ed-label">▸ How it works</span>
              <span className="h-px flex-1 max-w-[6rem] bg-slate-300" />
              <span className="ed-label text-slate-400">Photo → record · 3 steps</span>
            </div>

            <h1 className="rise rise-3 display max-w-3xl text-5xl font-medium leading-[0.92] tracking-[-0.032em] sm:text-6xl lg:text-7xl xl:text-[5.5rem]">
              One photograph.
              <br />
              <span className="text-slate-400">Every day.</span>
              <br />
              The rest writes{' '}
              <em className="font-normal italic text-emerald-700">itself</em>.
            </h1>

            <p className="rise rise-4 mt-8 max-w-md text-[15px] leading-relaxed text-slate-500">
              Drop one site photo. The Gantt re-aligns automatically and the record is
              filed — permanent, sortable, audit-grade. Built for foremen, project
              managers, and the people who answer to lawyers when a job goes sideways.
            </p>

            {/* QA principle callout — specification-style, not a magazine pull-quote */}
            <aside className="rise rise-4 mt-10 max-w-md border-l-2 border-emerald-700 pl-5">
              <div className="ed-label text-emerald-700">QA Principle №01</div>
              <p
                className="display mt-2 text-2xl font-normal italic leading-[1.2] tracking-tight text-slate-900"
                style={{ textWrap: 'balance' }}
              >
                If it isn&apos;t in the photo, it didn&apos;t happen on the job.
              </p>
            </aside>

            {/* TOC-style numbered flow */}
            <ol className="rise rise-5 mt-12 max-w-lg">
              {FLOW_STEPS.map((step, i) => {
                const Icon = step.Icon;
                return (
                  <li
                    key={step.label}
                    className="grid grid-cols-[auto_1fr_auto] items-baseline gap-x-6 border-b border-slate-900/10 py-5 last:border-b-0"
                  >
                    <span className="display text-3xl font-medium leading-none text-slate-300 tabular-nums">
                      0{i + 1}
                    </span>
                    <div>
                      <span className="display text-xl font-medium tracking-tight text-slate-900">
                        {step.label}
                      </span>
                      <p className="mt-1 text-sm leading-snug text-slate-500">
                        {step.caption}
                      </p>
                    </div>
                    <Icon className="h-4 w-4 self-center text-slate-400" strokeWidth={1.5} />
                  </li>
                );
              })}
            </ol>

            {/* System info — title-block footer */}
            <div className="rise rise-6 mt-16 hidden border-t border-slate-900/10 pt-5 lg:block">
              <p className="ed-label">
                Casone Electrical Pty Ltd
                <span className="mx-3 text-slate-300">·</span>
                Melbourne, Australia
                <span className="mx-3 text-slate-300">·</span>
                Authorized users only
              </p>
            </div>
          </div>
        </section>

        {/* RIGHT — Sign-in card */}
        <section className="relative lg:col-span-5 lg:min-h-[620px]">
          <div className="lg:sticky lg:top-10">
            <div className="rise rise-3 relative border border-slate-900/10 bg-white p-6 shadow-[0_1px_0_0_rgb(15_23_42/0.04),_0_12px_40px_-24px_rgb(15_23_42/0.18)] sm:p-7 lg:p-8">
              {/* Emerald bookmark accent — bleeds onto the border like a page tab. */}
              <span
                aria-hidden="true"
                className="absolute left-[-2px] top-8 h-12 w-[3px] bg-emerald-700"
              />
              <div className="flex items-center gap-3">
                <span className="ed-label text-emerald-700">
                  ▸ {mode === 'signin' ? 'Sign in' : 'Register'}
                </span>
                <span className="h-px flex-1 bg-slate-200" />
              </div>

              <h2 className="display mt-4 text-2xl font-medium leading-[1.05] tracking-tight sm:text-3xl">
                {mode === 'signin' ? (
                  <>
                    Welcome{' '}
                    <em className="font-normal italic text-emerald-700">back</em>.
                  </>
                ) : (
                  <>
                    Begin a{' '}
                    <em className="font-normal italic text-emerald-700">record</em>.
                  </>
                )}
              </h2>
              <p className="mt-1.5 text-[13px] leading-relaxed text-slate-500">
                {mode === 'signin'
                  ? 'Use the credentials provided by your administrator.'
                  : 'New accounts default to the Worker security group — admin can promote you afterward.'}
              </p>

              {/* Underline tab strip */}
              <div className="mt-5 flex gap-8 border-b border-slate-900/10">
                {(['signin', 'register'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => {
                      setMode(m);
                      setError('');
                    }}
                    className={`ed-tab -mb-px ${mode === m ? 'active' : ''}`}
                  >
                    {m === 'signin' ? 'Sign in' : 'Create account'}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                {mode === 'register' && (
                  <>
                    <div className="grid grid-cols-2 gap-4">
                      <label className="block">
                        <div className="field-row">
                          <span className="field-num">01</span>
                          <span className="ed-label">First name</span>
                        </div>
                        <input
                          type="text"
                          required
                          value={firstName}
                          onChange={(e) => setFirstName(e.target.value)}
                          className="field-input mt-1.5"
                          placeholder="Jordan"
                        />
                      </label>
                      <label className="block">
                        <div className="field-row">
                          <span className="field-num">02</span>
                          <span className="ed-label">Last name</span>
                        </div>
                        <input
                          type="text"
                          required
                          value={lastName}
                          onChange={(e) => setLastName(e.target.value)}
                          className="field-input mt-1.5"
                          placeholder="Casone"
                        />
                      </label>
                    </div>

                    <div>
                      <div className="flex items-baseline justify-between">
                        <div className="field-row">
                          <span className="field-num">03</span>
                          <span className="ed-label">Your role</span>
                        </div>
                        <span className="text-[10px] text-slate-400">
                          Admin can promote you later
                        </span>
                      </div>
                      <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
                        {ROLE_OPTIONS.map((opt) => {
                          const active = role === opt.value;
                          const Icon = opt.Icon;
                          return (
                            <button
                              key={opt.value}
                              type="button"
                              onClick={() => setRole(opt.value)}
                              className={`role-tile flex items-start gap-3 ${active ? 'active' : ''}`}
                            >
                              <Icon
                                className={`mt-0.5 h-4 w-4 flex-shrink-0 ${
                                  active ? 'text-emerald-300' : 'text-slate-400'
                                }`}
                                strokeWidth={1.5}
                              />
                              <span className="min-w-0 flex-1">
                                <span className="block text-xs font-semibold leading-tight">
                                  {opt.label}
                                </span>
                                <span
                                  className={`mt-0.5 block text-[10.5px] leading-tight ${
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

                    {/* Section divider — credentials follow */}
                    <div className="flex items-center gap-3 pt-1">
                      <span className="h-px flex-1 bg-slate-200" />
                      <span className="ed-label text-slate-400">Credentials</span>
                      <span className="h-px flex-1 bg-slate-200" />
                    </div>
                  </>
                )}

                <label className="block">
                  <div className="field-row">
                    <span className="field-num">{mode === 'register' ? '04' : '01'}</span>
                    <span className="ed-label">Email</span>
                  </div>
                  <input
                    type="email"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    autoComplete="email"
                    className="field-input mt-1.5"
                    placeholder="you@example.com"
                  />
                </label>

                <label className="block">
                  <div className="field-row">
                    <span className="field-num">{mode === 'register' ? '05' : '02'}</span>
                    <span className="ed-label">Password</span>
                    {mode === 'signin' && (
                      <span className="ml-auto text-[10px] text-slate-400">Min. 6 characters</span>
                    )}
                  </div>
                  <div className="relative mt-1.5">
                    <input
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      autoComplete={mode === 'signin' ? 'current-password' : 'new-password'}
                      className="field-input"
                      style={{ paddingRight: '2.5rem' }}
                      placeholder="••••••••"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      tabIndex={-1}
                      className="pw-toggle"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? (
                        <EyeOff className="h-4 w-4" strokeWidth={1.6} />
                      ) : (
                        <Eye className="h-4 w-4" strokeWidth={1.6} />
                      )}
                    </button>
                  </div>
                </label>

                {error && (
                  <p className="border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                    {error}
                  </p>
                )}

                <button type="submit" disabled={isLoading} className="submit-btn">
                  {isLoading ? (
                    <>
                      <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24">
                        <circle
                          className="opacity-25"
                          cx="12"
                          cy="12"
                          r="10"
                          stroke="currentColor"
                          strokeWidth="3"
                          fill="none"
                        />
                        <path
                          className="opacity-75"
                          fill="currentColor"
                          d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
                        />
                      </svg>
                      <span>{mode === 'signin' ? 'Signing in…' : 'Creating account…'}</span>
                    </>
                  ) : (
                    <>
                      <span>{mode === 'signin' ? 'Sign in' : 'Create account'}</span>
                      <span
                        className="text-emerald-300"
                        style={{
                          fontFamily: 'Fraunces, serif',
                          fontStyle: 'italic',
                          fontWeight: 400,
                        }}
                      >
                        — {mode === 'signin' ? 'enter' : 'begin'}
                      </span>
                      <ArrowUpRight className="arrow h-4 w-4" strokeWidth={1.75} />
                    </>
                  )}
                </button>

                <p className="pt-1 text-center text-xs text-slate-400">
                  {mode === 'signin' ? (
                    <>
                      Don&apos;t have an account?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('register');
                          setError('');
                        }}
                        className="font-medium text-slate-700 underline-offset-4 hover:text-emerald-700 hover:underline"
                      >
                        Create one
                      </button>
                    </>
                  ) : (
                    <>
                      Already have an account?{' '}
                      <button
                        type="button"
                        onClick={() => {
                          setMode('signin');
                          setError('');
                        }}
                        className="font-medium text-slate-700 underline-offset-4 hover:text-emerald-700 hover:underline"
                      >
                        Sign in
                      </button>
                    </>
                  )}
                </p>
              </form>
            </div>

            {/* Mobile-only colophon below the card */}
            <div className="mt-6 border-t border-slate-900/10 pt-4 lg:hidden">
              <p className="ed-label text-center">
                Casone Electrical · Melbourne, Australia
              </p>
            </div>
          </div>
        </section>
      </main>

      {/* ─────────── FOOTER RULE ─────────── */}
      <footer className="relative z-10 mx-auto max-w-[1400px] px-6 pb-6 sm:px-10 lg:px-12">
        <div className="hairline" />
        <div className="grid grid-cols-2 items-baseline gap-4 py-4">
          <div className="ed-label">© 2026 SiteProof</div>
          <div className="ed-label text-right">Authorized users only</div>
        </div>
      </footer>
    </div>
  );
}
