import { DollarSign } from 'lucide-react';
import ProjectFinancePanel from '../../sponsor/ProjectFinancePanel';
import { FRAUNCES } from '../components/ledger';

// Gantt "Finance" tab — the same money view the stakeholder sponsor cockpit
// shows (/sponsor), surfaced in-context inside a project. Gated in Gantt.tsx to
// finance viewers via canViewFinance (company_admin / project_manager /
// construction_mgr / site_manager / stakeholder / dev). Reuses
// ProjectFinancePanel so the two surfaces stay one source of truth.
export function FinanceTab() {
  return (
    <div>
      <div className="mb-5 flex items-center gap-2.5">
        <span className="grid h-9 w-9 place-items-center rounded-[10px] bg-[#E5F2EA] text-[#246F47]">
          <DollarSign className="h-4 w-4" />
        </span>
        <div>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[#246F47]">Finance</p>
          <h2 className="text-[22px] font-medium leading-tight text-[#1A1A1A]" style={{ fontFamily: FRAUNCES }}>
            The money view.
          </h2>
        </div>
      </div>
      <ProjectFinancePanel />
    </div>
  );
}
