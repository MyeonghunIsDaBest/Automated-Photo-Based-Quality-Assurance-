import { describe, it, expect, beforeEach } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useProjectActivity } from '../lib/hooks/useProjectActivity';
import { useAppStore } from '../store';
import { useFeatureStore } from '../store/features';
import { useSafetyIncidentsStore } from '../store/safetyIncidents';
import type { Photo, AIAnalysis } from '../types';
import type { SafetyIncident } from '../lib/api/safetyIncidents';

// Pass 1 added two new ActivityKinds — `ai_analysed` and `safety_flag` — to
// the project activity hook. These tests exercise the derivation of those
// events from store state.

const PROJECT_ID = 'proj-test';

beforeEach(() => {
  useAppStore.setState({ photos: [] });
  useFeatureStore.setState({ tasks: [], comments: [] });
  useSafetyIncidentsStore.getState().clear();
});

describe('useProjectActivity — ai_analysed events', () => {
  it('emits an ai_analysed event when a photo has a completed analysis', () => {
    const analysis: AIAnalysis = {
      id: 'a1',
      photoId: 'p1',
      modelUsed: 'mvp-stub@v0',
      phaseDetected: 'framing',
      completionPct: 42,
      confidence: 0.7,
      safetyFlags: [],
      qualityFlags: [],
      materials: [],
      suggestedTask: null,
      actionTaken: 'pending',
      analysisStatus: 'analysed',
      rationale: 'stub',
      rawResponse: null,
      analyzedAt: '2026-05-07T10:00:00.000Z',
    };
    const photo: Photo = {
      id: 'p1',
      projectId: PROJECT_ID,
      uploadedBy: 'u1',
      filename: 'wall.jpg',
      storageUrl: '',
      fileSizeKb: 100,
      width: 1024,
      height: 768,
      uploadedAt: '2026-05-07T09:00:00.000Z',
      aiAnalyzed: true,
      aiAnalysis: analysis,
    };
    useAppStore.setState({ photos: [photo] });

    const { result } = renderHook(() => useProjectActivity(PROJECT_ID, { limit: 50 }));
    const aiEvents = result.current.filter((e) => e.kind === 'ai_analysed');
    expect(aiEvents).toHaveLength(1);
    expect(aiEvents[0].targetEntityId).toBe('p1');
    expect(aiEvents[0].timestamp).toBe('2026-05-07T10:00:00.000Z');
  });

  it('does NOT emit ai_analysed for queued or analysing states', () => {
    const photo: Photo = {
      id: 'p2',
      projectId: PROJECT_ID,
      uploadedBy: 'u1',
      filename: 'wall.jpg',
      storageUrl: '',
      fileSizeKb: 100,
      width: 1024,
      height: 768,
      uploadedAt: '2026-05-07T09:00:00.000Z',
      aiAnalyzed: false,
      aiAnalysis: {
        id: 'a2',
        photoId: 'p2',
        modelUsed: 'pending',
        phaseDetected: null,
        completionPct: 0,
        confidence: 0,
        safetyFlags: [],
        qualityFlags: [],
        materials: [],
        suggestedTask: null,
        actionTaken: 'pending',
        analysisStatus: 'queued',
        rationale: null,
        rawResponse: null,
        analyzedAt: '2026-05-07T09:00:00.000Z',
      },
    };
    useAppStore.setState({ photos: [photo] });

    const { result } = renderHook(() => useProjectActivity(PROJECT_ID, { limit: 50 }));
    expect(result.current.filter((e) => e.kind === 'ai_analysed')).toHaveLength(0);
  });
});

describe('useProjectActivity — safety_flag events', () => {
  it('emits a safety_flag event for each incident in the project', () => {
    const incidents: SafetyIncident[] = [
      {
        id: 'inc1',
        projectId: PROJECT_ID,
        photoId: 'p1',
        aiAnalysisId: 'a1',
        flags: ['no_hard_hat', 'unsecured_load'],
        severity: 'high',
        status: 'open',
        reportedBy: null,
        resolvedBy: null,
        resolvedAt: null,
        notes: null,
        createdAt: '2026-05-07T11:00:00.000Z',
      },
      {
        id: 'inc2',
        projectId: 'other-project',
        photoId: null,
        aiAnalysisId: null,
        flags: ['fall_hazard'],
        severity: 'critical',
        status: 'open',
        reportedBy: 'u1',
        resolvedBy: null,
        resolvedAt: null,
        notes: null,
        createdAt: '2026-05-07T12:00:00.000Z',
      },
    ];
    useSafetyIncidentsStore.getState().setIncidents(incidents);

    const { result } = renderHook(() => useProjectActivity(PROJECT_ID, { limit: 50 }));
    const safetyEvents = result.current.filter((e) => e.kind === 'safety_flag');
    expect(safetyEvents).toHaveLength(1);
    expect(safetyEvents[0].targetEntityId).toBe('inc1');
    expect(safetyEvents[0].targetLabel).toContain('high hazard');
    expect(safetyEvents[0].targetLabel).toContain('no hard hat');
  });

  it('reflects manual vs AI-detected via actorName', () => {
    const aiIncident: SafetyIncident = {
      id: 'inc-ai',
      projectId: PROJECT_ID,
      photoId: 'p1',
      aiAnalysisId: 'a1',
      flags: ['exposed_wiring'],
      severity: 'critical',
      status: 'open',
      reportedBy: null,
      resolvedBy: null,
      resolvedAt: null,
      notes: null,
      createdAt: '2026-05-07T13:00:00.000Z',
    };
    const manualIncident: SafetyIncident = {
      ...aiIncident,
      id: 'inc-manual',
      aiAnalysisId: null,
      reportedBy: 'u1',
      createdAt: '2026-05-07T14:00:00.000Z',
    };
    useSafetyIncidentsStore.getState().setIncidents([aiIncident, manualIncident]);

    const { result } = renderHook(() => useProjectActivity(PROJECT_ID, { limit: 50 }));
    const safetyEvents = result.current.filter((e) => e.kind === 'safety_flag');
    expect(safetyEvents.find((e) => e.targetEntityId === 'inc-ai')?.actorName).toBe('AI safety check');
    expect(safetyEvents.find((e) => e.targetEntityId === 'inc-manual')?.actorName).toBe('Manual');
  });
});
