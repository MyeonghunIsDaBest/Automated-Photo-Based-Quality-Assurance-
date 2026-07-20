// ─────────────────────────────────────────────────────────────────────────────
// components/print/PrintDocFooter.tsx — the branded document footer from the
// designer's artwork, shared by the quote and invoice sheets:
//   · hairline rule + company/ABN/REC line
//   · orange contact band (Email us / More information / Call us today!)
//   · navy trade band (BUSINESS · COMMERCIAL · RESIDENTIAL · INDUSTRIAL)
// Every value is settings-backed (migration 100) — a column with no value
// simply doesn't render; nothing is ever a dead placeholder.
// ─────────────────────────────────────────────────────────────────────────────

import { Mail, Globe, Phone } from 'lucide-react';
import type { CommercialSettings } from '../../lib/api/commercial';
import { PRINT, PRINT_EXACT } from './printTheme';

interface Props {
  settings: CommercialSettings | null;
}

export default function PrintDocFooter({ settings }: Props) {
  if (!settings) return null;
  const identityLine = [
    settings.businessName,
    settings.abn ? `ABN ${settings.abn}` : null,
    settings.recLicence,
  ].filter(Boolean).join(' | ');

  const contacts: { label: string; value: string; Icon: typeof Mail }[] = [];
  if (settings.contactEmail) contacts.push({ label: 'Email us', value: settings.contactEmail, Icon: Mail });
  if (settings.website) contacts.push({ label: 'More information', value: settings.website, Icon: Globe });
  const phones = [settings.contactPhone, settings.contactPhoneAlt].filter(Boolean).join(' | ');
  if (phones) contacts.push({ label: 'Call us today!', value: phones, Icon: Phone });

  return (
    <div className="mt-10" style={{ breakInside: 'avoid' }}>
      {identityLine && (
        <p className="border-t border-[#E6E1D4] pt-2 pb-3 text-[10px]" style={{ color: PRINT.grey }}>
          {identityLine}
        </p>
      )}

      {contacts.length > 0 && (
        <div
          className={`flex flex-wrap items-center justify-around gap-x-6 gap-y-3 px-6 py-3.5 ${PRINT_EXACT}`}
          style={{ background: PRINT.orange }}
        >
          {contacts.map(({ label, value, Icon }) => (
            <span key={label} className="flex items-center gap-2.5">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white" aria-hidden>
                <Icon className="h-4 w-4" style={{ color: PRINT.orange }} strokeWidth={2} />
              </span>
              <span className="text-white">
                <span className="block text-[11px] leading-tight opacity-90">{label}</span>
                <span className="block text-[12px] font-bold leading-tight">{value}</span>
              </span>
            </span>
          ))}
        </div>
      )}

      {settings.businessName && (
        <p
          className={`px-6 py-2.5 text-center text-[11px] font-semibold uppercase tracking-[0.4em] text-white ${PRINT_EXACT}`}
          style={{ background: PRINT.navy }}
        >
          {settings.businessName} · Commercial · Residential · Industrial
        </p>
      )}
    </div>
  );
}
