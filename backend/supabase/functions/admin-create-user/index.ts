// ─────────────────────────────────────────────────────────────────────────────
// admin-create-user — Supabase Edge Function (Deno).
//
// Creates a new auth.users row + profile WITHOUT touching the caller's
// session. Solves the "admin creates a user → admin gets logged out as that
// user" bug that comes from calling the public `supabase.auth.signUp` from
// the admin panel (signUp auto-signs the new user in, and v2's localStorage
// session sync propagates that to every open tab).
//
// FLOW
//   1. Verify the caller's JWT (forwarded in the Authorization header) by
//      asking Supabase Auth for the matching auth.users row via an anon-key
//      client *seeded with the request's bearer token*.
//   2. Authorise: load the caller's profile and confirm security_group is
//      'company_admin' or 'administrator'. company_admin can assign any
//      role; administrator can assign anything EXCEPT company_admin.
//   3. Validate the body (email/password/role/etc.).
//   4. Create the user via supabase.auth.admin.createUser(...). The
//      auth.users → profiles trigger (handle_new_user, see migration
//      00_init.sql §4) writes the profile row with the requested
//      security_group — but the trigger silently downgrades 'company_admin'
//      and 'administrator' to 'worker' (those tiers are admin-assigned only).
//      So if the admin asked for an admin tier, we follow up with an UPDATE
//      using the service-role client.
//   5. Apply any optional follow-up fields the form collected (mobile,
//      emergency contacts) with a single UPDATE on profiles.
//   6. Return the new auth user + profile row.
//
// DEPLOY
//   supabase functions deploy admin-create-user
//   (NO --no-verify-jwt — we want JWT verification on this one.)
//
// SECRETS (Supabase dashboard → Edge Functions → Secrets)
//   SUPABASE_URL                — auto-populated.
//   SUPABASE_ANON_KEY           — auto-populated.
//   SUPABASE_SERVICE_ROLE_KEY   — set this manually if not already present.
//
// INVOKE (frontend wrapper does this for you, see lib/api/admin.ts)
//   POST /functions/v1/admin-create-user
//   Authorization: Bearer <admin's session JWT>
//   Content-Type: application/json
//   Body: { email, password, firstName, lastName, securityGroup,
//           mobile?, emergencyContactName?, emergencyContactEmail?,
//           emergencyContactMobile? }
// ─────────────────────────────────────────────────────────────────────────────

// @ts-expect-error Deno-only import; no Node types in this repo.
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
// @ts-expect-error Deno-only import.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0';

// Lazy reads — Deno.env.get returns `undefined` if a secret isn't set, and
// the previous `!` non-null assertion let undefineds propagate into
// createClient(undefined, undefined) which fails with a useless message.
// We assert at request time instead, and return a clear 500 explaining
// exactly which secret is missing.
const SUPABASE_URL = Deno.env.get('SUPABASE_URL') ?? '';
const ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
const SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';

// Mirrors the Postgres `security_group` enum (00_init.sql + Phase A's
// 01_security_group_expand.sql, which adds stakeholder + supplier).
const SECURITY_GROUPS = [
  'company_admin',
  'administrator',
  'construction_mgr',
  'project_manager',
  'worker',
  'stakeholder',
  'supplier',
] as const;
type SecurityGroup = typeof SECURITY_GROUPS[number];

// Stakeholder / supplier accounts get linked to their org-wide directory
// record so the UI can render company name + contact details. The CHECK
// constraint on profiles enforces at most one of these is set; the
// function rejects mismatches (e.g. linkTo.type='stakeholder' but
// securityGroup='worker').
interface LinkToPayload {
  type: 'stakeholder' | 'supplier';
  id: string;
}

interface CreateUserPayload {
  email?: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  securityGroup?: SecurityGroup;
  mobile?: string | null;
  emergencyContactName?: string | null;
  emergencyContactEmail?: string | null;
  emergencyContactMobile?: string | null;
  linkTo?: LinkToPayload | null;
}

// CORS — match the analyze-photo function's permissive policy. Same-origin
// invocations from supabase.functions.invoke don't strictly need this, but
// it lets us debug the function with curl from anywhere.
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
  });
}

serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return json(405, { error: 'Method Not Allowed' });
  }

  // ── 0. Sanity-check the function's own environment ──────────────────
  // Surfacing this at the top means a misconfigured deploy gets an
  // actionable error instead of an obscure "fetch failed" further down.
  const missing: string[] = [];
  if (!SUPABASE_URL)      missing.push('SUPABASE_URL');
  if (!ANON_KEY)          missing.push('SUPABASE_ANON_KEY');
  if (!SERVICE_ROLE_KEY)  missing.push('SUPABASE_SERVICE_ROLE_KEY');
  if (missing.length > 0) {
    return json(500, {
      error:
        `admin-create-user is missing required env vars: ${missing.join(', ')}. ` +
        `Set them in Supabase dashboard → Edge Functions → Secrets and redeploy.`,
    });
  }

  // ── 1. Authenticate the caller ──────────────────────────────────────
  const authHeader = req.headers.get('Authorization') ?? '';
  if (!authHeader.startsWith('Bearer ')) {
    return json(401, { error: 'Missing Authorization header.' });
  }

  // Caller-scoped client: anon key + the request's bearer token. The token
  // identifies the caller so getUser() returns their auth.users row.
  const callerClient = createClient(SUPABASE_URL, ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: callerData, error: callerErr } = await callerClient.auth.getUser();
  if (callerErr || !callerData?.user) {
    return json(401, { error: 'Invalid or expired session.' });
  }
  const callerId = callerData.user.id;

  // ── 2. Authorise — only admin tiers can create users ────────────────
  // Service-role client for the privileged checks + writes below. Bypasses
  // RLS, so we never depend on policies for the admin-only flow.
  const serviceClient = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  const { data: callerProfile, error: profileErr } = await serviceClient
    .from('profiles')
    .select('id, security_group, is_active')
    .eq('id', callerId)
    .maybeSingle();

  if (profileErr) {
    return json(500, { error: `Profile lookup failed: ${profileErr.message}` });
  }
  if (!callerProfile || !callerProfile.is_active) {
    return json(403, { error: 'Caller profile not found or inactive.' });
  }

  const callerGroup = callerProfile.security_group as SecurityGroup;
  const callerIsAdminTier =
    callerGroup === 'company_admin' || callerGroup === 'administrator';
  const callerIsDev = (callerProfile.security_group as string) === 'dev';
  // Project Managers can create their own crew (non-admin roles only — enforced
  // below). dev is the hidden superuser. Everyone else is rejected.
  const callerIsProjectManager = callerGroup === 'project_manager';
  if (!callerIsAdminTier && !callerIsDev && !callerIsProjectManager) {
    return json(403, { error: 'Only admins and project managers can create users.' });
  }

  // ── 3. Parse + validate the request body ────────────────────────────
  let body: CreateUserPayload;
  try {
    body = await req.json();
  } catch {
    return json(400, { error: 'Invalid JSON.' });
  }

  const email = body.email?.trim();
  const password = body.password ?? '';
  const firstName = body.firstName?.trim() ?? '';
  const lastName = body.lastName?.trim() ?? '';
  const requestedGroup = body.securityGroup ?? 'worker';

  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return json(400, { error: 'A valid email is required.' });
  }
  if (password.length < 6) {
    return json(400, { error: 'Password must be at least 6 characters.' });
  }
  if (!SECURITY_GROUPS.includes(requestedGroup)) {
    return json(400, { error: `Invalid security group: ${requestedGroup}` });
  }

  // Mirrors canAssignSecurityGroup() in frontend/src/lib/permissions.ts.
  // Administrators can assign every group except company_admin.
  if (callerGroup === 'administrator' && requestedGroup === 'company_admin') {
    return json(403, { error: 'Only Company Admin can assign Company Admin.' });
  }
  // Project Managers manage their own crew — non-admin roles only.
  if (callerIsProjectManager &&
      (requestedGroup === 'company_admin' || requestedGroup === 'administrator')) {
    return json(403, { error: 'Project managers can only create non-admin accounts.' });
  }

  // ── 3a. Validate linkTo payload (stakeholder/supplier accounts only) ─
  const linkTo = body.linkTo ?? null;
  if (linkTo) {
    if (linkTo.type !== 'stakeholder' && linkTo.type !== 'supplier') {
      return json(400, { error: `Invalid linkTo.type: ${linkTo.type}` });
    }
    if (typeof linkTo.id !== 'string' || linkTo.id.length === 0) {
      return json(400, { error: 'linkTo.id is required when linkTo is set.' });
    }
    // Type/group must match — a stakeholder account has to be linked to a
    // stakeholders row, and same for supplier. Anything else is a bug.
    if (linkTo.type !== requestedGroup) {
      return json(400, {
        error: `linkTo.type (${linkTo.type}) does not match securityGroup (${requestedGroup}).`,
      });
    }
    // Confirm the directory row exists.
    const tableName = linkTo.type === 'stakeholder' ? 'stakeholders' : 'suppliers';
    const { data: linkRow, error: linkErr } = await serviceClient
      .from(tableName)
      .select('id')
      .eq('id', linkTo.id)
      .maybeSingle();
    if (linkErr) {
      return json(500, { error: `Linkage lookup failed: ${linkErr.message}` });
    }
    if (!linkRow) {
      return json(400, {
        error: `${linkTo.type} record ${linkTo.id} not found.`,
      });
    }
  } else if (requestedGroup === 'stakeholder' || requestedGroup === 'supplier') {
    return json(400, {
      error: `linkTo is required when securityGroup is ${requestedGroup}.`,
    });
  }

  // ── 4. Create the auth.users row ────────────────────────────────────
  // email_confirm: true so the new account can sign in immediately. The
  // handle_new_user() trigger in migration 00_init.sql §4 fires on this
  // INSERT and writes the matching profiles row.
  const { data: created, error: createErr } = await serviceClient.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: {
      first_name: firstName,
      last_name: lastName,
      security_group: requestedGroup,
      requested_role: requestedGroup,
    },
  });

  if (createErr || !created?.user) {
    // Surface Supabase's error verbatim — usually "User already registered".
    const msg = createErr?.message ?? 'Failed to create user.';
    const status = msg.toLowerCase().includes('already') ? 409 : 400;
    return json(status, { error: msg });
  }
  const newUserId = created.user.id;

  // ── 5. Patch the profile row ────────────────────────────────────────
  // The trigger downgrades 'company_admin' / 'administrator' to 'worker'
  // because those tiers are admin-assigned only. The frontend's permission
  // check (canAssignSecurityGroup) already cleared the caller for the
  // requested tier, so promote the row here.
  const profilePatch: Record<string, unknown> = {
    first_name: firstName,
    last_name: lastName,
    security_group: requestedGroup,
  };
  if (body.mobile !== undefined) profilePatch.mobile = body.mobile;
  if (body.emergencyContactName !== undefined)
    profilePatch.emergency_contact_name = body.emergencyContactName;
  if (body.emergencyContactEmail !== undefined)
    profilePatch.emergency_contact_email = body.emergencyContactEmail;
  if (body.emergencyContactMobile !== undefined)
    profilePatch.emergency_contact_mobile = body.emergencyContactMobile;
  // Phase A: stakeholder/supplier linkage.
  if (linkTo) {
    if (linkTo.type === 'stakeholder') {
      profilePatch.stakeholder_id = linkTo.id;
      profilePatch.supplier_id = null;
    } else {
      profilePatch.supplier_id = linkTo.id;
      profilePatch.stakeholder_id = null;
    }
  }

  const { data: profileRow, error: updateErr } = await serviceClient
    .from('profiles')
    .update(profilePatch)
    .eq('id', newUserId)
    .select('*')
    .maybeSingle();

  if (updateErr) {
    // The auth user exists but the profile update failed. Surface a clear
    // error so the admin can re-edit the user's profile inline; we don't
    // roll back the auth user because the row IS in the DB and a roll-back
    // could leave an orphan profile.
    return json(500, {
      error: `User created but profile update failed: ${updateErr.message}`,
      userId: newUserId,
    });
  }

  // ── 6. Done. Return the new user + profile to the caller ────────────
  return json(200, {
    user: created.user,
    profile: profileRow,
  });
});
