// Read helpers for the `checklist_templates` table (roadmap P4.1). Reference
// data — a manager-curated (or seeded) set of checklist sub-steps per
// construction phase. The TaskDrawer "Apply template" picker reads these and
// bulk-creates the items onto a task via createChecklistItems (checklistItems.ts).

import { supabase, supabaseConfigured } from '../supabase';
import type { ConstructionPhase } from '../ai/contract';

export interface ChecklistTemplate {
  id: string;
  name: string;
  phase: ConstructionPhase | null;
  items: string[];
  isDefault: boolean;
}

interface ChecklistTemplateRow {
  id: string;
  org_id: string | null;
  name: string;
  phase: ConstructionPhase | null;
  items: string[] | null;
  is_default: boolean;
  created_at: string;
}

function mapRow(r: ChecklistTemplateRow): ChecklistTemplate {
  return {
    id: r.id,
    name: r.name,
    phase: r.phase ?? null,
    items: Array.isArray(r.items) ? r.items : [],
    isDefault: r.is_default,
  };
}

/** All checklist templates (small reference set), name-ordered. The picker
 *  filters by phase client-side. Empty in mock mode. */
export async function listChecklistTemplates(): Promise<ChecklistTemplate[]> {
  if (!supabaseConfigured()) return [];
  const { data, error } = await supabase
    .from('checklist_templates')
    .select('*')
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []).map((r) => mapRow(r as ChecklistTemplateRow));
}
