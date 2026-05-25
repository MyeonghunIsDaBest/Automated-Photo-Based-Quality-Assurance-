import { describe, it, expect, vi, beforeEach } from 'vitest';
import { act, renderHook } from '@testing-library/react';
import { useAssistantChat } from '../pages/gantt/tabs/assistant/useAssistantChat';
import * as api from '../lib/api/siteDiaryAssistant';

vi.mock('../lib/api/siteDiaryAssistant');

describe('useAssistantChat', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('starts empty', () => {
    const { result } = renderHook(() =>
      useAssistantChat({ projectId: '00000000-0000-0000-0000-000000000001', targetDate: '2026-05-25' }),
    );
    expect(result.current.messages).toEqual([]);
    expect(result.current.sending).toBe(false);
    expect(result.current.error).toBeNull();
  });

  it('appends user + assistant messages on successful send', async () => {
    vi.mocked(api.sendAssistantTurn).mockResolvedValue({
      ok: true,
      reply: 'Cleaned for the log:\n<<<DRAFT\nSlab poured.\n<<<END>>>\nApply?',
      draftText: 'Slab poured.',
      model: 'claude-haiku-4-5',
      inputTokens: 1000,
      outputTokens: 50,
    });

    const { result } = renderHook(() =>
      useAssistantChat({ projectId: '00000000-0000-0000-0000-000000000001', targetDate: '2026-05-25' }),
    );
    await act(async () => {
      await result.current.sendMessage('clean my notes');
    });

    expect(result.current.messages).toHaveLength(2);
    expect(result.current.messages[0]).toEqual(expect.objectContaining({ kind: 'user', content: 'clean my notes' }));
    expect(result.current.messages[1].kind).toBe('assistant');
    expect(result.current.error).toBeNull();
  });

  it('exposes draftText on the assistant message when present', async () => {
    vi.mocked(api.sendAssistantTurn).mockResolvedValue({
      ok: true,
      reply: '<<<DRAFT\nSlab poured.\n<<<END>>>',
      draftText: 'Slab poured.',
      model: 'claude-haiku-4-5',
      inputTokens: 1, outputTokens: 1,
    });
    const { result } = renderHook(() =>
      useAssistantChat({ projectId: '00000000-0000-0000-0000-000000000001', targetDate: '2026-05-25' }),
    );
    await act(async () => { await result.current.sendMessage('x'); });
    const last = result.current.messages.at(-1);
    expect(last?.kind).toBe('assistant');
    if (last?.kind === 'assistant') {
      expect(last.draftText).toBe('Slab poured.');
    }
  });

  it('sets error and keeps the user message on API failure', async () => {
    vi.mocked(api.sendAssistantTurn).mockResolvedValue({ ok: false, reason: 'error', detail: 'boom' });
    const { result } = renderHook(() =>
      useAssistantChat({ projectId: '00000000-0000-0000-0000-000000000001', targetDate: '2026-05-25' }),
    );
    await act(async () => { await result.current.sendMessage('hello'); });
    expect(result.current.error).toContain('boom');
    expect(result.current.messages).toHaveLength(1);
    expect(result.current.messages[0].kind).toBe('user');
  });

  it('reset() clears messages and error', async () => {
    vi.mocked(api.sendAssistantTurn).mockResolvedValue({ ok: false, reason: 'error', detail: 'x' });
    const { result } = renderHook(() =>
      useAssistantChat({ projectId: '00000000-0000-0000-0000-000000000001', targetDate: '2026-05-25' }),
    );
    await act(async () => { await result.current.sendMessage('hi'); });
    expect(result.current.messages.length).toBeGreaterThan(0);
    act(() => { result.current.reset(); });
    expect(result.current.messages).toEqual([]);
    expect(result.current.error).toBeNull();
  });
});
