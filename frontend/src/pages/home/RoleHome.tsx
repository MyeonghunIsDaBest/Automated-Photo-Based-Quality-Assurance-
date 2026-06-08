// RoleHome — the role-tailored Welcome deck at `/home`. A 7-slide experience
// (Cover · Product · Your day · Project preview · Get ready · Why · Final) with
// a left rail stepper + HUD + keyboard/wheel/touch nav. Content comes from
// `roleHomeConfig.ts` per security_group; real data (name, project count,
// active-project preview) is injected. A persistent "Skip to my work" jumps to
// the role's real workspace so the deck never traps an active user.
//
// Ported from a standalone HTML mockup into React + the app's warm palette /
// Fraunces + DM Sans. All CSS is scoped under `.wd-root` with `wd-` classes so
// nothing leaks into (or in from) the rest of the app. Sits BELOW the TopNav
// (height calc(100vh - 4rem)), so the rail is a slide stepper, not app nav.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  HardHat, Play, ArrowRight, ChevronLeft, ChevronRight, Lock, Info,
  TrendingUp, Image as ImageIcon, type LucideIcon,
} from 'lucide-react';
import { useAppStore } from '../../store';
import { useMyMemberships } from '../../lib/hooks/useMyMemberships';
import { useAutoAcceptInvites } from '../../lib/hooks/useAutoAcceptInvites';
import { useProjectsListStore } from '../projects/store';
import {
  ROLE_DECKS, PRODUCT_SLIDE, WHY_SLIDE, RAIL_STEPS,
  type RoleDeck, type DeckCTA, type DeckCard,
} from './roleHomeConfig';

const N = 7;

