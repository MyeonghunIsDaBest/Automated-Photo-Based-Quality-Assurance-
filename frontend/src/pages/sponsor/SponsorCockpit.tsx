// SponsorCockpit (/sponsor) — the stakeholder's finance-sponsor view
// (role-experiences, Phase 4). A project funder lands here (not the internal
// Gantt) and watches their money. The actual finance surface lives in the
// shared <ProjectFinancePanel> (reused by the Gantt "Finance" tab too); this
// page just frames it with the sponsor hero header.

import { useAppStore } from '../../store';
import { cardShell, FRAUNCES } from '../gantt/components/ledger';
import ProjectFinancePanel from './ProjectFinancePanel';

export default function SponsorCockpit() {
  const project = useAppStore((s) => s.project);
  const projectId = project?.id;

  if (!projectId || !project) {
    return (
      <div className="editorial-root min-h-full bg-[#FAF8F2] p-6">
        <div className={`px-6 py-16 text-center ${cardShell}`}>
          <h3 className="text-[22px] font-medium text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>No project selected.</h3>
          <p className="mx-auto mt-2 max-w-md text-[13px] text-[#6B6B6B]">Pick a project from the switcher up top to see its finances.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="editorial-root min-h-full bg-[#FAF8F2]">
      <div className="mx-auto w-full max-w-[1100px] px-4 py-6 sm:px-8 sm:py-8">
        {/* Hero */}
        <div className="mb-5">
          <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-[0.2em] text-[#246F47]">Sponsor · {project.name}</p>
          <h1 className="text-[30px] font-medium leading-tight text-[#1A1A1A] sm:text-[36px]" style={{ fontFamily: FRAUNCES, letterSpacing: '-0.02em' }}>
            The money view.
          </h1>
          <p className="mt-2 max-w-md text-[14px] leading-relaxed text-[#6B6B6B]">Is the spend tracking with the work? Release payment as each phase is verified complete.</p>
        </div>

        <ProjectFinancePanel />
      </div>
    </div>
  );
}
