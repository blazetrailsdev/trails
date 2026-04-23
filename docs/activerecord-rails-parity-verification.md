# ActiveRecord ↔ Rails parity verification

Goal: mechanically verify that trails parses and represents database
schemas the same way Rails does, by running both against identical
SQLite inputs and diffing canonical outputs. Designed to grow into
query parity (same-SQL-string checks) later.

This doc is the implementation contract. Each PR section below is
self-contained: a future agent should be able to open the PR without
reading the rest of the document.

---

## Principles

- **Shared input, independent outputs.** Both sides consume the same
  `schema.sql` applied to a fresh SQLite database. Each introspects the
  live DB and emits a canonical JSON file. A final step diffs the two
  JSONs.
- **Neutral canonical format.** Neither side's native dump is "truth."
  Both run a `canonicalize` step that lowers their output into a
  versioned, documented canonical schema. Prevents drift if
  `dumpSchemaColumns`
  (`packages/activerecord/src/schema-columns-dump.ts:63`) or
  `ActiveRecord::SchemaDumper` reshapes its output.
- **Separate ruby and node jobs in CI, run in parallel.** Each uploads
  its canonical JSON as an artifact. A third job downloads both and
  diffs.
- **Start narrow, widen after machinery works.** v0 covers tables +
  columns + indexes on SQLite only.

---

## Locked decisions (override before PR1 or live with them)

| #   | Decision                                     | Value                                                                                                                                                                                                                            |
| --- | -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Column ordering in canonical JSON            | **Preserve declaration order** (order is semantic). Indexes + tables sorted by name.                                                                                                                                             |
| D2  | `schema_migrations` / `ar_internal_metadata` | **Filter** on both sides. Fixtures never declare them.                                                                                                                                                                           |
| D3  | SQLite implicit `sqlite_autoindex_*` indexes | **Filter** on both sides.                                                                                                                                                                                                        |
| D4  | Canonical type alphabet (v1)                 | Closed set: `string`, `text`, `integer`, `bigint`, `float`, `decimal`, `datetime`, `date`, `time`, `boolean`, `binary`, `json`. Anything else → canonicalizer errors out.                                                        |
| D5  | Node-side SQLite applier                     | **`better-sqlite3`** added as a root `devDependency` (root `package.json`). Matches `scripts/api-compare/` / `scripts/test-compare/` pattern; no new workspace package. Keeps fixture application orthogonal to code under test. |
| D6  | Fixture sanity manifest                      | Sidecar `expected.json` per fixture: `{ tables: string[], indexCount: number }`. Canonicalizer asserts match, catches silent-drop false negatives.                                                                               |
| D7  | Diff behavior                                | Run **all** fixtures, print per-fixture pass/fail, exit 1 at end if any failed. Never fail-fast.                                                                                                                                 |
| D8  | Local dev                                    | Require both toolchains for full run. `pnpm parity:schema --side=rails\|trails\|diff` runs just one side.                                                                                                                        |
| D9  | Canonical format versioning                  | `version: 1` is pinned. Any bump requires updating: JSON Schema, both canonicalizers, and any checked-in baselines, in a single PR.                                                                                              |
| D10 | Rails pin                                    | `8.0.2` — matches `scripts/api-compare/fetch-rails.sh:6` (`RAILS_TAG="v8.0.2"`).                                                                                                                                                 |

---

## Canonical format (v1)

Documented by `scripts/parity/canonical/schema.schema.json` (JSON Schema,
draft 2020-12). TS types derived from it live in
`scripts/parity/canonical/types.ts`. Shape:

```ts
type CanonicalSchema = {
  version: 1;
  tables: CanonicalTable[]; // sorted by name ASC
};

type CanonicalTable = {
  name: string;
  primaryKey: string | string[] | null;
  columns: CanonicalColumn[]; // preserved declaration order (D1)
  indexes: CanonicalIndex[]; // sorted by name ASC
};

type CanonicalColumn = {
  name: string;
  type: CanonicalType; // from closed set (D4)
  null: boolean;
  default: string | number | boolean | null;
  limit: number | null;
  precision: number | null;
  scale: number | null;
};

type CanonicalIndex = {
  name: string;
  columns: string[]; // preserved order (order is semantic for composite indexes)
  unique: boolean;
  where: string | null;
};

type CanonicalType =
  | "string"
  | "text"
  | "integer"
  | "bigint"
  | "float"
  | "decimal"
  | "datetime"
  | "date"
  | "time"
  | "boolean"
  | "binary"
  | "json";
```

