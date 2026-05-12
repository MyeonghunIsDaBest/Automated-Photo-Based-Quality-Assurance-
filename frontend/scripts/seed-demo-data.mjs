#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// seed-demo-data.mjs
//
// Idempotent demo data seeder. Creates one realistic project ("Casone
// Electrical — Demo Site"), two zones, three tasks at varied progress, one
// photo with an already-confirmed AI analysis, one historical (resolved)
// safety incident, and — if at least two real auth users exist — a group
// conversation with four messages between them.
//
// USAGE
//   1. Run all SQL migrations in supabase/migrations/ against your project
//      (Supabase SQL editor or `supabase db push`).
//   2. Sign up at least one user in the app so a profile row exists.
//   3. Set env vars:
//        SUPABASE_URL=https://<ref>.supabase.co
//        SUPABASE_SERVICE_ROLE_KEY=eyJ...   (Project Settings → API → service_role)
//      The service role key bypasses RLS so the seeder can act as the
//      owner of synthesised rows. NEVER ship this key to the client.
//   4. From the repo root:  `npm --prefix frontend run seed:demo`
//
// IDEMPOTENCY
//   The seeder short-circuits if a project named "Casone Electrical — Demo
//   Site" already exists. Re-running prints "Demo data already seeded" and
//   exits 0. To re-seed from scratch, delete the project row in Supabase
//   Studio (cascade-delete handles tasks/photos/etc) and run again.
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

const PROJECT_NAME = 'Casone Electrical — Demo Site';
const PROJECT_CLIENT = 'Casone Electrical (internal demo)';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !key) {
  console.error(
    'seed-demo-data: SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY must be set in the environment.\n' +
      'Hint: copy them from Project Settings → API and prefix the npm command, e.g.\n' +
      '  SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm --prefix frontend run seed:demo',
  );
  process.exit(1);
}

const supabase = createClient(url, key, { auth: { persistSession: false } });

// ─── Helpers ───────────────────────────────────────────────────────────────

const today = new Date();
function isoDate(daysOffset) {
  const d = new Date(today);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString().slice(0, 10);
}
function isoTimestamp(daysOffset) {
  const d = new Date(today);
  d.setDate(d.getDate() + daysOffset);
  return d.toISOString();
}

async function listAuthUsers() {
  const { data, error } = await supabase.auth.admin.listUsers();
  if (error) throw error;
  return data.users.filter((u) => Boolean(u.email_confirmed_at) || !u.confirmation_sent_at);
}

// ─── Idempotency check ─────────────────────────────────────────────────────

const { data: existing, error: existingErr } = await supabase
  .from('projects')
  .select('id, name')
  .eq('name', PROJECT_NAME)
  .maybeSingle();
if (existingErr) {
  console.error('seed-demo-data: failed to check for existing project:', existingErr.message);
  process.exit(1);
}
if (existing) {
  console.log(`Demo data already seeded — project "${existing.name}" exists at id=${existing.id}.`);
  process.exit(0);
}

// ─── Pick a project owner ──────────────────────────────────────────────────

const users = await listAuthUsers();
if (users.length === 0) {
  console.error(
    'seed-demo-data: no confirmed auth users found. Sign up at least one user via the app first, then re-run.',
  );
  process.exit(1);
}
const owner = users[0];
const allUserIds = users.map((u) => u.id);
console.log(`Using ${owner.email} (id=${owner.id}) as the project owner.`);

// ─── Project ───────────────────────────────────────────────────────────────

const { data: project, error: projectErr } = await supabase
  .from('projects')
  .insert({
    name:        PROJECT_NAME,
    client_name: PROJECT_CLIENT,
    description: 'Demo site seeded by scripts/seed-demo-data.mjs — safe to delete.',
    start_date:  isoDate(-30),
    end_date:    isoDate(60),
    status:      'active',
    budget:      150000,
    created_by:  owner.id,
  })
  .select('*')
  .single();
if (projectErr) {
  console.error('seed-demo-data: failed to create project:', projectErr.message);
  process.exit(1);
}
console.log(`Created project ${project.id}.`);

