// ─────────────────────────────────────────────────────────────────────────────
// generate-reports — Supabase Edge Function (Deno).
//
// Iterates every row in `project_config` where `report_cadence != 'none'`,
// decides whether today is a report day for that cadence, and writes one
// `project_reports` row per matching project. Idempotent: the
// (project_id, report_type, date_from) unique index makes a same-day re-run
// a no-op (`on conflict do nothing`).
//
// CADENCE RULES (UTC):
//   weekly  → runs on Mondays. window = previous Mon..Sun.
//   monthly → runs on the 1st.  window = previous calendar month.
//   daily   → runs every day.   window = yesterday only. (Reserved — not
//             a config option today; included for future use.)
//
// SCHEDULING
//   This function is dumb on purpose — it can be invoked any time, and it
//   only writes a row when today matches the cadence. Wire it to a daily
//   cron (Supabase pg_cron, Vercel cron, or any external scheduler) at a
//   stable UTC time (e.g. 06:00 UTC). The README + DEMO docs cover the
//   options.
//
// DEPLOY
//   supabase functions deploy generate-reports
//
// INVOKE (manual / test)
//   curl -X POST "$SUPABASE_URL/functions/v1/generate-reports" \
//     -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
// ─────────────────────────────────────────────────────────────────────────────

// @ts-expect-error Deno-only import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { isProjectMember } from '../_shared/auth.ts';
import { logAction } from '../_shared/auditLog.ts';
import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Cadence = 'weekly' | 'monthly';
// On-demand requests (from the Reports page) may also ask for a 'daily' window.
type OnDemandType = 'daily' | 'weekly' | 'monthly';

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

interface ProjectConfigRow {
  project_id: string;
  report_cadence: 'none' | 'weekly' | 'monthly';
}

interface ReportWindow {
  reportType: Cadence;
  dateFrom: string; // YYYY-MM-DD
  dateTo: string;   // YYYY-MM-DD (inclusive)
}

function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

// Decide what report (if any) to run today for the given cadence. Returns
// null when today isn't a trigger day.
function windowFor(cadence: Cadence, today: Date): ReportWindow | null {
  const day = today.getUTCDay(); // 0 = Sunday, 1 = Monday, ...
  if (cadence === 'weekly') {
    if (day !== 1) return null; // only Mondays
    // Previous Mon..Sun window — 7 days ending yesterday.
    const end = new Date(today);
    end.setUTCDate(end.getUTCDate() - 1);
    const start = new Date(end);
    start.setUTCDate(start.getUTCDate() - 6);
    return { reportType: 'weekly', dateFrom: isoDate(start), dateTo: isoDate(end) };
  }
  if (cadence === 'monthly') {
    if (today.getUTCDate() !== 1) return null; // only on the 1st
    const lastMonthEnd = new Date(today);
    lastMonthEnd.setUTCDate(0); // back into the previous month
    const lastMonthStart = new Date(lastMonthEnd);
    lastMonthStart.setUTCDate(1);
    return { reportType: 'monthly', dateFrom: isoDate(lastMonthStart), dateTo: isoDate(lastMonthEnd) };
  }
  return null;
}

// On-demand (Reports-page "Generate now") windows are ROLLING and end today,
// matching the page's labels ("Last 24 hours / 7 days / 30 days"). Unlike the
// cron windows these aren't cadence-day-gated — the user asked for it now.
function onDemandWindow(reportType: OnDemandType, today: Date): { reportType: OnDemandType; dateFrom: string; dateTo: string } {
  const to = isoDate(today);
  const span = reportType === 'daily' ? 0 : reportType === 'weekly' ? 6 : 29;
  const start = new Date(today);
  start.setUTCDate(start.getUTCDate() - span);
  return { reportType, dateFrom: isoDate(start), dateTo: to };
}

// Most-recent prior SCHEDULED report's overall progress for a project+type, for
// the cron period-over-period delta. Restricted to cron-* runs so a rolling
// on-demand row can never become a cron report's baseline (the two series have
// different window semantics). Null when there's no earlier cron report.
async function priorOverallProgress(
  sb: ReturnType<typeof createClient>,
  projectId: string,
  reportType: string,
  beforeDateFrom: string,
): Promise<number | null> {
  const { data } = await sb
    .from('project_reports')
    .select('summary, date_from')
    .eq('project_id', projectId)
    .eq('report_type', reportType)
    .eq('status', 'ready')
    .like('generation_run_id', 'cron-%')
    .lt('date_from', beforeDateFrom)
    .order('date_from', { ascending: false })
    .limit(1)
    .maybeSingle();
  const prior = (data as { summary?: { overallProgress?: number } } | null)?.summary?.overallProgress;
  return typeof prior === 'number' ? prior : null;
}

