import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import PhotoReviewDrawer, { type ReviewQueueItem } from '../components/photos/PhotoReviewDrawer';

// Mock the API helpers so reject/confirm don't try to hit Supabase. The
// spies capture the args the drawer threads through after the T1.7 fix
// (rejectAnalysis must receive the trimmed notes string).

const rejectSpy = vi.fn(async (_photoId: string, _notes?: string) => undefined);
const confirmSpy = vi.fn(
  async (
    _photoId: string,
    _opts?: { overridePct?: number; notes?: string },
  ): Promise<{ ok: true; taskBumped?: boolean; newPct?: number }> => ({ ok: true as const }),
);
const setNotificationSpy = vi.fn();
vi.mock('../lib/api/aiAnalyses', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../lib/api/aiAnalyses')>();
  return {
    ...actual,
    rejectAnalysis: (photoId: string, notes?: string) => rejectSpy(photoId, notes),
    confirmAnalysis: (photoId: string, opts?: { overridePct?: number; notes?: string }) =>
      confirmSpy(photoId, opts),
  };
});

// Drawer hits getPhotoUrl on mount for the thumbnail — return a stub so the
// useEffect resolves without touching network.
vi.mock('../lib/api/photos', () => ({
  getPhotoUrl: vi.fn(async () => 'blob:test-thumb-url'),
}));

// The drawer reads currentProfile for the GPS gate — return a manager so
// the reject/confirm buttons render with no permission gating in the way.
vi.mock('../store', () => ({
  useAppStore: () => ({
    currentProfile: {
      id: 'tester',
      email: 'tester@example.com',
      fullName: 'Tester',
      role: 'project_manager',
      securityGroup: 'manager',
    },
    setNotification: setNotificationSpy,
  }),
}));

function makeItem(overrides: Partial<ReviewQueueItem> = {}): ReviewQueueItem {
  return {
    id: 'analysis-1',
    photo_id: 'photo-1',
    model_used: 'claude-sonnet-4-6',
    phase_detected: 'electrical',
    completion_pct: 60,
    confidence: 0.7,
    safety_flags: [],
    quality_flags: [],
    materials: [],
    suggested_task: null,
    rationale: 'AI rationale here.',
    raw_response: null,
    action_taken: 'pending',
    analysis_status: 'analysed',
    analyzed_at: '2026-05-26T00:00:00Z',
    photos: {
      id: 'photo-1',
      project_id: 'proj-1',
      storage_path: 'proj-1/photo-1.jpg',
      filename: 'site-shot.jpg',
      uploaded_by: 'user-1',
      taken_at: null,
      gps_lat: null,
      gps_lng: null,
    },
    ...overrides,
  };
}

describe('PhotoReviewDrawer', () => {
  beforeEach(() => {
    rejectSpy.mockClear();
    confirmSpy.mockClear();
    setNotificationSpy.mockClear();
  });

  it('threads trimmed reject notes through to rejectAnalysis (T1.7)', async () => {
    const onClose = vi.fn();
    const onResolved = vi.fn();
    render(<PhotoReviewDrawer item={makeItem()} onClose={onClose} onResolved={onResolved} />);

    const textarea = await screen.findByPlaceholderText(/why are you rejecting/i);
    fireEvent.change(textarea, {
      target: { value: '  wrong phase detected — looks like roofing  ' },
    });

    const rejectBtn = screen.getByRole('button', { name: /reject analysis/i });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(rejectSpy).toHaveBeenCalledTimes(1);
    });
    // Trimmed; pass undefined when empty (not yet exercised here, but the
    // trim is what matters for the audit log to read clean).
    expect(rejectSpy).toHaveBeenCalledWith('photo-1', 'wrong phase detected — looks like roofing');
    expect(onResolved).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('passes undefined notes when the textarea is left empty', async () => {
    render(<PhotoReviewDrawer item={makeItem()} onClose={vi.fn()} onResolved={vi.fn()} />);
    const rejectBtn = screen.getByRole('button', { name: /reject analysis/i });
    fireEvent.click(rejectBtn);

    await waitFor(() => {
      expect(rejectSpy).toHaveBeenCalledTimes(1);
    });
    expect(rejectSpy).toHaveBeenCalledWith('photo-1', undefined);
  });

  it('toasts the task bump after a successful confirm (W4)', async () => {
    confirmSpy.mockResolvedValueOnce({ ok: true, taskBumped: true, newPct: 80 });
    render(<PhotoReviewDrawer item={makeItem()} onClose={vi.fn()} onResolved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /confirm analysis at/i }));

    await waitFor(() => expect(confirmSpy).toHaveBeenCalledTimes(1));
    expect(setNotificationSpy).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'success', message: expect.stringContaining('80%') }),
    );
  });

  it('shows an error banner when confirm fails', async () => {
    confirmSpy.mockRejectedValueOnce(new Error('network boom'));
    render(<PhotoReviewDrawer item={makeItem()} onClose={vi.fn()} onResolved={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: /confirm analysis at/i }));

    expect(await screen.findByText(/network boom/i)).toBeTruthy();
  });
});
