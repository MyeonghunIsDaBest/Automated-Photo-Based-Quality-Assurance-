// Sponsor fund-release ledger (role-experiences, Phase 4). Fully guarded around
// the `payment_milestones` table (migration 49) — every call no-ops / swallows
// when Supabase isn't configured, the project is a demo (non-UUID) id, or the
// table isn't deployed yet. So the Sponsor cockpit renders (empty releases)
// before the migration lands; releases light up once it's applied.

import { supabase, supabaseConfigured } from '../supabase';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const isUuid = (id: string) => UUID_RE.test(id);

export interface MilestoneRelease {
  id: string;
  projectId: string;
  phase: string;
  label: string;
  amount: number;
  releasedBy: string | null;
  releasedAt: string;
  note: string | null;
}

interface MilestoneRow {
  id: string;
  project_id: string;
  phase: string;
  label: string;
  amount: number;
  released_by: string | null;
  released_at: string;
  note: string | null;
}

function mapRow(r: MilestoneRow): MilestoneRelease {
  return {
    id: r.id,
    projectId: r.project_id,
    phase: r.phase,
    label: r.label,
    amount: r.amount,
    releasedBy: r.released_by ?? null,
    releasedAt: r.released_at,
    note: r.note ?? null,
  };
}

/** Released milestones for a project. Empty when not configured / not deployed. */
export async function listMilestoneReleases(projectId: string): Promise<MilestoneRelease[]> {
  if (!supabaseConfigured() || !isUuid(projectId)) return [];
  try {
    const { data, error } = await supabase
      .from('payment_milestones')
      .select('id, project_id, phase, label, amount, released_by, released_at, note')
      .eq('project_id', projectId)
      .order('released_at', { ascending: false });
    if (error) return [];
    return (data ?? []).map((r) => mapRow(r as MilestoneRow));
  } catch {
    return [];
  }
}

export interface ReleaseInput {
  projectId: string;
  phase: string;
  label: string;
  amount: number;
  signatureData?: string | null;
  note?: string;
}

/** Release (sign off) a payment milestone. Throws on a real failure so the UI
 *  can surface it; the unique (project, phase) index prevents double-release. */
export async function releaseMilestone(input: ReleaseInput): Promise<void> {
  if (!supabaseConfigured()) throw new Error('Sign-off needs Supabase configured.');
  if (!isUuid(input.projectId)) throw new Error('Open a real (non-demo) project to release funds.');
  const { data: auth } = await supabase.auth.getUser();
  const { error } = await supabase.from('payment_milestones').insert({
    project_id: input.projectId,
    phase: input.phase,
    label: input.label,
    amount: input.amount,
    released_by: auth.user?.id ?? null,
    signature_data: input.signatureData ?? null,
    note: input.note ?? null,
  });
  if (error) {
    // Friendly mapping for the most likely cases.
    if (/relation .*payment_milestones.* does not exist|schema cache/i.test(error.message)) {
      throw new Error('Fund release isn’t switched on yet — deploy migration 49 first.');
    }
    if (/duplicate|23505/i.test(error.message)) {
      throw new Error('This milestone has already been released.');
    }
    throw new Error(error.message);
  }
}
