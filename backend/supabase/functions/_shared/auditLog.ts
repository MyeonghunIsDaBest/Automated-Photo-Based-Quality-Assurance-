// Audit-log helper used by every state-changing Edge Function. Wraps
// `audit_log` writes so each call site doesn't repeat the column boilerplate
// and the schema can evolve in one place.

// @ts-expect-error Deno-only import.
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

export interface AuditLogInput {
  supabase: SupabaseClient;
  projectId: string | null;
  userId: string | null;
  action: string;                  // verb-form, snake_case ('photo_analysed', 'analysis_confirmed')
  entityType: 'photo' | 'task' | 'ai_analysis' | 'safety_incident' | 'project' | 'project_config' | 'user';
  entityId: string;
  oldValue?: unknown;
  newValue?: unknown;
  notes?: string;
}

export async function logAction(input: AuditLogInput): Promise<void> {
  const { supabase, projectId, userId, action, entityType, entityId, oldValue, newValue, notes } = input;
  const { error } = await supabase.from('audit_log').insert({
    project_id: projectId,
    user_id: userId,
    action,
    entity_type: entityType,
    entity_id: entityId,
    old_value: oldValue ?? null,
    new_value: newValue ?? null,
    notes: notes ?? null,
  });
  // Audit failures must not block the primary write — log to stderr and move
  // on. The primary state change is the contract; the audit row is forensic.
  if (error) {
    console.error(`[audit_log] ${action} ${entityType}:${entityId} failed: ${error.message}`);
  }
}
