// ─────────────────────────────────────────────────────────────────────────────
// admin-rescue-user — Supabase Edge Function (Deno).
//
// Owner-tier endpoint. Lets an `is_owner=true` user rescue another admin
// without touching Supabase Studio: send a password-reset email, set a
// temporary password, edit profile fields, or grant/revoke ownership on
// another account.
//
// Migration 11 added the `is_owner` column + the `is_owner()` SQL helper.
// This function verifies the caller's JWT, loads their profile, gates on
// is_owner=true, then executes one of four actions per request:
//
//   POST /functions/v1/admin-rescue-user
//   Body: { targetUserId: string; action: 'send_reset' | 'set_temp_password' |
//           'edit_profile' | 'set_owner';
//           tempPassword?: string;     (action='set_temp_password')
//           profilePatch?: {...};      (action='edit_profile')
//           isOwner?: boolean;         (action='set_owner') }
//
// AUDIT
//   Every action writes an `audit_log` row with `entity_type='user'` and
//   `action='admin_rescue:<sub-action>'`. Receipts in case a sensitive op
//   needs to be defended later.
//
// LAST-OWNER GUARD
//   `set_owner` with `isOwner=false` rejects when the target is the last
//   `is_owner=true` profile. The UI also guards this, but the function
//   is the seatbelt.
//
// DEPLOY
//   supabase functions deploy admin-rescue-user
// ─────────────────────────────────────────────────────────────────────────────

// @ts-expect-error Deno-only import.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

import { logAction } from '../_shared/auditLog.ts';

// @ts-expect-error Deno globals.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
// @ts-expect-error Deno globals.
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
// @ts-expect-error Deno globals.
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

type RescueAction = 'send_reset' | 'set_temp_password' | 'edit_profile' | 'set_owner';

interface RescuePayload {
  targetUserId?: string;
  action?: RescueAction;
  tempPassword?: string;
  profilePatch?: {
    email?: string;
    first_name?: string;
    last_name?: string;
    mobile?: string;
    security_group?: string;
    is_active?: boolean;
  };
  isOwner?: boolean;
}

serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonError(405, 'method not allowed');
  }
  if (!SUPABASE_URL || !ANON_KEY || !SERVICE_ROLE_KEY) {
    return jsonError(500, 'missing Supabase env secrets');
  }

  // ── 1. Identify the caller via the forwarded JWT ─────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  const jwt = authHeader.replace(/^Bearer\s+/i, '').trim();
  if (!jwt) return jsonError(401, 'missing bearer token');

  // Anon client seeded with the caller's JWT so the auth API resolves to
  // the right user. We use service-role for the actual mutations below.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
  });
  const { data: userData, error: userErr } = await callerClient.auth.getUser(jwt);
  if (userErr || !userData?.user) return jsonError(401, 'invalid token');
  const callerId = userData.user.id;

  // Service-role client for the rest of the work (no RLS gates apply).
  const admin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  // ── 2. Authorise: caller must be is_owner=true + is_active=true ─────────
  const { data: callerProfile, error: callerProfileErr } = await admin
    .from('profiles')
    .select('id, email, is_owner, is_active')
    .eq('id', callerId)
    .single();

  if (callerProfileErr || !callerProfile) return jsonError(403, 'caller profile missing');
  if (!callerProfile.is_active) return jsonError(403, 'caller account disabled');
  if (!callerProfile.is_owner) return jsonError(403, 'owner-tier only');

  // ── 3. Validate body ─────────────────────────────────────────────────────
  let body: RescuePayload = {};
  try {
    body = await req.json();
  } catch {
    return jsonError(400, 'invalid json');
  }
  const { targetUserId, action } = body;
  if (!targetUserId) return jsonError(400, 'targetUserId required');
  if (!action || !['send_reset', 'set_temp_password', 'edit_profile', 'set_owner'].includes(action)) {
    return jsonError(400, 'action must be one of send_reset / set_temp_password / edit_profile / set_owner');
  }

  // ── 4. Load the target's profile (need email for password reset etc.) ────
  const { data: targetProfile, error: targetErr } = await admin
    .from('profiles')
    .select('id, email, first_name, last_name, security_group, is_active, is_owner')
    .eq('id', targetUserId)
    .single();
  if (targetErr || !targetProfile) return jsonError(404, 'target profile not found');

  // ── 5. Dispatch action ──────────────────────────────────────────────────
  let result: Record<string, unknown> = {};

  if (action === 'send_reset') {
    // Triggers Supabase Auth's standard reset-password email flow. No
    // password value crosses the wire.
    const { error } = await admin.auth.resetPasswordForEmail(targetProfile.email);
    if (error) return jsonError(500, `password-reset email failed: ${error.message}`);
    result = { sentTo: targetProfile.email };
  }

  else if (action === 'set_temp_password') {
    const pw = (body.tempPassword ?? '').trim();
    if (pw.length < 8) return jsonError(400, 'tempPassword must be at least 8 chars');
    const { error } = await admin.auth.admin.updateUserById(targetUserId, { password: pw });
    if (error) return jsonError(500, `set temp password failed: ${error.message}`);
    result = { ok: true };
  }

  else if (action === 'edit_profile') {
    const patch = body.profilePatch ?? {};
    const allowedKeys = ['email', 'first_name', 'last_name', 'mobile', 'security_group', 'is_active'] as const;
    const clean: Record<string, unknown> = {};
    for (const k of allowedKeys) if (k in patch) clean[k] = (patch as Record<string, unknown>)[k];
    if (Object.keys(clean).length === 0) return jsonError(400, 'profilePatch is empty');

    // If email is changing, also update auth.users.email via the admin API
    // so the user can actually sign in with the new email.
    if (typeof clean.email === 'string' && clean.email !== targetProfile.email) {
      const { error } = await admin.auth.admin.updateUserById(targetUserId, { email: clean.email });
      if (error) return jsonError(500, `auth email update failed: ${error.message}`);
    }

    const { error } = await admin
      .from('profiles')
      .update({ ...clean, updated_at: new Date().toISOString() })
      .eq('id', targetUserId);
    if (error) return jsonError(500, `profile update failed: ${error.message}`);

    result = { patched: Object.keys(clean) };
  }

  else if (action === 'set_owner') {
    const next = body.isOwner === true;

    // Last-owner guard: if revoking, ensure at least one other owner exists.
    if (!next && targetProfile.is_owner) {
      const { count, error } = await admin
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('is_owner', true);
      if (error) return jsonError(500, `owner-count read failed: ${error.message}`);
      if ((count ?? 0) <= 1) return jsonError(409, 'cannot revoke the last owner');
    }

    const { error } = await admin
      .from('profiles')
      .update({ is_owner: next, updated_at: new Date().toISOString() })
      .eq('id', targetUserId);
    if (error) return jsonError(500, `set_owner failed: ${error.message}`);

    result = { isOwner: next };
  }

  // ── 6. Audit log ─────────────────────────────────────────────────────────
  await logAction({
    supabase: admin,
    projectId: null,
    userId: callerId,
    action: `admin_rescue:${action}`,
    entityType: 'user',
    entityId: targetUserId,
    oldValue: { email: targetProfile.email, is_owner: targetProfile.is_owner, security_group: targetProfile.security_group },
    newValue: result,
    notes: `Owner ${callerProfile.email} rescued ${targetProfile.email}`,
  });

  return jsonOk({ ok: true, action, target: targetUserId, ...result });
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