export default function RoleHome() {
  const navigate = useNavigate();
  const currentUser = useAppStore((s) => s.currentUser);
  const currentProfile = useAppStore((s) => s.currentProfile);
  const sg = currentProfile?.securityGroup;
  const deck: RoleDeck | undefined = sg ? ROLE_DECKS[sg] : undefined;

  // Implicit accept — fire before the early return so a mis-routed user still
  // gets their invites stamped. No-ops on undefined.
  useAutoAcceptInvites(currentUser?.id);
  const { memberships, isLoading } = useMyMemberships(currentUser?.id);

  const projects = useProjectsListStore((s) => s.projects);
  const activeProjectId = useProjectsListStore((s) => s.activeProjectId);

  const [idx, setIdx] = useState(0);
  const stageRef = useRef<HTMLDivElement | null>(null);

  const go = useMemo(
    () => (n: number) => setIdx(Math.max(0, Math.min(N - 1, n))),
    [],
  );

  // Keyboard nav (ignored while typing in a field).
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.key === 'ArrowRight' || e.key === 'PageDown') { e.preventDefault(); setIdx((i) => Math.min(N - 1, i + 1)); }
      else if (e.key === 'ArrowLeft' || e.key === 'PageUp') { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
      else if (e.key === 'Home') setIdx(0);
      else if (e.key === 'End') setIdx(N - 1);
      else if (/^[1-7]$/.test(e.key)) setIdx(parseInt(e.key, 10) - 1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  // Wheel + touch nav, scoped to the stage so it doesn't fight page scroll
  // elsewhere. Locked to one move per ~620ms.
  useEffect(() => {
    const el = stageRef.current;
    if (!el) return;
    let lock = false;
    const nav = (d: number) => {
      if (lock) return;
      lock = true;
      setIdx((i) => Math.max(0, Math.min(N - 1, i + d)));
      window.setTimeout(() => { lock = false; }, 620);
    };
    const onWheel = (e: WheelEvent) => {
      if (Math.abs(e.deltaY) < 26 && Math.abs(e.deltaX) < 26) return;
      nav(e.deltaY + e.deltaX > 0 ? 1 : -1);
    };
    let tx = 0;
    const onTouchStart = (e: TouchEvent) => { tx = e.touches[0].clientX; };
    const onTouchEnd = (e: TouchEvent) => {
      const dx = e.changedTouches[0].clientX - tx;
      if (Math.abs(dx) > 60) nav(dx < 0 ? 1 : -1);
    };
    el.addEventListener('wheel', onWheel, { passive: true });
    el.addEventListener('touchstart', onTouchStart, { passive: true });
    el.addEventListener('touchend', onTouchEnd, { passive: true });
    return () => {
      el.removeEventListener('wheel', onWheel);
      el.removeEventListener('touchstart', onTouchStart);
      el.removeEventListener('touchend', onTouchEnd);
    };
  }, []);

  // No deck (no profile / mock user). RequireAuth already guarantees a profile
  // before children render, so this is effectively dead in the normal flow —
  // render nothing rather than fire a redirect (avoids adding redirect surface).
  if (!deck) return null;

  const n = memberships.length;
  const fullName = (currentUser?.fullName ?? '').trim();
  const firstName = fullName.split(' ')[0] || 'there';
  const initials = (fullName || deck.roleLabel)
    .split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  const accountSub = isLoading ? 'loading…' : deck.eyebrowSuffix(n);

  // Project-preview slide: the user's real active project if they have one.
  const previewProject =
    projects.find((p) => p.id === activeProjectId) ?? projects[0] ?? null;

  const railLabels = [...RAIL_STEPS, deck.finalRailLabel];

  const pad = (k: number) => (k < 9 ? '0' : '') + (k + 1);
  const cls = (i: number) => `wd-slide${i === idx ? ' is-active' : i < idx ? ' before' : ''}`;

  return (
    <div className="wd-root">
      <style>{WD_CSS}</style>

      {/* ── Rail (slide stepper) ── */}
      <aside className="wd-rail">
        <div className="wd-brand">
          <span className="wd-logo"><HardHat /></span>
          <span className="wd-brandname">SiteProof</span>
        </div>
        <div className="wd-raillabel">Getting started</div>
        <nav className="wd-raillist">
          {railLabels.map((label, i) => (
            <button
              key={label}
              type="button"
              onClick={() => go(i)}
              className={`wd-railitem${i === idx ? ' active' : ''}${i < idx ? ' done' : ''}`}
            >
              <span className="wd-rn">{pad(i)}</span>
              <span className="wd-rl">{label}</span>
            </button>
          ))}
        </nav>
        <div className="wd-acct">
          <span className="wd-avatar">{initials}</span>
          <div className="wd-ai">
            <div className="wd-an">{fullName || 'You'}</div>
            <div className="wd-ar">{accountSub}</div>
          </div>
        </div>
      </aside>

      {/* ── Stage ── */}
      <main className="wd-stage" ref={stageRef}>
        <div className="wd-slides">

          {/* 01 COVER */}
          <section className={`${cls(0)} wd-cover`}>
            <div className="wd-inner">
              <div className="wd-eyebrow wd-anim" style={anim(0)}>{deck.cover.eyebrow}</div>
              <div className="wd-statusrow wd-anim" style={anim(1)}>
                {deck.cover.badges.map((b) => {
                  const Icon = b.icon;
                  return (
                    <span key={b.label} className={`wd-badge ${b.tone}`}><Icon /> {b.label}</span>
                  );
                })}
              </div>
              <h1 className="wd-anim" style={anim(2)}>{deck.cover.title} <span className="wd-em">{deck.cover.accent}</span></h1>
              <p className="wd-sub wd-anim" style={anim(3)}>{deck.cover.sub}</p>
              <div className="wd-cta-row wd-anim" style={anim(4)}>
                <CtaButton cta={deck.cover.primary} onNavigate={navigate} />
                <button type="button" className="wd-btn wd-btn-ghost" onClick={() => go(1)}>
                  <Play /> Take the tour
                </button>
              </div>
            </div>
          </section>

          {/* 02 PRODUCT */}
          <section className={cls(1)}>
            <div className="wd-inner">
              <div className="wd-shead">
                <div className="wd-eyebrow wd-anim" style={anim(0)}>{PRODUCT_SLIDE.eyebrow}</div>
                <h2 className="wd-anim" style={anim(1)}>{PRODUCT_SLIDE.title} <span className="wd-em">{PRODUCT_SLIDE.accent}</span></h2>
              </div>
              <p className="wd-lead wd-anim" style={{ ...anim(2), marginBottom: 34 }}>{PRODUCT_SLIDE.lead}</p>
              <div className="wd-steps wd-anim" style={anim(3)}>
                <div className="wd-dash" />
                {PRODUCT_SLIDE.steps.map((s, i) => (
                  <div className="wd-stepc" key={s.title}>
                    <div className="wd-num">{i + 1}</div>
                    <h4>{s.title}</h4>
                    <p>{s.body}</p>
                  </div>
                ))}
              </div>
            </div>
          </section>

          {/* 03 YOUR DAY */}
          <section className={cls(2)}>
            <div className="wd-inner">
              <div className="wd-shead">
                <div className="wd-eyebrow mut wd-anim" style={anim(0)}>{deck.yourDay.eyebrow}</div>
                <h2 className="wd-anim" style={anim(1)}>{deck.yourDay.title} <span className="wd-em">{deck.yourDay.accent}</span></h2>
              </div>
              <div className="wd-cards3">
                {deck.yourDay.cards.map((c, i) => (
                  <FeatureCard key={c.title} card={c} delay={i + 2} onNavigate={navigate} />
                ))}
              </div>
            </div>
          </section>

          {/* 04 PROJECT PREVIEW */}
          <section className={cls(3)}>
            <div className="wd-inner">
              <div className="wd-shead">
                <div className="wd-eyebrow mut wd-anim" style={anim(0)}>A look ahead</div>
                <h2 className="wd-anim" style={anim(1)}>This is your <span className="wd-em">project home.</span></h2>
              </div>
              <div className="wd-anim" style={anim(2)}>
                <div className="wd-browser">
                  <div className="wd-bar">
                    <div className="wd-dots"><span /><span /><span /></div>
                    <div className="wd-url"><Lock /> app · {previewProject ? 'your project' : 'projects'}</div>
                  </div>
                  <div className="wd-screen">
                    <div className="wd-pv-card">
                      <div className="wd-pv-head">
                        <div>
                          <div className="wd-pv-name">{previewProject?.name ?? 'Your first project'}</div>
                          <div className="wd-pv-meta">{previewProject?.client ?? 'Added the moment you join a crew'}</div>
                        </div>
                        <span className="wd-badge green"><TrendingUp /> {previewProject ? 'On track' : 'Preview'}</span>
                      </div>
                      <div className="wd-track"><div className="wd-fill" style={{ width: `${previewProject?.percentComplete ?? 68}%` }} /></div>
                      <div className="wd-pv-stat">{previewProject ? `${previewProject.percentComplete}% complete` : '68% · sample data'}</div>
                      <div className="wd-thumbs">
                        <div className="wd-thumb"><ImageIcon /></div>
                        <div className="wd-thumb"><ImageIcon /></div>
                        <div className="wd-thumb"><ImageIcon /></div>
                        <div className="wd-thumb more">+9</div>
                      </div>
                    </div>
                    <div className="wd-pv-side">
                      <div className="wd-pv-mini"><div className="mn">Photo QA</div><div className="ms">photos to confirm</div></div>
                      <div className="wd-pv-mini"><div className="mn">Site Diary</div><div className="ms">auto-drafted</div></div>
                      <div className="wd-pv-mini"><div className="mn">Inbox</div><div className="ms">tasks land here</div></div>
                    </div>
                  </div>
                </div>
                <span className="wd-pv-note"><Info /> {previewProject ? 'A snapshot of one of your projects — open it for the live view.' : 'Preview only — your home fills with real tasks and photos once you join a crew.'}</span>
              </div>
            </div>
          </section>

          {/* 05 GET READY */}
          <section className={cls(4)}>
            <div className="wd-inner">
              <div className="wd-shead">
                <div className="wd-eyebrow mut wd-anim" style={anim(0)}>{deck.getReady.eyebrow}</div>
                <h2 className="wd-anim" style={anim(1)}>{deck.getReady.title} <span className="wd-em">{deck.getReady.accent}</span></h2>
              </div>
              <div className="wd-tiles">
                {deck.getReady.cards.map((c, i) => (
                  <TileCard key={c.title} card={c} step={i + 1} delay={i + 2} onNavigate={navigate} />
                ))}
              </div>
            </div>
          </section>

          {/* 06 WHY */}
          <section className={cls(5)}>
            <div className="wd-inner">
              <div className="wd-shead">
                <div className="wd-eyebrow mut wd-anim" style={anim(0)}>{WHY_SLIDE.eyebrow}</div>
                <h2 className="wd-anim" style={anim(1)}>{WHY_SLIDE.title} <span className="wd-em">{WHY_SLIDE.accent}</span></h2>
              </div>
              <div className="wd-why-grid">
                {WHY_SLIDE.pillars.map((p, i) => {
                  const Icon = p.icon;
                  return (
                    <div className="wd-why-item wd-anim" style={anim(i + 2)} key={p.title}>
                      <div className="wd-why-ico"><Icon /></div>
                      <h3>{p.title}</h3>
                      <p>{p.body}</p>
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          {/* 07 FINAL */}
          <section className={cls(6)}>
            <div className="wd-inner">
              <div className="wd-shead">
                <div className="wd-eyebrow wd-anim" style={anim(0)}>{deck.final.eyebrow}</div>
                <h2 className="wd-anim" style={anim(1)}>{deck.final.title} <span className="wd-em">{deck.final.accent}</span></h2>
              </div>
              <div className="wd-invite-card wd-anim" style={{ ...anim(2), maxWidth: 620 }}>
                <h4>{deck.final.headline}</h4>
                <p>{deck.final.body}</p>
                <div className="wd-cta-row" style={{ marginTop: 22 }}>
                  {deck.final.actions.map((a) => (
                    <CtaButton key={a.label} cta={a} onNavigate={navigate} />
                  ))}
                </div>
                {deck.final.note && (
                  <div className="wd-meta"><Info /> {deck.final.note}</div>
                )}
              </div>
            </div>
          </section>

        </div>

        {/* HUD */}
        <div className="wd-hud">
          <div className="wd-counter-wrap">
            <span className="wd-counter">{pad(idx)} <b>/ {pad(N - 1)}</b></span>
            <div className="wd-segs">
              {Array.from({ length: N }).map((_, i) => (
                <span key={i} className={i <= idx ? 'on' : ''} />
              ))}
            </div>
          </div>
          <div className="wd-hud-right">
            <button type="button" className="wd-skip" onClick={() => navigate(deck.skipTo)}>
              Skip to my work <ArrowRight />
            </button>
            <div className="wd-navbtns">
              <button type="button" className="wd-navbtn prev" onClick={() => go(idx - 1)} disabled={idx === 0} aria-label="Previous"><ChevronLeft /></button>
              <button type="button" className="wd-navbtn next" onClick={() => go(idx + 1)} disabled={idx === N - 1} aria-label="Next"><ChevronRight /></button>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}

// ─── helpers ────────────────────────────────────────────────────────────────
function anim(i: number): React.CSSProperties {
  return { ['--i' as string]: i } as React.CSSProperties;
}

function CtaButton({ cta, onNavigate }: { cta: DeckCTA; onNavigate: (to: string) => void }) {
  const Icon: LucideIcon = cta.icon;
  const variant = cta.variant ?? 'dark';
  return (
    <button type="button" className={`wd-btn wd-btn-${variant}`} onClick={() => onNavigate(cta.to)}>
      <Icon /> {cta.label}
    </button>
  );
}

function FeatureCard({ card, delay, onNavigate }: { card: DeckCard; delay: number; onNavigate: (to: string) => void }) {
  const Icon = card.icon;
  return (
    <button type="button" className="wd-fcard wd-anim" style={anim(delay)} onClick={() => card.to && onNavigate(card.to)}>
      <span className="wd-tab">{card.tag}</span>
      <span className={`wd-fico ${card.tone}`}><Icon /></span>
      <h3>{card.title}</h3>
      <p>{card.body}</p>
      <span className="wd-lnk">Learn more <ArrowRight /></span>
    </button>
  );
}

function TileCard({ card, step, delay, onNavigate }: { card: DeckCard; step: number; delay: number; onNavigate: (to: string) => void }) {
  const Icon = card.icon;
  return (
    <button type="button" className="wd-tile wd-anim" style={anim(delay)} onClick={() => card.to && onNavigate(card.to)}>
      <div className="wd-tnum">
        <span className={`wd-tico ${card.tone}`}><Icon /></span>
        <span className="wd-tstep">Step {step}</span>
      </div>
      <h4>{card.title}</h4>
      <p>{card.body}</p>
      <span className="wd-lnk">Open <ArrowRight /></span>
    </button>
  );
}

// ─── scoped styles (ported from the mockup; warm palette + Fraunces/DM Sans) ──
const WD_CSS = `
.wd-root{
  --bg:#F4F3ED; --bg2:#FBFAF5; --surface:#FFFFFF; --sunken:#F0EFE8;
  --ink:#1A1A1A; --ink2:#56544C; --ink3:#8A887E; --line:#E6E1D4; --line2:#DEDCD2;
  --green:#2F8F5C; --green-strong:#246F47; --green-pale:#E5F2EA;
  --black:#1A1A1A; --black2:#2A2A2A; --amber:#C8841E; --amber-pale:#F9EFD9; --slate:#5B6B7A; --slate-pale:#EEF1F4;
  --serif:'Fraunces',Georgia,serif; --sans:'DM Sans',ui-sans-serif,system-ui,sans-serif;
  --pad:clamp(28px,4vw,64px);
  position:relative; height:calc(100vh - 4rem); display:grid; grid-template-columns:280px 1fr;
  background:var(--bg); color:var(--ink); font-family:var(--sans); overflow:hidden;
}
.wd-root *{ box-sizing:border-box; }
.wd-root h1,.wd-root h2,.wd-root h3,.wd-root h4{ font-family:var(--serif); font-weight:500; letter-spacing:-.02em; line-height:1.05; margin:0; }
.wd-root i,.wd-root svg{ flex:none; }
.wd-em{ font-style:italic; color:var(--green); font-weight:500; }
.wd-eyebrow{ font-size:12px; font-weight:700; letter-spacing:.2em; text-transform:uppercase; color:var(--green-strong); display:inline-flex; align-items:center; gap:10px; }
.wd-eyebrow.mut{ color:var(--ink3); }
.wd-badge{ display:inline-flex; align-items:center; gap:6px; font-size:12px; font-weight:600; padding:5px 11px; border-radius:999px; white-space:nowrap; }
.wd-badge svg{ width:13px; height:13px; }
.wd-badge.green{ background:var(--green-pale); color:var(--green-strong); }
.wd-badge.amber{ background:var(--amber-pale); color:var(--amber); }
.wd-badge.slate{ background:var(--slate-pale); color:var(--slate); }
.wd-btn{ display:inline-flex; align-items:center; gap:9px; font-size:14px; font-weight:600; border-radius:999px; padding:12px 20px; transition:.16s; white-space:nowrap; cursor:pointer; border:none; }
.wd-btn svg{ width:16px; height:16px; }
.wd-btn-dark{ background:var(--black); color:#fff; } .wd-btn-dark:hover{ background:var(--black2); transform:translateY(-1px); }
.wd-btn-green{ background:var(--green); color:#fff; } .wd-btn-green:hover{ background:var(--green-strong); transform:translateY(-1px); }
.wd-btn-ghost{ border:1px solid var(--line2); background:var(--surface); color:var(--ink); } .wd-btn-ghost:hover{ border-color:var(--ink3); }
.wd-lnk{ display:inline-flex; align-items:center; gap:7px; font-size:13px; font-weight:600; color:var(--green-strong); }
.wd-lnk svg{ width:15px; height:15px; transition:.16s; } .wd-fcard:hover .wd-lnk svg,.wd-tile:hover .wd-lnk svg{ transform:translateX(3px); }

/* rail */
.wd-rail{ border-right:1px solid var(--line); background:var(--bg2); display:flex; flex-direction:column; padding:26px 20px 22px; }
.wd-brand{ display:flex; align-items:center; gap:11px; }
.wd-logo{ width:38px; height:38px; border-radius:11px; background:var(--green); display:grid; place-items:center; color:#fff; box-shadow:0 2px 6px rgba(36,111,71,.3); }
.wd-logo svg{ width:19px; height:19px; }
.wd-brandname{ font-family:var(--serif); font-size:22px; font-weight:600; letter-spacing:-.01em; }
.wd-raillabel{ font-size:11px; font-weight:700; letter-spacing:.18em; text-transform:uppercase; color:var(--ink3); margin:28px 6px 12px; }
.wd-raillist{ display:flex; flex-direction:column; gap:4px; }
.wd-railitem{ display:flex; align-items:center; gap:13px; padding:11px 13px; border-radius:14px; text-align:left; transition:.16s; background:none; border:none; cursor:pointer; }
.wd-railitem:hover{ background:rgba(26,26,26,.045); }
.wd-rn{ font-family:var(--serif); font-size:13px; font-weight:600; color:var(--ink3); width:22px; flex:none; font-variant-numeric:tabular-nums; }
.wd-rl{ font-size:14px; font-weight:600; color:var(--ink); }
.wd-railitem.active{ background:var(--black); }
.wd-railitem.active .wd-rn{ color:rgba(255,255,255,.55); } .wd-railitem.active .wd-rl{ color:#fff; }
.wd-railitem.done .wd-rn{ color:var(--green); }
.wd-acct{ margin-top:auto; padding-top:18px; border-top:1px solid var(--line); display:flex; align-items:center; gap:11px; }
.wd-avatar{ width:38px; height:38px; border-radius:11px; background:var(--black); color:#fff; display:grid; place-items:center; font-size:13px; font-weight:700; flex:none; }
.wd-an{ font-size:14px; font-weight:600; } .wd-ar{ font-size:11.5px; color:var(--ink3); margin-top:1px; }

/* stage */
.wd-stage{ position:relative; overflow:hidden;
  background:radial-gradient(55% 65% at 90% 8%, rgba(47,143,92,.10), transparent 60%), var(--bg); }
.wd-stage::before{ content:""; position:absolute; inset:0; pointer-events:none;
  background-image:linear-gradient(rgba(26,24,21,.03) 1px,transparent 1px),linear-gradient(90deg,rgba(26,24,21,.03) 1px,transparent 1px);
  background-size:42px 42px; -webkit-mask-image:radial-gradient(120% 80% at 85% 8%,#000,transparent 70%); mask-image:radial-gradient(120% 80% at 85% 8%,#000,transparent 70%); }
.wd-slides{ position:absolute; inset:0; }
.wd-slide{ position:absolute; inset:0; display:flex; flex-direction:column; justify-content:center;
  padding:56px var(--pad) 104px; opacity:0; transform:translateX(34px); pointer-events:none; overflow-y:auto;
  transition:opacity .45s ease, transform .55s cubic-bezier(.16,1,.3,1); }
.wd-slide.before{ transform:translateX(-34px); }
.wd-slide.is-active{ opacity:1; transform:none; pointer-events:auto; }
.wd-inner{ width:100%; max-width:1020px; }
@keyframes wdrise{ from{opacity:0; transform:translateY(16px)} to{opacity:1; transform:none} }
@media (prefers-reduced-motion:no-preference){ .wd-slide.is-active .wd-anim{ animation:wdrise .55s cubic-bezier(.16,1,.3,1) both; animation-delay:calc(var(--i,0)*80ms); } }
.wd-shead{ margin-bottom:clamp(18px,2.6vw,30px); } .wd-shead .wd-eyebrow{ margin-bottom:14px; }
.wd-shead h2{ font-size:clamp(28px,3.4vw,46px); }
.wd-lead{ font-family:var(--serif); font-size:clamp(16px,1.4vw,19px); color:var(--ink2); line-height:1.55; max-width:60ch; }

.wd-cover .wd-statusrow{ display:flex; align-items:center; gap:11px; margin:18px 0 22px; flex-wrap:wrap; }
.wd-cover h1{ font-size:clamp(40px,5vw,76px); line-height:.97; letter-spacing:-.03em; }
.wd-sub{ font-family:var(--serif); font-size:clamp(17px,1.6vw,22px); color:var(--ink2); margin-top:20px; max-width:52ch; line-height:1.5; }
.wd-cta-row{ display:flex; gap:12px; margin-top:30px; flex-wrap:wrap; }

.wd-steps{ display:grid; grid-template-columns:repeat(3,1fr); gap:20px; position:relative; }
.wd-dash{ position:absolute; top:30px; left:15%; right:15%; height:2px; z-index:0; background-image:linear-gradient(90deg,var(--line2) 58%,transparent 0); background-size:10px 2px; }
.wd-stepc{ position:relative; z-index:1; }
.wd-num{ width:58px; height:58px; border-radius:50%; margin-bottom:16px; display:grid; place-items:center; font-family:var(--serif); font-size:21px; font-weight:600; color:#fff; background:var(--black); box-shadow:0 6px 22px rgba(26,21,18,.12); }
.wd-stepc:nth-child(3) .wd-num{ background:var(--green); }
.wd-stepc:nth-child(4) .wd-num{ background:var(--amber); }
.wd-stepc h4{ font-size:clamp(17px,1.6vw,21px); } .wd-stepc p{ font-size:14px; color:var(--ink2); line-height:1.5; margin-top:8px; max-width:30ch; }

.wd-cards3{ display:grid; grid-template-columns:repeat(3,1fr); gap:16px; }
.wd-fcard{ background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:24px 22px 20px; box-shadow:0 1px 2px rgba(26,21,18,.05); display:flex; flex-direction:column; text-align:left; cursor:pointer; transition:.18s; }
.wd-fcard:hover{ box-shadow:0 6px 22px rgba(26,21,18,.08); transform:translateY(-3px); border-color:var(--line2); }
.wd-tab{ font-size:11px; font-weight:600; letter-spacing:.12em; text-transform:uppercase; color:var(--ink3); }
.wd-fico{ width:48px; height:48px; border-radius:13px; display:grid; place-items:center; margin:14px 0 14px; }
.wd-fico svg,.wd-tico svg,.wd-why-ico svg{ width:22px; height:22px; }
.wd-fico.green{ background:var(--green); color:#fff; } .wd-fico.amber{ background:var(--amber-pale); color:var(--amber); } .wd-fico.slate{ background:var(--slate-pale); color:var(--slate); } .wd-fico.dark{ background:var(--black); color:#fff; }
.wd-fcard h3{ font-size:clamp(19px,1.8vw,23px); } .wd-fcard p{ font-size:14px; color:var(--ink2); line-height:1.55; margin:9px 0 16px; } .wd-fcard .wd-lnk{ margin-top:auto; }

.wd-browser{ background:var(--surface); border:1px solid var(--line); border-radius:16px; box-shadow:0 22px 55px rgba(26,21,18,.13); overflow:hidden; max-width:820px; }
.wd-bar{ display:flex; align-items:center; gap:8px; padding:11px 14px; border-bottom:1px solid var(--line); background:var(--bg2); }
.wd-dots{ display:flex; gap:6px; } .wd-dots span{ width:11px; height:11px; border-radius:50%; background:#D9D6CC; }
.wd-url{ margin-left:8px; flex:1; height:24px; border-radius:7px; background:var(--sunken); font-size:12px; color:var(--ink3); display:flex; align-items:center; padding:0 11px; gap:7px; } .wd-url svg{ width:12px; height:12px; color:var(--green-strong); }
.wd-screen{ padding:18px 20px; display:grid; grid-template-columns:1.5fr 1fr; gap:14px; }
.wd-pv-card{ border:1px solid var(--line); border-radius:13px; padding:15px 16px; }
.wd-pv-head{ display:flex; align-items:flex-start; justify-content:space-between; gap:10px; }
.wd-pv-name{ font-family:var(--serif); font-size:16px; font-weight:600; } .wd-pv-meta{ font-size:11.5px; color:var(--ink3); margin-top:3px; }
.wd-track{ height:7px; border-radius:99px; background:var(--sunken); overflow:hidden; margin:13px 0 6px; } .wd-fill{ height:100%; border-radius:99px; background:linear-gradient(90deg,var(--green-strong),var(--green)); }
.wd-pv-stat{ font-size:11.5px; color:var(--ink3); }
.wd-thumbs{ display:grid; grid-template-columns:repeat(4,1fr); gap:7px; margin-top:13px; }
.wd-thumb{ aspect-ratio:1; border-radius:8px; background:linear-gradient(135deg,#DFE6DD,#CDD8C9); border:1px solid var(--line); display:grid; place-items:center; color:rgba(26,21,18,.3); } .wd-thumb svg{ width:14px; height:14px; }
.wd-thumb.more{ background:var(--sunken); color:var(--ink2); font-family:var(--serif); font-weight:600; font-size:13px; }
.wd-pv-side{ display:flex; flex-direction:column; gap:10px; }
.wd-pv-mini{ border:1px solid var(--line); border-radius:11px; padding:11px 12px; } .wd-pv-mini .mn{ font-size:13px; font-weight:600; } .wd-pv-mini .ms{ font-size:11px; color:var(--ink3); margin-top:2px; }
.wd-pv-note{ display:inline-flex; align-items:center; gap:7px; font-size:12.5px; color:var(--ink3); margin-top:14px; } .wd-pv-note svg{ width:14px; height:14px; }

.wd-tiles{ display:grid; grid-template-columns:repeat(3,1fr); gap:14px; }
.wd-tile{ background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:20px 18px; box-shadow:0 1px 2px rgba(26,21,18,.05); display:flex; flex-direction:column; text-align:left; cursor:pointer; transition:.16s; }
.wd-tile:hover{ box-shadow:0 6px 22px rgba(26,21,18,.08); transform:translateY(-3px); border-color:var(--line2); }
.wd-tnum{ display:flex; align-items:center; justify-content:space-between; }
.wd-tico{ width:44px; height:44px; border-radius:12px; display:grid; place-items:center; }
.wd-tico.green{ background:var(--green-pale); color:var(--green-strong); } .wd-tico.dark{ background:var(--black); color:#fff; } .wd-tico.amber{ background:var(--amber-pale); color:var(--amber); } .wd-tico.slate{ background:var(--slate-pale); color:var(--slate); }
.wd-tstep{ font-size:11.5px; font-weight:600; letter-spacing:.1em; text-transform:uppercase; color:var(--ink3); }
.wd-tile h4{ font-size:18px; margin-top:14px; } .wd-tile p{ font-size:13.5px; color:var(--ink2); margin-top:6px; line-height:1.45; } .wd-tile .wd-lnk{ margin-top:14px; }

.wd-why-grid{ display:grid; grid-template-columns:repeat(3,1fr); gap:28px; }
.wd-why-ico{ width:44px; height:44px; border-radius:12px; background:var(--green-pale); color:var(--green-strong); display:grid; place-items:center; margin-bottom:14px; }
.wd-why-item h3{ font-size:clamp(18px,1.7vw,22px); } .wd-why-item p{ font-size:14px; color:var(--ink2); line-height:1.55; margin-top:8px; }

.wd-invite-card{ background:var(--surface); border:1px solid var(--line); border-radius:18px; padding:26px; box-shadow:0 1px 2px rgba(26,21,18,.05); }
.wd-invite-card h4{ font-size:21px; } .wd-invite-card p{ font-size:14.5px; color:var(--ink2); line-height:1.5; margin-top:10px; }
.wd-meta{ margin-top:18px; padding-top:16px; border-top:1px solid var(--line); font-size:12.5px; color:var(--ink3); display:flex; align-items:center; gap:8px; } .wd-meta svg{ width:14px; height:14px; }

/* HUD */
.wd-hud{ position:absolute; left:var(--pad); right:var(--pad); bottom:22px; z-index:10; display:flex; align-items:center; justify-content:space-between; }
.wd-counter-wrap{ display:flex; align-items:center; gap:14px; }
.wd-counter{ font-family:var(--serif); font-size:16px; font-weight:600; font-variant-numeric:tabular-nums; white-space:nowrap; } .wd-counter b{ color:var(--ink3); font-weight:500; }
.wd-segs{ display:flex; gap:6px; } .wd-segs span{ width:22px; height:4px; border-radius:99px; background:var(--line2); transition:.3s; } .wd-segs span.on{ background:var(--green); }
.wd-hud-right{ display:flex; align-items:center; gap:16px; }
.wd-skip{ font-size:13px; font-weight:600; color:var(--ink2); display:inline-flex; align-items:center; gap:7px; background:none; border:none; cursor:pointer; transition:.16s; } .wd-skip:hover{ color:var(--green-strong); } .wd-skip svg{ width:15px; height:15px; }
.wd-navbtns{ display:flex; gap:10px; }
.wd-navbtn{ width:50px; height:50px; border-radius:50%; display:grid; place-items:center; transition:.16s; border:none; cursor:pointer; } .wd-navbtn svg{ width:20px; height:20px; }
.wd-navbtn.prev{ border:1px solid var(--line2); background:rgba(255,255,255,.65); color:var(--ink2); } .wd-navbtn.prev:hover{ border-color:var(--ink3); color:var(--ink); }
.wd-navbtn.next{ background:var(--black); color:#fff; box-shadow:0 6px 22px rgba(26,21,18,.12); } .wd-navbtn.next:hover{ background:var(--black2); transform:translateY(-2px); }
.wd-navbtn:disabled{ opacity:.32; cursor:default; transform:none; }

@media (max-width:1100px){ .wd-root{ grid-template-columns:240px 1fr; } }
@media (max-width:820px){
  .wd-root{ grid-template-columns:1fr; }
  .wd-rail{ display:none; }
  .wd-screen,.wd-steps,.wd-cards3,.wd-tiles,.wd-why-grid{ grid-template-columns:1fr; }
  .wd-skip{ display:none; }
  .wd-slide{ justify-content:flex-start; }
}
`;
