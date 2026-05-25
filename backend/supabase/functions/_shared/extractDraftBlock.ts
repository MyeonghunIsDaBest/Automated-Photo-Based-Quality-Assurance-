// backend/supabase/functions/_shared/extractDraftBlock.ts
//
// Extracts the <<<DRAFT ... <<<END>>> block from an assistant reply.
// Returns the captured paragraph (trimmed) or null if no block present.

const DRAFT_RE = /<<<DRAFT\s*([\s\S]*?)\s*<<<END>>>/;

export function extractDraftBlock(text: string): string | null {
  const m = text.match(DRAFT_RE);
  if (!m) return null;
  const captured = m[1]?.trim();
  return captured && captured.length > 0 ? captured : null;
}
