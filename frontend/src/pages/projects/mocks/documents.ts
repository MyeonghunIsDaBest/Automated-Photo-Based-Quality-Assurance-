import { ProjectDocument } from '../types';

export const mockDocuments: ProjectDocument[] = [
  // proj_1 — Lincoln Elementary
  { id: 'd1', projectId: 'proj_1', name: 'Punch List Week 8.pdf', category: 'tasks', size: 240_000, uploadedAt: '2024-02-28T10:00:00Z' },
  { id: 'd2', projectId: 'proj_1', name: 'North Wing Framing.jpg', category: 'photos', size: 1_400_000, uploadedAt: '2024-02-28T09:00:00Z' },
  { id: 'd3', projectId: 'proj_1', name: 'Electrical Rough-in.jpg', category: 'photos', size: 1_240_000, uploadedAt: '2024-02-28T11:30:00Z' },
  { id: 'd4', projectId: 'proj_1', name: 'Floor Plan Rev C.pdf', category: 'drawings', size: 3_200_000, uploadedAt: '2024-01-22T08:00:00Z' },
  { id: 'd5', projectId: 'proj_1', name: 'Site Layout.dwg', category: 'drawings', size: 2_100_000, uploadedAt: '2024-01-15T14:00:00Z' },
  { id: 'd6', projectId: 'proj_1', name: 'HVAC Warranty.pdf', category: 'warranties', size: 540_000, uploadedAt: '2024-02-10T09:00:00Z' },
  { id: 'd7', projectId: 'proj_1', name: 'Lighting Spec.pdf', category: 'specifications', size: 760_000, uploadedAt: '2024-01-30T15:00:00Z' },
  { id: 'd8', projectId: 'proj_1', name: 'Contract.pdf', category: 'documents', size: 980_000, uploadedAt: '2024-01-15T10:00:00Z' },
  { id: 'd9', projectId: 'proj_1', name: 'Order — Steel Studs.pdf', category: 'products', size: 320_000, uploadedAt: '2024-02-05T11:00:00Z' },
  { id: 'd10', projectId: 'proj_1', name: 'Permit — Electrical.pdf', category: 'files', size: 880_000, uploadedAt: '2024-02-01T09:00:00Z' },

  // proj_2 — Westside Community Center
  { id: 'd11', projectId: 'proj_2', name: 'Foundation Tasks.pdf', category: 'tasks', size: 210_000, uploadedAt: '2024-03-15T10:00:00Z' },
  { id: 'd12', projectId: 'proj_2', name: 'Site Survey.jpg', category: 'photos', size: 1_800_000, uploadedAt: '2024-03-05T08:00:00Z' },
  { id: 'd13', projectId: 'proj_2', name: 'Architectural Plans.pdf', category: 'drawings', size: 4_100_000, uploadedAt: '2024-03-01T09:00:00Z' },
  { id: 'd14', projectId: 'proj_2', name: 'Building Permit.pdf', category: 'files', size: 720_000, uploadedAt: '2024-03-08T10:00:00Z' },
  { id: 'd15', projectId: 'proj_2', name: 'Master Service Agreement.pdf', category: 'documents', size: 1_300_000, uploadedAt: '2024-03-01T08:00:00Z' },

  // proj_3 — Downtown Office
  { id: 'd16', projectId: 'proj_3', name: 'Closeout Punch List.pdf', category: 'tasks', size: 180_000, uploadedAt: '2024-04-20T10:00:00Z' },
  { id: 'd17', projectId: 'proj_3', name: 'Final Walkthrough.jpg', category: 'photos', size: 1_500_000, uploadedAt: '2024-04-22T14:00:00Z' },
  { id: 'd18', projectId: 'proj_3', name: 'Roof Detail.dwg', category: 'drawings', size: 2_400_000, uploadedAt: '2023-10-12T09:00:00Z' },
  { id: 'd19', projectId: 'proj_3', name: 'Roofing Warranty.pdf', category: 'warranties', size: 460_000, uploadedAt: '2024-04-22T10:00:00Z' },
  { id: 'd20', projectId: 'proj_3', name: 'Window Warranty.pdf', category: 'warranties', size: 410_000, uploadedAt: '2024-03-30T10:00:00Z' },
  { id: 'd21', projectId: 'proj_3', name: 'Finish Schedule.pdf', category: 'specifications', size: 580_000, uploadedAt: '2024-01-10T10:00:00Z' },
  { id: 'd22', projectId: 'proj_3', name: 'Furniture Order.pdf', category: 'products', size: 290_000, uploadedAt: '2024-04-01T10:00:00Z' },

  // proj_4 — Riverside Medical
  { id: 'd23', projectId: 'proj_4', name: 'Site Prep Tasks.pdf', category: 'tasks', size: 200_000, uploadedAt: '2024-04-10T10:00:00Z' },
  { id: 'd24', projectId: 'proj_4', name: 'Concept Drawings.pdf', category: 'drawings', size: 5_200_000, uploadedAt: '2024-04-01T09:00:00Z' },
  { id: 'd25', projectId: 'proj_4', name: 'Geotech Report.pdf', category: 'documents', size: 2_800_000, uploadedAt: '2024-04-05T10:00:00Z' },

  // proj_5 — Harbor Warehouse (completed)
  { id: 'd26', projectId: 'proj_5', name: 'Closeout Package.pdf', category: 'documents', size: 6_400_000, uploadedAt: '2023-11-30T10:00:00Z' },
  { id: 'd27', projectId: 'proj_5', name: 'Roof Warranty.pdf', category: 'warranties', size: 520_000, uploadedAt: '2023-11-25T10:00:00Z' },
  { id: 'd28', projectId: 'proj_5', name: 'Final Inspection.jpg', category: 'photos', size: 1_900_000, uploadedAt: '2023-11-29T15:00:00Z' },

  // proj_6 — Maple Heights (on hold)
  { id: 'd29', projectId: 'proj_6', name: 'Permit Clarification.pdf', category: 'files', size: 340_000, uploadedAt: '2024-04-25T10:00:00Z' },
  { id: 'd30', projectId: 'proj_6', name: 'Site Photos.jpg', category: 'photos', size: 1_600_000, uploadedAt: '2024-04-15T10:00:00Z' },
];
