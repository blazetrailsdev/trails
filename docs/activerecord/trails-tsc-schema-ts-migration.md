# Migrate `trails-tsc` to `schema.ts`, then drop `trails-schema-dump`

**Status:** proposed
**Owner:** activerecord-cli
**Related:** PR #2759 (wired up `ar db:schema:dump`)

## Goal

Make `trails-tsc --schema` consume the Rails-style schema snapshot
`db/schema.ts` (produced by `ar db:schema:dump` / `DatabaseTasks.dumpSchema`
via `SchemaDumper`) **directly**, then delete the now-redundant
`trails-schema-dump` bin and its JSON artifact (`db/schema-columns.json`).

After this, a project keeps exactly **one** committed schema artifact —
`db/schema.ts`, the same file Rails apps commit as `db/schema.rb` — and the
type-virtualization typechecker reads column types from it. No second dump
tool, no second file, no second "re-run after each migration" step.

## Why

`trails-schema-dump` and `ar db:schema:dump` are today two _different_ dumpers
emitting two _different_ artifacts from the same database:

| Tool                 | Output                   | Shape                                                   | Consumed by                                         |
| -------------------- | ------------------------ | ------------------------------------------------------- | --------------------------------------------------- |
| `trails-schema-dump` | `db/schema-columns.json` | `{ table: { col: { type, null, arrayElementType? } } }` | `trails-tsc --schema` (zero-declare virtualization) |
| `ar db:schema:dump`  | `db/schema.ts`           | `defineSchema(ctx)` with `ctx.createTable(...)` DSL     | `ar db:schema:load` (rebuild DB)                    |

Both require a live DB connection at dump time and both must be re-run after
every migration. `schema.ts` is a strict superset of the column-type
information in `schema-columns.json` (it carries type, nullability, array
element type, plus much more). So the JSON file and its dedicated tool are
redundant once `trails-tsc` can parse `schema.ts`.

Bonus: parsing the committed `schema.ts` is a **static** operation — no DB
connection needed at typecheck time, unlike the implicit "you must have run
`trails-schema-dump` against a live DB" contract today. The type info is
already baked into the file `db:schema:dump` commits.

## Current state (what reads what)

`trails-tsc --schema <path>` (`packages/activerecord-cli/src/tsc-wrapper/cli.ts`):

- `loadSchemaColumns(args)` reads the `--schema` file, `JSON.parse`s it, and
  returns `schemaColumnsByTable: Record<string, Record<string, DumpColumnSchema>>`.
- That map is threaded into `virtualize(text, path, { schemaColumnsByTable })`
  (and `synthesize`), which injects `declare` members for schema-only columns.
- `DumpColumnSchema = { type: string; null: boolean; arrayElementType?: string }`
  — Rails type string, nullability, optional array element type.

`schema.ts` (emitted by `SchemaDumper`, `packages/activerecord/src/schema-dumper.ts`):

```ts
import type { MigrationContext } from "@blazetrails/activerecord";

export default async function defineSchema(ctx: MigrationContext) {
  await ctx.createTable("users", { force: "cascade" }, (t) => {
    t.string("name", { null: false });
    t.integer("age");
    t.datetime("created_at", { null: false });
    t.datetime("updated_at", { null: false });
  });
}
```

Column-line forms the parser must handle (all emitted by `SchemaDumper`):

- `t.<dslType>("col", { ...colspec })` — the common case. `dslType` is the
  Rails type name (`string`, `integer`, `datetime`, `boolean`, `text`, …).
- Nullability: a column is **nullable unless** `null: false` is present
  (`schema-dumper.ts:946` only emits `null: false`). This matches the JSON
  dumper's `null: true`-when-no-NOT-NULL semantics.
- Arrays: `{ array: true }` in the colspec; the element's Rails type is
  `dslType`. Maps to `DumpColumnSchema.arrayElementType`.