// ─── Project config ────────────────────────────────────────────────────────
// Migration 09's `trg_create_project_config` trigger has already inserted a
// default row for this project. Customise a handful of fields so the demo
// shows non-default values in the admin tab + on the dashboard accent bar.

const { error: configErr } = await supabase
  .from('project_config')
  .update({
    progression_mode:       'human_assisted',
    weight_checklist:       50,
    weight_photos:          20,
    weight_ai:              30,
    target_photos_per_task: 3,
    accent_color:           '#0F766E',
    report_cadence:         'weekly',
    updated_by:             owner.id,
  })
  .eq('project_id', project.id);
if (configErr) {
  // Non-fatal: defaults still ship via the trigger. Warn and continue.
  console.warn(`seed-demo-data: failed to customise project_config: ${configErr.message}`);
} else {
  console.log(`Customised project_config for ${project.id}.`);
}

// ─── Zones ─────────────────────────────────────────────────────────────────

const { data: zones, error: zonesErr } = await supabase
  .from('zones')
  .insert([
    { project_id: project.id, name: 'Site A — North',  color_code: '#0F766E' },
    { project_id: project.id, name: 'Site B — South',  color_code: '#1E40AF' },
  ])
  .select('*');
if (zonesErr) {
  console.error('seed-demo-data: failed to create zones:', zonesErr.message);
  process.exit(1);
}
console.log(`Created ${zones.length} zones.`);

// ─── Tasks (3 across 2 zones, varied progress) ─────────────────────────────

const taskRows = [
  {
    project_id:       project.id,
    zone_id:          zones[0].id,
    name:             'Frame inspection — Level 1',
    phase:            'framing',
    start_date:       isoDate(-14),
    end_date:         isoDate(7),
    percent_complete: 65,
    status:           'in_progress',
    update_source:    'manual',
    created_by:       owner.id,
  },
  {
    project_id:       project.id,
    zone_id:          zones[0].id,
    name:             'Switchboard rough-in',
    phase:            'electrical',
    start_date:       isoDate(-7),
    end_date:         isoDate(21),
    percent_complete: 30,
    status:           'in_progress',
    update_source:    'manual',
    created_by:       owner.id,
  },
  {
    project_id:       project.id,
    zone_id:          zones[1].id,
    name:             'Conduit run — basement',
    phase:            'electrical',
    start_date:       isoDate(0),
    end_date:         isoDate(14),
    percent_complete: 0,
    status:           'not_started',
    update_source:    'manual',
    created_by:       owner.id,
  },
];

const { data: tasks, error: tasksErr } = await supabase
  .from('tasks')
  .insert(taskRows)
  .select('*');
if (tasksErr) {
  console.error('seed-demo-data: failed to create tasks:', tasksErr.message);
  process.exit(1);
}
console.log(`Created ${tasks.length} tasks.`);

// ─── Photo + already-confirmed AI analysis ────────────────────────────────

const photoStoragePath = `${project.id}/seed-frame-l1.jpg`;
const { data: photo, error: photoErr } = await supabase
  .from('photos')
  .insert({
    project_id:    project.id,
    task_id:       tasks[0].id,
    zone_id:       zones[0].id,
    uploaded_by:   owner.id,
    filename:      'seed-frame-l1.jpg',
    storage_path:  photoStoragePath,
    file_size_kb:  1248,
    width:         1600,
    height:        1200,
    taken_at:      isoTimestamp(-3),
    ai_analyzed:   true,
    notes:         'Seeded by scripts/seed-demo-data.mjs.',
  })
  .select('*')
  .single();
if (photoErr) {
  console.error('seed-demo-data: failed to create photo:', photoErr.message);
  process.exit(1);
}
console.log(`Created photo ${photo.id} (storage path is a placeholder — no actual file uploaded).`);

