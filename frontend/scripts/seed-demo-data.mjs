#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// seed-demo-data.mjs  —  Demo v2 (2026-05-22)
//
// Idempotent seeder for THREE side-by-side demo projects so the pitch can
// show "different customers, different settings, same product":
//   • Casone — North Site        emerald accent · weekly reports · mid-build
//   • Casone — South Site        rose accent    · monthly reports · early
//   • Casone — Workshop Fitout   indigo accent  · no reports     · late-build
//
// Each project gets:
//   • Customised project_config (accent_color, report_cadence, weights).
//   • 2 zones (per-site site_a / site_b).
//   • 7 tasks — one per construction phase, with progression staggered to
//     match the project's overall site state (mid / early / late).
//   • 10 photos — 5 already-confirmed AI analyses + 5 unanalysed photos
//     waiting to be picked up by the Mock-AI runner. The unanalysed ones
//     drive a live demo: drop a Mock-AI run and bars start moving.
//   • 1 historical (resolved) safety incident at low severity so the safety
//     page has a row to render.
//
// One cross-project group conversation is seeded if ≥ 2 confirmed auth
// users exist — same as Demo v1.
//
// IDEMPOTENCY
//   Short-circuits if all three project names already exist in `projects`.
//   Partial state (e.g. North + South present but Workshop missing) is a
//   loud error rather than a silent partial seed — fix by deleting the
//   leftover row(s) in Supabase Studio (cascade-delete handles children)
//   and re-running.
//
// BACKWARD COMPAT
//   The Demo v1 project ("Casone Electrical — Demo Site") is NOT touched.
//   Leave it alone or delete it in Studio; this seeder operates on the
//   three new names only.
//
// USAGE
//   1. Run all migrations in supabase/migrations/ (including 14).
//   2. Sign up at least one user in the app so a profile exists.
//   3. SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... npm --prefix frontend run seed:demo
// ─────────────────────────────────────────────────────────────────────────────

import { createClient } from '@supabase/supabase-js';

// ─── Project configs ───────────────────────────────────────────────────────
// Three sites with distinct visual identity + report cadence + build phase.
// `progressionScale` shifts the baseline progression vector below so each
// project reads as a different point in the construction timeline.

const PROJECTS = [
  {
    key:               'north',
    name:              'Casone — North Site',
    client:            'Casone Electrical',
    description:       'New build, mid-construction. Frame + electrical phases active.',
    accent:            '#10B981',  // emerald
    cadence:           'weekly',
    weightChecklist:   40,
    weightPhotos:      30,
    weightAi:          30,
    startOffsetDays:   -45,
    endOffsetDays:     90,
    budget:            220_000,
    // Mid-build: excavation done, foundation done, framing+electrical mid,
    // plumbing started, drywall + finishing not yet.
    progressionByPhase: {
      excavation: 100, foundation: 95, framing: 75, roofing: 45,
      electrical: 40, plumbing: 25, drywall: 5, finishing: 0,
    },
    safetyFlag:        'housekeeping',
    safetySeverity:    'low',
  },
  {
    key:               'south',
    name:              'Casone — South Site',
    client:            'Casone Electrical',
    description:       'Site clearance + early foundation. Heavy plant on-site.',
    accent:            '#BE123C',  // rose
    cadence:           'monthly',
    weightChecklist:   30,
    weightPhotos:      25,
    weightAi:          45,
    startOffsetDays:   -15,
    endOffsetDays:     150,
    budget:            340_000,
    progressionByPhase: {
      excavation: 80, foundation: 40, framing: 10, roofing: 0,
      electrical: 0,  plumbing: 0,   drywall: 0,  finishing: 0,
    },
    safetyFlag:        'unsecured_load',
    safetySeverity:    'high',
  },
  {
    key:               'workshop',
    name:              'Casone — Workshop Fitout',
    client:            'Casone Electrical (own premises)',
    description:       'Internal fitout, finishing phase. Final paint + commissioning underway.',
    accent:            '#4338CA',  // indigo
    cadence:           'none',
    weightChecklist:   50,
    weightPhotos:      20,
    weightAi:          30,
    startOffsetDays:   -120,
    endOffsetDays:     14,
    budget:            85_000,
    progressionByPhase: {
      excavation: 100, foundation: 100, framing: 100, roofing: 100,
      electrical: 90,  plumbing: 85,    drywall: 80,  finishing: 55,
    },
    safetyFlag:        'signage_missing',
    safetySeverity:    'low',
  },
];

// Construction-phase → realistic Australian task name. Reused across all
// three projects; the progression % above varies per project to fit the
// site's stage.
const TASK_TEMPLATES = [
  { phase: 'excavation', name: 'Footings excavation + benching' },
  { phase: 'foundation', name: 'Slab pour + cure' },
  { phase: 'framing',    name: 'Rondo wall framing — Level 1' },
  { phase: 'electrical', name: 'Switchboard rough-in' },
  { phase: 'plumbing',   name: 'Cold-water rough-in — kitchen' },
  { phase: 'drywall',    name: 'Gyprock hang + tape-and-set — Level 1' },
  { phase: 'finishing',  name: 'Paint + trim final coat' },
];

