-- ============================================================
-- Casone starter prebuilds + quote templates
-- ============================================================
-- ⚠ PARTIALLY SUPERSEDED (P3 import pipeline, Jul 2026):
-- PRE-BUILDS now import from CSV in the app — Catalogue → Import
-- → "Pre-builds import" card (template downloadable there; items
-- match by SKU, same rule as this file). Prefer that flow: no SQL
-- editor needed and errors are reported readably.
-- This file remains the only path for QUOTE TEMPLATES (with labour
-- lines) until a template CSV import ships — still safe to re-run.
-- ============================================================
-- RUN THIS *AFTER* importing casone-catalogue-starter.csv
-- (Catalogue → Import), because every line below looks materials
-- up by the SKUs from that CSV.
--
-- Paste into the Supabase SQL editor and run.
--
-- SAFE TO RE-RUN: each prebuild / template is created only if one
-- with the same name doesn't already exist — so re-running is a
-- no-op and never clobbers anything you've edited by hand.
--
-- ROBUST: materials are matched by SKU via a join, so if you
-- renamed a SKU during import, that one line is silently skipped
-- (the rest still load). Check the row counts at the end.
--
-- LABOUR NOTE: labour lines match the seeded roles
-- (electrician / apprentice / foreman). They price from each
-- role's loaded_rate, which is NULL until you set it in your
-- labour rates — until then those lines come in at $0 and you can
-- type the price on the quote.
-- ============================================================

do $$
declare
  v_pb  uuid;
  v_tpl uuid;
