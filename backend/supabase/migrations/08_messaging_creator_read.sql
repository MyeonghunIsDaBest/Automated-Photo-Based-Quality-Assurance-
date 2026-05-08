-- Phase D-6 — Messaging RLS fix, part 2.
--
-- Companion to 07_messaging_rls_fix.sql. After that migration the
-- multi-row member INSERT worked, but creating a conversation still
-- failed at the *prior* step:
--
--   .insert({ is_group, created_by, ... }).select('*').single()
--
-- supabase-js compiles this to a single POST that does INSERT + RETURNING *
-- atomically. RETURNING is gated by the conversations SELECT policy from
-- 03_messaging.sql, which only lets a user read a conversation they're
-- already a member of. The just-INSERTed row has no members yet (the
-- conversation_members INSERT happens in the next round-trip), so
-- RETURNING came back empty, supabase-js's `.single()` threw
-- "JSON object requested, multiple (or no) rows returned", and the
-- modal surfaced "Failed to create conversation." / "Failed to create
-- group."
--
-- Symptom in the browser console: a 200/206 POST to
-- /rest/v1/conversations?select=* with an empty body, followed by the
-- thrown error on the client side.
--
-- Fix: extend the conversations SELECT policy so the creator can always
-- read their own row. Everyone else still gates on membership. This also
-- means a creator who later removes themselves from the room can still
-- see the row in their inbox until they explicitly delete it — desired
-- behaviour, not a leak (they created it).
--
-- Sequence: 00, 01, 02, 03_messaging, 04_stakeholder_extras, 05_phash_rpc,
-- 06_analysis_history, 07_messaging_rls_fix, 08_messaging_creator_read
-- ← THIS FILE.

drop policy if exists "conv read" on public.conversations;
create policy "conv read" on public.conversations
  for select
  using (
    public.is_conversation_member(id)
    or created_by = auth.uid()
  );