### Deferred from v1 (will require a version bump)

Foreign keys, check constraints, generated/virtual columns, partial
index predicates beyond a simple `WHERE`, collations, default
_expressions_ (e.g. `CURRENT_TIMESTAMP`), composite PK edge cases,
SQLite `WITHOUT ROWID`.

---

## Directory layout (target state, end of PR6)

```
scripts/parity/
  canonical/
    schema.schema.json
    types.ts
    README.md
  fixtures/
    01-trivial/
      schema.sql
      expected.json
    02-moderate/
      schema.sql
      expected.json
  schema/
    ruby/
      Gemfile
      Gemfile.lock
      dump.rb
      canonicalize.rb
      canonicalize_test.rb
    node/
      dump.ts
      canonicalize.ts
      canonicalize.test.ts
    diff.ts
```

Future `scripts/parity/query/` reuses `fixtures/` by adding sidecar
`models.rb` / `models.ts` / `queries.yml`.

---

# PR plan (6 small PRs)

Order matters; each PR depends on the previous. Branch names suggested;
commit messages follow Conventional Commits.

---

## PR1 — Canonical format spec

**Branch:** `parity-pr1-canonical-spec`
**Scope:** docs + schemas only, zero runtime code.

### Files to add

1. `scripts/parity/canonical/schema.schema.json` — JSON Schema
   (draft 2020-12) encoding the shape in the "Canonical format" section
   above. Top-level `type: "object"` with `version` = const `1`.
   `additionalProperties: false` everywhere. Enums for `type` use the
   closed set from D4.
2. `scripts/parity/canonical/types.ts` — TS interfaces matching the
   schema exactly. Exports `CanonicalSchema`, `CanonicalTable`,
   `CanonicalColumn`, `CanonicalIndex`, `CanonicalType`. No runtime.
3. `scripts/parity/canonical/README.md` — explains:
   - What the format is for.
   - Version bump policy (D9).
   - Closed type alphabet rationale (D4).
   - Sorting + ordering rules (D1).

### Acceptance

- `pnpm exec tsc --noEmit scripts/parity/canonical/types.ts` clean.
- JSON Schema validates with `ajv compile` (add `ajv-cli` as dev-dep if
  not present — check `package.json` first).

### Non-goals

No fixtures, no dumpers, no CI. Pure definition.

---

## PR2 — Fixtures + manifests

**Branch:** `parity-pr2-fixtures`
**Scope:** two fixtures, each with `schema.sql` + `expected.json`.
Hand-written, no tooling.

### Files to add

1. `scripts/parity/fixtures/01-trivial/schema.sql` — one table `users`:
   `id INTEGER PRIMARY KEY`, `email TEXT NOT NULL`, `name TEXT`,
   `score REAL`, `avatar BLOB`, `created_at DATETIME NOT NULL`,
   `active INTEGER NOT NULL DEFAULT 1`. Covers all six SQLite storage
   classes Rails maps to abstract types: integer, text, real, blob,
   datetime, and boolean-as-integer.
2. `scripts/parity/fixtures/01-trivial/expected.json` —
   `{ "tables": ["users"], "indexCount": 0 }`.
3. `scripts/parity/fixtures/02-moderate/schema.sql` — two tables:
   `authors` (PK, `name TEXT NOT NULL UNIQUE`, `bio TEXT`,
   `created_at DATETIME NOT NULL`), `posts` (PK,
   `author_id INTEGER NOT NULL REFERENCES authors(id)`,
   `title TEXT NOT NULL`, `body TEXT`, `published_at DATETIME`,
   `view_count INTEGER NOT NULL DEFAULT 0`), plus one explicit
   `CREATE INDEX idx_posts_published_at ON posts(published_at)`.
   Extra columns beyond the bare minimum provide additional type and
   nullability coverage without complicating the fixture structure.
   v1 canonical does **not** cover FKs (deferred); the FK in SQL is
   kept deliberately so the fixture doesn't need reshaping when v2 adds
   FK support. Both canonicalizers silently ignore FK info in v1.
4. `scripts/parity/fixtures/02-moderate/expected.json` —
   `{ "tables": ["authors", "posts"], "indexCount": 1 }`.
   SQLite creates an implicit `sqlite_autoindex_authors_1` for the `UNIQUE`
   constraint on `authors.name`, but both canonicalizers filter
   `sqlite_autoindex_*` per D3. Only the explicit `idx_posts_published_at`
   survives.

