# Parity verification — schema + query

Reference for the parity pipelines that diff trails against Rails:
**schema parity** (`pnpm parity:schema`) and **query parity**
(`pnpm parity:query`). Both are shipped (schema #730–#746; query
#772) and run in CI as label-gated jobs.

This doc is the contract for adding fixtures and bumping the
canonical formats — not a "what to build" plan.

## Principles (apply to both pipelines)

- **Shared input, independent outputs.** Both sides consume the same
  fixture (`schema.sql`, plus `query.rb`/`query.ts` for query parity).
  Each side introspects / runs against a fresh SQLite DB and emits a
  canonical JSON file. A diff job compares the two.
- **Neutral canonical format.** Neither side's native dump is "truth."
  Both lower into a versioned schema so reshapes in
  `dumpSchemaColumns` (`packages/activerecord/src/schema-columns-dump.ts`)
  or `ActiveRecord::SchemaDumper` don't break parity.
- **Separate ruby and node jobs in CI, run in parallel**, joined by a
  diff job that downloads both artifacts.
- **Run all fixtures, never fail-fast.** Diff prints per-fixture
  pass/fail and exits 1 at the end if any failed.

## Locked decisions

| #   | Decision                                     | Value                                                                                                                                                                 |
| --- | -------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| D1  | Column ordering in canonical JSON            | Preserve declaration order (semantic). Indexes + tables sorted by name.                                                                                               |
| D2  | `schema_migrations` / `ar_internal_metadata` | Filter on both sides. Fixtures never declare them.                                                                                                                    |
| D3  | SQLite implicit `sqlite_autoindex_*` indexes | Filter on both sides.                                                                                                                                                 |
| D4  | Canonical type alphabet (v1)                 | Closed set: `string`, `text`, `integer`, `bigint`, `float`, `decimal`, `datetime`, `date`, `time`, `boolean`, `binary`, `json`. Anything else → canonicalizer errors. |
| D5  | Node-side SQLite applier                     | `better-sqlite3` as a root `devDependency`. No new workspace package.                                                                                                 |
| D6  | Fixture sanity manifest                      | Sidecar `expected.json` per fixture: `{ tables: string[], indexCount: number }`. Canonicalizer asserts match — catches silent-drop false negatives.                   |
| D7  | Diff behavior                                | Run all fixtures, per-fixture pass/fail, exit 1 if any failed.                                                                                                        |
| D8  | Local dev                                    | Both toolchains required for full run. `pnpm parity:schema --side=rails\|trails\|diff` runs just one side.                                                            |
| D9  | Canonical format versioning                  | `version: 1` is pinned. Any bump touches: JSON Schema, both canonicalizers, baselines — single PR.                                                                    |
| D10 | Rails pin                                    | `8.0.2` (matches `scripts/api-compare/fetch-rails.sh`).                                                                                                               |

## Canonical formats (v1)

### Schema (`scripts/parity/canonical/schema.schema.json`)

```ts
type CanonicalSchema = {
  version: 1;
  tables: CanonicalTable[]; // sorted by name ASC
};

type CanonicalTable = {
  name: string;
  primaryKey: string | string[] | null;
  columns: CanonicalColumn[]; // declaration order (D1)
  indexes: CanonicalIndex[]; // sorted by name ASC
};

type CanonicalColumn = {
  name: string;
  type: CanonicalType; // closed set (D4)
  null: boolean;
  default: string | number | boolean | null;
  limit: number | null;
  precision: number | null;
  scale: number | null;
};

type CanonicalIndex = {
  name: string;
  columns: string[]; // preserved order
  unique: boolean;
  where: string | null;
};
```

**Deferred from v1** (require version bump): foreign keys, check
constraints, generated/virtual columns, partial-index predicates
beyond simple `WHERE`, collations, default _expressions_
(`CURRENT_TIMESTAMP`), composite-PK edge cases, SQLite `WITHOUT ROWID`.

### Query (`scripts/parity/canonical/query.schema.json`)

```ts
type CanonicalQuery = {
  version: 1;
  fixture: string; // e.g. "arel-01"
  frozenAt: string; // ISO 8601 UTC — both sides freeze time to this
  sql: string; // result of to_sql / toSql()
  paramSql: string; // sql with datetime binds re-inlined; what diff actually compares
  binds: string[]; // datetime-only bind params as ISO 8601 UTC strings; informational, not diffed
};
```

`sql` is the full SQL for a SelectManager, the condition fragment for
a predicate node, or the quoted column reference for an Attribute.

`paramSql` is the load-bearing field for cross-side comparison: trails
emits `BindParam` nodes for non-datetime scalars where Rails inlines
them, so the dump steps re-inline non-datetime binds back into the SQL
string to remove that structural asymmetry.

`binds` carries only datetime-valued bind params (as ISO 8601 strings)
and is informational — explicitly excluded from the diff.

## Directory layout

```
scripts/parity/
  canonical/
    schema.schema.json     query.schema.json
    types.ts               query-types.ts
    README.md
  fixtures/
    01-trivial/            # schema fixtures
      schema.sql
      expected.json
    arel-01/               # query fixtures (also have schema.sql)
      schema.sql
      query.rb             # generated by translate/, then committed
      query.ts
      expected.json
  schema/
    ruby/{Gemfile, dump.rb, canonicalize.rb, canonicalize_test.rb}
    node/{dump.ts, canonicalize.ts, canonicalize.test.ts}
  query/
    ruby/{dump.rb, ar_dump.rb}
    node/{dump.ts, ar_dump.ts}
    diff.ts
  translate/arel.ts        # one-shot fixture generator
  run.ts                   # orchestrator
```

## Adding a new fixture

### Schema fixture

1. Create `scripts/parity/fixtures/NN-name/schema.sql` — pure SQLite
   DDL. No `schema_migrations` / `ar_internal_metadata`.
2. Create `expected.json` listing user-facing tables (alphabetical) and
   the _post-filter_ index count.
3. Run `pnpm parity:schema`. If it fails, the failure is a real
   parsing parity gap in trails — file an issue, fix the
   adapter/dumper, **do not edit the fixture to make the test pass**.
4. SQL features outside v1 canonical (FKs, checks, generated columns)
   can stay in `schema.sql` — both canonicalizers ignore unsupported
   features in v1.

### Query (Arel) fixture

1. Pick the next `arel-NN` slot.
2. Add `schema.sql` (often shared with a schema fixture) and a comment
   header on `query.rb` / `query.ts` describing the expression.
3. Run `tsx scripts/parity/translate/arel.ts --fixture arel-NN` to
   generate `query.rb` and `query.ts` from the Ruby comment via the
   translation map (Ruby Arel → trails camelCase). Review and commit.
4. Add `expected.json` per the schema-fixture rules.
5. Run `pnpm parity:query` — same "fix the code, not the fixture" rule.

#### Translation map (Arel Ruby → trails)

Common cases. Full table in git history of `query-parity-verification.md`
(this doc's predecessor) and verified against `packages/arel/src/`.

| Ruby                                    | TypeScript                                                                        |
| --------------------------------------- | --------------------------------------------------------------------------------- |
| `Arel::Table.new(:foo)`                 | `new Table("foo")`                                                                |
| `tbl[:col]`                             | `tbl.get("col")`                                                                  |
| `tbl[Arel.star]`                        | `tbl.star`                                                                        |
| `node.eq / lt / gt / not_eq / in`       | `node.eq / lt / gt / notEq / in`                                                  |
| `node.matches('%x%')`                   | `node.matches("%x%")`                                                             |
| `~node` (bitwise NOT)                   | `new Nodes.BitwiseNot(node)`                                                      |
| `node & val` / `\|` / `^` / `<<` / `>>` | `node.bitwiseAnd / bitwiseOr / bitwiseXor / bitwiseShiftLeft / bitwiseShiftRight` |
| `node.add / subtract / multiply`        | same camelCase                                                                    |
| `node.count(true)`                      | `node.count(true)` (distinct)                                                     |
| `node.sum / maximum / minimum`          | `node.sum() / maximum() / minimum()`                                              |
| `node.extract('month')`                 | `node.extract("month")`                                                           |
| `node.over(window)`                     | `node.over(window)`                                                               |
| `tbl.project / where / order / take`    | same camelCase                                                                    |
| `mgr.distinct`                          | `mgr.distinct()`                                                                  |
| `tbl.join(other)`                       | `tbl.join(other)`                                                                 |
| `tbl.join(other, OuterJoin)`            | `tbl.join(other, Nodes.OuterJoin)`                                                |
| `mgr.with(:recursive, cte)`             | `mgr.withRecursive(cte)`                                                          |
| `Arel.sql(str)` / `Arel.star`           | `sql(str)` / `star`                                                               |
| `Arel::Nodes::Quoted.new(val)`          | `new Nodes.Quoted(val)`                                                           |
| `Time.now` / `Time.zone.now`            | `new Date(frozenAt)`                                                              |
| `1.week.ago`                            | `new Date(Date.parse(frozenAt) - 7*24*60*60*1000)`                                |

## Time freezing (query parity)

- Orchestrator (`scripts/parity/run.ts`) only forwards `PARITY_FROZEN_AT`
  to both runners via `--frozen-at` if it's already set in the
  environment. If unset, each runner falls back to its built-in
  default frozen timestamp.
- Ruby side: `ActiveSupport::Testing::TimeHelpers#travel_to`.
- Node side (`scripts/parity/query/node/dump.ts`): validates `--frozen-at`
  (must be ISO 8601 UTC with trailing `Z`), resolves `frozenMs`, then
  installs `@sinonjs/fake-timers` with
  `FakeTimers.install({ now: frozenMs, toFake: ["Date"] })`. Uninstalls
  after the query runs.
- The resolved `frozenAt` is written into the canonical output JSON
  for auditability.
- **Override:** export `PARITY_FROZEN_AT=<iso8601>` (or pass
  `--frozen-at` directly to a runner) to pin a specific time.

## Follow-ups (not blocking v1)

1. Widen schema canonical to FKs, checks, generated columns
   (version → 2).
2. PG + MySQL fixture trees (`fixtures/pg/`, `fixtures/mysql/`),
   parameterized dumpers.
3. AR-level query fixtures (`ar-XX`): model auto-generation from
   schema FKs, named scopes, `has_many :through` inference.
4. Replace unified text diff with structural per-table/per-column
   reports if failures get hard to read.
