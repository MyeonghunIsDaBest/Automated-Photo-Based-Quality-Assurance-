import { useEffect, useState } from 'react';
import { useAppStore } from '../store';
import { canSeeAdminDashboard } from '../lib/permissions';
import { EyebrowLabel, StatStrip, StatCell } from '../components/editorial';
import { listProfiles } from '../lib/api/profiles';
import { listStakeholders } from '../lib/api/stakeholders';
import { listSuppliers } from '../lib/api/suppliers';
import UsersTab from './admin/components/UsersTab';
import StakeholdersTab from './admin/components/StakeholdersTab';
import SuppliersTab from './admin/components/SuppliersTab';
import ProjectConfigTab from './admin/components/ProjectConfigTab';

// Phase B follow-up: drops the per-page FONT_STYLES injection in favour of
// the global `.editorial-root` selector + Google Fonts @import declared in
// `frontend/src/index.css`. The page reads identically to before, just
// without inlining the same CSS three times across the app.
export default function Admin() {
  const { currentProfile } = useAppStore();

  // At-a-glance directory counts for the header strip. Cheap one-shot reads of
  // the existing list APIs (no realtime needed — admin chrome, not a live feed).
  const [counts, setCounts] = useState({ users: 0, admins: 0, stakeholders: 0, suppliers: 0 });
  useEffect(() => {
    if (!canSeeAdminDashboard(currentProfile)) return;
    let cancelled = false;
    void Promise.all([listProfiles(), listStakeholders(), listSuppliers()])
      .then(([profiles, stakeholders, suppliers]) => {
        if (cancelled) return;
        const admins = profiles.filter(
          (p) => p.securityGroup === 'company_admin' || p.securityGroup === 'administrator',
        ).length;
        setCounts({
          users: profiles.length,
          admins,
          stakeholders: stakeholders.length,
          suppliers: suppliers.length,
        });
      })
      .catch(() => void 0);
    return () => { cancelled = true; };
  }, [currentProfile]);

  if (!canSeeAdminDashboard(currentProfile)) return null;

  return (
    <div className="editorial-root min-h-full bg-[#FAFAF7]">
      {/* ─── Editorial header ─── */}
      <header className="relative overflow-hidden border-b border-[#E6E1D4]/70 bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-[#E5F2EA]/40 blur-3xl" />

        <div className="relative mx-auto w-full max-w-[1400px] px-4 py-8 sm:px-8 sm:py-10">
          <EyebrowLabel>Workspace · Administration</EyebrowLabel>
          <h1
            className="display mt-3 text-2xl font-medium leading-tight text-[#1A1A1A] sm:text-4xl md:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            People &amp; <em className="font-normal italic" style={{ color: 'var(--accent-color, #047857)' }}>partners</em>.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-[#6B6B6B] sm:text-[15px]">
            Manage every account on the system, the external stakeholders kept in the
            loop, and the suppliers feeding the schedule. Admins live at the top of the
            list — everyone else is filterable below.
          </p>

          <StatStrip className="mt-8">
            <StatCell label="Users" value={counts.users} caption="On the system" accent="emerald" />
            <StatCell label="Admins" value={counts.admins} caption="Top-tier access" accent="violet" />
            <StatCell label="Stakeholders" value={counts.stakeholders} caption="External contacts" accent="blue" />
            <StatCell label="Suppliers" value={counts.suppliers} caption="Feeding the schedule" accent="amber" />
          </StatStrip>
        </div>
      </header>

      {/* ─── Stacked sections ─── */}
      <div className="mx-auto w-full max-w-[1400px] space-y-10 px-4 py-8 sm:space-y-12 sm:px-8 sm:py-10">
        <Section
          eyebrow="Section · Users"
          title="Every account on the system."
          description="Admins are pinned at the top. Filter the rest by role or status. Row click opens a user's documents drawer; the dropdown changes their security group."
        >
          <UsersTab />
        </Section>

        <Section
          eyebrow="Section · Stakeholders"
          title="External contacts."
          description="Clients, consultants, council reps. Some stakeholders also have logins linked back here via Phase A's stakeholder security group."
        >
          <StakeholdersTab />
        </Section>

        <Section
          eyebrow="Section · Suppliers"
          title="Vendors feeding the schedule."
          description="Material and equipment suppliers, with branches and contacts. Used by the project preview's supplier-order flow to spawn Gantt tasks."
        >
          <SuppliersTab />
        </Section>

        <Section
          eyebrow="Section · Project config"
          title="Per-project knobs."
          description="AI thresholds, progression mode, dedup distance, accent colour, report cadence. Pick a project and edit; the change applies the next time the photo-QA pipeline or task drawer runs."
        >
          <ProjectConfigTab />
        </Section>
      </div>
    </div>
  );
}

function Section({
  eyebrow,
  title,
  description,
  children,
}: {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="mb-5">
        <EyebrowLabel>{eyebrow}</EyebrowLabel>
        <h2
          className="display mt-2 text-2xl font-medium leading-tight text-[#1A1A1A] sm:text-3xl"
          style={{ textWrap: 'balance' }}
        >
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-[#6B6B6B]">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
