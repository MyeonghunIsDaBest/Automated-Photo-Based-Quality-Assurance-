// ─────────────────────────────────────────────────────────────────────────────
// lib/jobs/simproCsv.ts — pure CSV parse + staging-import planner for Simpro jobs.
//
// No Supabase imports. Tested with vitest (single-fork) and called from
// SimproJobsTab.tsx before any network requests.
//
// Tuned to Simpro's "Job List Report" export:
//   row 1 — banner: "Selected Criteria - Job Stage: <Stage>"  (stage lives here)
//   row 2 — header: Job, Due Date, Customer, Telephone, Email, Site, Site Address, Site Suburb
//   row 3+ — data.  The `Job` cell packs "<number> - <description>".
// Quoted fields may contain commas, doubled-quote escapes, AND newlines, so a
// record can span multiple physical lines — the tokeniser is a full RFC4180-ish
// reader over the whole string (not line-by-line). A leading UTF-8 BOM is stripped.
//
// Optional columns (Stage, Contract Value/Total, Type/Category, Job Type) are read
// when present so a future value-bearing export works without code changes.
// ─────────────────────────────────────────────────────────────────────────────

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type SimproStage =
  | 'in_progress'
  | 'pending'
  | 'complete'
  | 'invoiced'
  | 'archived';

export type SimproJobType = 'project' | 'service';

export interface SimproJobRow {
  externalRef: string; // Simpro job number (required)
  description: string | null;
  customerName: string | null;
  telephone: string | null;
  email: string | null;
  siteName: string | null;
  siteAddress: string | null;
  suburb: string | null;
  category: string | null; // not in the Job List Report; read if a future export has it
  jobType: SimproJobType | null; // routing target; null when the CSV leaves it blank
  dueDate: string | null; // 'YYYY-MM-DD'
  stage: SimproStage;
  contractValue: number | null; // AUD ex-GST (null for the Job List Report)
  raw: Record<string, string>; // original row keyed by lowercased header — forward-compat
}

export interface ParseResult {
  rows: SimproJobRow[];
  errors: string[];
}

/** Minimal shape of an already-staged job needed by planSimproImport. */
export interface ExistingStagedRef {
  externalRef: string;
  promoted: boolean;
}

export interface ImportPlan {
  adds: SimproJobRow[]; // new external_ref
  updates: SimproJobRow[]; // already staged — re-import refreshes the staged row
  skips: Array<{ row: SimproJobRow; reason: string }>;
}

// ---------------------------------------------------------------------------
// Stage taxonomy (the 5 Simpro stages) — shared by the parser + the UI tabs.
// ---------------------------------------------------------------------------

export const SIMPRO_STAGES: SimproStage[] = [
  'in_progress',
  'pending',
  'complete',
  'invoiced',
  'archived',
];

export const STAGE_LABEL: Record<SimproStage, string> = {
  in_progress: 'In Progress',
  pending: 'Pending',
  complete: 'Complete',
  invoiced: 'Invoiced',
  archived: 'Archived',
};

// Reference template offered by "Download template" — mirrors the real export
// (banner + header + one example row) so a downloaded-then-re-uploaded file parses.
export const SIMPRO_CSV_TEMPLATE =
  '"Selected Criteria - Job Stage: Progress"\r\n' +
  '"Job","Due Date","Customer","Telephone","Email","Site","Site Address","Site Suburb"\r\n' +
  '"3901 - Solar Installation",,"Eco Sustainable Homes",,,"1313 Mount Dandenong Tourist Road Kalorama","1313 Mount Dandenong Tourist Road","Kalorama"\r\n';

// ---------------------------------------------------------------------------
// CSV tokeniser — RFC4180-ish: quoted fields may hold commas, doubled-quote
// escapes ("") and newlines. Returns records (arrays of raw field strings).
// A leading UTF-8 BOM is stripped.
// ---------------------------------------------------------------------------

function parseCsv(input: string): string[][] {
  let text = input;
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

  const records: string[][] = [];
  let record: string[] = [];
  let field = '';
  let inQuotes = false;
  let dirty = false; // current record/field has seen any content

  const n = text.length;
  for (let i = 0; i < n; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      dirty = true;
    } else if (c === ',') {
      record.push(field);
      field = '';
      dirty = true;
    } else if (c === '\r') {
      // ignore — \n handles the line break
    } else if (c === '\n') {
      record.push(field);
      records.push(record);
      record = [];
      field = '';
      dirty = false;
    } else {
      field += c;
      dirty = true;
    }
  }
  if (dirty || field !== '' || record.length > 0) {
    record.push(field);
    records.push(record);
  }
  return records;
}

