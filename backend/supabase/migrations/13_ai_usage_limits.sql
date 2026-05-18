-- ai_usage_daily — per-day counters that gate every Anthropic call.
--
-- Why an explicit table instead of relying on Anthropic's own usage API:
--   • The Edge Function runs in Deno isolates that can cold-start; we need
--     state that survives across invocations.
--   • Cap enforcement has to be synchronous (read counters → decide → call
--     Anthropic → record). Polling Anthropic's API would add latency to
--     every demo polish call.
--   • Per-project counters (a follow-up) will eventually pivot off the
--     same shape — easier to extend a local table than wrap a third-party
--     API.
--
-- Lifecycle:
--   • One row per UTC date. Created on first call of the day by the
--     `record_ai_call()` RPC below.
--   • Edge Function reads `current_ai_usage_today()` before each call and
--     bails with a 429 if any cap is hit.
--   • Cleanup: rows older than 90 days are uninteresting for daily caps
--     (monthly billing reads a separate aggregate); left in place for
--     manual audit. A periodic job can purge if disk pressure ever shows.

-- ──────────────────────────────────────────────────────────────────────────
-- 1. Table.
-- ──────────────────────────────────────────────────────────────────────────
create table if not exists public.ai_usage_daily (
  usage_date     date primary key default (current_date at time zone 'utc'),
  call_count     int  not null default 0,
  tokens_used    int  not null default 0,
  cost_cents     int  not null default 0,    -- denormalised, helpful for billing
  last_updated   timestamptz not null default now()
);

comment on table public.ai_usage_daily is
  'Per-UTC-date counters for Anthropic API usage. Used by Edge Functions
   (polish-text, future analyze-photo Phase D) to enforce daily caps.';

-- ──────────────────────────────────────────────────────────────────────────
-- 2. RLS — service-role only.
-- The frontend never reads this directly; only Edge Functions running with
-- the service-role key touch the table.
-- ──────────────────────────────────────────────────────────────────────────
alter table public.ai_usage_daily enable row level security;

-- No public policies. service_role bypasses RLS via the supabase-js client
-- credentials the Edge Function uses, so the absence of policies = locked
-- to service_role.

-- ──────────────────────────────────────────────────────────────────────────
-- 3. RPC — read today's usage in one call.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.current_ai_usage_today()
returns table (
  usage_date date,
  call_count int,
  tokens_used int,
  cost_cents int
)
language sql
stable
security definer
set search_path = public
as $$
  select
    coalesce(u.usage_date,  (current_date at time zone 'utc')::date) as usage_date,
    coalesce(u.call_count,  0) as call_count,
    coalesce(u.tokens_used, 0) as tokens_used,
    coalesce(u.cost_cents,  0) as cost_cents
  from (select 1) z
  left join public.ai_usage_daily u
    on u.usage_date = (current_date at time zone 'utc')::date;
$$;

comment on function public.current_ai_usage_today() is
  'Returns today''s usage counters (or zeros if no row yet). Used by Edge
   Functions to decide whether to proceed with an Anthropic call.';

-- ──────────────────────────────────────────────────────────────────────────
-- 4. RPC — atomic increment used after a successful call.
-- ──────────────────────────────────────────────────────────────────────────
create or replace function public.record_ai_call(
  p_tokens int,
  p_cost_cents int
)
returns void
language sql
security definer
set search_path = public
as $$
  insert into public.ai_usage_daily (usage_date, call_count, tokens_used, cost_cents)
  values (
    (current_date at time zone 'utc')::date,
    1, greatest(p_tokens, 0), greatest(p_cost_cents, 0)
  )
  on conflict (usage_date) do update set
    call_count   = ai_usage_daily.call_count   + 1,
    tokens_used  = ai_usage_daily.tokens_used  + greatest(p_tokens, 0),
    cost_cents   = ai_usage_daily.cost_cents   + greatest(p_cost_cents, 0),
    last_updated = now();
$$;

comment on function public.record_ai_call(int, int) is
  'Increments today''s counters by one call + the supplied tokens / cents.
   Called by the shared anthropic helper AFTER a successful Anthropic call.
   Idempotent across same-day concurrent invocations via upsert.';
