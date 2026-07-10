-- ============================================================
-- 93) Service job kind — service vs project work
-- ============================================================
-- Quotes already split into Service / Project registers (quote_type, mig 79).
-- Jobs now inherit that split: a job converted from a PROJECT quote is project
-- work, and the jobs board can filter/badge it accordingly. The board card's
-- drag-drop semantics are untouched — kind is presentation/filtering only.
--
-- Additive + idempotent. Depends: 63 (service_jobs), 65 (quotes.converted_job_id),
-- 79 (quotes.quote_type).
-- ============================================================

alter table public.service_jobs
  add column if not exists kind text not null default 'service'
    check (kind in ('service', 'project'));

comment on column public.service_jobs.kind is
  'Work register: service or project. Inherited from the originating quote''s quote_type at conversion; editable later.';

-- Backfill: any job converted from a project quote is project work. Re-runnable.
update public.service_jobs sj
set kind = 'project'
from public.quotes q
where q.converted_job_id = sj.id
  and q.quote_type = 'project'
  and sj.kind <> 'project';

notify pgrst, 'reload schema';
