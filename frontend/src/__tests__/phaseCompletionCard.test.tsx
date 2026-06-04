import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { PhaseCompletionBoard } from '../pages/gantt/tabs/PhaseCompletionCard';
import type { PhaseStatusRow, PhaseVerdictResult } from '../lib/api/phaseStatus';
import type { ScanHistoryItem } from '../lib/api/aiAnalyses';

// Mock the data layer so the board never touches Supabase. Same factory-closure
// pattern as photoReviewDrawer.test.tsx. The board reads ALL phases at once via
// listPhaseStatuses, then runs completePhase per phase the user expands. Scans
// are passed in as a prop (the AI-Analysis tab owns that fetch).
const listPhaseStatusesSpy = vi.fn(async (): Promise<PhaseStatusRow[]> => []);
const completePhaseSpy = vi.fn(async (): Promise<PhaseVerdictResult> => ({
  status: 'incomplete', verdict: '', blockers: [], readyForNext: false, modelUsed: 'stub',
}));

vi.mock('../lib/api/phaseStatus', () => ({
  listPhaseStatuses: () => listPhaseStatusesSpy(),
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

const SCAN: ScanHistoryItem = {
  photoId: 'ph-1',
  filename: 'rough-in-east.jpg',
  storagePath: 'proj-1/ph-1.jpg',
  uploadedAt: '2026-05-27T01:00:00Z',
  takenAt: null,
  phase: 'electrical',
  completionPct: 72,
  confidence: 0.88,
  actionTaken: 'auto_updated',
  analysisStatus: 'analysed',
  flags: 0,
};

describe('PhaseCompletionBoard', () => {
  beforeEach(() => {
    listPhaseStatusesSpy.mockReset();
    completePhaseSpy.mockReset();
  });

  it('lists every phase and expands one to show its verdict + blockers', async () => {
    listPhaseStatusesSpy.mockResolvedValue([ROW]);
    render(<PhaseCompletionBoard projectId="proj-1" scans={[]} />);

    // All eight phases render as collapsed rows; the verdict is hidden until
    // the user opens that phase.
    const electricalRow = await screen.findByRole('button', { name: /electrical/i });
    fireEvent.click(electricalRow);

    expect(await screen.findByText(/rough-in looks largely done/i)).toBeTruthy();
    expect(screen.getByText(/2 junction boxes uncovered/i)).toBeTruthy();
  });

  it('runs completePhase from a phase with no verdict and shows the result', async () => {
    listPhaseStatusesSpy.mockResolvedValue([]);
    completePhaseSpy.mockResolvedValue({
      status: 'complete',
      verdict: 'All electrical evidence confirmed — ready to proceed.',
      blockers: [],
      readyForNext: true,
      modelUsed: 'claude-haiku-4-5',
    });
    render(<PhaseCompletionBoard projectId="proj-1" scans={[]} />);

    const electricalRow = await screen.findByRole('button', { name: /electrical/i });
    fireEvent.click(electricalRow);

    const btn = await screen.findByRole('button', { name: /mark phase complete/i });
    fireEvent.click(btn);

    await waitFor(() => expect(completePhaseSpy).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/all electrical evidence confirmed/i)).toBeTruthy();
  });

  it('surfaces a phase\'s scan results (status + filename) when expanded', async () => {
    listPhaseStatusesSpy.mockResolvedValue([]);
    render(<PhaseCompletionBoard projectId="proj-1" scans={[SCAN]} />);

    const electricalRow = await screen.findByRole('button', { name: /electrical/i });
    fireEvent.click(electricalRow);

    // The scan's filename + its Scan Status badge pop out under the phase.
    expect(await screen.findByText(/rough-in-east\.jpg/i)).toBeTruthy();
    expect(screen.getByText(/auto-applied/i)).toBeTruthy();
  });
});
