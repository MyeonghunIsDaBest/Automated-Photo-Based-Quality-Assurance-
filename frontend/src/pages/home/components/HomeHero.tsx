// HomeHero — the editorial header for the role-aware /home page.
//
// Visually parallel to `EditorialPageHeader` (same grid-bg + blurred glow +
// Fraunces display heading + italic emerald accent) but renders the
// description with HTML support so the role-config's `<em>` accents light
// up. Keeping it as a sibling rather than extending the shared header
// avoids changing the contract of every page that consumes
// `EditorialPageHeader`.
//
// The only "tags" allowed inside the description string are `<em>…</em>` —
// rendered as italic emerald-700 spans. Everything else is HTML-escaped so
// untrusted role-config strings (this shouldn't happen, but defence in
// depth) can't inject markup.

import { Link } from 'react-router-dom';
import { ArrowUpRight } from 'lucide-react';
import EyebrowLabel from '../../../components/editorial/EyebrowLabel';

interface HomeHeroProps {
  eyebrow: string;
  title: string;
  /** Italic emerald accent rendered after the title — usually the user's
   *  first name. */
  accent: string;
  /** Sub-paragraph. `<em>…</em>` accents allowed. */
  description: string;
  /** Optional pill CTA in the right slot. */
  action?: { label: string; to: string };
  /** When true, the eyebrow renders with a subtle ellipsis-pulse class to
   *  signal that whatever count it suffixes is still being fetched. Lets
   *  callers hide the "invited to 0 projects" → "invited to N projects"
   *  pop-in. Cosmetic only — the text the caller passes wins. */
  eyebrowLoading?: boolean;
}

export default function HomeHero({
  eyebrow, title, accent, description, action, eyebrowLoading = false,
}: HomeHeroProps) {
  return (
    <header className="relative overflow-hidden border-b border-slate-200/70 bg-white">
      <div className="grid-bg absolute inset-0 opacity-50" aria-hidden />
      <div
        className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl"
        aria-hidden
      />

      <div className="relative flex flex-col gap-6 px-4 py-8 sm:flex-row sm:items-end sm:justify-between sm:px-8 sm:py-12">
        <div className="min-w-0">
          <EyebrowLabel className={eyebrowLoading ? 'animate-pulse' : undefined}>
            {eyebrow}
          </EyebrowLabel>
          <h1
            className="display mt-3 text-3xl font-medium leading-tight text-slate-900 sm:text-5xl md:text-6xl"
            style={{ textWrap: 'balance' }}
          >
            {title}{' '}
            <em
              className="font-normal italic"
              style={{ color: 'var(--accent-color, #047857)' }}
            >
              {accent}
            </em>
          </h1>
          <p
            className="mt-4 max-w-xl text-base leading-relaxed text-slate-500 sm:text-lg"
            dangerouslySetInnerHTML={{ __html: descriptionHtml(description) }}
          />
        </div>

        {action && (
          <div className="flex-shrink-0">
            <Link
              to={action.to}
              className="group inline-flex items-center gap-1.5 rounded-full bg-slate-900 px-4 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:-translate-y-0.5 hover:bg-emerald-700 active:translate-y-0"
            >
              {action.label}
              <ArrowUpRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5 group-hover:-translate-y-0.5" />
            </Link>
          </div>
        )}
      </div>
    </header>
  );
}

// Splits the raw description on `<em>…</em>` boundaries. Everything inside
// an em becomes an italic emerald span; everything else is HTML-escaped.
function descriptionHtml(raw: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return raw
    .split(/(<em>.*?<\/em>)/g)
    .map((chunk) => {
      const match = chunk.match(/^<em>(.*?)<\/em>$/);
      if (match) {
        return `<em class="font-normal not-italic" style="color: var(--accent-color, #047857); font-style: italic">${escape(match[1])}</em>`;
      }
      return escape(chunk);
    })
    .join('');
}
