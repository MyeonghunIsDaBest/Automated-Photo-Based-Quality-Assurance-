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
  unit: string;
  costPrice: number | null;
  sellPrice: number | null;
  tags: string[];
  description: string | null;
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
// ---------------------------------------------------------------------------

const REQUIRED_HEADERS = ['sku', 'name', 'unit', 'cost_price', 'sell_price', 'tags', 'description'];

function parseRow(line: string): string[] {
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

  if (lines.length === 0) {
    errors.push('header: file is empty');
    return { rows, errors };
  }

  // Validate header
  const headerFields = parseRow(lines[0]).map((h) => h.trim().toLowerCase());
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
  };

  // Data rows
  for (let lineNum = 1; lineNum < lines.length; lineNum++) {
    const line = lines[lineNum].trim();
    if (line === '') continue; // blank line — skip silently

    const rowNum = lineNum + 1; // 1-based, header is row 1
    const fields = parseRow(lines[lineNum]);

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

    const tags = rawTags === ''
      ? []
      : rawTags.split('|').map((t) => t.trim()).filter((t) => t !== '');

    rows.push({
      sku: rawSku === '' ? null : rawSku,
      name,
      unit: get(idx.unit) || 'ea',
      costPrice: costResult,
      sellPrice: sellResult,
      tags,
      description: rawDesc === '' ? null : rawDesc,
    });
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Import planner — pure, no network calls
//
// Resolution order per row:
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

  for (const row of rows) {
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

    // Step 3: new material
    adds.push(row);
  }

  return { adds, updates, skips };
}
