import type { SafetyFlag, SafetySeverity } from './contract.ts';

// Flag → severity mapping. Mirrored on the frontend through `contract.ts`
// imports — UI chips colour by severity, backend pipes severity into the
// safety_incidents row, notifications page-flag the highest severity in a
// given incident.
export const SAFETY_SEVERITY: Record<SafetyFlag, SafetySeverity> = {
  exposed_wiring:  'critical',
  fall_hazard:     'critical',
  no_hard_hat:     'high',
  unsecured_load:  'high',
  housekeeping:    'medium',
  signage_missing: 'low',
};

const SEVERITY_RANK: Record<SafetySeverity, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

// Worst severity across a list of flags. Empty list → 'low' (caller should
// have already short-circuited if there are no flags).
export function maxSeverity(flags: SafetyFlag[]): SafetySeverity {
  let worst: SafetySeverity = 'low';
  for (const f of flags) {
    const s = SAFETY_SEVERITY[f];
    if (SEVERITY_RANK[s] > SEVERITY_RANK[worst]) worst = s;
  }
  return worst;
}
