# Legacy migrations — superseded

These eleven files were the original incremental migration history (`0001` → `0011`). They are **superseded by `../00_init.sql`**, which is one consolidated, idempotent script that builds the entire schema from a clean database.

**Do not run these files.** They reference each other in order, assume specific drift states, and will fail or partially apply against the schema produced by `00_init.sql`. They are kept here so:

- `git blame` / `git log` history of every column, policy, and function survives.
- Anyone reading old commits, PRs, or `claude_build_prog.md` entries can follow the references back to the SQL that was actually run at that time.
- If we ever need to extract a single original definition (e.g. to compare RLS expressions before/after the rework), the source is here.

If you're spinning up a fresh Supabase project, see `../../README.md` — the only step is "paste `00_init.sql` and click Run".
