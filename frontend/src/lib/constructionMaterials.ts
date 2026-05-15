// Tiered construction materials catalogue — used by the new-order popup so
// site managers don't have to free-type line-item descriptions. Each tier
// maps to a real-world trade so a sparkie picks from cable + conduit, a
// chippie picks from timber + fasteners, etc.
//
// Prices are demo-grade AUD round numbers. Real procurement should ship from
// a supplier's price book; this catalogue is the deterministic stand-in that
// makes the new-order modal usable without a backend round-trip.

import type { LucideIcon } from 'lucide-react';
import {
  Cable,
  Construction,
  Droplets,
  Hammer,
  HardHat,
  Home,
  Paintbrush,
  Wrench,
} from 'lucide-react';

export interface MaterialItem {
  /** Stable kebab-case id. Pre-fixed by tier to avoid collisions across tiers. */
  id: string;
  /** Human label shown in the picker. */
  name: string;
  /** Short detail line under the name — gauge/size/spec. Optional. */
  spec?: string;
  /** Unit of measurement matching OrderLineItem.unit conventions. */
  unit: 'ea' | 'box' | 'm' | 'm²' | 'm³' | 'kg' | 'lf' | 'sf' | 'pallet' | 'roll';
  /** Demo-grade unit price in AUD. Used as the pre-filled unitCost; the user
   *  can still override per line on the order. */
  defaultUnitCost: number;
}

export interface MaterialTier {
  id: string;
  label: string;
  /** One-sentence trade descriptor — shown as the tier card subtitle. */
  description: string;
  icon: LucideIcon;
  /** Tailwind utility token used to colour the tier pill + accent strip. */
  accent: 'amber' | 'sky' | 'slate' | 'orange' | 'rose' | 'violet' | 'emerald' | 'indigo';
  items: MaterialItem[];
}