### Acceptance

- `sqlite3 /tmp/p.db < scripts/parity/fixtures/01-trivial/schema.sql`
  succeeds on a fresh DB. Same for `02-moderate`.
- `expected.json` files are valid JSON with both required keys.

### Note

Do **not** include `schema_migrations` / `ar_internal_metadata` in any
`schema.sql`. Both sides filter them from dumps (D2).

### Contract for adding a new fixture (future agents)

1. Create `scripts/parity/fixtures/NN-name/schema.sql` with pure SQLite
   DDL. No `schema_migrations` / `ar_internal_metadata`.
2. Create `scripts/parity/fixtures/NN-name/expected.json` listing the
   user-facing tables (alphabetically) and the _post-filter_ index
   count (autoindexes and internal tables excluded).
3. Run `pnpm parity:schema` locally. If it fails, the failure is a real
   parsing parity gap in trails — file an issue, fix the adapter/
   dumper, do not edit the fixture to make the test pass.
4. If the fixture uses a SQL feature v1 canonical doesn't cover (FKs,
   checks, generated columns, etc.), leave it in the SQL — both
   canonicalizers ignore unsupported features in v1.

---

## PR3 — Node side: dump + canonicalize

**Branch:** `parity-pr3-node-dumper`
**Scope:** node tooling only. No ruby, no diff, no CI.

### Files to add

1. Root `package.json` (`devDependencies`) — add `better-sqlite3`
   (latest 12.x compatible with Node 22). Do **not** create
   `scripts/parity/schema/node/package.json`; this follows the
   `scripts/api-compare/` / `scripts/test-compare/` convention of
   consuming root deps via `pnpm exec tsx` and avoids adding a new
   workspace package to `pnpm-workspace.yaml`.
2. `scripts/parity/schema/node/dump.ts` — CLI:
   ```
   tsx dump.ts <fixture-dir> <out.json>
   ```
   Steps:
   1. Create a temp sqlite file via `node:fs.mkdtempSync`.
   2. Apply `<fixture-dir>/schema.sql` via `better-sqlite3`.
   3. Shell out to `pnpm exec trails-schema-dump --database-url
sqlite:<tempfile>` (bin declared in
      `packages/activerecord/package.json:44`), capture stdout.
   4. Pipe through `canonicalize.ts`.
   5. Validate against `expected.json` (D6): assert the canonical
      `tables[].name` array equals `expected.tables` and the total
      index count matches `expected.indexCount`. If not, error with a
      diagnostic message and exit 2.
   6. Write canonical JSON to `<out.json>`.
3. `scripts/parity/schema/node/canonicalize.ts` — pure function:
   `canonicalize(native: DumpSchemaColumnsOutput): CanonicalSchema`.
   Maps the shape produced by
   `packages/activerecord/src/schema-columns-dump.ts:63` into
   canonical.
   - Filter `schema_migrations`, `ar_internal_metadata` (D2).
   - Filter indexes whose name matches `/^sqlite_autoindex_/` (D3).
   - Sort tables + indexes by name; **preserve column order** (D1).
   - Normalize type strings to the closed set (D4). Throw on unknown
     types with the offending table/column/type in the message.
4. `scripts/parity/schema/node/canonicalize.test.ts` — vitest unit
   tests with **golden fixtures** (hand-written `native → canonical`
   pairs). Cover: sorting, column-order preservation, filter rules,
   unknown-type error.

### Acceptance

- `pnpm --filter @blazetrails/activerecord build` succeeds.
- From repo root:
  `pnpm exec tsx scripts/parity/schema/node/dump.ts
scripts/parity/fixtures/01-trivial /tmp/trails-01.json`
  writes a file that validates against
  `scripts/parity/canonical/schema.schema.json`.
- `pnpm vitest run scripts/parity/schema/node/canonicalize.test.ts`
  green.

### Gotchas

- `trails-schema-dump` is a compiled bin. After any change to
  `packages/activerecord/src/schema-columns-dump.ts` or
  `packages/activerecord/src/bin/trails-schema-dump.ts`, run
  `pnpm --filter @blazetrails/activerecord build` before re-running
  `dump.ts`.
- `better-sqlite3` is a native module; pnpm will rebuild it on install.
  CI cache needs to cover this.

---

## PR4 — Ruby side: dump + canonicalize

**Branch:** `parity-pr4-ruby-dumper`
**Scope:** ruby tooling only. No CI yet.

### Files to add