const { data: analysis, error: analysisErr } = await supabase
  .from('ai_analyses')
  .insert({
    photo_id:       photo.id,
    model_used:     'demo-stub@v1',
    phase_detected: 'framing',
    completion_pct: 68,
    confidence:     0.82,
    safety_flags:   [],
    quality_flags:  [],
    materials:      ['stud', 'plywood'],
    suggested_task: tasks[0].name,
    action_taken:   'confirmed',
  })
  .select('*')
  .single();
if (analysisErr) {
  console.error('seed-demo-data: failed to create AI analysis:', analysisErr.message);
  process.exit(1);
}
console.log(`Created AI analysis ${analysis.id} (already confirmed).`);

// ─── Historical resolved safety incident ───────────────────────────────────

const { data: incident, error: incidentErr } = await supabase
  .from('safety_incidents')
  .insert({
    project_id:  project.id,
    flags:       ['housekeeping'],
    severity:    'low',
    status:      'resolved',
    reported_by: owner.id,
    resolved_by: owner.id,
    resolved_at: isoTimestamp(-2),
    notes:       'Demo: a stack of offcuts was cleared from the corridor. Resolved by site lead.',
    created_at:  isoTimestamp(-5),
  })
  .select('*')
  .single();
if (incidentErr) {
  console.error('seed-demo-data: failed to create safety incident:', incidentErr.message);
  process.exit(1);
}
console.log(`Created resolved safety incident ${incident.id}.`);

// ─── Group conversation with 4 messages (only if 2+ users exist) ───────────

if (allUserIds.length >= 2) {
  const groupName = 'Site Walk Through';
  const { data: conv, error: convErr } = await supabase
    .from('conversations')
    .insert({ name: groupName, is_group: true, created_by: owner.id })
    .select('*')
    .single();
  if (convErr) {
    console.error('seed-demo-data: failed to create conversation:', convErr.message);
    process.exit(1);
  }

  const memberRows = allUserIds.slice(0, 4).map((id) => ({
    conversation_id: conv.id,
    user_id: id,
  }));
  const { error: memberErr } = await supabase
    .from('conversation_members')
    .insert(memberRows);
  if (memberErr) {
    console.error('seed-demo-data: failed to add conversation members:', memberErr.message);
    process.exit(1);
  }

  const messageBodies = [
    'Walking the site Tuesday morning — meet at the gatehouse 7:30am.',
    'Bringing the fresh blueprints. Anyone need a hard copy?',
    'Yes please — and let\'s photograph the basement run while we\'re down there.',
    'Confirmed. See you all there.',
  ];
  // Use the first up-to-four members (cycling through if fewer) so each
  // message has a distinct sender.
  const senderIds = memberRows.map((m) => m.user_id);
  const messageRows = messageBodies.map((body, i) => ({
    conversation_id: conv.id,
    sender_id:       senderIds[i % senderIds.length],
    body,
    // Spread the messages across an hour so the chronological order is
    // obvious in the UI. Earliest message → 60 minutes ago.
    created_at: new Date(Date.now() - (messageBodies.length - i) * 15 * 60 * 1000).toISOString(),
  }));
  const { error: messagesErr } = await supabase
    .from('messages')
    .insert(messageRows);
  if (messagesErr) {
    console.error('seed-demo-data: failed to insert messages:', messagesErr.message);
    process.exit(1);
  }

  console.log(`Created group conversation "${groupName}" with ${memberRows.length} members and ${messageRows.length} messages.`);
} else {
  console.log('Skipped messaging seed — need at least 2 confirmed auth users (sign up another in the app, then re-run if you want a seeded conversation).');
}

console.log('\nDemo data seeded.');
console.log(`  Project:           ${PROJECT_NAME}  (id=${project.id})`);
console.log(`  Zones:             ${zones.map((z) => z.name).join(' · ')}`);
console.log(`  Tasks:             ${tasks.map((t) => `${t.name} (${t.percent_complete}%)`).join(' · ')}`);
console.log(`  Photo + analysis:  1 (confirmed, no safety flag)`);
console.log(`  Safety incident:   1 (historical, resolved)`);
console.log(`  Owner:             ${owner.email}`);
