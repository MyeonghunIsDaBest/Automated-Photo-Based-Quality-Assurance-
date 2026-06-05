import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ArrowUpRight,
  Building2,
  Camera,
  CheckCircle2,
  GanttChartSquare,
  HardHat,
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
  { value: 'project_manager', label: 'Project Manager',  Icon: Briefcase,      caption: 'Plan + scheduling. Edit Gantt + reports.' },
  { value: 'construction_mgr',label: 'Construction Mgr', Icon: Wrench,         caption: 'Multi-site oversight. Edit projects + tasks.' },
];

const FLOW_STEPS: { Icon: LucideIcon; label: string; caption: string }[] = [
  { Icon: Camera,            label: 'Upload',  caption: 'Drop a daily site photo from the field.' },
  { Icon: GanttChartSquare,  label: 'Update',  caption: 'The Gantt re-aligns to what AI sees.' },
  { Icon: CheckCircle2,      label: 'Prove',   caption: 'Every change is logged for QA and liability.' },
];

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
      navigate('/', { replace: true });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="editorial-root min-h-screen w-full bg-[#F4F0E5] text-[#1A1A1A] antialiased lg:grid lg:grid-cols-[1.08fr_0.92fr]">
      <style>{`
        @keyframes editorialRise {
          from { opacity: 0; transform: translateY(10px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .rise { animation: editorialRise 720ms cubic-bezier(0.2, 0.7, 0.2, 1) both; }
        .rise-1 { animation-delay:  60ms; }
        .rise-2 { animation-delay: 180ms; }
        .rise-3 { animation-delay: 300ms; }
        .rise-4 { animation-delay: 440ms; }

        .ed-label {
          font-family: 'DM Sans', sans-serif;
          font-size: 0.6875rem;
          font-weight: 500;
          letter-spacing: 0.22em;
          text-transform: uppercase;
          color: #6B6B6B;
        }

        .field-input {
          display: block;
          width: 100%;
          min-width: 0;
          border: 1px solid #E6E1D4;
          background-color: white;
          padding: 0.625rem 0.875rem;
          font-size: 0.875rem;
          color: #1A1A1A;
          border-radius: 2px;
          transition: border-color 200ms ease, box-shadow 200ms ease;
        }
        .field-input:focus {
          border-color: #1A1A1A;
          outline: none;
          box-shadow:
            inset 2px 0 0 0 #2F8F5C,
            0 0 0 3px rgb(47 143 92 / 0.10);
        }
        .field-input::placeholder { color: #B5AE9E; }
        @media (max-width: 640px) { .field-input { font-size: 16px; } }

        .field-num {
          font-family: 'Fraunces', serif;
          font-feature-settings: 'ss01';
          font-size: 0.8125rem;
          font-weight: 500;
          color: #C8C2B4;
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
          color: #A0A0A0;
          transition: color 180ms ease;
        }
        .pw-toggle:hover { color: #1A1A1A; }
        .pw-toggle:focus-visible { color: #2F8F5C; outline: none; }

        .ed-tab {
          padding: 0.5rem 0;
          font-size: 0.8125rem;
          font-weight: 500;
          color: #6B6B6B;
          border-bottom: 1.5px solid transparent;
          transition: color 200ms ease, border-color 200ms ease;
        }
        .ed-tab:hover { color: #1A1A1A; }
        .ed-tab.active { color: #1A1A1A; border-bottom-color: #1A1A1A; }

        .role-tile {
          border: 1px solid #E6E1D4;
          background-color: white;
          padding: 0.5rem 0.75rem;
          text-align: left;
          border-radius: 2px;
          transition: border-color 180ms ease, background-color 180ms ease, color 180ms ease;
        }
        .role-tile:hover { border-color: rgb(26 26 26 / 0.32); }
        .role-tile.active {
          background-color: #1A1A1A;
          border-color: #1A1A1A;
          color: white;
        }

        .submit-btn {
          position: relative;
          display: flex;
          width: 100%;
          align-items: center;
          justify-content: center;
          gap: 0.5rem;
          padding: 0.8125rem 1.25rem;
          font-family: 'DM Sans', sans-serif;
          font-size: 0.875rem;
          font-weight: 500;
          color: white;
          background-color: #1A1A1A;
          border-radius: 2px;
          transition: background-color 220ms ease, box-shadow 220ms ease, transform 220ms ease;
          overflow: hidden;
        }
        .submit-btn:not(:disabled):hover {
          background-color: #2F8F5C;
          box-shadow: 0 14px 36px -14px rgb(47 143 92 / 0.5);
          transform: translateY(-1px);
        }
        .submit-btn:disabled { opacity: 0.6; cursor: not-allowed; }
        .submit-btn .arrow { transition: transform 220ms ease; }
        .submit-btn:not(:disabled):hover .arrow { transform: translate(2px, -2px); }
      `}</style>

      {/* ─────────── LEFT — dark editorial panel (desktop only) ─────────── */}
      <section className="relative hidden overflow-hidden bg-[#1A1A1A] text-white lg:flex lg:flex-col lg:justify-between lg:px-14 lg:py-12 xl:px-20">
        {/* Faint dashed survey-arc decoration — engineering blueprint feel. */}
        <div aria-hidden className="pointer-events-none absolute -top-40 left-[55%] h-[36rem] w-[36rem] -translate-x-1/2 rounded-full border border-dashed border-white/[0.06]" />
        <div aria-hidden className="pointer-events-none absolute -top-28 left-[55%] h-[26rem] w-[26rem] -translate-x-1/2 rounded-full border border-dashed border-[#2F8F5C]/20" />

        {/* TOP — brand + eyebrow */}
        <div className="relative rise rise-1">
          <div className="flex items-center gap-2.5">
            <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#2F8F5C] shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              <Building2 className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
            </span>
            <span className="display text-lg font-semibold tracking-tight text-white">SiteProof</span>
          </div>
          <div className="mt-12 flex items-center gap-3">
            <span className="text-[#7FBE9C]">✦</span>
            <span className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/55">
              Quality assurance for the trades
            </span>
          </div>
        </div>

        {/* MIDDLE — headline + QA principle */}
        <div className="relative rise rise-2 py-10">
          <h1 className="display max-w-xl text-5xl font-medium leading-[0.95] tracking-[-0.032em] xl:text-6xl">
            One photograph.
            <br />
            <span className="text-white/35">Every day.</span>
            <br />
            The rest writes{' '}
            <em className="font-normal italic text-[#7FBE9C]">itself</em>.
          </h1>

          <aside className="mt-9 max-w-md border-l-2 border-[#2F8F5C] pl-5">
            <div className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#7FBE9C]">
              QA Principle №01
            </div>
            <p
              className="display mt-2 text-xl font-normal italic leading-[1.25] text-white/90"
              style={{ textWrap: 'balance' }}
            >
              If it isn&apos;t in the photo, it didn&apos;t happen on the job.
            </p>
          </aside>
        </div>

        {/* BOTTOM — 3-step flow + title-block footer */}
        <div className="relative rise rise-3">
          <div className="grid grid-cols-3 gap-6 border-t border-white/10 pt-7">
            {FLOW_STEPS.map((step, i) => {
              const Icon = step.Icon;
              return (
                <div key={step.label}>
                  <div className="flex items-center justify-between">
                    <span className="display text-2xl font-medium leading-none text-white/30 tabular-nums">
                      0{i + 1}
                    </span>
                    <Icon className="h-4 w-4 text-white/40" strokeWidth={1.5} />
                  </div>
                  <p className="display mt-3 text-base font-medium tracking-tight text-white">
                    {step.label}
                  </p>
                  <p className="mt-1 text-xs leading-snug text-white/45">{step.caption}</p>
                </div>
              );
            })}
          </div>
          <p className="mt-9 text-[11px] font-medium uppercase tracking-[0.18em] text-white/35">
            Casone Electrical Pty Ltd
            <span className="mx-2.5 text-white/20">·</span>
            Melbourne, Australia
            <span className="mx-2.5 text-white/20">·</span>
            Authorized users only
          </p>
        </div>
      </section>

      {/* ─────────── RIGHT — cream auth panel ─────────── */}
      <section className="relative flex min-h-screen flex-col px-6 py-8 sm:px-10 lg:px-14 lg:py-10 xl:px-20">
        {/* Paper-grain noise — printed-cream feel. */}
        <div
          className="pointer-events-none absolute inset-0 mix-blend-multiply opacity-[0.04]"
          style={{
            backgroundImage:
              "url(\"data:image/svg+xml,%3Csvg viewBox='0 0 200 200' xmlns='http://www.w3.org/2000/svg'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.9 0'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
          }}
        />

        {/* Mobile brand header (dark panel is desktop-only) */}
        <div className="relative mb-8 flex items-center gap-2.5 lg:hidden">
          <span className="flex h-8 w-8 items-center justify-center rounded-[9px] bg-[#2F8F5C]">
            <Building2 className="h-[18px] w-[18px] text-white" strokeWidth={1.75} />
          </span>
          <span className="display text-lg font-semibold tracking-tight">SiteProof</span>
        </div>

        {/* FORM — vertically centred in the panel */}
        <div className="relative flex flex-1 flex-col justify-center">
          <div className="mx-auto w-full max-w-md">
            <div className="rise rise-2 flex items-center gap-3">
              <span className="ed-label text-[#246F47]">
                ▸ {mode === 'signin' ? 'Sign in' : 'Register'}
              </span>
              <span className="h-px flex-1 bg-[#D8D2C4]" />
            </div>

            <h2 className="display rise rise-2 mt-4 text-3xl font-medium leading-[1.05] tracking-tight sm:text-4xl">
              {mode === 'signin' ? (
                <>
                  Welcome{' '}
                  <em className="font-normal italic text-[#246F47]">back</em>.
                </>
              ) : (
                <>
                  Begin a{' '}
                  <em className="font-normal italic text-[#246F47]">record</em>.
                </>
              )}
            </h2>
            <p className="rise rise-2 mt-2 text-[13px] leading-relaxed text-[#6B6B6B]">
              {mode === 'signin'
                ? 'Use the credentials provided by your administrator.'
                : 'New accounts default to the Worker security group — admin can promote you afterward.'}
            </p>

            {/* Underline tab strip */}
            <div className="rise rise-3 mt-5 flex gap-8 border-b border-[#1A1A1A]/10">
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

            <form onSubmit={handleSubmit} className="rise rise-4 mt-5 space-y-4">
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
                      <span className="text-[10px] text-[#A0A0A0]">
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
                                active ? 'text-[#A8D0B8]' : 'text-[#A0A0A0]'
                              }`}
                              strokeWidth={1.5}
                            />
                            <span className="min-w-0 flex-1">
                              <span className="block text-xs font-semibold leading-tight">
                                {opt.label}
                              </span>
                              <span
                                className={`mt-0.5 block text-[10.5px] leading-tight ${
                                  active ? 'text-[#C9C2B2]' : 'text-[#6B6B6B]'
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
                    <span className="h-px flex-1 bg-[#EFEBE0]" />
                    <span className="ed-label text-[#A0A0A0]">Credentials</span>
                    <span className="h-px flex-1 bg-[#EFEBE0]" />
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
                    <span className="ml-auto text-[10px] text-[#A0A0A0]">Min. 6 characters</span>
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
                <p className="border border-[#F0CFCF] bg-[#FBE5E5] px-3 py-2 text-xs text-[#C44545]">
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
                      className="text-[#A8D0B8]"
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

              <p className="pt-1 text-center text-xs text-[#A0A0A0]">
                {mode === 'signin' ? (
                  <>
                    Don&apos;t have an account?{' '}
                    <button
                      type="button"
                      onClick={() => {
                        setMode('register');
                        setError('');
                      }}
                      className="font-medium text-[#3A3A3A] underline-offset-4 hover:text-[#246F47] hover:underline"
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
                      className="font-medium text-[#3A3A3A] underline-offset-4 hover:text-[#246F47] hover:underline"
                    >
                      Sign in
                    </button>
                  </>
                )}
              </p>
            </form>
          </div>
        </div>

        {/* Panel footer */}
        <div className="relative mt-8 flex items-center justify-between border-t border-[#1A1A1A]/10 pt-4">
          <span className="ed-label">© 2026 SiteProof</span>
          <span className="ed-label text-[#A0A0A0]">Authorized users only</span>
        </div>
      </section>
    </div>
  );
}
