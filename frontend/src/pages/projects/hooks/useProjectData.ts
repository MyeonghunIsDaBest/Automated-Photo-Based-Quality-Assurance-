import { useMemo } from 'react';
import { mockWorkers } from '../mocks/workers';
import { mockDocuments } from '../mocks/documents';
import { mockDailyLogs } from '../mocks/dailyLogs';
import {
  Worker,
  ProjectDocument,
  DocumentCategory,
  DailyLog,
} from '../types';

export interface ProjectData {
  workers: Worker[];
  documents: ProjectDocument[];
  documentCounts: Record<DocumentCategory, number>;
  dailyLogs: DailyLog[];
}

const EMPTY_COUNTS: Record<DocumentCategory, number> = {
  tasks: 0,
  photos: 0,
  files: 0,
  drawings: 0,
  warranties: 0,
  products: 0,
  documents: 0,
  specifications: 0,
};

const EMPTY_DATA: ProjectData = {
  workers: [],
  documents: [],
  documentCounts: EMPTY_COUNTS,
  dailyLogs: [],
};

export function useProjectData(projectId: string | null): ProjectData {
  return useMemo(() => {
    if (!projectId) return EMPTY_DATA;

    const workers = mockWorkers.filter((w) => w.projectIds.includes(projectId));
    const documents = mockDocuments.filter((d) => d.projectId === projectId);
    const dailyLogs = mockDailyLogs
      .filter((l) => l.projectId === projectId)
      .sort((a, b) => (a.date < b.date ? 1 : -1));

    const documentCounts: Record<DocumentCategory, number> = { ...EMPTY_COUNTS };
    for (const doc of documents) {
      documentCounts[doc.category] += 1;
    }

    return { workers, documents, documentCounts, dailyLogs };
  }, [projectId]);
}
