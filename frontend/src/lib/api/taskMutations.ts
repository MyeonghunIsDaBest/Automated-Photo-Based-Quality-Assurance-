// Shared task mutation helpers — both the Projects page (Add Task / bulk add)
// and the Gantt page route their writes through these so a task created in
// either place lands in the same place: Supabase when configured, the local
// feature store always. Without this, Projects would only mutate the in-memory
// store while Gantt persists, which is exactly the divergence the user hit.

import type { Task } from '../../types';
import { supabaseConfigured } from '../supabase';
import {
  createTask as apiCreateTask,
  updateTask as apiUpdateTask,
  deleteTask as apiDeleteTask,
  mapTaskRow,
} from './tasks';
import { useFeatureStore } from '../../store/features';

export type NewTaskInput = Omit<Task, 'id' | 'photoCount' | 'lastUpdated' | 'updateSource'>;

// Insert a task. Persists to Supabase when configured; mirrors the row into
// the feature store so consumers (Projects list counts, Gantt rows) update
// immediately. Falls back to a purely local task when Supabase isn't wired —
// useful for the demo path.
export async function createTaskShared(input: NewTaskInput): Promise<Task> {
  const { addTask } = useFeatureStore.getState();

  if (supabaseConfigured()) {
    const row = await apiCreateTask({
      project_id: input.projectId,
      zone_id: input.zoneId ?? null,
      assignee_id: input.assigneeId ?? null,
      parent_task_id: input.parentTaskId ?? null,
      name: input.name,
      phase: input.phase,
      start_date: input.startDate,
      end_date: input.endDate,
      percent_complete: input.percentComplete,
      status: input.status,
      notes: input.notes,
      update_source: 'manual',
      dependencies: input.dependencies,
    });
    const task = mapTaskRow(row);
    addTask(task);
    return task;
  }

  const task: Task = {
    ...input,
    id: `task_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
    photoCount: 0,
    lastUpdated: new Date().toISOString(),
    updateSource: 'manual',
  };
  addTask(task);
  return task;
}

// Update an existing task. Writes to Supabase when configured AND mirrors the
// full new row into the feature store. The previous Gantt-side save mirrored
// only `percentComplete` to local state, so name/date/status edits silently
// reverted on the next render in environments without realtime.
export async function saveTaskShared(updated: Task): Promise<void> {
  const featureState = useFeatureStore.getState();

  if (supabaseConfigured()) {
    try {
      const row = await apiUpdateTask(updated.id, {
        name: updated.name,
        phase: updated.phase,
        start_date: updated.startDate,
        end_date: updated.endDate,
        status: updated.status,
        percent_complete: updated.percentComplete,
        zone_id: updated.zoneId ?? null,
        assignee_id: updated.assigneeId ?? null,
        parent_task_id: updated.parentTaskId ?? null,
        dependencies: updated.dependencies,
      });
      const next = mapTaskRow(row);
      useFeatureStore.setState((state) => ({
        tasks: state.tasks.map((t) => (t.id === next.id ? next : t)),
      }));
      // Keep the progress trend / notification side-effects firing.
      featureState.updateTaskProgress(updated.id, updated.percentComplete, 'manual');
      return;
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[tasks] save failed, falling back to local state:', e);
    }
  }

  // Local-only path (or Supabase fallback): mirror every field, not just %.
  useFeatureStore.setState((state) => ({
    tasks: state.tasks.map((t) =>
      t.id === updated.id
        ? { ...t, ...updated, lastUpdated: new Date().toISOString(), updateSource: 'manual' }
        : t,
    ),
  }));
  featureState.updateTaskProgress(updated.id, updated.percentComplete, 'manual');
}

export async function deleteTaskShared(id: string): Promise<void> {
  const { deleteTask } = useFeatureStore.getState();
  if (supabaseConfigured()) {
    try {
      await apiDeleteTask(id);
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('[tasks] delete failed:', e);
    }
  }
  deleteTask(id);
}
