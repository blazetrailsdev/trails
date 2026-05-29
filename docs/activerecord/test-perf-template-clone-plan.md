# AR test perf — canonical schema as a clonable template (Option 2)

> **Status (2026-05-28):** Proposal / spike not yet started.
>
> Supersedes the `isolate: false` approach, which was measured to be a
> **no-op** in this repo's vitest 3.2.4 + forks pool. See "Why not
> `isolate: false`" below for the data.

## Problem

Every `.test.ts` file in the `activerecord` project rebuilds the canonical
fixture schema from scratch. With vitest `isolate: true` (the default), the
module graph is reloaded per file, so `bootstrapTestHandler` + the D-Y
canonical preload (`defineSchema(TEST_SCHEMA)` in `test-setup-dy.ts`) run once
**per file** — hundreds of `CREATE TABLE` statements each time. On MariaDB at
~30ms/CREATE this dominates wall-clock; it's the reason `hookTimeout` is
bumped to 30s.

The win we want: pay the canonical DDL **once for the whole run**, then have
each worker start from a pre-built schema.

## Why not `isolate: false`

Measured empirically (probe = module-level counter in an imported module,
counting evaluations across N files):

| Config                                       | 6 files → module evals | Shares state?             |
| -------------------------------------------- | ---------------------- | ------------------------- |
| `isolate: false`, forks, maxForks=2          | 6                      | No                        |
| `--no-isolate`, threads                      | (per-file)             | No                        |
| `--isolate` (baseline)                       | (per-file)             | No — identical to `false` |
| `singleFork`/`singleThread` + `--no-isolate` | 1                      | **Yes**, but serial       |

`isolate: false` alone reloads the full module graph per test file in vitest
3.2.4's forks pool — it does **not** share `schemaCache`, the handler, or the
warm `:memory:` DB. Only `singleFork`/`singleThread` truly shares, and that
serializes every file into one process: measured **33.3s vs 14.1s** on the
associations directory (2.4× slower) because it throws away file-level
parallelism and the per-fork-DB model. Dead end.

## What Rails does (parity anchor)

Rails builds the schema **once** via `db:test:prepare`
(`vendor/rails/activerecord/lib/active_record/railties/databases.rake`), then
every forked test process runs against that already-prepared DB. The schema
is not re-created per test file. Option 2 is the JS analog: build a template
once in `globalSetup`, clone it cheaply per worker.

## Design

### Phase 0 — sqlite spike (this prototype)

Smallest end-to-end proof on the sqlite3 adapter only. Acceptance: canonical
DDL runs once for the whole vitest invocation; each worker starts warm;
associations-directory wall-clock drops vs the current per-file baseline;
no test regressions.

1. **`globalSetup` builds the template.** Add a `globalSetup` entry to the
   `activerecord` project in `vitest.config.ts`. It runs once before any
   worker. It opens a sqlite connection to a **file** template
   (`<tmp>/ar-test-template.sqlite`), runs `defineSchema(TEST_SCHEMA)` against
   it, closes it. Use the async fs-adapter
   (`@blazetrails/activesupport/fs-adapter`) — **no `node:fs`** (hard rule).
   The template path is passed to workers via an env var the config sets
   (e.g. `AR_TEST_TEMPLATE_PATH`), since `globalSetup` and setup files don't
   share module state.

2. **Workers clone instead of `CREATE`.** In `test-setup-dy.ts` (or a helper
   it calls), when `AR_TEST_TEMPLATE_PATH` is set and the adapter is sqlite,
   **copy the template file** to a per-worker path and open _that_ as the
   worker DB, rather than re-running the `:memory:` establish-connection plus
   `defineSchema(TEST_SCHEMA)` preload. File copy is async-fs. The schema
   arrives pre-built; `schemaCache` warms on first `dataSourceExists` as today.
   - Open question: keep per-worker DB **on disk** (simplest, clone = file
     copy) vs restore into `:memory:` via the sqlite backup API. Disk is the
     spike default; measure whether `:memory:` is worth the extra plumbing.

3. **Leave `isolate: true`.** No cross-file state sharing — the entire
   module-leak hazard class (the `let _foo` / `_modelsByName` / duplicate
   `class Foo extends Base` concerns from the `isolate: false` audit) is
   avoided. Per-file isolation behaves exactly as today.

4. **Global `beforeEach` reset is untouched.** `test-setup-ar.ts` continues
   to reset shared adapter state per test. No dependency on the sibling
   opt-in-global-drop PR — nothing is shared across files.