- `t.enum("col", { enum_type: "...", ... })` — PG enums. Treat as `string`
  for TS purposes (parity with today's resolution).
- `t.column("col", "<sqlType>", { ... })` — generic fallback for exotic SQL
  types. We only have the raw SQL type string here, so resolution may degrade
  to `unknown` (see Known limitations).
- The implicit primary-key column. `createTable`'s options object carries the
  PK (`id`, `primaryKey`, composite `primaryKey: [...]`, or `id: false`).
  `schema-columns.json` includes `id` because it introspects every DB column,
  so the parser **must synthesize** the PK column(s) from `createTable`
  options to keep parity. This is the subtlest part of the port.

## Design

Add a static `schema.ts` parser to `trails-tsc` that produces the same
`schemaColumnsByTable` map `loadSchemaColumns` returns today, so nothing
downstream of `loadSchemaColumns` changes.

**Parser approach: TypeScript Compiler API (AST), not execution.** `trails-tsc`
and the virtualizer already operate on the TS AST; reuse that. Parsing avoids
importing/evaluating `schema.ts` (which would pull in `@blazetrails/activerecord`
and want a connection). Walk the `defineSchema` body:

1. Find each `ctx.createTable(<nameLiteral>, <optionsObj?>, <arrow>)` call.
2. From `<optionsObj>`, synthesize the PK column(s) unless `id: false`.
3. Walk `<arrow>`'s body statements: each `t.<method>(<nameLiteral>, <optsObj?>)`
   call → one column. Map `<method>` → Rails type; read `null`/`array` from
   `<optsObj>`; for `t.column`, read the 2nd arg SQL-type literal.
4. Emit `{ table: { col: { type, null, arrayElementType? } } }`.

The Rails-type → TS-type mapping already lives in `virtualize.ts` and is
unchanged — the parser emits Rails type _strings_, exactly like the JSON
dumper does today.

**`--schema` dispatch.** Detect by extension: `.ts`/`.js` → AST parser; `.json`
→ existing `JSON.parse` path. Keep the JSON branch through one release as a
deprecation shim (warn once), or drop it in the same breaking change — see
open question Q1.

## Work breakdown (sized, sibling PRs off `main`)

Per repo convention these are **non-overlapping sibling PRs**, not a stack.

### PR A — schema.ts parser in activerecord-cli (~220 LOC, impl + unit tests)

- New `packages/activerecord-cli/src/tsc-wrapper/schema-ts-parser.ts`:
  `parseSchemaTs(source: string, filePath: string): SchemaColumnsByTable`.
- Pure TS-AST parse; no DB, no import of the schema module.
- Unit tests covering: basic columns, `null: false`, arrays, `t.enum`,
  `t.column` fallback, PK synthesis (`id`, `id: false`, composite
  `primaryKey: [...]`), `t.timestamps`-expanded datetime columns, multiple
  tables. Fixtures are inline `schema.ts` strings.
- **No wiring yet** — ships the parser standalone behind its export so it can
  be reviewed in isolation.

### PR B — wire `--schema *.ts` into trails-tsc (~120 LOC)

- `loadSchemaColumns`: dispatch on file extension; `.ts`/`.js` → `parseSchemaTs`,
  `.json` → existing path.
- Smoke test through the real `trails-tsc` virtualize path with a `.ts` schema
  (extend `tsc-wrapper/cli.test.ts`).
- Decide JSON deprecation per Q1.

### PR C — migrate consumers + docs (~80 LOC, mostly deletions/doc)

- `examples/twitter-clone`: `typecheck` script `--schema db/schema-columns.json`
  → `--schema db/schema.ts`; `db:schema:dump` npm script (currently aliases
  `trails-schema-dump --out db/schema-columns.json`) → `ar db:schema:dump`;
  update example README table + prose.
- Root `README.md` (lines ~50-70): replace the `trails-schema-dump` quickstart
  with `ar db:schema:dump` + `--schema db/schema.ts`.
- `scripts/parity/canonical/README.md`, `docs/activerecord/standalone-activerecord-cli-proposal.md`:
  update references.

### PR D — delete `trails-schema-dump` (~120 LOC deletions)

Gated on A–C merged so nothing is left pointing at the removed bin.

- Remove bin: `package.json` `"trails-schema-dump"` entry,
  `src/bin/trails-schema-dump.ts`, `src/bin/trails-schema-dump-bin.ts`.
- Remove the `ar schema:dump` CLI subcommand + `runSchemaDump` import/wiring
  in `cli.ts` (and help/usage text). Note: keep `ar models:dump` — separate
  tool, unaffected.
- Remove `cli.test.ts` / `delegate.test.ts` cases that exercise `schema:dump`
  / the bin delegate.
- Decide `dumpSchemaColumns` + `schema-columns-dump.ts` in `@blazetrails/activerecord`
  per Q2 (only remaining references are a doc-comment in `virtualize.ts` and
  the `index.ts` export). If nothing else consumes it, delete it and its test;
  otherwise keep and mark `@internal`.

## Known limitations / edges to verify

- **Exotic `t.column("c", "<sqlType>")` types.** The JSON dumper resolved these
  via `sqlTypeMetadata` to a Rails type; from `schema.ts` we have only the raw
  SQL type string. Parser should map the well-known ones and fall back to
  `unknown` (current behavior for unrecognized types). Confirm no canonical
  fixture regresses in the parity suite.
- **PK parity.** Verify the synthesized `id` column's type/nullability matches
  what `schema-columns.json` previously emitted for the same DB (bigint vs
  integer per adapter; `id: false` tables get no synthesized column).
- **`t.timestamps()`** — `SchemaDumper` does _not_ emit `t.timestamps()` (the
  string never appears in `schema-dumper.ts`); it expands to explicit
  `t.datetime("created_at", …)` / `t.datetime("updated_at", …)` lines, which
  the parser handles for free. No special-casing needed — but keep a fixture
  proving timestamp columns resolve to `datetime`.
- **`force: "cascade"` / table options** are irrelevant to column types —
  parser ignores all `createTable` options except PK-related ones.

## Open questions

- **Q1 — JSON back-compat:** drop `--schema *.json` in the same release, or
  keep it for one deprecation cycle with a warning? Recommendation: keep a
  thin warn-once shim through one minor, since external `package.json`
  typecheck scripts reference it.
- **Q2 — `dumpSchemaColumns`/`schema-columns-dump.ts`:** delete with the bin
  (no remaining runtime consumer) or retain as `@internal`? Recommendation:
  delete — `schema.ts` is now the single source and keeping a dead second
  dumper invites drift.

## Acceptance

- `trails-tsc --schema db/schema.ts --noEmit` produces identical virtualized
  declares to today's `--schema db/schema-columns.json` for the twitter-clone
  example and the canonical parity fixtures.
- No remaining reference to `trails-schema-dump` or `schema-columns.json` in
  source, bins, docs, or examples (grep-clean).
- `examples/twitter-clone` typechecks green off `db/schema.ts` alone.
