// ProjectsStrip — the "Your projects" row on /home. Horizontal scroll on
// mobile, 3-col grid on desktop. Empty-state copy comes from the role config.

import { useMemo } from 'react';
import { useAppStore } from '../../../store';
import { useProjectsListStore } from '../../projects/store';
import InvitedProjectCard from './InvitedProjectCard';
import type { ProjectMember } from '../../../types';

interface ProjectsStripProps {
  memberships: ProjectMember[];
  emptyCopy: string;
}

export default function ProjectsStrip({ memberships, emptyCopy }: ProjectsStripProps) {
  const projects = useProjectsListStore((s) => s.projects);
  const users    = useAppStore((s) => s.users);

  // Map projectId → membership so we render projects in the membership's
  // invited-at order (most-recent first). Drop memberships whose project no
  // longer exists in the list store (project deleted; the cache is briefly
  // stale).
  const cards = useMemo(() => {
    const byId = new Map(projects.map((p) => [p.id, p]));
    return memberships
      .filter((m) => byId.has(m.projectId))
      .sort((a, b) => b.invitedAt.localeCompare(a.invitedAt))
      .map((m) => ({
        project:    byId.get(m.projectId)!,
        membership: m,
      }));
  }, [memberships, projects]);

  const nameByUserId = useMemo(() => {
    const map = new Map<string, string>();
    for (const u of users) map.set(u.id, u.fullName);
    return map;
  }, [users]);

  return (
    <section aria-labelledby="your-projects-heading">
      <div className="flex items-center justify-between gap-3">
        <p
          id="your-projects-heading"
          className="text-[11px] font-medium uppercase tracking-[0.22em] text-slate-500"
        >
          Your projects
        </p>
        {cards.length > 0 && (
          <p className="text-xs tabular-nums text-slate-400">
            {cards.length} · {cards.length === 1 ? 'one project' : 'projects'}
          </p>
        )}
      </div>

      {cards.length === 0 ? (
        <p className="mt-4 rounded-2xl border border-dashed border-slate-200 bg-white px-5 py-7 text-sm leading-relaxed text-slate-500 sm:text-[15px]">
          {emptyCopy}
        </p>
      ) : (
        <div className="-mx-4 mt-4 overflow-x-auto px-4 sm:mx-0 sm:overflow-visible sm:px-0">
          <div className="flex gap-4 sm:grid sm:grid-cols-2 sm:gap-5 lg:grid-cols-3">
            {cards.map(({ project, membership }) => (
              <InvitedProjectCard
                key={membership.id}
                project={project}
                membership={membership}
                invitedByName={
                  membership.invitedBy
                    ? nameByUserId.get(membership.invitedBy) ?? undefined
                    : undefined
                }
              />
            ))}
          </div>
        </div>
      )}
    </section>
  );
}
