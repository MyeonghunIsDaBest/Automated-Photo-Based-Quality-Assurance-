-- Phase D-3 — Server-side perceptual-hash similarity search.
--
-- Pre-Phase-D, `findSimilarPhotos` in lib/api/photos.ts pulled every photo
-- with a perceptual_hash for the project and ran the Hamming distance
-- client-side. That works for tens or hundreds of photos but breaks down
-- past ~1000 photos per project (the upload page locks up while parsing
-- the response).
--
-- This RPC pushes the filter into Postgres so the client only sees the
-- matching rows. Uses the existing `phash_distance(a text, b text)`
-- function defined in 02_phase_c_seam.sql.
--
-- Sequence: 00_init, 01_security_group_expand, 02_phase_c_seam,
-- 03_messaging, 04_stakeholder_extras, 05_phash_rpc ← THIS FILE.

create or replace function find_similar_photos(
  p_project_id uuid,
  p_hash       text,
  p_threshold  int default 6
)
returns setof photos
language sql
stable
as $$
  select *
    from photos
   where project_id = p_project_id
     and perceptual_hash is not null
     and length(perceptual_hash) = 16
     and phash_distance(perceptual_hash, p_hash) <= p_threshold
   order by phash_distance(perceptual_hash, p_hash) asc, uploaded_at desc;
$$;

-- Open to authenticated users — RLS on the underlying `photos` table still
-- applies, so a worker only sees photos in their projects, etc.
grant execute on function find_similar_photos(uuid, text, int) to authenticated;
