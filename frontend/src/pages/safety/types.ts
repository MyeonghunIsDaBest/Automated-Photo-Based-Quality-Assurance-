export type SafetyDocCategory = 'ohse' | 'swms' | 'msds';

export interface SafetyDocument {
  id: string;
  category: SafetyDocCategory;
  title: string;
  reference?: string;
  effectiveDate: string;
  expiryDate?: string;
  fileName: string;
  fileSizeKb?: number;
  uploadedBy: string;
  uploadedAt: string;
  notes?: string;
}

export type IncidentType = 'injury' | 'near_miss';
export type IncidentSeverity = 'low' | 'medium' | 'high' | 'critical';
export type IncidentStatus = 'open' | 'investigating' | 'closed';

export interface IncidentReport {
  id: string;
  type: IncidentType;
  occurredAt: string;
  location: string;
  description: string;
  severity: IncidentSeverity;
  personInvolved?: string;
  bodyPart?: string;
  treatmentGiven?: string;
  contributingFactors?: string;
  recommendedAction?: string;
  witnesses?: string;
  photoNames?: string[];
  reportedBy: string;
  reportedAt: string;
  status: IncidentStatus;
}

export const SEVERITY_LABEL: Record<IncidentSeverity, string> = {
  low: 'Low',
  medium: 'Medium',
  high: 'High',
  critical: 'Critical',
};

export const STATUS_LABEL: Record<IncidentStatus, string> = {
  open: 'Open',
  investigating: 'Investigating',
  closed: 'Closed',
};

export const CATEGORY_LABEL: Record<SafetyDocCategory, string> = {
  ohse: 'OHS&E',
  swms: 'SWMS',
  msds: 'MSDS',
};

export const CATEGORY_BLURB: Record<SafetyDocCategory, string> = {
  ohse: 'Occupational Health, Safety & Environment policies and inductions.',
  swms: 'Safe Work Method Statements — hazards and controls per high-risk task.',
  msds: 'Material / Safety Data Sheets for hazardous chemicals and materials on site.',
};
