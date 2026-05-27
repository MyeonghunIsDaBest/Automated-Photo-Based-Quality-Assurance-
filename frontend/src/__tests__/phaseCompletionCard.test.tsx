import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhaseCompletionCard } from '../pages/gantt/tabs/PhaseCompletionCard';
import type { PhaseStatusRow, PhaseVerdictResult } from '../lib/api/phaseStatus';

// Mock the data layer so the card never touches Supabase. Same factory-closure
// pattern as photoReviewDrawer.test.tsx.
const getPhaseStatusSpy = vi.fn(async (): Promise<PhaseStatusRow | null> => null);
const completePhaseSpy = vi.fn(async (): Promise<PhaseVerdictResult> => ({
  status: 'incomplete', verdict: '', blockers: [], readyForNext: false, modelUsed: 'stub',
}));

vi.mock('../lib/api/phaseStatus', () => ({
  getPhaseStatus: () => getPhaseStatusSpy(),
  completePhase: () => completePhaseSpy(),
}));

const ROW: PhaseStatusRow = {
  project_id: 'proj-1',
  phase: 'electrical',
  status: 'incomplete',
  verdict_text: 'Rough-in looks largely done; a few junction boxes still open.',
  blockers: ['2 junction boxes uncovered'],
  ready_for_next: false,
  model_used: 'claude-haiku-4-5',
  completed_at: null,
  updated_at: '2026-05-27T00:00:00Z',
};

describe('PhaseCompletionCard', () => {
  beforeEach(() => {
    getPhaseStatusSpy.mockReset();
    completePhaseSpy.mockReset();
  });

  it('renders an existing verdict and its blockers', async () => {
    getPhaseStatusSpy.mockResolvedValue(ROW);
    render(<PhaseCompletionCard projectId="proj-1" phase="electrical" />);

    expect(await screen.findByText(/rough-in looks largely done/i)).toBeTruthy();
    expect(screen.getByText(/2 junction boxes uncovered/i)).toBeTruthy();
  });

  it('runs completePhase from the empty state and shows the returned verdict', async () => {
    getPhaseStatusSpy.mockResolvedValue(null);
    completePhaseSpy.mockResolvedValue({
      status: 'complete',
      verdict: 'All electrical evidence confirmed — ready to proceed.',
      blockers: [],
      readyForNext: true,
      modelUsed: 'claude-haiku-4-5',
    });
    render(<PhaseCompletionCard projectId="proj-1" phase="electrical" />);

    const btn = await screen.findByRole('button', { name: /mark phase complete/i });
    fireEvent.click(btn);

    await waitFor(() => expect(completePhaseSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/all electrical evidence confirmed/i)).toBeTruthy();
  });
});
