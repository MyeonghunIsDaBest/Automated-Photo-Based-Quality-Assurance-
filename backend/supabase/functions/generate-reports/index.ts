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

import { logAction } from '../_shared/auditLog.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

type Cadence = 'weekly' | 'monthly';

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

// Cheap summary aggregations from existing tables. Counts + an overall-progress
// snapshot. No Storage rendering — that lives in a follow-up (PDF generator).
async function buildSummary(
  sb: ReturnType<typeof createClient>,
  projectId: string,
  fromIso: string,
  toIso: string,
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
    progressChange: 0, // delta vs. previous window — wire when prior report is available
    safetyFlags,
  };
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const today = new Date();
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
      summary = await buildSummary(sb, cfg.project_id, window.dateFrom, window.dateTo);
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
    headers: { 'Content-Type': 'application/json' },
  });
}

function jsonError(status: number, message: string): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}
