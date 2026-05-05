// Admin-driven user management. Calls the `admin-create-user` Edge Function
// instead of the public `auth.signUp` API — that's the whole point of this
// file. The public signUp auto-signs the new user in (replacing the admin's
// session in the same browser context), and `persistSession: true` then
// propagates that flip to every other open tab via localStorage. The edge
// function uses the service role key on the server side and never touches
// the caller's session.
//
// See `supabase/functions/admin-create-user/index.ts` for the server.
//
// LOCALHOST FALLBACK
// If the edge function isn't deployed yet (typical when running `npm run
// dev` against a fresh Supabase project), `supabase.functions.invoke`
// throws `FunctionsFetchError` / 404 / similar. To keep QA testing
// unblocked, we transparently fall back to a *throwaway Supabase client*
// configured with `persistSession: false`. The fallback's signUp runs in
// memory only, so the new user's session never lands in localStorage and
// the admin's session stays put. The fallback also can't promote admin
// tiers — the trigger downgrades them — so we follow up with an UPDATE
// using the regular client (admins have RLS write access to profiles).
//
// The fallback is dev-only: in production we want the proper edge-function
// path with its server-side authorisation check.

import { createClient } from '@supabase/supabase-js';
import { supabase, supabaseConfigured } from '../supabase';
import { rowToProfile } from './auth';
import type { Profile, SecurityGroup } from '../../types';

const NOT_CONFIGURED = new Error(
  'Supabase is not configured. Set VITE_SUPABASE_URL and VITE_SUPABASE_ANON_KEY in frontend/.env.local.',
);

export interface AdminCreateUserInput {
  email: string;
  password: string;
  firstName: string;
  lastName: string;
  securityGroup: SecurityGroup;
  mobile?: string | null;
  emergencyContactName?: string | null;
  emergencyContactEmail?: string | null;
  emergencyContactMobile?: string | null;
}

interface ProfileRowResponse {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  mobile: string | null;
  emergency_contact_name: string | null;
  emergency_contact_email: string | null;
  emergency_contact_mobile: string | null;
  security_group: SecurityGroup;
  is_active: boolean;
  avatar_url: string | null;
  created_at: string;
  updated_at: string;
}

interface CreateUserResponse {
  user: { id: string; email: string };
  profile: ProfileRowResponse;
}

// Pulls the most informative error string out of whatever supabase.functions
// .invoke surfaces. The wrapper throws FunctionsHttpError / FunctionsFetchError
// /  FunctionsRelayError depending on what failed; we want to read the JSON
// body when the function returned 4xx/5xx so the admin sees the real reason.
async function describeInvokeError(error: unknown, data: unknown): Promise<string> {
  // Supabase's FunctionsHttpError attaches `.context.response` (a Response).
  const ctxResponse = (error as { context?: { response?: Response } })?.context?.response;
  if (ctxResponse) {
    try {
      const text = await ctxResponse.clone().text();
      try {
        const parsed = JSON.parse(text);
        if (parsed?.error) return String(parsed.error);
      } catch {
        // Not JSON — return the raw text if it looks useful.
        if (text && text.length < 400) return text;
      }
      return `Edge function returned HTTP ${ctxResponse.status}.`;
    } catch {
      /* fall through */
    }
  }
  // The function may also have been reached but returned an error body —
  // some supabase-js versions stash that on `data` even when `error` is set.
  const bodyError = (data as { error?: string } | null | undefined)?.error;
  if (bodyError) return bodyError;

  if (error instanceof Error) return error.message;
  return 'Unknown edge-function error.';
}

// True when the error means "the function is not deployed / unreachable".
// We use this to gate the localhost fallback so we don't fall back on real
// errors like "user already registered" — those should still surface.
function looksLikeMissingFunction(error: unknown): boolean {
  const status = (error as { context?: { response?: { status?: number } } })?.context?.response?.status;
  if (status === 404) return true;
  const name = (error as { name?: string })?.name ?? '';
  if (name === 'FunctionsFetchError' || name === 'FunctionsRelayError') return true;
  const msg = String((error as { message?: string })?.message ?? '').toLowerCase();
  return /not found|failed to fetch|networkerror|fetch failed/.test(msg);
}

