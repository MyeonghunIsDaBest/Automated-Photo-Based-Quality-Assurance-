// ─────────────────────────────────────────────────────────────────────────────
// lib/catalogue/csv.ts — pure CSV parse + import planner for materials.
//
// No Supabase imports. Intended to be tested with vitest (single-fork) and
// called from ImportTab.tsx before any network requests.
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CsvMaterialRow {
  sku: string | null;
  name: string;
  /** null = blank cell — inserts default to 'ea', updates keep the existing unit. */
  unit: string | null;
  costPrice: number | null;
  sellPrice: number | null;
  tags: string[];
  description: string | null;
  /** Optional columns (P3 import pipeline). null = not provided in the file —
   *  inserts fall back to defaults, updates leave the existing value alone. */
  category: string | null;
  subcategory: string | null;
  isStockItem: boolean | null;
  isFavourite: boolean | null;
}

export interface ParseResult {
  rows: CsvMaterialRow[];
  errors: string[];
}

/** Minimal shape of an existing material needed by planImport. */
export interface ExistingMaterial {
  id: string;
  sku: string | null;
  name: string;
  isActive: boolean;
}

export interface ImportPlan {
  adds: CsvMaterialRow[];
  updates: Array<{ id: string; row: CsvMaterialRow }>;
  skips: Array<{ row: CsvMaterialRow; reason: string }>;
}

// ---------------------------------------------------------------------------
// CSV parser — hand-rolled, handles:
//   • quoted fields with embedded commas
//   • doubled-quote escapes ("" inside a quoted field)
//   • blank lines (skipped)
// Known limitation: newlines INSIDE a quoted field (Excel Alt+Enter) are not
// supported — the record splits and the fragment surfaces as a row error
// (never silent corruption). Strip in-cell newlines before exporting.
// ---------------------------------------------------------------------------

const REQUIRED_HEADERS = ['sku', 'name', 'unit', 'cost_price', 'sell_price', 'tags', 'description'];
// Optional columns — old 7-column files keep working unchanged.
const OPTIONAL_HEADERS = ['category', 'subcategory', 'is_stock_item', 'is_favourite'] as const;

/** Parse one CSV line (quoted fields, doubled-quote escapes). Shared with the
 *  pre-build importer. */
export function parseCsvLine(line: string): string[] {
  const fields: string[] = [];
  let i = 0;
  while (i <= line.length) {
    if (i === line.length) {
      fields.push('');
      break;
    }
    if (line[i] === '"') {
      // Quoted field
      i += 1;
      let field = '';
      while (i < line.length) {
        if (line[i] === '"') {
          if (i + 1 < line.length && line[i + 1] === '"') {
            // Doubled-quote escape
            field += '"';
            i += 2;
          } else {
            // End of quoted field
            i += 1;
            break;
          }
        } else {
          field += line[i];
          i += 1;
        }
      }
      fields.push(field);
      // Skip comma or end
      if (i < line.length && line[i] === ',') {
        i += 1;
      }
    } else {
      // Unquoted field — read until comma or end
      const start = i;
      while (i < line.length && line[i] !== ',') {
        i += 1;
      }
      fields.push(line.slice(start, i));
      if (i < line.length) {
        i += 1; // skip comma
      } else {
        break;
      }
    }
  }
  return fields;
}

/** Lenient boolean for spreadsheet exports: yes/true/1/y — no/false/0/n.
 *  Empty = not provided (null). Anything else is a row error. */
function parseBool(raw: string): boolean | null | 'error' {
  const t = raw.trim().toLowerCase();
  if (t === '') return null;
  if (['yes', 'true', '1', 'y'].includes(t)) return true;
  if (['no', 'false', '0', 'n'].includes(t)) return false;
  return 'error';
}

function parsePrice(raw: string): number | null | 'error' {
  const trimmed = raw.trim();
  if (trimmed === '') return null;
  const n = Number(trimmed);
  // Reject NaN, ±Infinity, and negative values — prices must be finite
  // non-negative numbers.
  if (!isFinite(n) || n < 0) return 'error';
  return n;
}

