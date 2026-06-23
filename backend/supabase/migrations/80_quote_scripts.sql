-- ============================================================
-- 80) Quote scripts — reusable Scope-of-Works templates ("Insert script")
-- ============================================================
-- Phase 1 Part 2 of the quote rework. Manager-editable text templates dropped
-- into a quote's customer-facing Description. Type-aware (any|service|project)
-- so a Project quote offers the Project SOW and a Service quote the Service one.
-- Distinct from quote_templates (mig 78 = line-item bundles).
--
-- Additive + idempotent. Manager-only (mirrors quote_templates RLS). Customer-
-- facing commercial module — nothing here touches supplier `invoices`.
-- Depends: 00_init (is_manager_or_above), 64 (touch_updated_at()).
-- ============================================================

create table if not exists public.quote_scripts (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  quote_type  text not null default 'any'
                check (quote_type in ('any','service','project')),
  body        text not null,
  sort_order  int not null default 0,
  is_active   boolean not null default true,
  created_by  uuid references auth.users(id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists idx_quote_scripts_active on public.quote_scripts(is_active);

drop trigger if exists trg_quote_scripts_touch on public.quote_scripts;
create trigger trg_quote_scripts_touch before update on public.quote_scripts
  for each row execute function public.touch_updated_at();

comment on table public.quote_scripts is
  'Reusable scope-of-works text templates inserted into a quote Description (the "Insert script" picker). quote_type any|service|project filters which quotes see them.';

-- ── RLS: manager-or-above for read + write (quoting is manager-only) ──
alter table public.quote_scripts enable row level security;
drop policy if exists quote_scripts_mgr_all on public.quote_scripts;
create policy quote_scripts_mgr_all on public.quote_scripts
  for all using (public.is_manager_or_above()) with check (public.is_manager_or_above());

-- ── Seed: the Project SOW (verbatim from Casone) + a concise Service version.
-- Dollar-quoted so apostrophes / ampersands / quotes / parens need no escaping.
-- Guarded by name so re-running this migration never duplicates them. ──
insert into public.quote_scripts (name, quote_type, body, sort_order)
select 'Project — Main Scope of Works', 'project', $SOW$Project - Main Scope Of Works at .


Scope of Works:

Install works as described in the below:


Specifications:


Drawings:



Inclusions:

    Detailed in each Cost Centre listed in this proposal.
    Shop Drawings within 7 days of acceptance of the signed quote.
    OHS & E Management Plan.
    SWMS (Safe Work Method Statements)
    MSDS Register. (Materials Safety Data Sheets)
    "As Installed" Drawings.
    Electrical Package Manual.
    CoES (Certificate of Electrical Safety)
    Warranty List of Installed Products.
    Product Specifications Installed.
    Exit & Emergency Certification Report.

Exclusions:

    Supply & Installation of Air-Conditioning components
    Penetrations
    BMS System
    Fire System cables back to fire panel
    Security System Cable Installation
    Security System Supply and/or Installation
    Audio / Visual Cabling, Supply and Installation

NOTE: All exclusions to be quoted as variations and chargeable in addition to the original quoted price.$SOW$, 1
where not exists (select 1 from public.quote_scripts where name = 'Project — Main Scope of Works');

insert into public.quote_scripts (name, quote_type, body, sort_order)
select 'Service — Scope of Works', 'service', $SOW$Service - Scope Of Works at .


Scope of Works:

Attend site and carry out the electrical service works described in this quote.


Inclusions:

    Labour and materials as detailed in this quote.
    Certificate of Electrical Safety (CoES) on completion.
    Make-good of the immediate work area.

Exclusions:

    Any works not expressly listed above.
    Patching, painting, or building works.
    Supply & Installation of Air-Conditioning components.

NOTE: All additional works to be quoted as variations and chargeable in addition to the original quoted price.$SOW$, 2
where not exists (select 1 from public.quote_scripts where name = 'Service — Scope of Works');

notify pgrst, 'reload schema';