// Creates an auth user + profile WITHOUT swapping the caller's session.
// Throws on any non-2xx response so call sites can `try/catch` like every
// other lib/api/* function.
export async function adminCreateUser(input: AdminCreateUserInput): Promise<Profile> {
  if (!supabaseConfigured()) throw NOT_CONFIGURED;

  // ── Primary path — edge function ─────────────────────────────────────
  // `supabase.functions.invoke` automatically attaches the current session's
  // bearer token in the Authorization header — the edge function uses that
  // to identify and authorise the caller.
  const { data, error } = await supabase.functions.invoke<CreateUserResponse>(
    'admin-create-user',
    { body: input },
  );

  if (!error && data?.profile) {
    return rowToProfile(data.profile);
  }

  // Edge function reachable but returned an error → surface its real body.
  if (error && !looksLikeMissingFunction(error)) {
    const detail = await describeInvokeError(error, data);
    throw new Error(detail);
  }

  // ── Fallback path — dev-only throwaway client ────────────────────────
  // Function isn't deployed (or localhost can't reach it). Do the work
  // with a separate Supabase client so the admin's primary session stays
  // intact. Production builds skip this path so prod deployments without
  // the edge function fail loudly.
  if (!import.meta.env.DEV) {
    const detail = await describeInvokeError(error, data);
    throw new Error(
      `Edge function 'admin-create-user' is unreachable (${detail}). ` +
      `Run 'supabase functions deploy admin-create-user' and confirm ` +
      `SUPABASE_SERVICE_ROLE_KEY is set in the dashboard's Edge Function secrets.`,
    );
  }

  // eslint-disable-next-line no-console
  console.warn(
    '[admin] admin-create-user edge function unreachable — using dev-only ' +
    'throwaway-client fallback. Deploy the function before shipping.',
  );

  return adminCreateUserFallback(input);
}

// ─── Dev-only throwaway-client fallback ──────────────────────────────────
//
// A second Supabase client with persistSession: false. Calling signUp on it
// returns the new user's session, but that session is held only in memory
// of this throwaway client and never written to localStorage — so the
// primary client (admin's session) is unaffected.
//
// This path can't promote admin tiers via signUp metadata (the
// handle_new_user trigger downgrades them). After signUp, we use the
// regular admin client to UPDATE the profile row with the requested role
// + contact fields. RLS on the profiles table allows admins to update any
// profile, so this works without the service role key.

async function adminCreateUserFallback(input: AdminCreateUserInput): Promise<Profile> {
  const url = import.meta.env.VITE_SUPABASE_URL as string;
  const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string;
  if (!url || !anonKey) throw NOT_CONFIGURED;

  // Throwaway client — separate `storageKey` keeps it from colliding with
  // the primary client's localStorage entry; `persistSession: false` keeps
  // the new user's session out of storage entirely. Uses an in-memory
  // storage shim because Supabase v2 requires `storage` even when
  // persistSession is false.
  const memoryStorage = new Map<string, string>();
  const throwaway = createClient(url, anonKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      storageKey: 'sb-admin-create-throwaway',
      storage: {
        getItem: (k) => memoryStorage.get(k) ?? null,
        setItem: (k, v) => { memoryStorage.set(k, v); },
        removeItem: (k) => { memoryStorage.delete(k); },
      },
    },
  });

  const { data: signupData, error: signupErr } = await throwaway.auth.signUp({
    email: input.email,
    password: input.password,
    options: {
      data: {
        first_name: input.firstName,
        last_name: input.lastName,
        // Pass the requested role as metadata. The trigger writes 'worker'
        // for admin-tier requests; the UPDATE below corrects it.
        security_group: input.securityGroup,
        requested_role: input.securityGroup,
      },
    },
  });
  if (signupErr) throw signupErr;

  const newUserId = signupData.user?.id;
  if (!newUserId) {
    throw new Error('Sign-up succeeded but no user id returned.');
  }

  // Sign the throwaway client out so its in-memory token is wiped.
  await throwaway.auth.signOut().catch(() => {});

  // Promote / patch the profile row using the PRIMARY client (admin's
  // session). RLS on profiles allows admins to update any row; the
  // primary client's session is unchanged because the throwaway never
  // touched localStorage.
  const patch: Record<string, unknown> = {
    first_name: input.firstName,
    last_name: input.lastName,
    security_group: input.securityGroup,
  };
  if (input.mobile !== undefined) patch.mobile = input.mobile;
  if (input.emergencyContactName !== undefined)
    patch.emergency_contact_name = input.emergencyContactName;
  if (input.emergencyContactEmail !== undefined)
    patch.emergency_contact_email = input.emergencyContactEmail;
  if (input.emergencyContactMobile !== undefined)
    patch.emergency_contact_mobile = input.emergencyContactMobile;

  const { data: profileRow, error: updateErr } = await supabase
    .from('profiles')
    .update(patch)
    .eq('id', newUserId)
    .select('*')
    .maybeSingle();

  if (updateErr) {
    throw new Error(
      `User created but profile patch failed: ${updateErr.message}. ` +
      `The admin can fix the row inline from the Users table.`,
    );
  }
  if (!profileRow) {
    throw new Error('Profile row not found after creation — RLS may be blocking the read.');
  }
  return rowToProfile(profileRow as ProfileRowResponse);
}