5. **Teardown.** `globalSetup` returns a teardown fn that unlinks the template
   file (async-fs). Per-worker clones live in tmp and are cleaned on process
   exit (reuse the existing `process.on("exit")` pattern already in
   `test-setup-worker-db.ts`, or an fs-adapter unlink in a worker teardown).

### Measurement protocol

Run on a quiet machine, same `TRAILS_TEST_FORKS`, three times each, report
median:

```
time pnpm vitest run packages/activerecord/src/associations/   # baseline (main)
time pnpm vitest run packages/activerecord/src/associations/   # spike branch
```

Capture: total duration, `setup` aggregate, `tests` aggregate. The spike wins
if `setup` aggregate collapses (canonical DDL gone from per-file cost) without
regressing `tests` or total. Baseline reference already captured: associations
dir = **14.1s**, setup aggregate **~208s**.

### Phases beyond the spike (not in scope for the prototype)

- **Phase 1 — PG.** `CREATE DATABASE slot_n TEMPLATE ar_test_template`.
  Requires no active connections to the template at clone time; fits the
  advisory-slot model in `test-setup-worker-db.ts`. globalSetup creates the
  template DB; each slot clones from it.
- **Phase 2 — MariaDB.** No template-DB primitive. Options: `mysqldump`
  schema-only + replay, or DDL replay from a cached statement list. Spike
  separately — the win here is smallest and may not beat per-fork DDL; if it
  doesn't, MariaDB keeps the current per-worker preload and only sqlite/PG
  adopt the template path. **Measure before committing.**

## Bespoke-schema caveat (must document, don't silently cap)

The template only covers `TEST_SCHEMA` (the canonical set). Test files that
call `defineSchema(...)` with tables **beyond** canonical still pay
incremental DDL for those extras — the additive fast-path
(`schemaCache.dataSourceExists` short-circuit) already handles the canonical
overlap, so only the genuinely-new tables cost. This is the bulk-win case,
not full coverage. Note it in the spike writeup; do not claim "DDL eliminated."

## Risks / open questions

- **fs-adapter on the hot path.** Template copy per worker is N file copies at
  startup. Cheap vs hundreds of CREATEs, but confirm the async-fs copy isn't
  itself a bottleneck on CI's disk. Measure.
- **sqlite file vs `:memory:` semantics.** Some tests may assume `:memory:`
  (e.g. isolation, or pragmas). There is no `describeIfSqlite` helper (sqlite
  is the default adapter, so sqlite paths aren't gated); audit the concrete
  targets instead — the `":memory:"` string literals (~55 files) and the
  sqlite adapter suites under `adapters/sqlite3/**` and
  `connection-adapters/sqlite3-*.test.ts` — before switching the worker DB to
  a file. The spike must run those sqlite suites green.
- **globalSetup ↔ worker env handoff.** `globalSetup` can't share module
  state with setup files; the template path must travel via env or a known
  tmp location. Confirm vitest propagates env set in `globalSetup` to forked
  workers (it does for `process.env` mutations in the config module; verify
  for globalSetup specifically — may need to write the path to a fixed tmp
  filename instead).
- **Concurrent local worktrees.** Multiple agents running the suite share
  `<tmp>`. The advisory slot is **not** unique across invocations — two
  separate runs each claim slot 1 and would collide on the same path. Paths
  must include a **per-run token** (e.g. a `Date.now()`/`Math.random()` value
  stamped once in `globalSetup` and propagated to workers), with the advisory
  slot only as an additional per-worker suffix. `Date.now()`/`Math.random()`
  are fine here since this is test infra, not a workflow script.

## Acceptance for the prototype PR

- `globalSetup` builds the sqlite template once; verified via a probe that the
  canonical DDL runs exactly once for a multi-file run.
- Workers clone the template; `defineSchema(TEST_SCHEMA)` no longer issues
  CREATEs per file on sqlite.
- `isolate: true` unchanged; no module-leak hazards introduced.
- `adapters/sqlite3/**` + a representative cross-section run green.
- Before/after wall-clock + setup-aggregate numbers in the PR body.
- PG/MariaDB paths untouched (they keep the current per-worker preload until
  their own phases land).

## What NOT to do

- Do **not** ship `isolate: false` — measured no-op (see above).
- Do **not** use `singleFork`/`singleThread` — measured 2.4× regression.
- Do **not** touch the global `beforeEach` opt-in/opt-out logic — sibling PR
  owns it; Option 2 doesn't need it.
- Do **not** use `node:*` / `process.*` fs APIs — async fs-adapter only.
