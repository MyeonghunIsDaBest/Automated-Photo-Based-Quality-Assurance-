// InvitedProjectCard — one card per invited project on the worker / stakeholder
// / supplier home. Surfaces:
//   • Project name in Fraunces
//   • Status dot + days remaining
//   • "invited by ${pmName} · ${relativeDate}" attribution (if available)
//
// Clicking sets the active project and deep-links to /gantt for that project.
// The TopNav project switcher will reflect the change because it reads from
// the same `useProjectsListStore.activeProjectId`.

import { useNavigate } from 'react-router-dom';
import { differenceInDays, format, parseISO } from 'date-fns';
import { motion } from 'framer-motion';
import { hoverLift, tapShrink } from '../../../lib/motion/variants';
import { useProjectsListStore } from '../../projects/store';
import type { Project as ListProject } from '../../projects/types';
import type { ProjectMember } from '../../../types';

interface InvitedProjectCardProps {
  project: ListProject;
  membership: ProjectMember;
  /** Display name for the user who placed the invite, if we can resolve it
   *  (fallback to the user-id if not). */
  invitedByName?: string;
}

const STATUS_DOT: Record<ListProject['status'], string> = {
  active:    'bg-[#2F8F5C]',
  on_hold:   'bg-[#C8841E]',
  completed: 'bg-[#A0A0A0]',
  archived:  'bg-[#D8D2C4]',
};

const STATUS_LABEL: Record<ListProject['status'], string> = {
  active:    'Active',
  on_hold:   'On hold',
  completed: 'Completed',
  archived:  'Archived',
};

export default function InvitedProjectCard({
  project, membership, invitedByName,
}: InvitedProjectCardProps) {
  const navigate = useNavigate();
  const setActiveProject = useProjectsListStore((s) => s.setActiveProject);

  const open = () => {
    setActiveProject(project.id);
    navigate(`/gantt?project=${project.id}`);
  };

  const daysRemaining = (() => {
    try {
      return Math.max(0, differenceInDays(parseISO(project.endDate), new Date()));
    } catch {
      return null;
    }
  })();

  const invitedRelative = (() => {
    try {
      return format(parseISO(membership.invitedAt), 'MMM d');
    } catch {
      return null;
    }
  })();

  return (
    <motion.button
      type="button"
      onClick={open}
      whileHover={hoverLift}
      whileTap={tapShrink}
      className="group flex h-full w-full min-w-[260px] flex-col rounded-[14px] border border-[#E6E1D4] bg-white p-5 text-left shadow-[0_1px_2px_rgba(20,20,20,0.04)] transition-all hover:border-[#D8D2C4] hover:shadow-[0_4px_12px_rgba(20,20,20,0.08)] sm:min-w-0"
    >
      <div className="flex items-start justify-between gap-2">
        <h3 className="display min-w-0 truncate text-lg font-medium text-[#1A1A1A]">
          {project.name}
        </h3>
        <span
          className={`mt-1.5 h-2 w-2 flex-shrink-0 rounded-full ${STATUS_DOT[project.status]}`}
          title={STATUS_LABEL[project.status]}
          aria-label={STATUS_LABEL[project.status]}
        />
      </div>

      <p className="mt-0.5 truncate text-xs text-[#6B6B6B]">{project.client}</p>

      <div className="mt-4 flex items-baseline justify-between gap-3 text-xs">
        <span className="text-[#A0A0A0]">
          {daysRemaining === null ? '—' :
           daysRemaining === 0   ? 'Due today' :
                                   `${daysRemaining}d remaining`}
        </span>
        <span className="tabular-nums font-medium text-[#3A3A3A]">
          {project.percentComplete}%
        </span>
      </div>

      {/* Attribution: only renders if we have something to say (a name or a
          date). For the demo seed `invitedBy` is null on admin self-rows so
          the footer collapses gracefully. */}
      {(invitedByName || invitedRelative) && (
        <p className="mt-3 border-t border-[#EFEBE0] pt-3 text-[11px] text-[#6B6B6B]">
          {invitedByName ? <>Invited by <span className="font-medium text-[#3A3A3A]">{invitedByName}</span></> : 'Invited'}
          {invitedRelative ? ` · ${invitedRelative}` : ''}
        </p>
      )}
    </motion.button>
  );
}
