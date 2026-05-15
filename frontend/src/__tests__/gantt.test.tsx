import { describe, expect, it } from 'vitest';
import { render, screen } from '@testing-library/react';
import { GanttChart } from '../components/ui/GanttChart';
import type { Task } from '../types';

function makeTask(overrides: Partial<Task> = {}): Task {
  return {
    id: 't1',
    projectId: 'p1',
    name: 'Foundation pour',
    phase: 'foundation',
    startDate: '2026-01-01',
    endDate: '2026-01-31',
    durationDays: 30,
    percentComplete: 50,
    status: 'in_progress',
    dependencies: [],
    photoCount: 0,
    lastUpdated: '2026-01-15T00:00:00Z',
    updateSource: 'manual',
    notes: [],
    isPhaseAnchor: false,
    ...overrides,
  };
}

describe('GanttChart', () => {
  it('renders the empty state when no tasks are passed', () => {
    render(<GanttChart tasks={[]} startDate="2026-01-01" endDate="2026-12-31" />);
    expect(screen.getByText(/No tasks yet/i)).toBeInTheDocument();
  });

  it('renders task name and percentage for one task', () => {
    render(
      <GanttChart
        tasks={[makeTask({ name: 'Roof framing', percentComplete: 75 })]}
        startDate="2026-01-01"
        endDate="2026-12-31"
      />
    );
    expect(screen.getByText('Roof framing')).toBeInTheDocument();
    // The 75% appears in the legend cell + bar overlay; just assert at least one.
    expect(screen.getAllByText(/75%/).length).toBeGreaterThan(0);
  });

  it('renders one row per task', () => {
    const tasks = [
      makeTask({ id: 't1', name: 'Alpha' }),
      makeTask({ id: 't2', name: 'Beta', startDate: '2026-02-01', endDate: '2026-02-28' }),
      makeTask({ id: 't3', name: 'Gamma', startDate: '2026-03-01', endDate: '2026-03-31' }),
    ];
    render(<GanttChart tasks={tasks} startDate="2026-01-01" endDate="2026-12-31" />);
    expect(screen.getByText('Alpha')).toBeInTheDocument();
    expect(screen.getByText('Beta')).toBeInTheDocument();
    expect(screen.getByText('Gamma')).toBeInTheDocument();
  });

  it('renders month headers when showMonths is true', () => {
    render(<GanttChart tasks={[]} startDate="2026-01-01" endDate="2026-03-31" />);
    expect(screen.getByText(/Jan 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Feb 2026/i)).toBeInTheDocument();
    expect(screen.getByText(/Mar 2026/i)).toBeInTheDocument();
  });
});