// ─── Env + supabase client ─────────────────────────────────────────────────

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

function phaseStatus(pct) {
  if (pct === 0)   return 'not_started';
  if (pct === 100) return 'complete';
  return 'in_progress';
}

// ─── Idempotency check across all three project names ──────────────────────

const projectNames = PROJECTS.map((p) => p.name);
const { data: existing, error: existingErr } = await supabase
  .from('projects')
  .select('id, name')
  .in('name', projectNames);
if (existingErr) {
  console.error('seed-demo-data: failed to query existing projects:', existingErr.message);
  process.exit(1);
}

if (existing && existing.length === projectNames.length) {
  console.log(`Demo v2 already seeded — all ${projectNames.length} projects exist.`);
  process.exit(0);
}
if (existing && existing.length > 0) {
  console.error(
    `seed-demo-data: partial Demo v2 state detected. Found ${existing.length} of ${projectNames.length} projects:\n` +
      existing.map((p) => `  • ${p.name} (id=${p.id})`).join('\n') +
      '\nDelete the existing row(s) in Supabase Studio (cascade-delete handles children) and re-run.',
  );
  process.exit(1);
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
console.log(`Using ${owner.email} (id=${owner.id}) as the project owner.\n`);

// ─── Seed each project ─────────────────────────────────────────────────────

const createdProjectIds = [];

for (const cfg of PROJECTS) {
  console.log(`── ${cfg.name} (${cfg.cadence} cadence · ${cfg.accent}) ──`);

  // 1. Project
  const { data: project, error: projectErr } = await supabase
    .from('projects')
    .insert({
      name:        cfg.name,
      client_name: cfg.client,
      description: cfg.description,
      start_date:  isoDate(cfg.startOffsetDays),
      end_date:    isoDate(cfg.endOffsetDays),
      status:      'active',
      budget:      cfg.budget,
      created_by:  owner.id,
    })
    .select('*')
    .single();
  if (projectErr) {
    console.error(`  ✗ project insert failed: ${projectErr.message}`);
    process.exit(1);
  }
  console.log(`  ✓ project ${project.id}`);
  createdProjectIds.push(project.id);

  // 2. Project config (trigger created defaults; customise per cfg)
  const { error: configErr } = await supabase
    .from('project_config')
    .update({
      progression_mode:       'human_assisted',
      weight_checklist:       cfg.weightChecklist,
      weight_photos:          cfg.weightPhotos,
      weight_ai:              cfg.weightAi,
      target_photos_per_task: 3,
      accent_color:           cfg.accent,
      report_cadence:         cfg.cadence,
      updated_by:             owner.id,
    })
    .eq('project_id', project.id);
  if (configErr) {
    console.warn(`  ! project_config customisation failed: ${configErr.message} (defaults still applied)`);
  } else {
    console.log(`  ✓ project_config (accent=${cfg.accent}, cadence=${cfg.cadence})`);
  }

  // 3. Zones — two zones per site, matching the accent for the primary zone
  const { data: zones, error: zonesErr } = await supabase
    .from('zones')
    .insert([
      { project_id: project.id, name: `${cfg.name.split('—')[1].trim()} — Zone A`, color_code: cfg.accent },
      { project_id: project.id, name: `${cfg.name.split('—')[1].trim()} — Zone B`, color_code: '#64748B' },
    ])
    .select('*');
  if (zonesErr) {
    console.error(`  ✗ zones insert failed: ${zonesErr.message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${zones.length} zones`);

  // 4. Tasks — one per phase, progression from cfg.progressionByPhase.
  const taskRows = TASK_TEMPLATES.map((tpl, i) => {
    const pct = cfg.progressionByPhase[tpl.phase] ?? 0;
    return {
      project_id:       project.id,
      zone_id:          zones[i % 2].id,
      name:             tpl.name,
      phase:            tpl.phase,
      start_date:       isoDate(cfg.startOffsetDays + i * 10),
      end_date:         isoDate(cfg.startOffsetDays + (i + 2) * 10),
      percent_complete: pct,
      status:           phaseStatus(pct),
      update_source:    'manual',
      created_by:       owner.id,
    };
  });
  const { data: tasks, error: tasksErr } = await supabase
    .from('tasks')
    .insert(taskRows)
    .select('*');
  if (tasksErr) {
    console.error(`  ✗ tasks insert failed: ${tasksErr.message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${tasks.length} tasks (${tasks.map((t) => `${t.phase}=${t.percent_complete}%`).join(', ')})`);

  // 5. Photos — 10 per project. Layout:
  //    • 5 already analysed (action_taken=confirmed) → demonstrate "history"
  //    • 5 pending (ai_analyzed=false) → demonstrate "Mock-AI can run"
  // Spread across the first few tasks so multiple bars move when the
  // operator hits "Run AI analysis" during the demo.
  const photoRows = [];
  for (let i = 0; i < 10; i++) {
    const task = tasks[i % tasks.length];
    const isAnalysed = i < 5;
    photoRows.push({
      project_id:    project.id,
      task_id:       task.id,
      zone_id:       zones[i % 2].id,
      uploaded_by:   owner.id,
      filename:      `${cfg.key}-photo-${String(i + 1).padStart(2, '0')}.jpg`,
      storage_path:  `${project.id}/seed-${cfg.key}-${i + 1}.jpg`,
      file_size_kb:  900 + (i * 73) % 600,
      width:         1600,
      height:        1200,
      taken_at:      isoTimestamp(-((i + 1) * 2)),
      ai_analyzed:   isAnalysed,
      notes:         null,
    });
  }
  const { data: photos, error: photosErr } = await supabase
    .from('photos')
    .insert(photoRows)
    .select('*');
  if (photosErr) {
    console.error(`  ✗ photos insert failed: ${photosErr.message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${photos.length} photos (5 analysed, 5 pending for Mock-AI)`);

  // 6. AI analyses for the analysed photos (rows 0-4). Stamp with a Phase-C
  // model name + action_taken='confirmed' so the seeded photos read as
  // "already reviewed history" rather than living in the review queue.
  const analysedPhotos = photos.slice(0, 5);
  const analysisRows = analysedPhotos.map((p, i) => {
    const task = tasks.find((t) => t.id === p.task_id);
    return {
      photo_id:        p.id,
      model_used:      'demo-stub@v1',
      phase_detected:  task?.phase ?? null,
      completion_pct:  task?.percent_complete ?? 0,
      confidence:      0.78 + (i * 0.03),  // 0.78..0.90 spread
      safety_flags:    [],
      quality_flags:   [],
      materials:       [],
      suggested_task:  null,
      action_taken:    'confirmed',
      analysis_status: 'confirmed',
      rationale:       'Seeded analysis — operator confirmed during initial review.',
      raw_response:    { seeded: true },
      analyzed_at:     isoTimestamp(-((i + 1) * 2) + 1),
    };
  });
  const { error: analysesErr } = await supabase
    .from('ai_analyses')
    .insert(analysisRows);
  if (analysesErr) {
    console.error(`  ✗ ai_analyses insert failed: ${analysesErr.message}`);
    process.exit(1);
  }
  console.log(`  ✓ ${analysisRows.length} seed ai_analyses (confirmed)`);

  // 7. Safety incident — historical, resolved. Severity per cfg so each
  // site shows a different colour band on the safety page.
  const { error: incidentErr } = await supabase
    .from('safety_incidents')
    .insert({
      project_id:  project.id,
      flags:       [cfg.safetyFlag],
      severity:    cfg.safetySeverity,
      status:      'resolved',
      reported_by: owner.id,
      resolved_by: owner.id,
      resolved_at: isoTimestamp(-3),
      notes:       `Demo: ${cfg.safetyFlag.replace(/_/g, ' ')} flagged during inspection. Resolved on the day.`,
      created_at:  isoTimestamp(-5),
    });
  if (incidentErr) {
    console.error(`  ✗ safety_incident insert failed: ${incidentErr.message}`);
    process.exit(1);
  }
  console.log(`  ✓ 1 safety_incident (${cfg.safetySeverity})`);
  console.log('');
}

// ─── Cross-project group conversation (if ≥ 2 users exist) ─────────────────

if (allUserIds.length >= 2) {
  const groupName = 'Casone — Coord (all sites)';
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
    'Three sites running this week — North in framing, South just broke ground, Workshop is in finishing.',
    'North progress photos uploaded — bars should move once you hit Run AI.',
    'Heads up: South has heavy plant arriving Tuesday — make sure the unsecured-load signage is up before crews arrive.',
    'Confirmed. Workshop is on track for handover end of next week.',
  ];
  const senderIds = memberRows.map((m) => m.user_id);
  const messageRows = messageBodies.map((body, i) => ({
    conversation_id: conv.id,
    sender_id:       senderIds[i % senderIds.length],
    body,
    created_at: new Date(Date.now() - (messageBodies.length - i) * 15 * 60 * 1000).toISOString(),
  }));
  const { error: messagesErr } = await supabase
    .from('messages')
    .insert(messageRows);
  if (messagesErr) {
    console.error('seed-demo-data: failed to insert messages:', messagesErr.message);
    process.exit(1);
  }
  console.log(`── Group conversation "${groupName}" with ${memberRows.length} members and ${messageRows.length} messages ──\n`);
} else {
  console.log('Skipped messaging seed — need at least 2 confirmed auth users.\n');
}

// ─── Done ──────────────────────────────────────────────────────────────────

console.log('Demo v2 seeded.');
console.log(`  Projects:  ${PROJECTS.map((p) => `${p.name} (${p.cadence})`).join(' · ')}`);
console.log(`  IDs:       ${createdProjectIds.join(', ')}`);
console.log(`  Owner:     ${owner.email}`);
console.log('');
console.log('Next: open any project in the app → /gantt?tab=review → "Run AI analysis"');
console.log('      to watch Mock-AI bump the 5 pending photos per project.');
