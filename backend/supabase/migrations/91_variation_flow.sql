-- ============================================================
-- 91) Variation flow — send-to-customer step
-- ============================================================
-- Boss brief: on-site upsell — price extra work as a variation in quote format,
-- SEND it to the customer, and when they say yes it folds into the running job
-- as another cost centre (one job, one invoice). This migration adds the missing
-- 'sent' lifecycle step; acceptance stays the existing 'approved' status (the
-- app labels it "Mark accepted"). A variation's TITLE is its cost-centre label.
--
-- Additive + idempotent. Depends: 65 (variations).
-- ============================================================

alter table public.variations
  add column if not exists sent_at timestamptz;

-- Extend the status check to include 'sent' (draft → priced → sent → approved/declined).
alter table public.variations drop constraint if exists variations_status_check;
alter table public.variations
  add constraint variations_status_check
  check (status in ('draft', 'priced', 'sent', 'approved', 'declined'));

notify pgrst, 'reload schema';
