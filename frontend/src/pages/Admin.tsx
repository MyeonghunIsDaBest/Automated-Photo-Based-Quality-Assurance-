import { useAppStore } from '../store';
import { canSeeAdminDashboard } from '../lib/permissions';
import { EyebrowLabel } from '../components/editorial';
import UsersTab from './admin/components/UsersTab';
import StakeholdersTab from './admin/components/StakeholdersTab';
import SuppliersTab from './admin/components/SuppliersTab';

// Phase B follow-up: drops the per-page FONT_STYLES injection in favour of
// the global `.editorial-root` selector + Google Fonts @import declared in
// `frontend/src/index.css`. The page reads identically to before, just
// without inlining the same CSS three times across the app.
export default function Admin() {
  const { currentProfile } = useAppStore();
  if (!canSeeAdminDashboard(currentProfile)) return null;

  return (
    <div className="editorial-root min-h-full bg-[#FAFAF7]">
      {/* ─── Editorial header ─── */}
      <header className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />

        <div className="relative px-4 py-8 sm:px-8 sm:py-10">
          <EyebrowLabel>Workspace · Administration</EyebrowLabel>
          <h1
            className="display mt-3 text-2xl font-medium leading-tight text-slate-900 sm:text-4xl md:text-5xl"
            style={{ textWrap: 'balance' }}
          >
            People &amp; <em className="font-normal italic text-emerald-700">partners</em>.
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-500 sm:text-[15px]">
            Manage every account on the system, the external stakeholders kept in the
            loop, and the suppliers feeding the schedule. Admins live at the top of the
            list — everyone else is filterable below.
          </p>
        </div>
      </header>

      {/* ─── Stacked sections ─── */}
      <div className="space-y-10 px-4 py-8 sm:space-y-12 sm:px-8 sm:py-10">
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
          className="display mt-2 text-2xl font-medium leading-tight text-slate-900 sm:text-3xl"
          style={{ textWrap: 'balance' }}
        >
          {title}
        </h2>
        <p className="mt-2 max-w-2xl text-sm leading-relaxed text-slate-500">
          {description}
        </p>
      </div>
      {children}
    </section>
  );
}
