// Photo-QA contract parity check.
//
// Diffs `frontend/src/lib/ai/contract.ts` against
// `supabase/functions/_shared/contract.ts`. The frontend can't import from
// `supabase/functions/` and Deno can't reach into `frontend/src`, so the two
// files are vendored copies that MUST be byte-identical.
//
// Wired into `prebuild` so a drift fails the build before it ships.

import { readFileSync, existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..', '..');

const FRONTEND = resolve(REPO, 'frontend/src/lib/ai/contract.ts');
const SHARED   = resolve(REPO, 'supabase/functions/_shared/contract.ts');

let exitCode = 0;

function fail(msg) {
  console.error(`✗ contract parity: ${msg}`);
  exitCode = 1;
}

if (!existsSync(FRONTEND)) fail(`missing ${FRONTEND}`);
if (!existsSync(SHARED))   fail(`missing ${SHARED}`);

if (exitCode === 0) {
  // Normalise line endings before comparing — Windows checkouts may store CRLF
  // for the frontend file and LF for the shared file (or vice versa) and that
  // shouldn't fail parity. Trailing-newline differences also normalised.
  const a = readFileSync(FRONTEND, 'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '\n');
  const b = readFileSync(SHARED,   'utf8').replace(/\r\n/g, '\n').replace(/\s+$/, '\n');

  if (a !== b) {
    fail('frontend/src/lib/ai/contract.ts and supabase/functions/_shared/contract.ts have drifted.');
    console.error('');
    console.error('  Both files must be byte-identical.');
    console.error('  Edit one, copy to the other, commit together.');
    console.error('');

    // Tiny line-by-line diff so the failure is actionable.
    const linesA = a.split('\n');
    const linesB = b.split('\n');
    const max = Math.max(linesA.length, linesB.length);
    let shown = 0;
    for (let i = 0; i < max && shown < 8; i++) {
      if (linesA[i] !== linesB[i]) {
        console.error(`  L${i + 1} frontend: ${JSON.stringify(linesA[i] ?? '<eof>')}`);
        console.error(`        shared:   ${JSON.stringify(linesB[i] ?? '<eof>')}`);
        shown += 1;
      }
    }
  } else {
    console.log('✓ contract parity: frontend ↔ supabase/_shared in sync');
  }
}

process.exit(exitCode);
