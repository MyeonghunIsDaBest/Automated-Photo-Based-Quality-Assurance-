// k6 load test — Stage 7 / P10.2. Simulates ~50 concurrent users hammering the
// read-heavy paths of the app (the photo-QA + dashboard surfaces) to find the
// breaking point and confirm p95 latency holds.
//
// READ-ONLY BY DESIGN: it only issues GETs against the Supabase REST API. It
// does NOT upload photos, trigger analyze-photo, or call any Claude-backed Edge
// Function — load-testing those would burn real API credit and write junk into
// the pilot. See "Extending to writes/AI" at the bottom before adding any.
//
// ── Run ────────────────────────────────────────────────────────────────────
//   1. Install k6:  https://k6.io/docs/get-started/installation/
//   2. Grab a real user access token (so RLS lets the reads through):
//        - sign in to the app, open devtools → Application → Local Storage →
//          the supabase auth entry → copy `access_token`; OR use the CLI/curl
//          password-grant against /auth/v1/token?grant_type=password.
//   3. Run:
//        k6 run \
//          -e BASE_URL=https://<ref>.supabase.co \
//          -e ANON_KEY=<anon-key> \
//          -e ACCESS_TOKEN=<user-jwt> \
//          -e PROJECT_ID=<pilot-project-uuid> \
//          scripts/k6-load-test.js
//
// ── Read the result ──────────────────────────────────────────────────────────
//   - `http_req_failed` should stay < 1% and the `latency` threshold green.
//   - Ramp `TARGET_VUS` up (75, 100, 150…) until a threshold goes red — that's
//     your breaking point. Record it + the limiting resource (Postgres CPU,
//     connection pool, PostgREST) from the Supabase dashboard during the run.

import http from 'k6/http';
import { check, sleep, group } from 'k6';

const BASE_URL     = __ENV.BASE_URL;
const ANON_KEY     = __ENV.ANON_KEY;
const ACCESS_TOKEN = __ENV.ACCESS_TOKEN;
const PROJECT_ID   = __ENV.PROJECT_ID;
const TARGET_VUS   = Number(__ENV.TARGET_VUS || 50);

if (!BASE_URL || !ANON_KEY || !ACCESS_TOKEN || !PROJECT_ID) {
  throw new Error('Set BASE_URL, ANON_KEY, ACCESS_TOKEN and PROJECT_ID env vars (see header).');
}

const headers = {
  apikey: ANON_KEY,
  Authorization: `Bearer ${ACCESS_TOKEN}`,
  'Content-Type': 'application/json',
};

export const options = {
  scenarios: {
    // Ramp to TARGET_VUS, hold, then ramp down — the classic load profile.
    site_reads: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: TARGET_VUS },   // ramp up
        { duration: '2m',  target: TARGET_VUS },    // hold at peak
        { duration: '30s', target: 0 },             // ramp down
      ],
      gracefulRampDown: '10s',
    },
  },
  thresholds: {
    http_req_failed:   ['rate<0.01'],          // < 1% errors
    http_req_duration: ['p(95)<800', 'p(99)<2000'],
    'group_duration{group:::dashboard tick}': ['p(95)<2500'],
  },
};

const rest = (path) =>
  http.get(`${BASE_URL}/rest/v1/${path}`, { headers, tags: { name: path.split('?')[0] } });

export default function () {
  // One "dashboard tick" ≈ what a user's screen loads: their projects, then a
  // project's tasks + a page of photos + recent analyses + open hazards. The
  // photo page is capped at 100 rows to mirror the roadmap's "100 photos".
  group('dashboard tick', () => {
    const projects = rest('projects?select=id,name&limit=50');
    check(projects, { 'projects 200': (r) => r.status === 200 });

    const tasks = rest(`tasks?select=id,name,percent_complete,status&project_id=eq.${PROJECT_ID}&limit=100`);
    check(tasks, { 'tasks 200': (r) => r.status === 200 });

    const photos = rest(`photos?select=id,storage_path,uploaded_at&project_id=eq.${PROJECT_ID}&order=uploaded_at.desc&limit=100`);
    check(photos, { 'photos 200': (r) => r.status === 200 });

    // ai_analyses joined to photos for the project (review-queue style read).
    const analyses = rest(`ai_analyses?select=id,analysis_status,confidence,photos!inner(project_id)&photos.project_id=eq.${PROJECT_ID}&limit=100`);
    check(analyses, { 'analyses 200': (r) => r.status === 200 });

    // Open safety hazards count (head request — cheapest, mirrors the dashboard tile).
    const hazards = http.get(
      `${BASE_URL}/rest/v1/safety_incidents?select=id&project_id=eq.${PROJECT_ID}&status=eq.open`,
      { headers: { ...headers, Prefer: 'count=exact' }, tags: { name: 'safety_incidents:count' } },
    );
    check(hazards, { 'hazards 200/206': (r) => r.status === 200 || r.status === 206 });
  });

  // Human think-time between screen loads so we model users, not a fetch loop.
  sleep(Math.random() * 3 + 1);
}

// ── Extending to writes/AI (do carefully) ────────────────────────────────────
// To load-test the write path, add a separate scenario at LOW VU count that
// POSTs to /rest/v1/<table> with a body, and CLEAN UP the rows afterward
// (teardown). To test analyze-photo, point at a NON-pilot scratch project with
// ANTHROPIC_DISABLED=true (the function then returns 503 fast without burning
// credit) — never load-test live Claude calls against the pilot's budget.
