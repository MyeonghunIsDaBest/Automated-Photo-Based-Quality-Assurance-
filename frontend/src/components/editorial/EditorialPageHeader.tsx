// EditorialPageHeader — the reusable shell header used at the top of every
// authenticated page. Lifts Settings / Upload / Gallery / Gantt / Audit onto
// the same editorial baseline that Admin / Dashboard / Reports / Safety /
// Messages / ReviewQueue / Login / Projects already use.
//
// Pattern mirrors Admin.tsx:18-37 — relative-positioned header with grid-bg +
// accent blur, eyebrow chip, balanced display heading with an italic accent
// span, an optional supporting paragraph, and an optional right-aligned slot
// for page-level controls (filter toolbar, primary CTA).

import EyebrowLabel from './EyebrowLabel';

interface EditorialPageHeaderProps {
  eyebrow: string;
  /** Plain-text headline. Use `accent` to italicise a trailing fragment. */
  title: string;
  /** Optional italic / accent span rendered after the title with the
   *  shell's emerald/var(--accent-color) treatment. */
  accent?: string;
  /** Optional trailing punctuation after the accent span (defaults to "."). */
  trailingPunctuation?: string;
  description?: string;
  /** Right-aligned slot for page-level controls (filters, primary CTA). */
  actions?: React.ReactNode;
}

export default function EditorialPageHeader({
  eyebrow,
  title,
  accent,
  trailingPunctuation = '.',
  description,
  actions,
}: EditorialPageHeaderProps) {
  return (
    <header className="relative overflow-hidden border-b border-slate-200/70 bg-white">
      <div className="grid-bg absolute inset-0 opacity-50" />
      <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />

      <div className="relative flex flex-col gap-4 px-4 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:py-10">
        <div>
          <EyebrowLabel>{eyebrow}</EyebrowLabel>
          <h1
            className="display mt-3 text-2xl font-medium leading-tight text-slate-900 sm:text-4xl md:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            {title}
            {accent && (
              <>
                {' '}
                <em
                  className="font-normal italic"
                  style={{ color: 'var(--accent-color, #047857)' }}
                >
                  {accent}
                </em>
              </>
            )}
            {trailingPunctuation}
          </h1>
          {description && (
            <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
              {description}
            </p>
          )}
        </div>
        {actions && <div className="flex flex-wrap items-center gap-2 sm:flex-shrink-0">{actions}</div>}
      </div>
    </header>
  );
}
