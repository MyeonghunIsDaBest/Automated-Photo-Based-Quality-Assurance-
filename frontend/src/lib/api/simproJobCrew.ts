// lib/api/simproJobCrew.ts — crew assignment for imported Simpro jobs
// (simpro_job_crew, migration 72). Reads return empty when Supabase isn't
// configured; writes throw.
import { supabase, supabaseConfigured } from '../supabase';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

/** Map of simproJobId → assigned user ids, for the given jobs. Chunked so a long
 *  id list can't build a too-long URL (PostgREST `in.(…)` → 400 URI too long). */
export async function listCrewForSimproJobs(jobIds: string[]): Promise<Map<string, string[]>> {
  const out = new Map<string, string[]>();
  if (!supabaseConfigured() || jobIds.length === 0) return out;
  const CHUNK = 100;
  for (let i = 0; i < jobIds.length; i += CHUNK) {
    const batch = jobIds.slice(i, i + CHUNK);
    const { data, error } = await supabase
      .from('simpro_job_crew')
      .select('simpro_job_id, user_id')
      .in('simpro_job_id', batch);
    if (error) throw error;
    for (const r of data ?? []) {
      const row = r as { simpro_job_id: string; user_id: string };
      const arr = out.get(row.simpro_job_id) ?? [];
      arr.push(row.user_id);
      out.set(row.simpro_job_id, arr);
    }
  }
  return out;
}

export async function addSimproCrew(jobId: string, userId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const uid = (await supabase.auth.getUser()).data.user?.id ?? null;
  const { error } = await supabase
    .from('simpro_job_crew')
    .upsert(
      { simpro_job_id: jobId, user_id: userId, assigned_by: uid },
      { onConflict: 'simpro_job_id,user_id', ignoreDuplicates: true },
    );
  if (error) throw error;
}

export async function removeSimproCrew(jobId: string, userId: string): Promise<void> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;
  const { error } = await supabase
    .from('simpro_job_crew')
    .delete()
    .eq('simpro_job_id', jobId)
    .eq('user_id', userId);
  if (error) throw error;
}
