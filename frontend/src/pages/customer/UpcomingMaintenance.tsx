// UpcomingMaintenance — read-only portal widget showing the next upcoming
// recurring maintenance events for the customer.
//
// Zero mutations. Renders the 5 soonest active schedules.

import { useEffect, useState } from 'react';
import { CalendarClock } from 'lucide-react';
import { cardShell, FRAUNCES } from '../gantt/components/ledger';
import {
  listSchedulesForCustomer,
  type MaintenanceSchedule,
} from '../../lib/api/maintenanceSchedules';
import type { Property } from '../../lib/api/properties';

// ─── date helpers (no tz shift) ──────────────────────────────────────────────

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

function parseLocalDate(dateStr: string): Date {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(y, m - 1, d);
}

function friendlyDate(dateStr: string): string {
  const d = parseLocalDate(dateStr);
  return `${d.getDate()} ${MONTH_NAMES[d.getMonth()]} ${d.getFullYear()}`;
}

type DueTone = 'overdue' | 'soon' | 'ok';

function getDueTone(nextDue: string): DueTone {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const due = parseLocalDate(nextDue);
  const diffDays = Math.floor((due.getTime() - today.getTime()) / 86400000);
  if (diffDays < 0) return 'overdue';
  if (diffDays <= 30) return 'soon';
  return 'ok';
}

const DUE_STYLE: Record<DueTone, { label: string; pill: string; text: string }> = {
  overdue: {
    label: 'Overdue',
    pill: 'bg-[#FBE5E5] text-[#C44545]',
    text: 'text-[#C44545]',
  },
  soon: {
    label: 'Due soon',
    pill: 'bg-[#F9EFD9] text-[#C8841E]',
    text: 'text-[#C8841E]',
  },
  ok: {
    label: '',
    pill: 'bg-[#E5F2EA] text-[#246F47]',
    text: 'text-[#3A3A3A]',
  },
};

// ─── component ───────────────────────────────────────────────────────────────

interface UpcomingMaintenanceProps {
  customerId: string;
  properties: Property[];
}

export default function UpcomingMaintenance({
  customerId,
  properties,
}: UpcomingMaintenanceProps) {
  const [schedules, setSchedules] = useState<MaintenanceSchedule[]>([]);
  const [loading, setLoading] = useState(true);

  const propMap = new Map(properties.map((p) => [p.id, p.name]));

  useEffect(() => {
    setLoading(true);
    listSchedulesForCustomer(customerId)
      .then((data) => {
        // Filter active, sort next due asc, top 5
        const upcoming = data
          .filter((s) => s.isActive)
          .sort((a, b) => a.nextDue.localeCompare(b.nextDue))
          .slice(0, 5);
        setSchedules(upcoming);
      })
      .catch(() => {
        // Silently empty — portal should not block on maintenance widget errors
        setSchedules([]);
      })
      .finally(() => setLoading(false));
  }, [customerId]);

  if (loading) {
    return (
      <section className={`mb-4 overflow-hidden ${cardShell}`}>
        <div className="border-b border-[#EFEBE0] px-5 py-3">
          <h2
            className="text-[16px] font-medium text-[#1A1A1A]"
            style={{ fontFamily: FRAUNCES }}
          >
            Upcoming maintenance
          </h2>
        </div>
        <div className="flex items-center justify-center px-5 py-8">
          <span className="inline-block h-5 w-5 animate-spin rounded-full border-2 border-[#E6E1D4] border-t-[#2F8F5C]" />
        </div>
      </section>
    );
  }

  return (
    <section className={`mb-4 overflow-hidden ${cardShell}`}>
      <div className="border-b border-[#EFEBE0] px-5 py-3">
        <h2
          className="text-[16px] font-medium text-[#1A1A1A]"
          style={{ fontFamily: FRAUNCES }}
        >
          Upcoming maintenance
        </h2>
        <p className="text-[12px] text-[#6B6B6B]">
          Scheduled recurring services for your properties.
        </p>
      </div>

      {schedules.length === 0 ? (
        <div className="flex flex-col items-center gap-2 px-5 py-8 text-center">
          <CalendarClock className="h-7 w-7 text-[#A0A0A0]" strokeWidth={1.5} />
          <p className="text-[13px] text-[#6B6B6B]">No scheduled maintenance coming up.</p>
          <p className="text-[12px] text-[#A0A0A0]">
            Your service team will keep this up to date.
          </p>
        </div>
      ) : (
        <ul className="divide-y divide-[#EFEBE0]">
          {schedules.map((s) => {
            const tone = getDueTone(s.nextDue);
            const style = DUE_STYLE[tone];
            return (
              <li key={s.id} className="flex items-center justify-between gap-4 px-5 py-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-[#1A1A1A]">{s.title}</p>
                  <p className="text-[12px] text-[#6B6B6B]">
                    {propMap.get(s.propertyId) ?? 'Unknown property'}
                    {s.category ? ` · ${s.category}` : ''}
                  </p>
                </div>
                <div className="flex flex-shrink-0 flex-col items-end gap-1 text-right">
                  <span className={`text-[12px] font-medium ${style.text}`}>
                    Due {friendlyDate(s.nextDue)}
                  </span>
                  {tone !== 'ok' && (
                    <span
                      className={`rounded-full px-2 py-0.5 text-[11px] font-semibold ${style.pill}`}
                    >
                      {style.label}
                    </span>
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
