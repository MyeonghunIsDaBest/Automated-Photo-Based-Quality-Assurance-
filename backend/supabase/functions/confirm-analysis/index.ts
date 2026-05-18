// ─────────────────────────────────────────────────────────────────────────────
// confirm-analysis — Supabase Edge Function (Deno).
//
// Phase C review-queue endpoint. JWT-gated; manager+ only.
//
//   POST /functions/v1/confirm-analysis
//   { photoId, action: 'confirmed' | 'rejected', overridePct?: number, notes?: string }
//
// On 'confirmed':
//   - ai_analyses.action_taken='confirmed', analysis_status='confirmed'
//   - tasks.percent_complete bumped to overridePct (or completion_pct), guarded
//   - audit_log entry
//
// On 'rejected':
//   - ai_analyses.action_taken='skipped', analysis_status='rejected'
//   - audit_log entry (no task touch)
//
// DEPLOY:
//   supabase functions deploy confirm-analysis
// ─────────────────────────────────────────────────────────────────────────────

// @ts-expect-error Deno-only import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { logAction } from '../_shared/auditLog.ts';
import { loadProjectConfig } from '../_shared/loadProjectConfig.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const MANAGER_GROUPS = new Set([
  'company_admin',
  'administrator',
  'construction_mgr',
  'project_manager',
  'site_manager',
]);

interface ConfirmPayload {
  photoId?: string;
  action?: 'confirmed' | 'rejected';
  overridePct?: number;
  notes?: string;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  // ── 1. Identify the caller ──────────────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return jsonError(401, 'missing bearer token');

  const sb = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { data: userData, error: userErr } = await sb.auth.getUser(jwt);
  if (userErr || !userData?.user) return jsonError(401, 'invalid token');
  const userId = userData.user.id;

  // ── 2. Role check (manager+) ────────────────────────────────────────────
  const { data: profile, error: profileErr } = await sb
    .from('profiles')
    .select('security_group, is_active')
    .eq('id', userId)
    .single();

  if (profileErr || !profile) return jsonError(403, 'profile missing');
  if (!profile.is_active) return jsonError(403, 'account disabled');
  if (!MANAGER_GROUPS.has(profile.security_group)) {
    return jsonError(403, 'manager+ only');
  }

  // ── 3. Validate payload ────────────────────────────────────────────────
  let body: ConfirmPayload = {};
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid json');
  }

  const { photoId, action, overridePct, notes } = body;
  if (!photoId) return jsonError(400, 'photoId required');
  if (action !== 'confirmed' && action !== 'rejected') {
    return jsonError(400, 'action must be confirmed or rejected');
  }
  if (overridePct !== undefined) {
    if (!Number.isInteger(overridePct) || overridePct < 0 || overridePct > 100) {
      return jsonError(400, 'overridePct must be an integer 0..100');
    }
  }

  // ── 4. Fetch the analysis row ──────────────────────────────────────────
  const { data: analysis, error: aErr } = await sb
    .from('ai_analyses')
    .select('id, photo_id, completion_pct, analysis_status, action_taken, photos(project_id, task_id)')
    .eq('photo_id', photoId)
    .single();

  if (aErr || !analysis) return jsonError(404, 'no analysis for that photo');
  if (analysis.analysis_status !== 'analysed') {
    return jsonError(409, `analysis is in state '${analysis.analysis_status}', cannot ${action}`);
  }

  const photo = analysis.photos as unknown as { project_id: string; task_id: string | null };

  // ── 4b. Per-project manual-floor gate ──────────────────────────────────
  // If the project's admin has disabled manual overrides, a manager+ caller
  // can still confirm/reject the analysis but can NOT pass `overridePct` to
  // force a custom percentage. This protects against operators bypassing the
  // AI's call in projects that want strict auto-action behaviour.
  if (overridePct !== undefined) {
    const cfg = await loadProjectConfig(sb, photo.project_id);
    if (!cfg.manualFloorAllowed) {
      return jsonError(403, 'manual floor disabled for this project');
    }
  }

  // ── 5a. Confirmed path ─────────────────────────────────────────────────
  if (action === 'confirmed') {
    const newPct = overridePct ?? (analysis.completion_pct as number);

    const { error: aiUpdateErr } = await sb
      .from('ai_analyses')
      .update({
        action_taken:    'confirmed',
        analysis_status: 'confirmed',
      })
      .eq('id', analysis.id);
    if (aiUpdateErr) return jsonError(500, aiUpdateErr.message);

    let taskBumped = false;
    let oldPct: number | null = null;
    if (photo.task_id) {
      const { data: oldTask } = await sb
        .from('tasks')
        .select('percent_complete')
        .eq('id', photo.task_id)
        .single();
      oldPct = (oldTask?.percent_complete ?? 0) as number;

      if (newPct > oldPct) {
        const { error: taskErr } = await sb
          .from('tasks')
          .update({
            percent_complete: newPct,
            update_source:    'supervisor',
            last_updated:     new Date().toISOString(),
          })
          .eq('id', photo.task_id)
          .lt('percent_complete', newPct);
        taskBumped = !taskErr;
      }
    }

    await logAction({
      supabase:   sb,
      projectId:  photo.project_id,
      userId,
      action:     'analysis_confirmed',
      entityType: 'ai_analysis',
      entityId:   analysis.id,
      oldValue:   { percent_complete: oldPct, ai_completion_pct: analysis.completion_pct },
      newValue:   { confirmed_pct: newPct, task_bumped: taskBumped },
      notes,
    });

    return jsonOk({ ok: true, action, taskBumped, newPct });
  }

  // ── 5b. Rejected path ──────────────────────────────────────────────────
  const { error: rejectErr } = await sb
    .from('ai_analyses')
    .update({
      action_taken:    'skipped',
      analysis_status: 'rejected',
    })
    .eq('id', analysis.id);
  if (rejectErr) return jsonError(500, rejectErr.message);

  await logAction({
    supabase:   sb,
    projectId:  photo.project_id,
    userId,
    action:     'analysis_rejected',
    entityType: 'ai_analysis',
    entityId:   analysis.id,
    oldValue:   { ai_completion_pct: analysis.completion_pct },
    newValue:   { rejected: true },
    notes,
  });

  return jsonOk({ ok: true, action });
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