export const MATERIAL_TIERS: MaterialTier[] = [
  {
    id: 'electrical',
    label: 'Electrical',
    description: 'Cabling, conduit, switchgear, and lighting for the sparkies.',
    icon: Cable,
    accent: 'amber',
    items: [
      { id: 'electrical-cable-16mm-4c',   name: 'Cable 16mm² 4-core',      spec: 'XLPE/PVC · sub-mains', unit: 'm',   defaultUnitCost: 18 },
      { id: 'electrical-cable-2.5mm-tps', name: 'TPS cable 2.5mm²',        spec: 'general lighting/power', unit: 'roll', defaultUnitCost: 220 },
      { id: 'electrical-cable-1.5mm-tps', name: 'TPS cable 1.5mm²',        spec: 'switch drops', unit: 'roll', defaultUnitCost: 165 },
      { id: 'electrical-conduit-25mm',    name: 'Conduit 25mm orange',     spec: 'rigid PVC · sub-floor', unit: 'm',   defaultUnitCost: 6 },
      { id: 'electrical-conduit-32mm',    name: 'Conduit 32mm orange',     spec: 'rigid PVC · feeders',  unit: 'm',   defaultUnitCost: 9 },
      { id: 'electrical-junction-box',    name: 'Junction box, 4-way',     spec: 'IP56 · grey', unit: 'ea',  defaultUnitCost: 14 },
      { id: 'electrical-mcb-32a',         name: 'MCB 32A single-pole',     spec: 'C-curve · DIN', unit: 'ea',  defaultUnitCost: 22 },
      { id: 'electrical-rcd-40a',         name: 'RCD 40A two-pole',        spec: '30 mA trip', unit: 'ea',  defaultUnitCost: 95 },
      { id: 'electrical-gpo-double',      name: 'Double GPO, white',       spec: '10 A · screwless', unit: 'ea',  defaultUnitCost: 18 },
      { id: 'electrical-downlight-led',   name: 'LED downlight 12 W',      spec: 'dimmable · 90 mm cutout', unit: 'ea',  defaultUnitCost: 35 },
      { id: 'electrical-cable-tray',      name: 'Cable tray, 300 mm',      spec: 'galvanised · 3 m length', unit: 'ea',  defaultUnitCost: 145 },
    ],
  },
  {
    id: 'plumbing',
    label: 'Plumbing',
    description: 'Copper, PVC, fittings, and valves for water + waste runs.',
    icon: Droplets,
    accent: 'sky',
    items: [
      { id: 'plumbing-copper-15mm',       name: 'Copper pipe 15 mm',       spec: 'type B · 6 m length', unit: 'm',   defaultUnitCost: 16 },
      { id: 'plumbing-copper-22mm',       name: 'Copper pipe 22 mm',       spec: 'type B · 6 m length', unit: 'm',   defaultUnitCost: 24 },
      { id: 'plumbing-pvc-100mm',         name: 'PVC pipe 100 mm DWV',     spec: 'sewer drainage', unit: 'm',   defaultUnitCost: 22 },
      { id: 'plumbing-pvc-50mm',          name: 'PVC pipe 50 mm DWV',      spec: 'waste branch', unit: 'm',   defaultUnitCost: 11 },
      { id: 'plumbing-elbow-15mm',        name: 'Elbow 15 mm 90°',         spec: 'capillary copper', unit: 'box', defaultUnitCost: 38 },
      { id: 'plumbing-tee-22mm',          name: 'Tee 22 mm',               spec: 'capillary copper', unit: 'box', defaultUnitCost: 52 },
      { id: 'plumbing-ball-valve-22mm',   name: 'Ball valve 22 mm',        spec: 'full-bore · isolating', unit: 'ea',  defaultUnitCost: 28 },
      { id: 'plumbing-tank-rainwater',    name: 'Rainwater tank 2000 L',   spec: 'slimline · poly', unit: 'ea',  defaultUnitCost: 880 },
      { id: 'plumbing-trap-bottle',       name: 'Bottle trap 32 mm',       spec: 'basin waste', unit: 'ea',  defaultUnitCost: 16 },
      { id: 'plumbing-sealant-pipe',      name: 'Pipe-thread sealant',     spec: '50 mL tube', unit: 'box', defaultUnitCost: 14 },
    ],
  },
  {
    id: 'structural',
    label: 'Structural · Concrete',
    description: 'Cement, rebar, formwork, and structural-frame fasteners.',
    icon: Construction,
    accent: 'slate',
    items: [
      { id: 'structural-cement-bag',      name: 'Portland cement 20 kg',   spec: 'general purpose', unit: 'pallet', defaultUnitCost: 480 },
      { id: 'structural-concrete-25mpa',  name: 'Concrete N25 ready-mix',  spec: '25 MPa · slump 80', unit: 'm³',  defaultUnitCost: 285 },
      { id: 'structural-rebar-n12',       name: 'Rebar N12 · 6 m',         spec: 'deformed · grade 500', unit: 'ea',  defaultUnitCost: 22 },
      { id: 'structural-rebar-n16',       name: 'Rebar N16 · 6 m',         spec: 'deformed · grade 500', unit: 'ea',  defaultUnitCost: 38 },
      { id: 'structural-mesh-sl82',       name: 'Mesh SL82 sheet',         spec: '6 m × 2.4 m', unit: 'ea',  defaultUnitCost: 110 },
      { id: 'structural-formwork-ply',    name: 'Formwork ply 17 mm',      spec: '2.4 m × 1.2 m · F17', unit: 'ea',  defaultUnitCost: 78 },
      { id: 'structural-anchor-bolt',     name: 'Anchor bolt M16',         spec: 'hot-dip galvanised', unit: 'ea',  defaultUnitCost: 9 },
      { id: 'structural-tie-wire',        name: 'Tie wire 1.6 mm',         spec: 'black annealed · 4 kg coil', unit: 'ea',  defaultUnitCost: 28 },
    ],
  },
  {
    id: 'framing',
    label: 'Framing · Carpentry',
    description: 'Timber, sheeting, and fasteners for walls + floors + roofs.',
    icon: Hammer,
    accent: 'orange',
    items: [
      { id: 'framing-stud-90x45',         name: 'Stud 90×45 MGP10',        spec: '2.4 m length', unit: 'ea',  defaultUnitCost: 11 },
      { id: 'framing-plate-90x35',        name: 'Top/bottom plate 90×35',  spec: '3.6 m · MGP10', unit: 'ea',  defaultUnitCost: 18 },
      { id: 'framing-plywood-17mm',       name: 'Plywood structural 17 mm', spec: '2.4 m × 1.2 m', unit: 'ea',  defaultUnitCost: 92 },
      { id: 'framing-plywood-12mm',       name: 'Plywood structural 12 mm', spec: '2.4 m × 1.2 m · F11', unit: 'ea',  defaultUnitCost: 68 },
      { id: 'framing-osb-15mm',           name: 'OSB sheathing 15 mm',     spec: '2.4 m × 1.2 m', unit: 'ea',  defaultUnitCost: 54 },
      { id: 'framing-screws-bugle',       name: 'Bugle-head screws 8×65',  spec: '500-pack', unit: 'box', defaultUnitCost: 42 },
      { id: 'framing-nails-gun',          name: 'Gun nails 75 mm',         spec: '4000-pack · ring-shank', unit: 'box', defaultUnitCost: 88 },
      { id: 'framing-bracket-joist',      name: 'Joist hanger 90 mm',      spec: 'galvanised', unit: 'ea',  defaultUnitCost: 6 },
    ],
  },
  {
    id: 'roofing',
    label: 'Roofing',
    description: 'Sheeting, tiles, flashing, gutters, and downpipes.',
    icon: Home,
    accent: 'rose',
    items: [
      { id: 'roofing-colorbond-sheet',    name: 'Colorbond roof sheet',    spec: 'Trimdek · 0.42 BMT', unit: 'm²',  defaultUnitCost: 38 },
      { id: 'roofing-tile-concrete',      name: 'Concrete roof tile',      spec: 'classic profile · charcoal', unit: 'ea',  defaultUnitCost: 3 },
      { id: 'roofing-ridge-cap',          name: 'Ridge cap, 1.8 m',        spec: 'Colorbond · matching', unit: 'ea',  defaultUnitCost: 28 },
      { id: 'roofing-flashing-200mm',     name: 'Flashing 200 mm',         spec: 'lead-free · 2.4 m', unit: 'ea',  defaultUnitCost: 36 },
      { id: 'roofing-gutter-quad',        name: 'Quad gutter, 3 m',        spec: 'Colorbond', unit: 'ea',  defaultUnitCost: 42 },
      { id: 'roofing-downpipe-100',       name: 'Downpipe 100 × 75 mm',    spec: '3 m · Colorbond', unit: 'ea',  defaultUnitCost: 32 },
      { id: 'roofing-insulation-r4.0',    name: 'Roof insulation R4.0',    spec: 'glasswool · 580 mm', unit: 'roll', defaultUnitCost: 95 },
      { id: 'roofing-screws-tek',         name: 'Tek screws 14-10×65',     spec: '1000-pack · cyclonic', unit: 'box', defaultUnitCost: 58 },
    ],
  },
  {
    id: 'drywall',
    label: 'Drywall · Finishing',
    description: 'Plasterboard, jointing, paint, and trim for fit-out.',
    icon: Paintbrush,
    accent: 'violet',
    items: [
      { id: 'drywall-plasterboard-10mm',  name: 'Plasterboard 10 mm',      spec: '2.4 m × 1.2 m', unit: 'ea',  defaultUnitCost: 22 },
      { id: 'drywall-plasterboard-13mm',  name: 'Plasterboard 13 mm fire', spec: '2.4 m × 1.2 m · FR', unit: 'ea',  defaultUnitCost: 34 },
      { id: 'drywall-cornice-90mm',       name: 'Cornice 90 mm cove',      spec: '4.0 m length', unit: 'ea',  defaultUnitCost: 18 },
      { id: 'drywall-joint-compound',     name: 'Joint compound 20 kg',    spec: 'ready-mix', unit: 'ea',  defaultUnitCost: 38 },
      { id: 'drywall-paper-tape',         name: 'Paper tape, 90 m roll',   spec: 'pre-creased', unit: 'roll', defaultUnitCost: 12 },
      { id: 'drywall-paint-low-sheen',    name: 'Paint, low-sheen 15 L',   spec: 'interior · white', unit: 'ea',  defaultUnitCost: 215 },
      { id: 'drywall-paint-ceiling',      name: 'Paint, ceiling 15 L',     spec: 'flat · white', unit: 'ea',  defaultUnitCost: 175 },
      { id: 'drywall-skirting-mdf',       name: 'Skirting MDF 92×18',      spec: '5.4 m · pre-primed', unit: 'ea',  defaultUnitCost: 28 },
    ],
  },
  {
    id: 'site',
    label: 'Site · Safety',
    description: 'Barriers, signage, PPE, and consumables for the site.',
    icon: HardHat,
    accent: 'emerald',
    items: [
      { id: 'site-fence-temp-2.4m',       name: 'Temp fence panel 2.4 m',  spec: 'mesh + foot', unit: 'ea',  defaultUnitCost: 165 },
      { id: 'site-witches-hat',           name: 'Witches hat, 700 mm',     spec: 'reflective collar', unit: 'ea',  defaultUnitCost: 28 },
      { id: 'site-bunting-yellow',        name: 'Bunting tape, 100 m',     spec: 'caution · yellow', unit: 'roll', defaultUnitCost: 22 },
      { id: 'site-hard-hat',              name: 'Hard hat, vented',        spec: 'AS/NZS 1801', unit: 'ea',  defaultUnitCost: 18 },
      { id: 'site-vest-hi-vis',           name: 'Hi-vis vest, day/night',  spec: 'TTMC-W17', unit: 'ea',  defaultUnitCost: 28 },
      { id: 'site-gloves-cut5',           name: 'Cut-resistant gloves',    spec: 'EN388 · level 5', unit: 'box', defaultUnitCost: 65 },
      { id: 'site-signage-swms',          name: 'SWMS notice board',       spec: 'A2 · weatherproof', unit: 'ea',  defaultUnitCost: 88 },
    ],
  },
  {
    id: 'fixtures',
    label: 'Fixtures · Fittings',
    description: 'Joinery, hardware, and trim that lands toward project end.',
    icon: Wrench,
    accent: 'indigo',
    items: [
      { id: 'fixtures-door-internal',     name: 'Internal door, flush',    spec: '2040 × 820 · hollow-core', unit: 'ea',  defaultUnitCost: 95 },
      { id: 'fixtures-door-external',     name: 'External door, solid',    spec: '2040 × 820 · oak veneer', unit: 'ea',  defaultUnitCost: 380 },
      { id: 'fixtures-hinge-butt',        name: 'Butt hinge 100 mm',       spec: 'ball-bearing · SS', unit: 'box', defaultUnitCost: 24 },
      { id: 'fixtures-handle-lever',      name: 'Lever handle, brushed',   spec: 'passage set', unit: 'ea',  defaultUnitCost: 65 },
      { id: 'fixtures-window-aluminium',  name: 'Aluminium window, sliding', spec: '1200 × 900 · clear', unit: 'ea',  defaultUnitCost: 420 },
      { id: 'fixtures-bench-stone',       name: 'Stone benchtop 3 m',      spec: '20 mm · honed', unit: 'ea',  defaultUnitCost: 1450 },
      { id: 'fixtures-tap-mixer',         name: 'Basin mixer tap',         spec: 'chrome · WELS 5', unit: 'ea',  defaultUnitCost: 165 },
    ],
  },
];

