// RoleHome — the single editorial home page at `/home`. Role-aware: reads
// `currentProfile.securityGroup` and renders the variant config from
// `roleHomeConfig.ts`.
//
// The shell is invariant — every variant gets the same section order:
//   1. Hero (with role-typed eyebrow / title / accent / description / action)
//   2. "What is SiteProof?" explainer card
//   3. Projects strip (only the projects this user is invited to)
//   4. Action tiles (3 large CTAs)
//   5. Today's brief (worker only)
//   6. Why we built our own (3 pillars)
//
// Field roles only — admins / PMs visiting `/home` directly are bounced to
// `/dashboard`. The `/` index route handles the default redirect via
// `RoleHomeRedirect.tsx`.

import { Navigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { useAppStore } from '../../store';
import { fadeUp, staggerContainer } from '../../lib/motion/variants';
import { useMyMemberships } from '../../lib/hooks/useMyMemberships';
import { useAutoAcceptInvites } from '../../lib/hooks/useAutoAcceptInvites';
import { ROLE_HOME_VARIANTS } from './roleHomeConfig';

import HomeHero from './components/HomeHero';
import WhatIsSiteProof from './components/WhatIsSiteProof';
import ProjectsStrip from './components/ProjectsStrip';
import ActionTile from './components/ActionTile';
import AssignedTasksMini from './components/AssignedTasksMini';
import WhyPanel from './components/WhyPanel';
import FieldActionsCard from '../../components/home/FieldActionsCard';

export default function RoleHome() {
  const currentUser    = useAppStore((s) => s.currentUser);
  const currentProfile = useAppStore((s) => s.currentProfile);
  const sg = currentProfile?.securityGroup;
  const variant = sg ? ROLE_HOME_VARIANTS[sg] : undefined;

  // Implicit accept — fire BEFORE the early-return so admins arriving here
  // by mistake still bounce cleanly. The hook itself no-ops on undefined.
  useAutoAcceptInvites(currentUser?.id);
  const { memberships, isLoading: membershipsLoading } = useMyMemberships(currentUser?.id);

  // Admin / PM / manager bouncing — they belong on /dashboard. Mock-mode
  // demo user without a securityGroup falls through to /dashboard too.
  if (!variant) {
    return <Navigate to="/dashboard" replace />;
  }

  const firstName = (currentUser?.fullName ?? '').split(' ')[0] || 'there';
  // While the first membership fetch is in flight, suppress the count so
  // workers don't see "invited to 0 projects" → "invited to 3 projects"
  // pop-in. Once `membershipsLoading` flips false, ProjectsStrip's own
  // empty-state handles the genuine "really zero" case.
  const eyebrowSuffix = membershipsLoading
    ? 'loading projects…'
    : variant.hero.eyebrowSuffix(memberships.length);
  const eyebrow = `${variant.roleLabel} · ${eyebrowSuffix}`;

  return (
    <motion.div
      className="editorial-root min-h-full bg-[#FAF8F2]"
      variants={staggerContainer}
      initial="hidden"
      animate="visible"
    >
      <HomeHero
        eyebrow={eyebrow}
        eyebrowLoading={membershipsLoading}
        title={variant.hero.title}
        accent={`${firstName}.`}
        description={variant.hero.description}
        action={variant.hero.action}
      />

      <div className="mx-auto flex max-w-6xl flex-col gap-8 px-4 py-8 sm:gap-10 sm:px-8 sm:py-12">
        <motion.section variants={fadeUp}>
          <WhatIsSiteProof paragraph={variant.explainer} />
        </motion.section>

        <motion.section variants={fadeUp}>
          <ProjectsStrip
            memberships={memberships}
            emptyCopy={variant.projects.emptyCopy}
          />
        </motion.section>

        {/* Worker field cockpit (Phase 2): one-tap capture + clock in/out. */}
        {sg === 'worker' && (
          <motion.section variants={fadeUp}>
            <FieldActionsCard />
          </motion.section>
        )}

        <motion.section variants={fadeUp} aria-labelledby="today-on-site-heading">
          <p
            id="today-on-site-heading"
            className="text-[11px] font-medium uppercase tracking-[0.22em] text-[#6B6B6B]"
          >
            Today on site
          </p>
          <div className="mt-4 grid grid-cols-1 gap-4 md:grid-cols-3 md:gap-5">
            {variant.tiles.map((tile) => (
              <ActionTile key={tile.title} tile={tile} />
            ))}
          </div>
        </motion.section>

        {variant.showAssignedTasks && (
          <motion.section variants={fadeUp}>
            <AssignedTasksMini
              userId={currentUser?.id}
              projectIds={memberships.map((m) => m.projectId)}
            />
          </motion.section>
        )}

        <motion.section variants={fadeUp}>
          <WhyPanel pillars={variant.pillars} />
        </motion.section>
      </div>
    </motion.div>
  );
}
