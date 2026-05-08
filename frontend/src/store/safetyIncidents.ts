// Cache store for safety_incidents so the project activity hook can derive
// `safety_flag` events without spinning up its own Supabase subscription per
// consumer. `useSafetyRealtime` is the single writer (it lives at the layout
// level and pushes inserts here); reads happen wherever an `ActivityEvent`
// list is needed.
//
// Treat this as a write-through cache — the source of truth is the
// `safety_incidents` Postgres table. Pages that need the *list* of incidents
// should still call `listSafetyIncidents(projectId)` once on mount and dump
// the result in via `setIncidents()`; from there the realtime channel keeps
// the cache fresh.

import { create } from 'zustand';
import type { SafetyIncident } from '../lib/api/safetyIncidents';

interface SafetyIncidentsState {
  incidents: SafetyIncident[];
  setIncidents: (incidents: SafetyIncident[]) => void;
  upsertIncident: (incident: SafetyIncident) => void;
  clear: () => void;
}

export const useSafetyIncidentsStore = create<SafetyIncidentsState>((set) => ({
  incidents: [],

  setIncidents: (incidents) => set({ incidents }),

  upsertIncident: (incident) =>
    set((state) => {
      const existing = state.incidents.findIndex((i) => i.id === incident.id);
      if (existing < 0) return { incidents: [incident, ...state.incidents] };
      const next = state.incidents.slice();
      next[existing] = incident;
      return { incidents: next };
    }),

  clear: () => set({ incidents: [] }),
}));