// Latest SCHEDULED (cron) report's overall progress for a project+type — the
// stable baseline an on-demand "refresh" compares against. On-demand windows
// are rolling and kept to a single live row, so they have no meaningful prior
// of their own; the last periodic report is the honest comparison point.
async function lastScheduledOverallProgress(
  sb: ReturnType<typeof createClient>,
  projectId: string,
  reportType: string,
): Promise<number | null> {
  const { data } = await sb
    .from('project_reports')
    .select('summary')
    .eq('project_id', projectId)
    .eq('report_type', reportType)
    .eq('status', 'ready')
    .like('generation_run_id', 'cron-%')
    .order('generated_at', { ascending: false })
    .limit(1)
    .maybeSingle();
  const prior = (data as { summary?: { overallProgress?: number } } | null)?.summary?.overallProgress;
  return typeof prior === 'number' ? prior : null;
}

// Cheap summary aggregations from existing tables. Counts + an overall-progress
// snapshot. No Storage rendering — that lives in a follow-up (PDF generator).
async function buildSummary(
  sb: ReturnType<typeof createClient>,
  projectId: string,
  fromIso: string,
  toIso: string,
  priorProgress: number | null,
) {
  // Window is inclusive of dateTo. Convert to half-open timestamp range.
  const fromTs = `${fromIso}T00:00:00Z`;
  const toTs = `${toIso}T23:59:59Z`;

  const [photosRes, tasksRes, safetyRes, allTasksRes] = await Promise.all([
    sb.from('photos').select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .gte('uploaded_at', fromTs)
      .lte('uploaded_at', toTs),
    sb.from('tasks').select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .gte('last_updated', fromTs)
      .lte('last_updated', toTs),
    sb.from('safety_incidents').select('id', { count: 'exact', head: true })
      .eq('project_id', projectId)
      .gte('detected_at', fromTs)
      .lte('detected_at', toTs),
    sb.from('tasks').select('percent_complete').eq('project_id', projectId),
  ]);

  const photosUploaded = photosRes.count ?? 0;
  const tasksUpdated   = tasksRes.count ?? 0;
  const safetyFlags    = safetyRes.count ?? 0;
  const taskRows       = (allTasksRes.data ?? []) as Array<{ percent_complete: number }>;
  const overallProgress = taskRows.length === 0
    ? 0
    : Math.round(taskRows.reduce((s, t) => s + (t.percent_complete ?? 0), 0) / taskRows.length);

  return {
    photosUploaded,
    tasksUpdated,
    overallProgress,
    // Period-over-period delta vs. the most recent prior report (0 when this is
    // the first report for the project+type).
    progressChange: priorProgress === null ? 0 : overallProgress - priorProgress,
    safetyFlags,
  };
}

