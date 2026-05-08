-- Phase D-1 — Messaging
--
-- Tables: conversations, conversation_members, messages.
-- RLS: members of a conversation can read; only the sender can insert messages
--      with sender_id = auth.uid(); only the conversation creator can add other
--      members; users can self-leave.
--
-- The realtime publication is extended so the layout-level
-- `useMessagingRealtime` hook receives every relevant INSERT.
--
-- Sequence in this repo:
--   00_init.sql                 — base schema (tasks, photos, comments, etc.)
--   01_security_group_expand.sql — security_group enum + handle_new_user trigger
--   02_phase_c_seam.sql          — ai_analyses + safety_incidents
--   03_messaging.sql             — THIS FILE
--
-- Idempotency notes:
--   - All `create table` statements use `if not exists`.
--   - Policies use `drop policy if exists` so re-running the file is safe.
--   - Publication ALTERs are wrapped in DO blocks that swallow duplicate_object
--     so re-running on a project that's already wired up doesn't fail.

create table if not exists public.conversations (
  id          uuid primary key default gen_random_uuid(),
  name        text,
  is_group    boolean not null default false,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid references public.conversations(id) on delete cascade,
  user_id         uuid references auth.users(id) on delete cascade,
  joined_at       timestamptz not null default now(),
  last_read_at    timestamptz,
  primary key (conversation_id, user_id)
);

create table if not exists public.messages (
  id              uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id       uuid references auth.users(id) on delete set null,
  body            text not null check (length(trim(body)) > 0),
  created_at      timestamptz not null default now()
);

create index if not exists idx_messages_conv_recent on public.messages (conversation_id, created_at desc);
create index if not exists idx_conv_members_user    on public.conversation_members (user_id);

-- SECURITY DEFINER short-circuits the recursive RLS that would otherwise
-- happen if `members read` queried `conversation_members` to decide whether
-- to allow reading `conversation_members`. The function runs with the
-- definer's permissions and bypasses the recursive check.
create or replace function public.is_conversation_member(c_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.conversation_members
    where conversation_id = c_id and user_id = auth.uid()
  );
$$;

alter table public.conversations         enable row level security;
alter table public.conversation_members  enable row level security;
alter table public.messages              enable row level security;

drop policy if exists "conv read"   on public.conversations;
drop policy if exists "conv insert" on public.conversations;
create policy "conv read" on public.conversations
  for select using (public.is_conversation_member(id));
create policy "conv insert" on public.conversations
  for insert with check (auth.role() = 'authenticated' and created_by = auth.uid());

drop policy if exists "members read"        on public.conversation_members;
drop policy if exists "members insert"      on public.conversation_members;
drop policy if exists "members delete self" on public.conversation_members;
create policy "members read" on public.conversation_members
  for select using (public.is_conversation_member(conversation_id));
create policy "members insert" on public.conversation_members
  for insert with check (
    auth.role() = 'authenticated'
    and (
      user_id = auth.uid()
      or exists (
        select 1 from public.conversations c
        where c.id = conversation_id and c.created_by = auth.uid()
      )
    )
  );
create policy "members delete self" on public.conversation_members
  for delete using (user_id = auth.uid());

drop policy if exists "msg read"   on public.messages;
drop policy if exists "msg insert" on public.messages;
create policy "msg read" on public.messages
  for select using (public.is_conversation_member(conversation_id));
create policy "msg insert" on public.messages
  for insert with check (
    auth.role() = 'authenticated'
    and sender_id = auth.uid()
    and public.is_conversation_member(conversation_id)
  );

-- The realtime publication needs each table added explicitly. Wrapped in DO
-- blocks because adding a table that's already in the publication is a
-- duplicate_object error; this lets the migration re-run cleanly.
do $$ begin
  alter publication supabase_realtime add table public.messages;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.conversations;
exception when duplicate_object then null; end $$;
do $$ begin
  alter publication supabase_realtime add table public.conversation_members;
exception when duplicate_object then null; end $$;