1. `scripts/parity/schema/ruby/Gemfile` — pins:
   ```ruby
   source "https://rubygems.org"
   gem "activerecord", "8.0.2"  # D10 — no full Rails stack needed
   gem "sqlite3", "~> 2.1"      # matches AR 8.0.2 declared dependency range
   gem "minitest", "~> 5.25"    # canonicalize_test.rb
   ```
   Note: uses `activerecord` directly (not `rails`) — we only need AR
   introspection, not the full framework. Gemfile.lock is generated on
   first `bundle install` (requires network) and should be committed.
2. `scripts/parity/schema/ruby/dump.rb` — CLI:
   `bundle exec ruby dump.rb <fixture-dir> <out.json>`.
   Steps:
   1. Create temp sqlite via `Dir.mktmpdir`.
   2. Apply `schema.sql` via `SQLite3::Database#execute_batch` (raw SQL,
      isolates fixture application from AR under test).
   3. `ActiveRecord::Base.establish_connection(adapter: "sqlite3",
database: tempfile)`.
   4. Introspect via `conn.tables`, `conn.columns(table)`,
      `conn.indexes(table)`, `conn.primary_key(table)` — same data
      AR's type system provides, in declaration order. Direct
      introspection is simpler and more reliable than parsing schema.rb.
   5. Build native dump Hash and pass to `canonicalize.rb`.
   6. Validate against `expected.json` (D6) — same invariant as node
      side. Exit 2 on mismatch.
   7. `File.write(out_json, JSON.pretty_generate(canonical) + "\n")`.
3. `scripts/parity/schema/ruby/canonicalize.rb` —
   `Canonicalize.call(native_dump) => Hash`.
   - Input is a plain Ruby Hash from `dump.rb` (not schema.rb text).
   - Filter `schema_migrations`, `ar_internal_metadata` (D2).
   - Filter `sqlite_autoindex_*` (D3).
   - Map `col.type` AR abstract type symbols (`:integer`, `:text`, etc.)
     to the closed canonical set (D4). Raise on unknown.
   - Output Hash shape exactly matches `CanonicalSchema` (sorted/
     ordered per D1).
4. `scripts/parity/schema/ruby/canonicalize_test.rb` — minitest, golden
   fixtures (hand-written native-dump Hash → canonical Hash pairs).
   Same coverage as the node-side canonicalize tests.

### Acceptance

- From repo root:
  `cd scripts/parity/schema/ruby && bundle install && cd - &&
bundle exec --gemfile scripts/parity/schema/ruby/Gemfile ruby
scripts/parity/schema/ruby/dump.rb
scripts/parity/fixtures/01-trivial /tmp/rails-01.json`
  writes a file that validates against
  `scripts/parity/canonical/schema.schema.json`.
- `bundle exec --gemfile scripts/parity/schema/ruby/Gemfile ruby
scripts/parity/schema/ruby/canonicalize_test.rb` green.

### Gotchas

- Rails creates `ar_internal_metadata` on connect. `conn.tables`
  includes it — filter in both `dump.rb` and `canonicalize.rb` (D2).
- `conn.primary_key` returns `nil`, a `String`, or an `Array` of
  strings — handle all three cases.
- `conn.indexes` on SQLite filters any index whose name starts with
  `"sqlite_"` (Rails source:
  `sqlite3/schema_statements.rb:12` — `next if row["name"].start_with?("sqlite_")`).
  The canonicalizer's `sqlite_autoindex_*` filter (D3) is
  belt-and-suspenders and catches any that slip through.

---

## PR5 — Diff script + `pnpm parity:schema`

**Branch:** `parity-pr5-diff-and-runner`
**Scope:** top-level runner + diff logic. No CI yet.

### Files to add / edit

1. `scripts/parity/schema/diff.ts` — CLI:
   `tsx diff.ts --rails-dir <dir> --trails-dir <dir>`
   - Iterate every `*.json` file present in **both** dirs.
   - For each, load, validate against canonical JSON Schema, then
     `JSON.stringify` with stable key order and produce a unified diff
     via the `diff` npm package.
   - Print per-fixture `PASS` / `FAIL` with the diff below each fail.
   - At the end, print a summary like `3/4 fixtures passed`.
   - Exit 0 only if **all** fixtures passed; else exit 1 (D7).
