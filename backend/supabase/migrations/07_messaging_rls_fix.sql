-- Phase D-5 — Messaging RLS fix.
--
-- Pre-Phase-D-5, creating any new conversation that included a second user
-- failed with the modal surfacing "Failed to create conversation." or
-- "Failed to create group." The frontend never got past the
-- `conversation_members` multi-row INSERT.
--
-- Why it broke:
--   The `members insert` policy from 03_messaging.sql allowed the creator
--   to add other members via an inline:
--     exists (select 1 from conversations c
--             where c.id = conversation_id and c.created_by = auth.uid())
--   but `conversations` has its own SELECT RLS gated on
--   `is_conversation_member(id)`. A multi-row INSERT evaluates each row's
--   WITH CHECK against the pre-statement snapshot; row 2 (the "other
--   user" membership) ran before row 1 (the creator's own membership)
--   committed, so the EXISTS subquery couldn't read the conversation,
--   the policy failed, and the whole INSERT was rejected.
--
-- Fix: a SECURITY DEFINER `is_conversation_creator(c_id)` function bypasses
-- the conversations RLS for the policy check. Identical pattern to the
-- existing `is_conversation_member` helper introduced in 03_messaging.sql.
--
-- Sequence: 00, 01, 02, 03_messaging, 04_stakeholder_extras, 05_phash_rpc,
-- 06_analysis_history, 07_messaging_rls_fix ← THIS FILE.

create or replace function public.is_conversation_creator(c_id uuid)
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1 from public.conversations
    where id = c_id and created_by = auth.uid()
  );
$$;

drop policy if exists "members insert" on public.conversation_members;
create policy "members insert" on public.conversation_members
  for insert
  with check (
    auth.role() = 'authenticated'
    and (
      user_id = auth.uid()
      or public.is_conversation_creator(conversation_id)
    )
  );
