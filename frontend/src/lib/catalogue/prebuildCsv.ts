// ─────────────────────────────────────────────────────────────────────────────
// lib/catalogue/prebuildCsv.ts — pure CSV parse + import planner for PRE-BUILDS
// (assemblies of catalogue materials: "Downlight point", "GPO point", …).
//
// File format (header row required; one row per ITEM, grouped by prebuild_name):
//   prebuild_name, category, subcategory, is_favourite, item_sku, item_qty
//   Downlight point, Electrical, Points, yes, CBL-TPS25, 12
//   Downlight point, , , , DLK-9W, 1
// Meta columns (category/subcategory/is_favourite) are read from the FIRST row
// of each prebuild; later rows may leave them blank. Items resolve to catalogue
// materials strictly by SKU — import the materials CSV first.
//
// No Supabase imports; vitest-friendly (mirrors csv.ts). Supersedes the manual
// casone-catalogue-prebuilds-templates.sql paste for pre-builds.
// ─────────────────────────────────────────────────────────────────────────────

import { parseCsvLine } from './csv';

export interface CsvPrebuildItem {
  sku: string;
  qty: number;
  /** 1-based file line, for error messages. */
  line: number;
}

export interface CsvPrebuild {
  name: string;
  category: string | null;
  subcategory: string | null;
  isFavourite: boolean;
  items: CsvPrebuildItem[];
}

export interface PrebuildParseResult {
  prebuilds: CsvPrebuild[];
  errors: string[];
}

const HEADERS = ['prebuild_name', 'category', 'subcategory', 'is_favourite', 'item_sku', 'item_qty'];

export function parsePrebuildsCsv(text: string): PrebuildParseResult {
  const lines = text.split(/\r?\n/);
  const errors: string[] = [];
  const byName = new Map<string, CsvPrebuild>();
  // Assemblies with ANY invalid row are dropped whole at the end — importing
  // the surviving rows would build a partial assembly (and, if the FIRST row
  // was the bad one, steal its category/favourite meta too).
  const namesWithErrors = new Set<string>();

  if (lines.length === 0 || lines[0].trim() === '') {
    return { prebuilds: [], errors: ['header: file is empty'] };
  }

  const headerFields = parseCsvLine(lines[0].replace(/^﻿/, '')).map((h) => h.trim().toLowerCase());
  for (const required of HEADERS) {
    if (!headerFields.includes(required)) {
      return { prebuilds: [], errors: [`header: missing required column "${required}" — expected: ${HEADERS.join(',')}`] };
    }
  }
  const idx = Object.fromEntries(HEADERS.map((h) => [h, headerFields.indexOf(h)])) as Record<(typeof HEADERS)[number], number>;

  for (let lineNum = 1; lineNum < lines.length; lineNum++) {
    if (lines[lineNum].trim() === '') continue;
    const rowNum = lineNum + 1;
    const fields = parseCsvLine(lines[lineNum]);
    const get = (i: number) => (fields[i] ?? '').trim();

    const name = get(idx.prebuild_name);
    if (!name) { errors.push(`row ${rowNum}: prebuild_name is required`); continue; }

    const sku = get(idx.item_sku);
    if (!sku) {
      errors.push(`row ${rowNum}: item_sku is required (pre-build items resolve by SKU)`);
      namesWithErrors.add(name.toLowerCase());
      continue;
    }

    const qtyRaw = get(idx.item_qty);
    const qty = Number(qtyRaw);
    // Floor of 0.01: the DB column is numeric(10,2) check (qty > 0), so
    // anything that rounds to 0.00 would blow up mid-import instead of here.
    if (!isFinite(qty) || Math.round(qty * 100) / 100 <= 0) {
      errors.push(`row ${rowNum}: item_qty "${qtyRaw}" must be a number of at least 0.01`);
      namesWithErrors.add(name.toLowerCase());
      continue;
    }

    let pb = byName.get(name.toLowerCase());
    if (!pb) {
      const favRaw = get(idx.is_favourite).toLowerCase();
      pb = {
        name,
        category: get(idx.category) || null,
        subcategory: get(idx.subcategory) || null,
        isFavourite: ['yes', 'true', '1', 'y'].includes(favRaw),
        items: [],
      };
      byName.set(name.toLowerCase(), pb);
    }
    if (pb.items.some((it) => it.sku === sku)) {
      errors.push(`row ${rowNum}: duplicate item ${sku} in "${name}" — combine quantities into one row`);
      namesWithErrors.add(name.toLowerCase());
      continue;
    }
    pb.items.push({ sku, qty, line: rowNum });
  }

  // All-or-nothing per assembly: drop any prebuild that had a bad row.
  for (const key of namesWithErrors) {
    const pb = byName.get(key);
    if (pb !== undefined) {
      byName.delete(key);
      errors.push(`"${pb.name}" skipped entirely — fix its invalid row(s) above and re-upload (partial assemblies are never imported)`);
    }
  }

  return { prebuilds: [...byName.values()], errors };
}

// ---------------------------------------------------------------------------
// Planner — pure. A pre-build only imports when EVERY item SKU resolves
// (a partial assembly would silently misprice every quote that uses it).
// ---------------------------------------------------------------------------

export interface ExistingPrebuildLite {
  id: string;
  name: string;
}

export interface MaterialSkuLite {
  id: string;
  sku: string | null;
}

export interface PrebuildImportPlan {
  creates: Array<{ prebuild: CsvPrebuild; items: Array<{ materialId: string; qty: number }> }>;
  skips: Array<{ name: string; reason: string }>;
  /** Flattened missing-SKU list for display (file line numbers included). */
  missingSkus: Array<{ prebuild: string; sku: string; line: number }>;
}

export function planPrebuildImport(
  existing: ExistingPrebuildLite[],
  materials: MaterialSkuLite[],
  prebuilds: CsvPrebuild[],
): PrebuildImportPlan {
  const creates: PrebuildImportPlan['creates'] = [];
  const skips: PrebuildImportPlan['skips'] = [];
  const missingSkus: PrebuildImportPlan['missingSkus'] = [];

  const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));
  const materialBySku = new Map<string, string>();
  for (const m of materials) {
    if (m.sku !== null && m.sku !== '') materialBySku.set(m.sku, m.id);
  }

  for (const pb of prebuilds) {
    if (existingNames.has(pb.name.toLowerCase())) {
      skips.push({ name: pb.name, reason: 'a pre-build with this name already exists — rename it in the file or delete the old one first' });
      continue;
    }
    const missing = pb.items.filter((it) => !materialBySku.has(it.sku));
    if (missing.length > 0) {
      for (const it of missing) missingSkus.push({ prebuild: pb.name, sku: it.sku, line: it.line });
      skips.push({
        name: pb.name,
        reason: `missing catalogue SKU${missing.length === 1 ? '' : 's'}: ${missing.map((m) => m.sku).join(', ')} — import the materials CSV first`,
      });
      continue;
    }
    creates.push({
      prebuild: pb,
      items: pb.items.map((it) => ({ materialId: materialBySku.get(it.sku) as string, qty: it.qty })),
    });
  }

  return { creates, skips, missingSkus };
}
