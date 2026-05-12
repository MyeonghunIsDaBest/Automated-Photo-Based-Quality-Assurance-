// useProjectConfig — read/write hook for the per-project configuration row
// introduced in migration 09.
//
// Subscribes to `useProjectsListStore.activeProjectId` so a project switch
// triggers a refetch (without that, the admin would see stale config after
// flipping projects in the picker). Caches into `useFeatureStore.projectConfig`
// keyed by projectId, so pages that mount the hook a second time during a
// session hit the cache instead of re-fetching.

import { useEffect, useCallback, useState } from 'react';
import { useFeatureStore } from '../../store/features';
import { useProjectsListStore } from '../../pages/projects/store';
import {
  getProjectConfig,
  updateProjectConfig,
  type ProjectConfigPatch,
} from '../api/projectConfig';
import type { ProjectConfig } from '../../types';

export interface UseProjectConfigResult {
  config: ProjectConfig | null;
  isLoading: boolean;
  error: string | null;
  refetch: () => Promise<void>;
  save: (patch: ProjectConfigPatch) => Promise<ProjectConfig>;
}

export function useProjectConfig(explicitProjectId?: string): UseProjectConfigResult {
  const activeProjectId = useProjectsListStore((s) => s.activeProjectId);
  const projectId = explicitProjectId ?? activeProjectId ?? null;
  const config = useFeatureStore((s) =>
    projectId ? s.projectConfig[projectId] ?? null : null,
  );
  const setProjectConfig = useFeatureStore((s) => s.setProjectConfig);
  const [isLoading, setIsLoading] = useState<boolean>(!!projectId && !config);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!projectId) return;
    setIsLoading(true);
    setError(null);
    try {
      const fresh = await getProjectConfig(projectId);
      setProjectConfig(fresh);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setIsLoading(false);
    }
  }, [projectId, setProjectConfig]);

  // Hydrate on mount / project switch. Skip the refetch when a config is
  // already in the cache for this project — the admin tab's Save action
  // updates the cache directly so a fresh read isn't strictly needed.
  useEffect(() => {
    if (!projectId) return;
    if (config) return;
    void refetch();
  }, [projectId, config, refetch]);

  const save = useCallback(
    async (patch: ProjectConfigPatch) => {
      if (!projectId) throw new Error('no active project');
      const updated = await updateProjectConfig(projectId, patch);
      setProjectConfig(updated);
      return updated;
    },
    [projectId, setProjectConfig],
  );

  return { config, isLoading, error, refetch, save };
}
