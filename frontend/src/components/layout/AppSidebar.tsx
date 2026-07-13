// ─────────────────────────────────────────────────────────────────────────────
// components/layout/AppSidebar.tsx — the desktop ink rail (P9.B shell swap).
//
// The design mocks' 248px sidebar (design/saas-ui-rework/styles.css:59-77),
// realized: sticky ink #1A1A1A rail — brand block top, grouped nav
// (Operations / Commerce / Relationships / Company), user block pinned bottom.
// Active item = solid sage fill. Desktop only (hidden below md); phones get
// BottomTabBar instead.
//
// Signature: the brand block reuses the app's own ledger-kicker DNA (dark
// strip over a glyph tile — the same anatomy as every register header), so
// the rail reads as SiteProof's ledger, not a generic SaaS shell.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useRef, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { LogOut, Settings } from 'lucide-react';
import { useAppStore } from '../../store';
import { SECURITY_GROUP_LABELS } from '../../lib/permissions';
import { FRAUNCES } from '../../pages/gantt/components/ledger';
import { buildNavGroups } from './navConfig';

export default function AppSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { currentUser, currentProfile, logout } = useAppStore();
  const [userMenuOpen, setUserMenuOpen] = useState(false);
  const userBlockRef = useRef<HTMLDivElement>(null);

  // Close the user popover on outside click / Escape.
  useEffect(() => {
    if (!userMenuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (userBlockRef.current && !userBlockRef.current.contains(e.target as Node)) setUserMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setUserMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [userMenuOpen]);

  if (!currentUser) return null;

  const principal = currentProfile ?? currentUser ?? null;
  const groups = buildNavGroups(principal, currentUser);

  const roleLabel = currentProfile
    ? SECURITY_GROUP_LABELS[currentProfile.securityGroup]
    : currentUser.role.charAt(0).toUpperCase() + currentUser.role.slice(1);
  const initials = currentUser.fullName
    .split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'));

  return (
    <aside
      aria-label="Primary"
      className="sticky top-0 hidden h-screen w-[248px] shrink-0 flex-col gap-1 overflow-y-auto bg-[#1A1A1A] px-4 py-[22px] text-[#E8E4DA] md:flex"
    >
      {/* Brand block — a ledger kicker tile (the app's own register DNA) */}
      <Link to="/" className="mb-4 flex items-center gap-3 rounded-[9px] px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F8F5C]">
        <span className="w-[34px] shrink-0 overflow-hidden rounded-[9px] border border-white/15 bg-white/5 text-center">
          <span className="block bg-[#2F8F5C] py-px text-[7px] font-semibold tracking-[0.2em] text-white">CAS</span>
          <span className="block py-0.5 text-[15px] leading-none text-white" style={{ fontFamily: FRAUNCES }}>S</span>
        </span>
        <span className="text-[19px] font-medium text-white" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.01em' }}>
          Site<span className="text-[#2F8F5C]">Proof</span>
        </span>
      </Link>

      {/* Grouped nav */}
      <nav className="flex flex-1 flex-col gap-0.5">
        {groups.map((group, gi) => (
          <div key={group.label ?? gi} className={gi > 0 ? 'mt-4' : ''}>
            {group.label && (
              <div className="mb-1 px-2.5 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#7E796E]">
                {group.label}
              </div>
            )}
            {group.items.map((item) => {
              const active = isActive(item.path);
              return (
                <Link
                  key={item.path}
                  to={item.path}
                  aria-current={active ? 'page' : undefined}
                  className={`mb-0.5 flex items-center gap-[11px] rounded-[9px] px-[11px] py-[9px] text-[13.5px] font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F8F5C] ${
                    active
                      ? 'bg-[#2F8F5C] text-white'
                      : 'text-[#C9C3B4] hover:bg-white/[.06] hover:text-white'
                  }`}
                >
                  <item.icon className="h-[17px] w-[17px] shrink-0" strokeWidth={active ? 2 : 1.75} />
                  <span className="truncate">{item.label}</span>
                </Link>
              );
            })}
          </div>
        ))}
      </nav>

      {/* User block — pinned bottom, hairline above */}
      <div ref={userBlockRef} className="relative mt-auto border-t border-white/[.08] pt-3">
        {userMenuOpen && (
          <div className="absolute bottom-full left-0 mb-2 w-full overflow-hidden rounded-[11px] border border-white/10 bg-[#242424] py-1 shadow-[0_8px_28px_rgba(0,0,0,0.4)]">
            <button
              type="button"
              onClick={() => { setUserMenuOpen(false); navigate('/settings'); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#C9C3B4] transition-colors hover:bg-white/[.06] hover:text-white"
            >
              <Settings className="h-4 w-4" /> Settings
            </button>
            <button
              type="button"
              onClick={() => { setUserMenuOpen(false); logout(); }}
              className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-left text-[13px] font-medium text-[#C9C3B4] transition-colors hover:bg-white/[.06] hover:text-white"
            >
              <LogOut className="h-4 w-4" /> Sign out
            </button>
          </div>
        )}
        <button
          type="button"
          onClick={() => setUserMenuOpen((v) => !v)}
          aria-haspopup="menu"
          aria-expanded={userMenuOpen}
          className="flex w-full items-center gap-2.5 rounded-[9px] px-2 py-1.5 text-left transition-colors hover:bg-white/[.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#2F8F5C]"
        >
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[#2F8F5C] text-[12px] font-semibold text-white">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block truncate text-[13px] font-medium text-white">{currentUser.fullName}</span>
            <span className="block truncate text-[11px] text-[#7E796E]">{roleLabel}</span>
          </span>
        </button>
      </div>
    </aside>
  );
}