// Flat lookup map by id for line-item resolution / activity log labels.
export const MATERIAL_BY_ID: Record<string, MaterialItem & { tierId: string }> =
  Object.fromEntries(
    MATERIAL_TIERS.flatMap((tier) =>
      tier.items.map((item) => [item.id, { ...item, tierId: tier.id }] as const),
    ),
  );

export function findTierByItemId(itemId: string): MaterialTier | undefined {
  const entry = MATERIAL_BY_ID[itemId];
  if (!entry) return undefined;
  return MATERIAL_TIERS.find((t) => t.id === entry.tierId);
}

// Tailwind class tokens per accent. Centralising avoids repeating literal
// strings across the modal + future tier-pill renders.
export const TIER_ACCENT_CLASSES: Record<MaterialTier['accent'], {
  badge: string;
  ring: string;
  bar: string;
}> = {
  amber:   { badge: 'border-amber-200 bg-amber-50 text-amber-700',     ring: 'ring-amber-200',   bar: 'bg-amber-500' },
  sky:     { badge: 'border-sky-200 bg-sky-50 text-sky-700',           ring: 'ring-sky-200',     bar: 'bg-sky-500' },
  slate:   { badge: 'border-slate-200 bg-slate-50 text-slate-700',     ring: 'ring-slate-200',   bar: 'bg-slate-500' },
  orange:  { badge: 'border-orange-200 bg-orange-50 text-orange-700',  ring: 'ring-orange-200',  bar: 'bg-orange-500' },
  rose:    { badge: 'border-rose-200 bg-rose-50 text-rose-700',        ring: 'ring-rose-200',    bar: 'bg-rose-500' },
  violet:  { badge: 'border-violet-200 bg-violet-50 text-violet-700',  ring: 'ring-violet-200',  bar: 'bg-violet-500' },
  emerald: { badge: 'border-emerald-200 bg-emerald-50 text-emerald-700', ring: 'ring-emerald-200', bar: 'bg-emerald-500' },
  indigo:  { badge: 'border-indigo-200 bg-indigo-50 text-indigo-700',  ring: 'ring-indigo-200',  bar: 'bg-indigo-500' },
};
