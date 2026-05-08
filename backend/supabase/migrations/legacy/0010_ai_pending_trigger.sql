-- ─────────────────────────────────────────────────────────────────────────────
-- 0010_ai_pending_trigger.sql — when a new photo arrives, drop a placeholder
-- "pending" ai_analyses row so the gallery can render an "Awaiting AI" state
-- and the future analyze-photo Edge Function has something to update.
--
-- Run AFTER 0009. Idempotent.
-- ─────────────────────────────────────────────────────────────────────────────

create or replace function on_photo_inserted_queue_ai() returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  -- Use placeholder values that satisfy the table's NOT NULL + range checks.
  -- The real analysis row gets inserted later by the Edge Function with a
  -- real model name — they won't collide because the unique constraint is on
  -- (photo_id, model_used, analyzed_at).
  insert into ai_analyses (
    photo_id, model_used, completion_pct, confidence, action_taken
  ) values (
    new.id, 'pending', 0, 0, 'pending'
  )
  on conflict do nothing;
  return new;
end;
$$;

drop trigger if exists trg_on_photo_inserted_queue_ai on photos;
create trigger trg_on_photo_inserted_queue_ai
  after insert on photos
  for each row execute function on_photo_inserted_queue_ai();
