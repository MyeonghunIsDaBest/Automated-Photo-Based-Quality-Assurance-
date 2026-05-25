import { describe, it, expect } from 'vitest';
import { parseDraftBlock } from '../pages/gantt/tabs/assistant/parseDraftBlock';

describe('parseDraftBlock', () => {
  it('returns null when no sentinels are present', () => {
    expect(parseDraftBlock('just a chat reply')).toBeNull();
  });

  it('extracts the draft paragraph and the text before/after', () => {
    const input = `Cleaned for the log:
<<<DRAFT
Slab pour completed. Inspector at 14:00.
<<<END>>>
Apply, or tweak?`;
    const result = parseDraftBlock(input);
    expect(result).not.toBeNull();
    expect(result!.before.trim()).toBe('Cleaned for the log:');
    expect(result!.draft.trim()).toBe('Slab pour completed. Inspector at 14:00.');
    expect(result!.after.trim()).toBe('Apply, or tweak?');
  });

  it('handles a draft block with no surrounding text', () => {
    const input = `<<<DRAFT
Concrete slab pour completed.
<<<END>>>`;
    const result = parseDraftBlock(input);
    expect(result).not.toBeNull();
    expect(result!.before).toBe('');
    expect(result!.draft.trim()).toBe('Concrete slab pour completed.');
    expect(result!.after).toBe('');
  });

  it('returns null on an empty draft block', () => {
    const input = `before
<<<DRAFT

<<<END>>>
after`;
    expect(parseDraftBlock(input)).toBeNull();
  });

  it('returns null on malformed sentinels (missing END)', () => {
    const input = `<<<DRAFT
Something here without a closer`;
    expect(parseDraftBlock(input)).toBeNull();
  });
});