// ---------------------------------------------------------------------------
// Field coercion helpers
// ---------------------------------------------------------------------------

function normalizeStage(raw: string): SimproStage | null {
  const k = raw.trim().toLowerCase().replace(/[\s_-]+/g, ' ');
  switch (k) {
    case 'in progress':
    case 'inprogress':
    case 'progress':
      return 'in_progress';
    case 'pending':
    case 'quote':
    case 'to do':
      return 'pending';
    case 'complete':
    case 'completed':
    case 'done':
      return 'complete';
    case 'invoiced':
    case 'invoice':
      return 'invoiced';
    case 'archived':
    case 'archive':
    case 'closed':
      return 'archived';
    default:
      return null;
  }
}

/** Maps a Simpro job-type value to a promote target. Unknown/blank → 'service'
 *  (the lightweight single-task model). */
export function resolveJobType(raw: string | null): SimproJobType {
  const k = (raw ?? '').trim().toLowerCase();
  if (k.startsWith('project')) return 'project';
  return 'service';
}

export type SimproCategory = 'solar' | 'aircon' | 'battery' | 'generator' | 'ev' | 'other';

/** Best-effort category from a job description (the Job List Report has no Type
 *  column). Keyword match, first hit wins; defaults to 'other'. Used for the
 *  Type pill on the Sim-Pro Jobs table. */
export function inferCategory(description: string | null): SimproCategory {
  const d = (description ?? '').toLowerCase();
  if (/\bev\b|ev charger/.test(d)) return 'ev';
  if (/\bsolar\b|\bpv\b|inverter/.test(d)) return 'solar';
  if (/batter/.test(d)) return 'battery';
  if (/\bgenerator\b|\bgenset\b|\bgen\b/.test(d)) return 'generator';
  if (/air[- ]?con|a\/c|\bsplit\b|hvac|heat pump|ducted/.test(d)) return 'aircon';
  return 'other';
}

/** AU dd/mm/yyyy or ISO yyyy-mm-dd → 'YYYY-MM-DD'. Unparseable/blank → null. */
function parseAuDate(raw: string): string | null {
  const t = raw.trim();
  if (t === '') return null;
  let m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(t);
  if (m) return `${m[1]}-${m[2]}-${m[3]}`;
  m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(t);
  if (m) return `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`;
  return null;
}