2. `scripts/parity/run.ts` — top-level runner:
   `tsx scripts/parity/run.ts [--side=rails|trails|diff|all]`
   (default `all`).
   - `rails`: loops fixtures, calls `bundle exec ruby dump.rb` for each,
     writes to `scripts/parity/.out/rails/<fixture>.json`.
   - `trails`: same via `tsx scripts/parity/schema/node/dump.ts`, writes
     to `scripts/parity/.out/trails/<fixture>.json`.
   - `diff`: invokes `diff.ts` with those two directories.
   - `all`: runs rails + trails in parallel (`Promise.all`), then diff.
3. `scripts/parity/.gitignore` — `.out/`.
4. `package.json` (root, `scripts` block starting at
   `package.json:6`) — add:
   ```json
   "parity:schema": "pnpm exec tsx scripts/parity/run.ts"
   ```
   Mirror the `api:compare` / `test:compare` style visible at
   `package.json:21` and `package.json:24`.

### Acceptance

- From repo root on a machine with ruby + bundle + node:
  `pnpm parity:schema` exits 0 once both sides agree on both
  fixtures.
- `pnpm parity:schema --side=trails` runs node side only.
- Intentionally breaking one fixture (e.g. editing
  `02-moderate/schema.sql` to add a column neither canonicalizer knows
  to drop) → diff output clearly names the fixture and column.

### Gotchas

- Use `child_process.spawn` with `stdio: "inherit"` from the runner so
  ruby + trails errors land in the CI log.
- `.out/` must never be committed; verify the `.gitignore` works before
  merging.

---

## PR6 — CI wiring

**Branch:** `parity-pr6-ci`
**Scope:** `.github/workflows/ci.yml` only.

### Changes

Add three jobs to `.github/workflows/ci.yml`. Model structure on the
existing `Rails API/Test Comparison` job at `.github/workflows/ci.yml:295`
(its ruby + pnpm + node setup is exactly what we need). Use
`actions/upload-artifact@v4` and `actions/download-artifact@v4`.

1. Job `schema-parity-rails`:
   - Uses `ruby/setup-ruby@v1` with `ruby-version: "3.3"` and
     `bundler-cache: true` (pointing bundler at
     `scripts/parity/schema/ruby/Gemfile`). Mirror line 308.
   - Runs `pnpm exec tsx scripts/parity/run.ts --side=rails`.
   - Uploads `scripts/parity/.out/rails/` as artifact
     `parity-rails-dumps`.
2. Job `schema-parity-trails`:
   - pnpm + node setup like line 301–307.
   - `pnpm install --frozen-lockfile` + `pnpm build`.
   - Runs `pnpm exec tsx scripts/parity/run.ts --side=trails`.
   - Uploads `scripts/parity/.out/trails/` as artifact
     `parity-trails-dumps`.
3. Job `schema-parity-diff`:
   - `needs: [schema-parity-rails, schema-parity-trails]`.
   - Downloads both artifacts into
     `scripts/parity/.out/rails/` and `scripts/parity/.out/trails/`.
   - Runs `pnpm exec tsx scripts/parity/schema/diff.ts --rails-dir
scripts/parity/.out/rails --trails-dir
scripts/parity/.out/trails`.

All three jobs gated with `if: needs.changes.outputs.docs_only != 'true'`
to match the existing pattern at `.github/workflows/ci.yml:297`.

### Acceptance

- On push, all three jobs run. `schema-parity-rails` and
  `schema-parity-trails` upload non-empty artifacts with one JSON per
  fixture. `schema-parity-diff` downloads both and exits 0.
- Total wall-clock for the three-job chain is under ~3 minutes on a
  cold cache (pnpm + bundler caches warmed thereafter).
- The jobs appear in the same `needs: changes` gate as other parity
  jobs (`.github/workflows/ci.yml:297`), so docs-only PRs skip them.
- Failure-mode verification (do this once, locally on a throwaway
  commit before landing PR6): introduce a one-line regression in
  `scripts/parity/schema/node/canonicalize.ts` that drops `limit` on
  string columns, push, confirm `schema-parity-diff` fails with a
  unified diff naming the affected fixture and column. Revert before
  merging.

---

## Follow-ups (not blocking v1)

1. Widen canonical format to include FKs (bump `version` to `2`).
2. Add PG + MySQL fixture trees (`fixtures/pg/`, `fixtures/mysql/`) and
   parameterize both dumpers by adapter.
3. `scripts/parity/query/` with `models.rb` / `models.ts` / `queries.yml`
   per fixture and a canonical `[{id, sql}]` shape. Reuses the same
   three-job CI pattern.
4. Replace unified text diff with structural per-table/per-column
   reports if failures become hard to read.
