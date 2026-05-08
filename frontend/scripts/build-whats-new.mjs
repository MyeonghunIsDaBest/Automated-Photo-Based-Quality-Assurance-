#!/usr/bin/env node
// ─────────────────────────────────────────────────────────────────────────────
// build-whats-new.mjs
//
// Generates `frontend/src/data/whats-new.json` from `git log` so the Dashboard
// "What's new?" card always reflects the latest commits without manual
// curation. Runs at `predev` and `prebuild` (see frontend/package.json).
//
// HOW IT WORKS
//   1. Spawn `git log --no-merges -n 30 --name-only --pretty=format:...`
//      from the repo root.
//   2. For each commit, classify by changed files:
//        frontend/   → 'frontend'
//        supabase/   → 'backend'  (Edge Functions + migrations)
//        anything else (root configs, .github, docs) → 'infra'
//      A commit that touches BOTH frontend + supabase reports 'fullstack'.
//      The legacy `/backend` folder was removed in the Phase D readiness
//      pass — Supabase covers everything it used to host.
//   3. Translate the subject to layman terms — strip conventional-commit
//      prefixes ("feat:", "fix:", etc), drop noisy verbs ("push", "wip"),
//      capitalize, end with a period.
//   4. Skip commits that aren't user-facing (chore/test/build/ci unless they
//      touch product code; merge commits; "wip"/"checkpoint" subjects).
//   5. Write JSON sorted newest-first, cap at 12 entries.
//
// FAILURE MODES
//   The script never fails the build. If git is unreachable (CI without
//   `.git`, fresh extract from a tarball, etc.), it writes an empty entries
//   array and an `unavailable: true` flag so the UI can show a friendly
//   fallback.
// ─────────────────────────────────────────────────────────────────────────────

import { execSync } from 'node:child_process';
import { writeFileSync, mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..', '..');
const outFile = resolve(__dirname, '..', 'src', 'data', 'whats-new.json');

const MAX_ENTRIES = 12;
const LOG_LIMIT = 40; // pull a few extra; we'll filter out non-user-facing

// Conventional-commit prefix at start of subject. Captures the type so we
// can map to a "kind".
const CC_PREFIX = /^(feat|fix|chore|refactor|docs|test|build|ci|perf|style|revert)(\([^)]+\))?:\s*/i;

// Subjects that aren't worth surfacing. Match case-insensitively.
const SKIP_PATTERNS = [
  /^merge\b/i,
  /^wip\b/i,
  /^checkpoint\b/i,
  /^typo\b/i,
  /^lint\b/i,
  /^format\b/i,
];

// Words to strip from the front of a subject so the headline reads well.
const NOISY_LEADS = [
  /^push\s+/i,
  /^just\s+/i,
  /^small\s+/i,
  /^minor\s+/i,
];

function classifySurface(filesChanged) {
  let touchesFrontend = false;
  let touchesBackend = false;
  let touchesInfra = false;
  for (const f of filesChanged) {
    if (f.startsWith('frontend/')) touchesFrontend = true;
    else if (f.startsWith('supabase/')) touchesBackend = true;
    else touchesInfra = true;
  }
  if (touchesFrontend && touchesBackend) return 'fullstack';
  if (touchesFrontend) return 'frontend';
  if (touchesBackend) return 'backend';
  return 'infra';
}

function classifyKind(subject) {
  const m = subject.match(CC_PREFIX);
  if (m) {
    const t = m[1].toLowerCase();
    if (t === 'feat') return 'new';
    if (t === 'fix') return 'fix';
    if (t === 'perf') return 'improve';
    if (t === 'refactor') return 'improve';
    if (t === 'revert') return 'fix';
    return 'chore';
  }
  const lower = subject.toLowerCase();
  if (/^(add|new|introduce|ship|launch|implement)\b/.test(lower)) return 'new';
  if (/^(fix|patch|repair|resolve|correct)\b/.test(lower)) return 'fix';
  if (/^(refactor|improve|polish|tune|tidy|clean)\b/.test(lower)) return 'improve';
  if (/^(update|upgrade|bump)\b/.test(lower)) return 'improve';
  return 'change';
}

// Strip noise + conventional prefix; capitalize; end with period.
function laymanise(subject) {
  let s = subject.trim();
  s = s.replace(CC_PREFIX, '');
  for (const re of NOISY_LEADS) s = s.replace(re, '');
  s = s.trim();
  if (!s) return '';
  // Capitalize first letter (preserve the rest as-is, including acronyms).
  s = s.charAt(0).toUpperCase() + s.slice(1);
  // Drop trailing whitespace, collapse internal whitespace, ensure period.
  s = s.replace(/\s+/g, ' ').replace(/[.!]+$/, '');
  return s + '.';
}

function shouldSkip(subject) {
  for (const re of SKIP_PATTERNS) if (re.test(subject)) return true;
  return false;
}

function readGitLog() {
  // Format: marker | hash | iso-date | subject  followed by file list lines
  // until the next marker or EOF.
  const FMT = '__COMMIT__|%h|%cI|%s';
  const cmd = `git log --no-merges -n ${LOG_LIMIT} --name-only --pretty=format:"${FMT}"`;
  let out;
  try {
    out = execSync(cmd, { cwd: repoRoot, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    return null;
  }
  const lines = out.split(/\r?\n/);
  const commits = [];
  let current = null;
  for (const line of lines) {
    if (line.startsWith('__COMMIT__|')) {
      if (current) commits.push(current);
      const [, hash, iso, ...rest] = line.split('|');
      current = {
        id: hash,
        date: iso,
        subject: rest.join('|'), // restore any pipes that were inside the subject
        files: [],
      };
    } else if (line.length > 0 && current) {
      current.files.push(line);
    }
  }
  if (current) commits.push(current);
  return commits;
}

function build() {
  const commits = readGitLog();
  if (!commits) {
    return { generatedAt: new Date().toISOString(), unavailable: true, entries: [] };
  }
  const entries = [];
  for (const c of commits) {
    if (shouldSkip(c.subject)) continue;
    const headline = laymanise(c.subject);
    if (!headline) continue;
    const surface = classifySurface(c.files);
    const kind = classifyKind(c.subject);
    // Suppress chore-like infra commits that don't touch product code.
    if (kind === 'chore' && surface === 'infra') continue;
    entries.push({
      id: c.id,
      date: c.date,
      surface,
      kind,
      headline,
      filesChanged: c.files.length,
    });
    if (entries.length >= MAX_ENTRIES) break;
  }
  return { generatedAt: new Date().toISOString(), entries };
}

function main() {
  const data = build();
  mkdirSync(dirname(outFile), { recursive: true });
  writeFileSync(outFile, JSON.stringify(data, null, 2) + '\n', 'utf8');
  const tag = data.unavailable ? '(unavailable)' : `(${data.entries.length} entries)`;
  // eslint-disable-next-line no-console
  console.log(`[whats-new] wrote ${outFile} ${tag}`);
}

main();
