-- ─────────────────────────────────────────────────────────────────────────────
-- seed.sql — minimal demo data so the Gantt isn't empty on a fresh project.
--
-- WHEN TO RUN:
--   • Local Supabase CLI (`supabase db reset`) runs this automatically.
--   • Hosted projects: paste into SQL Editor and Run, but ONLY on a fresh
--     database. It is NOT idempotent on its own — the IF NOT EXISTS guards
--     below handle the common case where it's run twice in a row.
--
-- Everything seeds under a deterministic UUID so dependent rows (tasks,
-- zones) can reference it without a sub-select.
-- ─────────────────────────────────────────────────────────────────────────────

-- Use a fixed UUID so reruns don't multiply rows.
do $$
declare
  demo_project_id uuid := '00000000-0000-0000-0000-000000000001';
  demo_zone_a     uuid := '00000000-0000-0000-0000-00000000000a';
  demo_zone_b     uuid := '00000000-0000-0000-0000-00000000000b';
begin
  if not exists (select 1 from projects where id = demo_project_id) then
    insert into projects (id, name, client_name, description, start_date, end_date, status, budget)
    values (
      demo_project_id,
      'Riverside Tower (demo)',
      'Acme Developments',
      'Demo project pre-seeded so the dashboard has something to draw.',
      current_date - interval '30 days',
      current_date + interval '120 days',
      'active',
      4_500_000
    );

    insert into zones (id, project_id, name, description, color_code) values
      (demo_zone_a, demo_project_id, 'Foundation Pad', 'Below-grade concrete works', '#3B82F6'),
      (demo_zone_b, demo_project_id, 'Tower Core',     'Levels 1–14 vertical core',  '#10B981')
    on conflict (id) do nothing;

    insert into tasks (project_id, zone_id, name, phase, start_date, end_date, percent_complete, status) values
      (demo_project_id, demo_zone_a, 'Excavation & Shoring',  'excavation',  current_date - interval '30 days', current_date - interval '12 days', 100, 'complete'),
      (demo_project_id, demo_zone_a, 'Footing Pour',          'foundation',  current_date - interval '14 days', current_date + interval '4 days',   65, 'in_progress'),
      (demo_project_id, demo_zone_b, 'Core Wall L1–L4',       'framing',     current_date,                       current_date + interval '28 days', 10, 'in_progress'),
      (demo_project_id, demo_zone_b, 'Electrical Rough-in',   'electrical',  current_date + interval '14 days',  current_date + interval '60 days',  0, 'not_started'),
      (demo_project_id, demo_zone_b, 'MEP Coordination',      'plumbing',    current_date + interval '40 days',  current_date + interval '90 days',  0, 'not_started');
  end if;
end $$;
