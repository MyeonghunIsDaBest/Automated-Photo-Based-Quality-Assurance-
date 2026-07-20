// components/layout/NavFlyoutContent.tsx — the two-column mega-menu body.
//
// Shell-agnostic: reused by the desktop hover flyout (NavFlyout, portaled beside
// the rail) AND the phone bottom sheet (BottomTabBar). Left column = sub-views,
// each carrying its lifecycle TONE dot so the list reads as a scannable status
// ledger (Pending slate → In-progress amber → Complete sage → Invoiced violet),
// the same colours the board/register use. Right column = "Create new" actions
// that dispatch a CreateIntent to the app-level switchboard.

import { Link, useLocation } from 'react-router-dom';
import { Plus, ChevronRight } from 'lucide-react';
import { useAppStore } from '../../store';
import { useCreateModalStore } from '../../store/createModal';
import { FRAUNCES, TONE } from '../../pages/gantt/components/ledger';
import type { NavItem } from './navConfig';

export function NavFlyoutContent({
  item,
  onNavigate,
}: {
  item: NavItem;
  /** Called after a sub-view link or create action fires (closes the flyout/sheet). */
  onNavigate?: () => void;
}) {
  const location = useLocation();
  const currentUser = useAppStore((s) => s.currentUser);
  const openCreate = useCreateModalStore((s) => s.open);
  if (!item.flyout) return null;

  const currentSearch = new URLSearchParams(location.search);
  const onThisPath = location.pathname === item.path;

  const isActiveSub = (search: string): boolean => {
    if (!onThisPath) return false;
    if (search === '') {
      // Base view: active only when no distinguishing param is present.
      return !currentSearch.has('view') && !currentSearch.has('status') && !currentSearch.has('filter');
    }
    const [k, v] = search.split('=');
    return currentSearch.get(k) === v;
  };

  const createActions = item.flyout.createActions.filter((a) => (a.gate ? a.gate(currentUser) : true));
  const hasCreate = createActions.length > 0;

  return (
    <div>
      {/* Header — icon tile + Fraunces section name */}
      <div className="flex items-center gap-2.5 border-b border-[#EFEBE0] px-4 py-3">
        <span className="grid h-7 w-7 place-items-center rounded-[8px] bg-[#F0EDE4] text-[#1A1A1A]">
          <item.icon className="h-4 w-4" strokeWidth={1.75} />
        </span>
        <span className="text-[16px] text-[#1A1A1A]" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.01em' }}>
          {item.label}
        </span>
      </div>

      <div className={`grid p-2.5 ${hasCreate ? 'grid-cols-2' : 'grid-cols-1'}`}>
        {/* Left — sub-views (a status ledger) */}
        <div className={`min-w-0 ${hasCreate ? 'pr-2.5' : ''}`}>
          <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#A0A0A0]">Views</p>
          <div className="flex flex-col gap-0.5">
            {item.flyout.subViews.map((sv) => {
              const active = isActiveSub(sv.search);
              const dot = sv.tone ? TONE[sv.tone].dot : '#C9BBA0';
              return (
                <Link
                  key={sv.label}
                  to={sv.search ? `${item.path}?${sv.search}` : item.path}
                  onClick={onNavigate}
                  aria-current={active ? 'page' : undefined}
                  className={`group flex min-h-8 items-center gap-2.5 rounded-md px-2 text-[13.5px] transition-colors ${
                    active ? 'bg-[#F0EDE4] font-semibold text-[#1A1A1A]' : 'text-[#3A3A3A] hover:bg-[#FAF8F2]'
                  }`}
                >
                  <span
                    className="h-[7px] w-[7px] shrink-0 rounded-full"
                    style={active ? { backgroundColor: dot, boxShadow: `0 0 0 3px #fff, 0 0 0 4px ${dot}33` } : { backgroundColor: dot }}
                    aria-hidden
                  />
                  <span className="min-w-0 flex-1 truncate">{sv.label}</span>
                  <ChevronRight
                    className={`h-3.5 w-3.5 shrink-0 text-[#C9BBA0] transition-opacity ${active ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'}`}
                    strokeWidth={2}
                    aria-hidden
                  />
                </Link>
              );
            })}
          </div>
        </div>

        {/* Right — create new (vertical hairline divides the two jobs of the menu) */}
        {hasCreate && (
          <div className="min-w-0 border-l border-[#EFEBE0] pl-2.5">
            <p className="mb-1 px-2 text-[10px] font-bold uppercase tracking-[0.16em] text-[#A0A0A0]">Create new</p>
            <div className="flex flex-col gap-0.5">
              {createActions.map((a) => (
                <button
                  key={a.intent}
                  type="button"
                  onClick={() => { openCreate(a.intent); onNavigate?.(); }}
                  className="group flex min-h-8 items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] font-medium text-[#3A3A3A] transition-colors hover:bg-[#E5F2EA] hover:text-[#246F47]"
                >
                  <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-[#E5F2EA] text-[#2F8F5C] transition-colors group-hover:bg-[#CFE8DA]">
                    <Plus className="h-3 w-3" strokeWidth={2.5} />
                  </span>
                  <span className="min-w-0 flex-1 truncate">{a.label}</span>
                </button>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
