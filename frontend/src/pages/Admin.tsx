import { useAppStore } from '../store';
import { canSeeAdminDashboard } from '../lib/permissions';
import UsersTab from './admin/components/UsersTab';
import StakeholdersTab from './admin/components/StakeholdersTab';
import SuppliersTab from './admin/components/SuppliersTab';

const FONT_STYLES = `
  @import url('https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600;9..144,700&family=DM+Sans:wght@400;500;600;700&display=swap');
  .admin-root { font-family: 'DM Sans', system-ui, sans-serif; }
  .admin-root .display { font-family: 'Fraunces', Georgia, serif; font-feature-settings: 'ss01'; letter-spacing: -0.02em; }
  .admin-root .grid-bg {
    background-image:
      linear-gradient(to right, rgba(15, 23, 42, 0.04) 1px, transparent 1px),
      linear-gradient(to bottom, rgba(15, 23, 42, 0.04) 1px, transparent 1px);
    background-size: 32px 32px;
  }
`;

export default function Admin() {
  const { currentProfile } = useAppStore();
  if (!canSeeAdminDashboard(currentProfile)) return null;

  return (
    <div className="admin-root min-h-full bg-[#FAFAF7]">
      <style>{FONT_STYLES}</style>

      {/* ─── Editorial header ─── */}
      <header className="relative overflow-hidden border-b border-slate-200/70 bg-white">
        <div className="grid-bg absolute inset-0 opacity-50" />
        <div className="absolute -right-32 -top-32 h-96 w-96 rounded-full bg-emerald-100/40 blur-3xl" />

        <div className="relative px-4 py-8 sm:px-8 sm:py-10">
          <div className="mb-3 flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-slate-500">
            <span className="inline-block h-px w-6 bg-slate-400" />
            Workspace · Administration
          </div>
          <h1 className="display text-3xl sm:text-5xl font-medium leading-none text-slate-900">
            People &amp; <em className="font-normal italic text-emerald-700">partners</em>.
          </h1>
          <p className="mt-3 max-w-xl text-sm sm:text-[15px] leading-relaxed text-slate-500">
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
          description="Clients, consultants, council reps. They don't have logins — they're CRM records the project office maintains."
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
        <div className="mb-2 flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.2em] text-slate-500">
          <span className="inline-block h-px w-6 bg-slate-400" />
          {eyebrow}
        </div>
        <h2
          className="text-3xl font-medium leading-tight text-slate-900"
          style={{
            fontFamily: "'Fraunces', Georgia, serif",
            fontFeatureSettings: "'ss01'",
            letterSpacing: '-0.02em',
          }}
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
