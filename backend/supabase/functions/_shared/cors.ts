// Shared CORS helper for browser-invoked Edge Functions.
//
// Browsers send a CORS preflight OPTIONS request before any cross-origin POST
// that carries JSON or a custom Authorization header. The Supabase Edge
// runtime does NOT add CORS headers for us — every function authored here
// has to respond to OPTIONS with the right Access-Control-* headers, OR the
// browser blocks the actual POST and we see "Status code: 405" / "CORS
// header missing" in the console.
//
// All browser-callable functions in this project should:
//   1. import { CORS_HEADERS, handleCorsPreflight } from '../_shared/cors.ts'
//   2. early-return handleCorsPreflight(req) before any other logic
//   3. include `...CORS_HEADERS` in every Response's headers
//
// Server-to-server functions (Postgres webhooks, cron-style) don't strictly
// need this, but adding it doesn't hurt.

export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

/** Returns a 204 preflight response when the request is OPTIONS, else null
 *  so the caller can continue to its real handler. */
export function handleCorsPreflight(req: Request): Response | null {
  if (req.method === 'OPTIONS') {
    return new Response(null, { status: 204, headers: CORS_HEADERS });
  }
  return null;
}