/** Strips $ , and whitespace, then parses. Blank → null; non-numeric/negative → 'error'. */
function parseMoney(raw: string): number | null | 'error' {
  const trimmed = raw.replace(/[$,\s]/g, '');
  if (trimmed === '') return null;
  const n = Number(trimmed);
  if (!isFinite(n) || n < 0) return 'error';
  return n;
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

export function parseSimproCsv(text: string): ParseResult {
  const rows: SimproJobRow[] = [];
  const errors: string[] = [];

  const records = parseCsv(text).filter(
    (r) => !(r.length === 1 && r[0].trim() === ''),
  );
  if (records.length === 0) {
    errors.push('header: file is empty');
    return { rows, errors };
  }

  // Row 1 may be a "Selected Criteria … Job Stage: X" banner (single cell).
  const first = records[0];
  const isBanner =
    first.length === 1 && /selected criteria|job stage/i.test(first[0]);
  let bannerStage: SimproStage | null = null;
  let headerRow: string[];
  let dataStart: number;
  if (isBanner) {
    const m = /job stage:\s*(.+?)\s*$/i.exec(first[0]);
    if (m) bannerStage = normalizeStage(m[1]);
    headerRow = records[1] ?? [];
    dataStart = 2;
  } else {
    headerRow = first;
    dataStart = 1;
  }

  const headerFields = headerRow.map((h) => h.trim().toLowerCase());
  const col = (...names: string[]): number => {
    for (const name of names) {
      const i = headerFields.indexOf(name);
      if (i >= 0) return i;
    }
    return -1;
  };

  const idx = {
    job: col('job', 'job no', 'job number'),
    due: col('due date', 'due'),
    customer: col('customer', 'client'),
    telephone: col('telephone', 'phone'),
    email: col('email'),
    site: col('site'),
    siteAddress: col('site address'),
    suburb: col('site suburb', 'suburb'),
    stage: col('stage', 'job stage', 'job status'),
    contract: col('contract value', 'total ex', 'total'),
    category: col('type', 'category'),
    jobType: col('job type', 'job_type'),
  };

  if (idx.job < 0) {
    errors.push(
      'header: missing required "Job" column — this should be a Simpro Job List Report export',
    );
    return { rows, errors };
  }
  if (bannerStage === null && idx.stage < 0) {
    errors.push(
      "header: couldn't determine the job stage — expected a \"Selected Criteria … Job Stage\" banner row or a Stage column",
    );
    return { rows, errors };
  }

  for (let r = dataStart; r < records.length; r++) {
    const record = records[r];
    const get = (i: number): string => (i >= 0 && i < record.length ? record[i].trim() : '');
    const rowNum = r + 1; // 1-based record number in the file

    const jobCell = get(idx.job);
    if (jobCell === '') {
      errors.push('row ' + rowNum + ': Job number is blank');
      continue;
    }
    const sep = jobCell.indexOf(' - ');
    const externalRef = sep >= 0 ? jobCell.slice(0, sep).trim() : jobCell;
    const description = sep >= 0 ? jobCell.slice(sep + 3).trim() || null : null;
    if (externalRef === '') {
      errors.push('row ' + rowNum + ': Job number is blank');
      continue;
    }

    let stage = bannerStage;
    if (idx.stage >= 0) {
      const rawStage = get(idx.stage);
      if (rawStage !== '') {
        const s = normalizeStage(rawStage);
        if (s === null) {
          errors.push('row ' + rowNum + ': stage "' + rawStage + '" is not a recognised Simpro stage');
          continue;
        }
        stage = s;
      }
    }
    if (stage === null) {
      errors.push('row ' + rowNum + ': missing stage');
      continue;
    }

    let contractValue: number | null = null;
    if (idx.contract >= 0) {
      const cv = parseMoney(get(idx.contract));
      if (cv === 'error') {
        errors.push('row ' + rowNum + ': contract value "' + get(idx.contract) + '" is not a valid amount');
        continue;
      }
      contractValue = cv;
    }

    const rawJobType = get(idx.jobType);

    const raw: Record<string, string> = {};
    headerFields.forEach((h, i) => {
      raw[h] = (record[i] ?? '').trim();
    });

    rows.push({
      externalRef,
      description,
      customerName: get(idx.customer) || null,
      telephone: get(idx.telephone) || null,
      email: get(idx.email) || null,
      siteName: get(idx.site) || null,
      siteAddress: get(idx.siteAddress) || null,
      suburb: get(idx.suburb) || null,
      category: get(idx.category) || null,
      jobType: rawJobType === '' ? null : resolveJobType(rawJobType),
      dueDate: parseAuDate(get(idx.due)),
      stage,
      contractValue,
      raw,
    });
  }

  return { rows, errors };
}

// ---------------------------------------------------------------------------
// Staging-import planner — pure, no network calls.
//
// Per external_ref: already staged → update (re-import refreshes the row);
// otherwise → add. A second occurrence of the same ref within one upload is
// skipped (first wins) so a self-duplicated export can't double-insert.
// ---------------------------------------------------------------------------

export function planSimproImport(
  existing: ExistingStagedRef[],
  rows: SimproJobRow[],
): ImportPlan {
  const existingRefs = new Set(existing.map((e) => e.externalRef));
  const adds: SimproJobRow[] = [];
  const updates: SimproJobRow[] = [];
  const skips: Array<{ row: SimproJobRow; reason: string }> = [];
  const seen = new Set<string>();

  for (const row of rows) {
    if (seen.has(row.externalRef)) {
      skips.push({
        row,
        reason:
          'duplicate job no. "' + row.externalRef + '" in this upload — first occurrence kept',
      });
      continue;
    }
    seen.add(row.externalRef);

    if (existingRefs.has(row.externalRef)) {
      updates.push(row);
    } else {
      adds.push(row);
    }
  }

  return { adds, updates, skips };
}
