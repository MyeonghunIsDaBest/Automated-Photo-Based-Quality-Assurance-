// frontend/src/pages/gantt/tabs/assistant/parseDraftBlock.ts
//
// Frontend mirror of backend/_shared/extractDraftBlock — but returns the
// surrounding text too so the ChatThread can render three nodes (text →
// draft card → text) per assistant reply.

export interface ParsedDraft {
  before: string;
  draft: string;
  after: string;
}

const DRAFT_RE = /<<<DRAFT\s*([\s\S]*?)\s*<<<END>>>/;

export function parseDraftBlock(text: string): ParsedDraft | null {
  const m = text.match(DRAFT_RE);
  if (!m || typeof m.index !== 'number') return null;
  const draft = (m[1] ?? '').trim();
  if (draft.length === 0) return null;
  const before = text.slice(0, m.index);
  const after = text.slice(m.index + m[0].length);
  return { before, draft, after };
}
