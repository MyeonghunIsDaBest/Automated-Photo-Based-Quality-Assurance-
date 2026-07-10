-- ============================================================
-- 97) Proposal terms & footer — settings-backed print blocks
-- ============================================================
-- P6 backbone (design-independent): the quote/proposal print sheet gains a
-- Terms & Conditions block and an optional footer line, both edited once in
-- Sales → Settings and printed on every proposal. The SimPro-design-matching
-- restyle lands separately when Luke's designs + Erica's input arrive.
--
-- Additive + idempotent. Depends: 65 (commercial_settings).
-- ============================================================

alter table public.commercial_settings
  add column if not exists quote_terms text,
  add column if not exists proposal_footer text;

comment on column public.commercial_settings.quote_terms is
  'Terms & conditions printed on every quote/proposal (plain text, blank = block hidden).';
comment on column public.commercial_settings.proposal_footer is
  'One footer line under the proposal (e.g. licence number / thank-you), blank = hidden.';

notify pgrst, 'reload schema';
