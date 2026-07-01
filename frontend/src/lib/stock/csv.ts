// ─────────────────────────────────────────────────────────────────────────────
// lib/stock/csv.ts — small CSV helpers for the Stock module: a generic browser
// download + a lenient "reference,quantity" parser for bulk stock-takes / reorder
// imports. Mirrors the app's existing inline CSV-export pattern + lib/catalogue/csv.
// ─────────────────────────────────────────────────────────────────────────────

/** Quote a CSV cell (wrap in quotes, double embedded quotes). */
function cell(v: string | number | null | undefined): string {
  return `"${String(v ?? "").replace(/"/g, '""')}"`;
}

/** Build a CSV string + trigger a browser download. */
export function downloadCsv(filename: string, header: string[], rows: (string | number | null | undefined)[][]): void {
  const csv = [header, ...rows].map((r) => r.map(cell).join(",")).join("\r\n");
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : `${filename}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export interface StockCountRow {
  /** SKU or item name to match against the catalogue. */
  ref: string;
  qty: number;
}

export interface StockCountParse {
  rows: StockCountRow[];
  errors: string[];
}

/** Parse a lenient "reference, quantity" CSV (a header row of ref/sku/name +
 *  qty/count/quantity is auto-skipped). Used for bulk stock-take + reorder import.
 *  Returns matched rows + human-readable errors for bad lines. */
export function parseStockCountCsv(text: string): StockCountParse {
  const rows: StockCountRow[] = [];
  const errors: string[] = [];
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  lines.forEach((line, i) => {
    // Split on the FIRST comma only, so item names may contain commas if quoted.
    const cols = line.match(/^\s*("([^"]|"")*"|[^,]*)\s*,\s*(.*)$/);
    const rawRef = cols ? cols[1] : line;
    const rawQty = cols ? cols[3] : "";
    const ref = rawRef.replace(/^"|"$/g, "").replace(/""/g, '"').trim();
    const qty = parseFloat(String(rawQty).replace(/[^0-9.\-]/g, ""));
    // Skip a header row.
    if (i === 0 && /^(ref|sku|name|item)$/i.test(ref)) return;
    if (!ref) { errors.push(`Line ${i + 1}: missing item reference`); return; }
    if (!Number.isFinite(qty)) { errors.push(`Line ${i + 1}: "${ref}" has no valid quantity`); return; }
    rows.push({ ref, qty });
  });
  return { rows, errors };
}
