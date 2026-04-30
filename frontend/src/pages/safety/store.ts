import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import type {
  IncidentReport,
  IncidentStatus,
  SafetyDocument,
} from './types';

interface SafetyState {
  documents: SafetyDocument[];
  incidents: IncidentReport[];
  addDocument: (doc: Omit<SafetyDocument, 'id'>) => SafetyDocument;
  removeDocument: (id: string) => void;
  addIncident: (incident: Omit<IncidentReport, 'id'>) => IncidentReport;
  setIncidentStatus: (id: string, status: IncidentStatus) => void;
}

const id = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export const useSafetyStore = create<SafetyState>()(
  persist(
    (set) => ({
      documents: [],
      incidents: [],

      addDocument: (doc) => {
        const newDoc: SafetyDocument = { ...doc, id: id('doc') };
        set((state) => ({ documents: [newDoc, ...state.documents] }));
        return newDoc;
      },

      removeDocument: (docId) =>
        set((state) => ({ documents: state.documents.filter((d) => d.id !== docId) })),

      addIncident: (incident) => {
        const newIncident: IncidentReport = { ...incident, id: id('inc') };
        set((state) => ({ incidents: [newIncident, ...state.incidents] }));
        return newIncident;
      },

      setIncidentStatus: (incidentId, status) =>
        set((state) => ({
          incidents: state.incidents.map((i) =>
            i.id === incidentId ? { ...i, status } : i
          ),
        })),
    }),
    { name: 'siteproof-safety' }
  )
);