begin
  -- ── Prebuilds (reusable bundles for the editor's "Prebuild" picker) ──

  if not exists (select 1 from public.prebuilds where name = 'GPO Point (double)') then
    insert into public.prebuilds (name, category, description)
      values ('GPO Point (double)', 'Electrical', 'Double power point with cable + conduit run')
      returning id into v_pb;
    insert into public.prebuild_items (prebuild_id, material_id, qty, sort_order)
      select v_pb, m.id, q.qty, q.so
      from (values ('GPO-DBL', 1, 0), ('CBL-TPS25', 8, 1), ('CON-CORR20', 5, 2)) as q(sku, qty, so)
      join public.materials m on m.sku = q.sku;
  end if;

  if not exists (select 1 from public.prebuilds where name = 'Downlight Point') then
    insert into public.prebuilds (name, category, description)
      values ('Downlight Point', 'Electrical', 'LED downlight with cable + conduit run')
      returning id into v_pb;
    insert into public.prebuild_items (prebuild_id, material_id, qty, sort_order)
      select v_pb, m.id, q.qty, q.so
      from (values ('DL-LED', 1, 0), ('CBL-TPS15', 6, 1), ('CON-CORR20', 4, 2)) as q(sku, qty, so)
      join public.materials m on m.sku = q.sku;
  end if;

  if not exists (select 1 from public.prebuilds where name = 'Smoke Alarm Point') then
    insert into public.prebuilds (name, category, description)
      values ('Smoke Alarm Point', 'Electrical', '240V photoelectric smoke alarm with cable run')
      returning id into v_pb;
    insert into public.prebuild_items (prebuild_id, material_id, qty, sort_order)
      select v_pb, m.id, q.qty, q.so
      from (values ('SMK-240', 1, 0), ('CBL-TPS15', 8, 1)) as q(sku, qty, so)
      join public.materials m on m.sku = q.sku;
  end if;

  if not exists (select 1 from public.prebuilds where name = 'Light Switch Point') then
    insert into public.prebuilds (name, category, description)
      values ('Light Switch Point', 'Electrical', 'Single gang switch with cable run')
      returning id into v_pb;
    insert into public.prebuild_items (prebuild_id, material_id, qty, sort_order)
      select v_pb, m.id, q.qty, q.so
      from (values ('SW-1G', 1, 0), ('CBL-TPS15', 5, 1)) as q(sku, qty, so)
      join public.materials m on m.sku = q.sku;
  end if;

  -- ── Quote templates (whole-job bundles for "Apply template") ──

  -- 6.6kW Solar Install
  if not exists (select 1 from public.quote_templates where name = '6.6kW Solar Install (15 x 440W)') then
    insert into public.quote_templates (name, category, description)
      values ('6.6kW Solar Install (15 x 440W)', 'Solar', '15 x 440W panels + 5kW single-phase inverter, full mount + DC/AC')
      returning id into v_tpl;
    insert into public.quote_template_items (template_id, kind, material_id, qty, sort_order)
      select v_tpl, 'material', m.id, q.qty, q.so
      from (values
        ('PNL-440M', 15, 0), ('INV-5K-1P', 1, 1), ('RAIL-42', 6, 2),
        ('CLMP-MID', 26, 3), ('CLMP-END', 8, 4), ('FOOT-TIN', 30, 5),
        ('ISO-DC-1000', 1, 6), ('ISO-AC-40', 1, 7), ('CBL-DC6', 40, 8),
        ('MC4-PR', 4, 9), ('CON-SOL25', 12, 10)
      ) as q(sku, qty, so)
      join public.materials m on m.sku = q.sku;
    insert into public.quote_template_items (template_id, kind, role, qty, sort_order)
      values (v_tpl, 'labour', 'electrician', 12, 90),
             (v_tpl, 'labour', 'apprentice', 12, 91);
  end if;

  -- Switchboard Upgrade
  if not exists (select 1 from public.quote_templates where name = 'Switchboard Upgrade') then
    insert into public.quote_templates (name, category, description)
      values ('Switchboard Upgrade', 'Electrical', 'New board, main switch/RCD, RCBOs + earthing')
      returning id into v_tpl;
    insert into public.quote_template_items (template_id, kind, material_id, qty, sort_order)
      select v_tpl, 'material', m.id, q.qty, q.so
      from (values
        ('SWBD-12', 1, 0), ('RCD-4P', 1, 1), ('RCBO-2P', 6, 2),
        ('MCB-1P', 4, 3), ('CBL-TPS6', 10, 4), ('EARTH-STK', 1, 5)
      ) as q(sku, qty, so)
      join public.materials m on m.sku = q.sku;
    insert into public.quote_template_items (template_id, kind, role, qty, sort_order)
      values (v_tpl, 'labour', 'electrician', 6, 90);
  end if;

  -- EV Charger Install (7kW)
  if not exists (select 1 from public.quote_templates where name = 'EV Charger Install (7kW)') then
    insert into public.quote_templates (name, category, description)
      values ('EV Charger Install (7kW)', 'Electrical', '7kW single-phase EV charger on dedicated circuit')
      returning id into v_tpl;
    insert into public.quote_template_items (template_id, kind, material_id, qty, sort_order)
      select v_tpl, 'material', m.id, q.qty, q.so
      from (values
        ('EVC-7K', 1, 0), ('CBL-TPS6', 15, 1), ('CON-CORR25', 12, 2),
        ('RCBO-2P', 1, 3), ('ISO-AC-40', 1, 4)
      ) as q(sku, qty, so)
      join public.materials m on m.sku = q.sku;
    insert into public.quote_template_items (template_id, kind, role, qty, sort_order)
      values (v_tpl, 'labour', 'electrician', 4, 90);
  end if;
end $$;

-- Tell PostgREST the data changed (harmless if no schema change).
notify pgrst, 'reload schema';

-- ── Verify what loaded ──
select 'prebuilds' as kind, name, (select count(*) from public.prebuild_items pi where pi.prebuild_id = p.id) as lines
  from public.prebuilds p order by name;
select 'templates' as kind, t.name, (select count(*) from public.quote_template_items ti where ti.template_id = t.id) as lines
  from public.quote_templates t order by t.name;