export function parseMaterialsCsv(text: string): ParseResult {
  const lines = text.split(/\r?\n/);
  const rows: CsvMaterialRow[] = [];
  const errors: string[] = [];

  if (lines.length === 0 || lines[0].trim() === '') {
    errors.push('header: file is empty');
    return { rows, errors };
  }

  // Validate header (strip a UTF-8 BOM — Excel exports start with one)
  const headerLine = lines[0].replace(/^﻿/, '');
  const headerFields = parseCsvLine(headerLine).map((h) => h.trim().toLowerCase());
  for (const required of REQUIRED_HEADERS) {
    if (!headerFields.includes(required)) {
      errors.push("header: missing required column \"" + required + "\" — expected: " + REQUIRED_HEADERS.join(','));
      return { rows, errors };
    }
  }

  const idx = {
    sku: headerFields.indexOf('sku'),
    name: headerFields.indexOf('name'),
    unit: headerFields.indexOf('unit'),
    cost_price: headerFields.indexOf('cost_price'),
    sell_price: headerFields.indexOf('sell_price'),
    tags: headerFields.indexOf('tags'),
    description: headerFields.indexOf('description'),
    // Optional (−1 when the column is absent)
    category: headerFields.indexOf('category'),
    subcategory: headerFields.indexOf('subcategory'),
    is_stock_item: headerFields.indexOf('is_stock_item'),
    is_favourite: headerFields.indexOf('is_favourite'),
  };
  void OPTIONAL_HEADERS; // documented above; indexes resolved individually

  // Data rows
  for (let lineNum = 1; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum].trim();
    if (line === '') continue; // blank line — skip silently

    const rowNum = lineNum + 1; // 1-based, header is row 1
    const fields = parseCsvLine(lines[lineNum]);

    const get = (i: number): string => (fields[i] ?? '').trim();

    const name = get(idx.name);
    if (!name) {
      errors.push("row " + rowNum + ": name is required");
      continue;
    }

    const rawCost = get(idx.cost_price);
    const costResult = parsePrice(rawCost);
    if (costResult === 'error') {
      errors.push("row " + rowNum + ": cost_price \"" + rawCost + "\" is not a valid finite non-negative number");
      continue;
    }

    const rawSell = get(idx.sell_price);
    const sellResult = parsePrice(rawSell);
    if (sellResult === 'error') {
      errors.push("row " + rowNum + ": sell_price \"" + rawSell + "\" is not a valid finite non-negative number");
      continue;
    }

    const rawSku = get(idx.sku);
    const rawTags = get(idx.tags);
    const rawDesc = get(idx.description);

    const rawStock = idx.is_stock_item >= 0 ? get(idx.is_stock_item) : '';
    const stockResult = parseBool(rawStock);
    if (stockResult === 'error') {
      errors.push("row " + rowNum + ": is_stock_item \"" + rawStock + "\" is not yes/no/true/false/1/0");
      continue;
    }
    const rawFav = idx.is_favourite >= 0 ? get(idx.is_favourite) : '';
    const favResult = parseBool(rawFav);
    if (favResult === 'error') {
      errors.push("row " + rowNum + ": is_favourite \"" + rawFav + "\" is not yes/no/true/false/1/0");
      continue;
    }
    const rawCategory = idx.category >= 0 ? get(idx.category) : '';
    const rawSubcategory = idx.subcategory >= 0 ? get(idx.subcategory) : '';

    const tags = rawTags === ''
      ? []
      : rawTags.split('|').map((t) => t.trim()).filter((t) => t !== '');

    rows.push({
      sku: rawSku === '' ? null : rawSku,
      name,
      unit: get(idx.unit) || null,
      costPrice: costResult,
      sellPrice: sellResult,
      tags,
      description: rawDesc === '' ? null : rawDesc,
      category: rawCategory === '' ? null : rawCategory,
      subcategory: rawSubcategory === '' ? null : rawSubcategory,
      isStockItem: stockResult,
      isFavourite: favResult,
    });
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Import planner — pure, no network calls
//
// Resolution order per row:
//   0. Same SKU (or, for sku-less adds, same name) seen EARLIER IN THIS FILE
//      → skip (a duplicate sku would trip the DB unique index and sink the
//      whole insert chunk it lands in)
//   1. SKU present and matches existing SKU (case-sensitive) → update
//   2. No SKU match; active-name match (case-insensitive) → skip with reason
//   3. Neither → add
// ---------------------------------------------------------------------------

export function planImport(existing: ExistingMaterial[], rows: CsvMaterialRow[]): ImportPlan {
  const adds: CsvMaterialRow[] = [];
  const updates: Array<{ id: string; row: CsvMaterialRow }> = [];
  const skips: Array<{ row: CsvMaterialRow; reason: string }> = [];

  // Build lookup maps for efficiency
  const bySkuMap = new Map<string, ExistingMaterial>();
  const byNameMap = new Map<string, ExistingMaterial>();

  for (const m of existing) {
    if (m.sku !== null) {
      bySkuMap.set(m.sku, m);
    }
    if (m.isActive) {
      byNameMap.set(m.name.toLowerCase(), m);
    }
  }

  // Duplicates WITHIN the file: first occurrence wins, later ones skip.
  const seenSkus = new Set<string>();
  const seenAddNames = new Set<string>();

  for (const row of rows) {
    // Step 0: duplicate sku earlier in this same file
    if (row.sku !== null) {
      if (seenSkus.has(row.sku)) {
        skips.push({ row, reason: "sku \"" + row.sku + "\" appears earlier in this file — combine the rows into one" });
        continue;
      }
      seenSkus.add(row.sku);
    }

    // Step 1: exact SKU match
    if (row.sku !== null) {
      const match = bySkuMap.get(row.sku);
      if (match !== undefined) {
        updates.push({ id: match.id, row });
        continue;
      }
    }

    // Step 2: case-insensitive active name match
    const nameMatch = byNameMap.get(row.name.toLowerCase());
    if (nameMatch !== undefined) {
      skips.push({ row, reason: "name \"" + nameMatch.name + "\" already exists as an active material — update by matching on sku instead" });
      continue;
    }

    // Step 0b (sku-less adds only): duplicate name earlier in this file
    if (row.sku === null && seenAddNames.has(row.name.toLowerCase())) {
      skips.push({ row, reason: "name \"" + row.name + "\" appears earlier in this file — combine the rows into one" });
      continue;
    }

    // Step 3: new material
    seenAddNames.add(row.name.toLowerCase());
    adds.push(row);
  }

  return { adds, updates, skips };
}
