-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║ Phase C — Photo-QA Seam (DB lifecycle, contract, dedup, safety, GPS)     ║
-- ║                                                                          ║
-- ║ Lands the schema half of the Photo-QA seam so Phase D's vision-model     ║
-- ║ swap is a one-file change. See ~/.claude/plans/review-the-entire-code-   ║
-- ║ zesty-swing/phase-C-photo-qa-seam.md for the canonical design.           ║
-- ║                                                                          ║
-- ║ Idempotent: this migration runs after `00_init.sql` + `01_security_      ║
-- ║ group_expand.sql`. Safe to re-run on the same database (every CREATE     ║
-- ║ uses IF NOT EXISTS or guarded DO blocks).                                ║
-- ╚══════════════════════════════════════════════════════════════════════════╝

-- ╭─ §1. ai_analyses lifecycle ───────────────────────────────────────────────╮
-- │ Add analysis_status (queued → analysing → analysed → confirmed/rejected) │
-- │ + rationale + raw_response. Drop the old UNIQUE on (photo_id,            │
-- │ model_used, analyzed_at) and replace with UNIQUE(photo_id) so the        │
-- │ analyser UPDATEs a single row per photo instead of INSERTing duplicates. │
-- ╰───────────────────────────────────────────────────────────────────────────╯

alter table ai_analyses
  add column if not exists analysis_status text
    not null default 'queued'
    check (analysis_status in ('queued','analysing','analysed','failed','confirmed','rejected')),
  add column if not exists rationale text,
  add column if not exists raw_response jsonb;

-- Backfill: rows the trigger pre-inserted carry model_used='pending' and stay
-- queued; analyser-inserted rows are already finished work, mark analysed.
update ai_analyses
   set analysis_status = case
         when model_used = 'pending' then 'queued'
         else 'analysed'
       end
 where analysis_status = 'queued';

-- The current analyze-photo function INSERTs on every invocation, so production
-- data may already have multiple rows per photo. Collapse to one row per photo
-- (keep the most recent non-pending) before adding the UNIQUE constraint.
with ranked as (
  select id,
         photo_id,
         model_used,
         analyzed_at,
         row_number() over (
           partition by photo_id
           order by case when model_used = 'pending' then 1 else 0 end,
                    analyzed_at desc
         ) as rn
    from ai_analyses
)
delete from ai_analyses a
 using ranked r
 where a.id = r.id
   and r.rn > 1;

-- Drop old UNIQUE if present (auto-generated name from inline `unique (...)`).
do $$
begin
  alter table ai_analyses drop constraint ai_analyses_photo_id_model_used_analyzed_at_key;
exception when undefined_object then
  null;
end;
$$;

create unique index if not exists ai_analyses_photo_id_unique on ai_analyses (photo_id);


-- ╭─ §2. photos.perceptual_hash + similarity helper ──────────────────────────╮
-- │ blockhash-core produces a 64-bit hex string client-side. phash_distance  │
-- │ is the Hamming distance between two hashes, 0..64 (lower = more similar).│
-- ╰───────────────────────────────────────────────────────────────────────────╯

alter table photos
  add column if not exists perceptual_hash text;

create index if not exists photos_phash_idx on photos (project_id, perceptual_hash);

create or replace function phash_distance(a text, b text) returns int
language sql
immutable
as $$
  -- Each input is 16 hex chars = 64 bits. Cast to bit(64), XOR, count set
  -- bits. Returns 64 if either input is null/short — treats unknown as
  -- "definitely not a duplicate".
  select case
    when a is null or b is null then 64
    when length(a) <> 16 or length(b) <> 16 then 64
    else (
      select count(*)::int
        from generate_series(1, 64) g
       where get_bit(('x' || a)::bit(64) # ('x' || b)::bit(64), g - 1) = 1
    )
  end;
$$;


-- ╭─ §3. safety_incidents — DB-backed safety list ────────────────────────────╮
-- │ Replaces the local Zustand `useSafetyStore`. Source of truth for both    │
-- │ the manual incident form and the AI safety-flag pipeline.                │
-- ╰───────────────────────────────────────────────────────────────────────────╯

create table if not exists safety_incidents (
  id              uuid primary key default gen_random_uuid(),
  project_id      uuid not null references projects(id)     on delete cascade,
  photo_id        uuid          references photos(id)        on delete cascade,
  ai_analysis_id  uuid          references ai_analyses(id)   on delete set null,
  flags           text[] not null default '{}',
  severity        text not null check (severity in ('low','medium','high','critical')),
  status          text not null default 'open'
                     check (status in ('open','acknowledged','resolved','dismissed')),
  reported_by     uuid references auth.users(id) on delete set null,
  resolved_by     uuid references auth.users(id) on delete set null,
  resolved_at     timestamptz,
  notes           text,
  created_at      timestamptz not null default now()
);
create index if not exists idx_safety_incidents_project on safety_incidents (project_id, created_at desc);
create index if not exists idx_safety_incidents_status  on safety_incidents (status);
create index if not exists idx_safety_incidents_photo   on safety_incidents (photo_id);

alter table safety_incidents enable row level security;

drop policy if exists "safety_incidents: read"           on safety_incidents;
drop policy if exists "safety_incidents: log own"        on safety_incidents;
drop policy if exists "safety_incidents: resolve mgr+"   on safety_incidents;

create policy "safety_incidents: read" on safety_incidents
  for select using (auth.role() = 'authenticated');

-- Manual incidents from the frontend: the user is the reporter and there is
-- no linked AI analysis. AI-detected incidents (ai_analysis_id IS NOT NULL)
-- come in via the Edge Function with service_role and bypass RLS entirely.
create policy "safety_incidents: log own" on safety_incidents
  for insert
  with check (
    auth.role() = 'authenticated'
    and reported_by = auth.uid()
    and ai_analysis_id is null
  );

create policy "safety_incidents: resolve mgr+" on safety_incidents
  for update
  using (is_manager_or_above())
  with check (is_manager_or_above());


-- ╭─ §4. view_photos_safe — GPS hidden from non-managers ─────────────────────╮
-- │ Workers can see photos in their project but not the GPS coordinates.     │
-- │ Gallery reads through this view. The review drawer reads `photos`        │
-- │ directly (it's already manager-gated by canConfirmAIAnalysis).           │
-- ╰───────────────────────────────────────────────────────────────────────────╯

drop view if exists view_photos_safe;
create view view_photos_safe with (security_invoker = true) as
  select
    id,
    project_id,
    task_id,
    zone_id,
    uploaded_by,
    filename,
    storage_path,
    thumbnail_path,
    file_size_kb,
    width,
    height,
    taken_at,
    uploaded_at,
    case when is_manager_or_above() then gps_lat else null end as gps_lat,
    case when is_manager_or_above() then gps_lng else null end as gps_lng,
    notes,
    ai_analyzed,
    perceptual_hash
  from photos;

grant select on view_photos_safe to authenticated;


-- ╭─ §5. Realtime ────────────────────────────────────────────────────────────╮
-- │ safety_incidents joins the existing realtime publication so the toast     │
-- │ pipeline can subscribe by project_id.                                     │
-- ╰───────────────────────────────────────────────────────────────────────────╯

do $$
begin
  alter publication supabase_realtime add table safety_incidents;
exception when duplicate_object then
  null;
end;
$$;