serve(async (req: Request) => {
  const pre = handleCorsPreflight(req);
  if (pre) return pre;
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: { ...CORS_HEADERS } });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const today = new Date();

  // ── On-demand path (Reports page "Generate now") ──────────────────────────
  // A body carrying { projectId, reportType } generates that one report
  // immediately, bypassing the cadence day-check. Idempotent per (project,
  // type, date_from) — a same-day re-generate UPSERTs and refreshes the
  // summary so the figures stay live.
  let body: { projectId?: string; reportType?: OnDemandType } = {};
  try { body = await req.json(); } catch { /* cron sends no body */ }

  // Any on-demand intent (either field present) MUST carry both fields and pass
  // the project-membership gate. Only a bodyless invocation (the cron
  // scheduler) falls through to the cadence sweep — so a malformed/partial
  // request can never silently trigger the all-projects cron run.
  if (body.projectId != null || body.reportType != null) {
    const rt = body.reportType;
    if (!body.projectId || !rt) {
      return jsonError(400, 'on-demand generation requires both projectId and reportType');
    }
    if (rt !== 'daily' && rt !== 'weekly' && rt !== 'monthly') {
      return jsonError(400, `invalid reportType: ${String(rt)}`);
    }
    if (!UUID_RE.test(body.projectId)) {
      return jsonError(400, `invalid projectId`);
    }
    // AuthZ: the service-role client below is RLS-exempt, so without this gate
    // any authenticated user could generate + read ANY project's report.
    if (!(await isProjectMember(req, body.projectId))) {
      return jsonError(403, 'forbidden: not a member of this project');
    }
    const win = onDemandWindow(rt, today);
    const runId = `ondemand-${isoDate(today)}-${today.getUTCHours().toString().padStart(2, '0')}`;
    try {
      // "Refresh latest": an on-demand report is the CURRENT rolling snapshot,
      // not a growing history, so we keep at most one on-demand row per
      // (project, type). The delta compares to the last SCHEDULED (cron) report
      // — the stable periodic baseline — not to a day-old rolling row.
      const prior = await lastScheduledOverallProgress(sb, body.projectId, rt);
      const summary = await buildSummary(sb, body.projectId, win.dateFrom, win.dateTo, prior);

      // Drop any previous on-demand row(s) for this (project, type) so the list
      // shows only the freshest snapshot. Scoped to ondemand-* run ids, so the
      // scheduled (cron) history is never touched.
      await sb
        .from('project_reports')
        .delete()
        .eq('project_id', body.projectId)
        .eq('report_type', rt)
        .like('generation_run_id', 'ondemand-%');

      const { data, error } = await sb
        .from('project_reports')
        .insert({
          project_id: body.projectId,
          report_type: rt,
          date_from: win.dateFrom,
          date_to: win.dateTo,
          status: 'ready',
          summary,
          generated_at: new Date().toISOString(),
          generation_run_id: runId,
          failure_reason: null,
        })
        .select('*')
        .single();
      if (error) {
        // If the rolling window lands exactly on an existing SCHEDULED report's
        // (project, type, date_from), the unique index rejects the insert — that
        // cron row already covers this window, so return it rather than clobber
        // cron history.
        const isDuplicate = error.code === '23505' || /duplicate/i.test(error.message);
        if (isDuplicate) {
          const { data: existing } = await sb
            .from('project_reports')
            .select('*')
            .eq('project_id', body.projectId)
            .eq('report_type', rt)
            .eq('date_from', win.dateFrom)
            .maybeSingle();
          if (existing) return jsonOk({ ok: true, onDemand: true, report: existing });
        }
        return jsonError(500, `report write failed: ${error.message}`);
      }
      await logAction({
        supabase: sb,
        projectId: body.projectId,
        userId: null,
        action: 'report_generated',
        entityType: 'project',
        entityId: body.projectId,
        newValue: { report_type: rt, date_from: win.dateFrom, date_to: win.dateTo, on_demand: true, summary },
      });
      return jsonOk({ ok: true, onDemand: true, report: data });
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      // Record the failure so on-demand errors are visible in project_reports
      // (parity with the cron path), not just a 500 the client forgets. INSERT
      // (not upsert): if a report already occupies this window the insert is
      // rejected and we leave that row alone — never clobber a scheduled report
      // with a failure. Best-effort, so the original 500 is always returned.
      try {
        await sb.from('project_reports').insert({
          project_id: body.projectId,
          report_type: rt,
          date_from: win.dateFrom,
          date_to: win.dateTo,
          status: 'failed',
          failure_reason: reason,
          generation_run_id: runId,
        });
      } catch { /* best-effort failure record */ }
      return jsonError(500, reason);
    }
  }

  // ── Cron path (cadence sweep over every configured project) ───────────────
  const runId = `cron-${isoDate(today)}-${today.getUTCHours().toString().padStart(2, '0')}`;

  const { data: configs, error: cfgErr } = await sb
    .from('project_config')
    .select('project_id, report_cadence')
    .neq('report_cadence', 'none');

  if (cfgErr) return jsonError(500, `project_config read failed: ${cfgErr.message}`);

  const rows = (configs ?? []) as ProjectConfigRow[];
  const inserted: string[] = [];
  const skipped: string[] = [];

  for (const cfg of rows) {
    const cadence = cfg.report_cadence as Cadence;
    const window = windowFor(cadence, today);
    if (!window) {
      skipped.push(`${cfg.project_id}:${cadence}:not-due`);
      continue;
    }

    let summary;
    try {
      const prior = await priorOverallProgress(sb, cfg.project_id, window.reportType, window.dateFrom);
      summary = await buildSummary(sb, cfg.project_id, window.dateFrom, window.dateTo, prior);
    } catch (e) {
      const reason = e instanceof Error ? e.message : String(e);
      await sb.from('project_reports').insert({
        project_id: cfg.project_id,
        report_type: window.reportType,
        date_from: window.dateFrom,
        date_to: window.dateTo,
        status: 'failed',
        failure_reason: reason,
        generation_run_id: runId,
      });
      skipped.push(`${cfg.project_id}:${cadence}:summary-failed`);
      continue;
    }

    const { error: insertErr } = await sb.from('project_reports').insert({
      project_id: cfg.project_id,
      report_type: window.reportType,
      date_from: window.dateFrom,
      date_to: window.dateTo,
      status: 'ready',
      summary,
      generation_run_id: runId,
    });

    if (insertErr) {
      // Unique-violation = same-day re-run for the same window. Not an error.
      const isDuplicate = insertErr.code === '23505' || /duplicate/i.test(insertErr.message);
      if (isDuplicate) {
        skipped.push(`${cfg.project_id}:${cadence}:already-generated`);
        continue;
      }
      console.error(`[generate-reports] ${cfg.project_id}: ${insertErr.message}`);
      skipped.push(`${cfg.project_id}:${cadence}:insert-failed`);
      continue;
    }

    inserted.push(`${cfg.project_id}:${cadence}`);
    await logAction({
      supabase: sb,
      projectId: cfg.project_id,
      userId: null,
      action: 'report_generated',
      entityType: 'project',
      entityId: cfg.project_id,
      newValue: { report_type: window.reportType, date_from: window.dateFrom, date_to: window.dateTo, summary },
    });
  }

  return jsonOk({
    ok: true,
    runId,
    processed: rows.length,
    insertedCount: inserted.length,
    skippedCount: skipped.length,
    inserted,
    skipped,
  });
});

function jsonOk(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}
