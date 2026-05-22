// WhatIsSiteProof — the "what type of website is this" explainer panel.
// One paragraph in a soft-emerald-tinted card. `<em>…</em>` accents in the
// role-config string render as italic emerald spans.

interface WhatIsSiteProofProps {
  /** Single paragraph; `<em>…</em>` allowed. Pull from
   *  `ROLE_HOME_VARIANTS[role].explainer`. */
  paragraph: string;
}

export default function WhatIsSiteProof({ paragraph }: WhatIsSiteProofProps) {
  return (
    <section
      aria-labelledby="what-is-siteproof-heading"
      className="rounded-2xl border border-emerald-100 bg-gradient-to-br from-emerald-50/70 to-emerald-50/20 px-5 py-6 sm:px-7 sm:py-8"
    >
      <p
        id="what-is-siteproof-heading"
        className="text-[11px] font-medium uppercase tracking-[0.22em] text-emerald-700"
      >
        What is SiteProof
      </p>
      <p
        className="mt-3 max-w-2xl text-base leading-relaxed text-slate-700 sm:text-[17px]"
        style={{ textWrap: 'pretty' }}
        dangerouslySetInnerHTML={{ __html: paragraphHtml(paragraph) }}
      />
    </section>
  );
}

function paragraphHtml(raw: string): string {
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return raw
    .split(/(<em>.*?<\/em>)/g)
    .map((chunk) => {
      const match = chunk.match(/^<em>(.*?)<\/em>$/);
      if (match) {
        return `<em class="font-medium" style="color: var(--accent-color, #047857); font-style: italic">${escape(match[1])}</em>`;
      }
      return escape(chunk);
    })
    .join('');
}
