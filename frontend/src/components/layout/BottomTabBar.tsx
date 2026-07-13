// ─────────────────────────────────────────────────────────────────────────────
// components/layout/BottomTabBar.tsx — the phone shell (P9.B).
//
// A solid, full-width work-tool tab bar (not a floating pill): paper surface,
// hairline top, h-16 + safe-area, ≤4 role-aware tabs + a "More" sheet holding
// the rest of the gated nav. Active = ink text + a sage dot above the icon
// (the ledger ToneDot language). Desktop (md+) never sees it.
//
// Stacking contract: this bar is z-30 — BELOW MotionDrawer's backdrop (z-40)
// and sheets (z-50), so bottom sheets deliberately slide over it and the
// backdrop dims it. Layout owns --bottom-nav-h (4rem below md, 0 at md+);
// main content, the Toaster, and FABs pad by that variable.
// ─────────────────────────────────────────────────────────────────────────────

import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { MoreHorizontal } from 'lucide-react';
import MotionDrawer from '../ui/MotionDrawer';
import { useAppStore } from '../../store';
import { bottomTabsFor } from './navConfig';

export default function BottomTabBar() {
  const location = useLocation();
  const { currentUser, currentProfile } = useAppStore();
  const [moreOpen, setMoreOpen] = useState(false);

  if (!currentUser) return null;
  const principal = currentProfile ?? currentUser ?? null;
  const { tabs, more } = bottomTabsFor(principal, currentUser);
  if (tabs.length === 0) return null; // customers: the portal owns its shell

  const isActive = (path: string) =>
    location.pathname === path || (path !== '/' && location.pathname.startsWith(path + '/'));
  const moreActive = more.some((i) => isActive(i.path));

  const tabCls = (active: boolean) =>
    `relative flex min-h-11 flex-1 flex-col items-center justify-center gap-0.5 pt-1.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[#2F8F5C] ${
      active ? 'text-[#1A1A1A]' : 'text-[#6B6B6B]'
    }`;

  const dot = (
    <span aria-hidden className="absolute top-0.5 h-1 w-1 rounded-full bg-[#2F8F5C]" />
  );

  return (
    <>
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 border-t border-[#E6E1D4] bg-[#FAF8F2] pb-safe md:hidden"
      >
        <div className="flex h-16 items-stretch">
          {tabs.map((item) => {
            const active = isActive(item.path);
            return (
              <Link key={item.path} to={item.path} aria-current={active ? 'page' : undefined} className={tabCls(active)}>
                {active && dot}
                <item.icon className="h-6 w-6" strokeWidth={active ? 2 : 1.75} />
                <span className="text-[10px] font-medium leading-none">{item.label}</span>
              </Link>
            );
          })}
          {more.length > 0 && (
            <button
              type="button"
              onClick={() => setMoreOpen(true)}
              aria-haspopup="dialog"
              aria-expanded={moreOpen}
              className={tabCls(moreActive)}
            >
              {moreActive && dot}
              <MoreHorizontal className="h-6 w-6" strokeWidth={moreActive ? 2 : 1.75} />
              <span className="text-[10px] font-medium leading-none">More</span>
            </button>
          )}
        </div>
      </nav>

      {/* The "More" sheet — the rest of the gated nav as 44px rows */}
      <MotionDrawer open={moreOpen} onClose={() => setMoreOpen(false)} ariaLabel="More navigation">
        <div className="p-2 pb-safe">
          <p className="px-3.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-[0.16em] text-[#A0A0A0]">
            More
          </p>
          {more.map((item) => {
            const active = isActive(item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMoreOpen(false)}
                aria-current={active ? 'page' : undefined}
                className={`flex min-h-11 items-center gap-3 rounded-[11px] px-3.5 text-[15px] font-medium transition-colors ${
                  active ? 'bg-[#E5F2EA] text-[#246F47]' : 'text-[#3A3A3A] hover:bg-[#FAF8F2]'
                }`}
              >
                <item.icon className="h-5 w-5" strokeWidth={1.75} />
                {item.label}
              </Link>
            );
          })}
        </div>
      </MotionDrawer>
    </>
  );
}
