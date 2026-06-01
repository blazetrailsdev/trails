# Migrate `trails-models-dump` to consume `schema.ts`

**Status:** proposed
**Owner:** activerecord-cli
**Related:** PR #2759 (wired up `ar db:schema:dump`), PR #2761 (parseSchemaTs — PR A), companion plan `trails-tsc-schema-ts-migration.md`

## Goal

Make `trails-models-dump` derive its model output from the committed
`db/schema.ts` snapshot (read via `parseSchemaTs` + new parser extension)
**instead of** connecting to a live database at generation time.

After this migration, bare-AR users have **one committed artifact** —
`db/schema.ts` — that drives both type-checking (`trails-tsc`) and model
code generation (`trails-models-dump`). No live DB needed for either tool
after the initial dump.

## Why

`trails-models-dump` today opens a live database connection, calls
`introspectTables` once, then runs three parallel queries per table
(`introspectPrimaryKey`, `introspectColumns`, `introspectForeignKeys`), and
builds `IntrospectedTable[]` from the results. That works, but it creates a
non-trivial operational coupling: every `ar models:dump` invocation requires
a reachable DB with correct credentials. In CI, in offline dev, and on a
new machine clone, that means extra setup before codegen can run.

The Rails analogy is instructive: Rails' `rails generate model` derives
attribute hints from `db/schema.rb` — the _committed_ schema snapshot — not
by running `DESCRIBE` queries at generate time. The schema file is already
the source of truth the team version-controls; generators read it. Trails
should work the same way once `db/schema.ts` exists.

Concrete wins:

- **No DB connection at generation time.** `ar models:dump --schema db/schema.ts`
  is a pure file read + codegen — works offline, in containers without a
  running DB, in CI before `db:create`.
- **Deterministic output.** Generated model files are a function of the
  committed schema, not of live DB state that may differ between machines.
- **One schema artifact.** `db/schema.ts` already drives `db:schema:load`,
  typecheck via `trails-tsc`, and DB reset/setup. Model codegen joins the
  same pipeline.

## Current state

### What `trails-models-dump` does today

`packages/activerecord-cli/src/bin/trails-models-dump.ts`:

1. Requires `--database-url` or `$DATABASE_URL`.
2. Calls `Base.establishConnection(url)` to open the connection pool.
3. Calls `introspectTables(adapter)` → list of table names.
4. For each table, runs three parallel queries: `introspectPrimaryKey`,
   `introspectColumns`, `introspectForeignKeys`.
5. Assembles `IntrospectedTable[]` (from `@blazetrails/activerecord`):
   ```ts
   interface IntrospectedTable {
     name: string;
     primaryKey: string | string[] | null; // column name(s)
     foreignKeys: ForeignKeyDefinition[];
     columns: { name: string; type: string }[];
   }
   ```
6. Passes to `generateModels(introspected, opts)` which is a pure code
   generator (no DB, no I/O).

The DB-facing half (steps 1–5) is the migration target. `generateModels`
is already clean and reusable.

### What `parseSchemaTs` provides today

`packages/activerecord-cli/src/tsc-wrapper/schema-ts-parser.ts` (PR A,
#2761):

```ts
function parseSchemaTs(source: string, filePath: string): SchemaColumnsByTable;
// SchemaColumnsByTable = Record<string, Record<string, DumpColumnSchema>>
// DumpColumnSchema = { type: string; null: boolean; arrayElementType?: string }
```

Parses `createTable` blocks via TypeScript AST. Returns column name → column
schema. The implicit `id` PK column is **synthesized into the column map**.
Does **not** expose PK column names as a separate field. Does **not** parse
`addForeignKey` calls at all.

### The gap

| `generateModels` needs                      | `parseSchemaTs` provides                                                                                                                                                                  |
| ------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `name: string`                              | ✓ (map key)                                                                                                                                                                               |
| `primaryKey: string \| string[] \| null`    | ✗ — PK is synthesized into the column map, not exposed as its own field; composite PK column names are lost (`synthesizePk` returns the string `"composite"` without capturing the array) |
| `foreignKeys: ForeignKeyDefinition[]`       | ✗ — `addForeignKey` calls are not parsed                                                                                                                                                  |
| `columns: { name: string; type: string }[]` | ✓ (partial — `DumpColumnSchema` has `type` but also `null`/`arrayElementType`; `name` is available as the map key)                                                                        |

## What `schema.ts` contains that covers the gap

`SchemaDumper` emits:

**Inside `createTable` options:**

- Default PK (`id bigint`): no option emitted — must synthesize.
- UUID PK: `{ id: "uuid" }`.
- No PK: `{ id: false }`.
- Composite PK: `{ primaryKey: ["col_a", "col_b"], id: false }` — column
  names are available as string literals in the array.

**`addForeignKey` calls** (outside `createTable`, at the top level of
`defineSchema`):

```ts
await ctx.addForeignKey("books", "authors", { column: "author_id" });
await ctx.addForeignKey("reviews", "books", { column: "book_id", onDelete: "cascade" });
```

Fields: `fromTable` (1st arg), `toTable` (2nd arg), and options object
with `column`, `primaryKey` (target PK, defaults to `"id"`), `name`,
`onDelete`, `onUpdate`, `deferrable`, `validate`. The `column` option is
conditionally emitted by the dumper; when absent, Rails convention applies:
`${singularize(toTable)}_id`.

Both pieces of information are sufficient to reconstruct `IntrospectedTable`
without touching a database.

## Design

Add a new function in a **sibling file** —
`packages/activerecord-cli/src/tsc-wrapper/schema-ts-model-parser.ts`:

```ts
// Re-uses the IntrospectedTable type from @blazetrails/activerecord
// (already a dep of activerecord-cli) so no new interface is needed.
export function parseSchemaForModels(source: string, filePath: string): IntrospectedTable[];
```

Returning `IntrospectedTable[]` directly — rather than defining a parallel
`SchemaModelTable` interface — keeps the type at the call site trivial: the
result slots straight into `generateModels` without a mapping step, and no
new exported shape needs stabilising. `activerecord-cli` already imports the
`IntrospectedTable` _type_ for the live-DB path.

**Why a sibling file, not the same file.** It is tempting to drop
`parseSchemaForModels` into the existing `schema-ts-parser.ts` to reuse its
AST helpers (`strLiteral`, `objPropValue`, `parseCreateTable`, `walkBody`).
But that file is re-exported through `tsc-wrapper/index.ts` — the barrel the
**`trails-tsc` typecheck path** consumes (`parseSchemaTs`). `parseSchemaForModels`
needs a **value import** of the `ForeignKeyDefinition` class (see step 2), and
a top-level value import of `@blazetrails/activerecord` in `schema-ts-parser.ts`
would make every `trails-tsc` invocation eagerly load the entire AR runtime
module. The companion plan's whole point is that `trails-tsc` parses
`schema.ts` _statically_ and never imports AR. To preserve that, PR 1
**exports the four AST helpers** from `schema-ts-parser.ts` (they stay pure —
no AR import) and the new sibling file imports both the helpers and
`ForeignKeyDefinition`. The AR-runtime coupling is then confined to the
`trails-models-dump` path, which already depends on AR anyway.

(`@blazetrails/activerecord` does expose a `./*` wildcard subpath export
(`package.json:37`), so `ForeignKeyDefinition` _could_ instead be
value-imported from the narrow `connection-adapters/abstract/schema-definitions.js`
subpath — the way `schema-ts-parser.ts` already imports a _type_ from the
narrow `schema-columns-dump` subpath. But a narrow value import still drags AR
runtime into a file on the `trails-tsc` barrel; it shrinks the surface without
removing the coupling. The sibling-file split keeps the boundary clean, so it
remains the better answer.)

**`parseSchemaForModels` internals:**

1. Reuse the existing `createTable` visitor. Additionally:
   - For composite PKs, capture the string-literal array from the
     `primaryKey` option instead of discarding it.
   - Map the synthesized PK into `primaryKey: string | string[] | null`
     (column name, not type).
   - Map columns to `{ name: string; type: string }[]` (the `IntrospectedTable`
     shape), discarding the `null`/`arrayElementType` fields that `generateModels`
     does not consume.

2. Add a new top-level visitor for `addForeignKey(fromTable, toTable, opts)`:
   - Extract string literals for `fromTable`, `toTable`.
   - Read `column`, `primaryKey`, `name`, `onDelete`, `onUpdate`,
     `deferrable`, `validate` from the options object.
   - Default `column` to `${singularize(toTable)}_id` when absent.
   - Default `primaryKey` to `"id"` when absent.
   - Synthesize a constraint name when `name` is absent
     (`fk_rails_${fromTable}_${column}` is sufficient for codegen).
   - Construct `new ForeignKeyDefinition(fromTable, toTable, column, primaryKey,
name, onDelete, onUpdate, deferrable, validate)` — the constructor's
     positional parameter order, verified against
     `connection-adapters/abstract/schema-definitions.ts`. Use the real class
     (value-imported from `@blazetrails/activerecord`) so the result is
     assignable to `ForeignKeyDefinition[]` without casting; plain object
     literals are not structurally assignable to a class type.
   - Attach the `ForeignKeyDefinition` to the relevant `fromTable` entry.

3. Return `IntrospectedTable[]` with one entry per `createTable` call,
   annotated with the `addForeignKey` entries collected in step 2.

**`--schema` dispatch in `trails-models-dump`:**

Add a `--schema <path>` flag. When present:

- Read the file, call `parseSchemaForModels` (returns `IntrospectedTable[]`),
  pass straight to `generateModels` — no mapping step.
- No `Base.establishConnection()`. No DB URL required.
- `sourceHint` is the resolved path to `schema.ts`.

The `--database-url` / `$DATABASE_URL` path is **kept unchanged** for now.
When neither `--schema` nor a DB URL is available, prefer auto-discovering
`db/schema.ts` relative to CWD (see PR 4).

## Work breakdown (sized, sibling PRs off `main`)

Per repo convention these are **non-overlapping sibling PRs**, not a stack.

### PR 1 — New `schema-ts-model-parser.ts` with `parseSchemaForModels` (~160 LOC)

- Export the four reusable AST helpers (`strLiteral`, `objPropValue`,
  `parseCreateTable`, `walkBody`) from `schema-ts-parser.ts` so the sibling
  file can import them. These stay pure — **no AR value import added to
  `schema-ts-parser.ts`** (see "Why a sibling file" above) (~5 lines).
- New file `schema-ts-model-parser.ts`:
  - Composite-PK capture: read the `primaryKey: [...]` literal array from
    `createTable` options (the existing `synthesizePk` returns the sentinel
    `"composite"` and discards the names — capture them here) (~20 lines).
  - New `visitAddForeignKey` visitor over top-level `addForeignKey` calls,
    constructing `ForeignKeyDefinition` instances (~55 lines).
  - `parseSchemaForModels` assembling `IntrospectedTable[]` (~25 lines).
- Unit tests: composite PKs, FKs with and without explicit options,
  FK column default inference, tables with `id: false`, multiple tables
  with cross-table FKs (~60 lines).
- **`parseSchemaTs` and `SchemaColumnsByTable` keep their behavior** (only
  helper visibility changes) — zero behavioral risk to the `trails-tsc` path.

Dependency: PR A (#2761) merged (parser infrastructure lives there).

### PR 2 — New `--schema` flag in `trails-models-dump` (~130 LOC)

- Add `schemaPath?: string` to `Args`; parse `--schema` / `--schema=<v>`
  (~20 lines).
- Update `usage()` string (~5 lines).
- New branch in `run()`: when `--schema` given, read file via `getFsAsync` +
  `parseSchemaForModels` → `IntrospectedTable[]` → apply existing
  `BUILTIN_IGNORE` / `--only` / `--ignore` filtering → `generateModels`
  (~50 lines). No `Base.establishConnection()`. The `--only`/`--ignore`/
  `--strip-prefix`/`--strip-suffix`/`--no-header`/`--format` flags all
  apply identically to both paths.
- Integration test: write a minimal inline `schema.ts` with two tables and
  one FK to a tmpfile, run `trails-models-dump --schema <tmpfile>`, assert
  generated classes + `belongsTo`/`hasMany` are correct (~55 lines).

Dependency: PR 1 merged.

### PR 3 — Migrate consumers and docs (~50 LOC)

- `packages/activerecord-cli/README.md`: update the `ar models:dump` row in
  the Tooling table to show `--schema db/schema.ts` as the primary form;
  add a short note that `--database-url` is a live-DB fallback.
- `packages/activerecord-cli/src/cli.ts` help string: add `--schema` to the
  `models:dump` description line.
- Any docs under `docs/` that reference `ar models:dump` without a `--schema`
  flag.
- No production code changes in this PR.

Dependency: PR 2 merged (so docs reflect real flags).

### PR 4 — Convention default + live-DB deprecation (~60 LOC)

Two changes, both in `trails-models-dump.ts`:

1. **Convention default**: when neither `--schema` nor a DB URL is present,
   check for `db/schema.ts` relative to CWD. If found, use it as if
   `--schema db/schema.ts` were passed (no warning). If not found, fall
   through to the existing `$DATABASE_URL` check (or error as before).
   This makes the schema.ts path zero-config for projects that have already
   run `ar db:schema:dump`.

2. **Deprecation warning**: if `--database-url` or `$DATABASE_URL` is
   resolved as the source (i.e., no `--schema` and no auto-discovered
   `db/schema.ts`), emit a one-line warning to stderr:
   ```
   trails-models-dump: warning: generating from a live DB connection; consider committing db/schema.ts and using --schema instead.
   ```
   The tool still succeeds — this is informational only.

Dependency: PR 3 merged.

## Parser-shape gaps (summary)

| Gap                          | How addressed                                                                                       |
| ---------------------------- | --------------------------------------------------------------------------------------------------- |
| Composite PK column names    | Capture `primaryKey: [...]` literal array from `createTable` options in `parseSchemaForModels`      |
| FK list per table            | New `visitAddForeignKey` pass over top-level `addForeignKey` calls                                  |
| FK `column` default          | Infer `${singularize(toTable)}_id` when option absent                                               |
| FK constraint `name` default | Synthesize `fk_rails_${fromTable}_${col}` when absent                                               |
| `ForeignKeyDefinition` type  | Construct `new ForeignKeyDefinition(...)` instances — class methods required for type assignability |
| Return type                  | Reuse `IntrospectedTable` from `@blazetrails/activerecord`; no new exported interface               |

## Risks / open questions

- **Single custom-named primary keys are NOT representable in trails
  `schema.ts` — the headline parity claim has a hole here.** trails'
  `SchemaDumper` emits a single PK whose column name ≠ `"id"` as just
  `{ id: false }` plus an ordinary column line — it does **not** write a
  `primaryKey: "<col>"` option. Only composite PKs get `tableOpts.primaryKey`
  (`schema-dumper.ts:921-925`: the `else if (!hasId) tableOpts.id = false`
  branch emits no `primaryKey:`; `primaryKeyTableOptions` at :857-870 only
  handles the `uuid`/`id`-named case). **This diverges from Rails**, which
  emits `primary_key: "<col>"` (`vendor/rails/.../schema_dumper.rb:172` —
  `tbl.print ", primary_key: #{pk.inspect}" unless pk == "id"`).
  Consequence: such a table reads back as `primaryKey: null`, and
  `generateModels` then **skips it** as "no primary key (likely a view)"
  (`model-codegen.ts:166`) — whereas the live-DB path's `introspectPrimaryKey`
  recovers the custom column and models it. Resolution: this migration
  **accepts it as a known limitation** of the `--schema` path and narrows the
  acceptance criterion accordingly (see below). Fully closing it requires a
  **prerequisite, out-of-scope `SchemaDumper` fix** to emit single custom PKs
  (correct vs Rails regardless) — tracked as its own issue, not blocking PRs
  1–4. Composite PKs are unaffected (they do emit `primaryKey: [...]`).

- **`t.references` never appears in `schema.ts`.**
  `SchemaDumper.emitTable` emits explicit column lines (`t.integer(...)`)
  plus separate top-level `addForeignKey` calls — `t.references` is never
  written to the output file. The parser needs no `t.references` handler.
  (Confirmed: no `references` call appears in `schema-dumper.ts`.)

- **FK `column` absent in schema.ts.** The dumper conditionally omits the
  `column:` option (`if (fk.column) opts.push(...)` at schema-dumper.ts:1109).
  In practice every FK has a column, but the parser must default to the
  Rails convention (`singularize(toTable) + "_id"`) to be safe. This matches
  `introspectForeignKeys`'s behavior on adapters that follow the same convention.

- **Composite FK columns.** `ForeignKeyDefinition.column` can be a
  comma-separated string (`"user_id,post_id"`) for composite FKs. The
  schema-dumper doesn't emit those today, but `generateModels` already
  handles them via its `fk.column.includes(",")` check. The new parser
  should pass these through verbatim if encountered.

- **Users without `db/schema.ts` yet.** Projects that haven't run
  `ar db:schema:dump` have no schema.ts to point at. The live-DB path
  remains available for exactly this bootstrap case. The convention default
  (PR 4) gracefully falls back rather than erroring.

- **MySQL spatial and other exotic types.** The schema-dumper emits these as
  `t.column("c", "geometry")` or via adapter-specific helpers. Both surface
  in schema.ts as DSL method names the parser already captures as the `type`
  string. `generateModels` doesn't use column types for codegen (only for the
  future STI/polymorphic heuristics), so type fidelity here is a non-issue
  for this migration.

- **PG enum types.** Emitted as `t.enum("col", { enum_type: "..." })` (only
  when the column's OID-resolved type is an enum — `schema-dumper.ts:993`).
  In `parseColumnStatement` the method name `"enum"` falls through to the
  generic branch (`schema-ts-parser.ts:138`), which records `{ type: "enum" }`
  — no special-casing required, and codegen ignores column types anyway. The
  helper is shared by both parsers, so this behavior is inherited for free.

- **`ForeignKeyDefinition` is a class, not an interface.** It carries instance
  methods (`isCustomPrimaryKey`, `isExportNameOnSchemaDump`, etc.). Plain
  object literals are NOT structurally assignable to `ForeignKeyDefinition[]`
  in TypeScript. The parser must construct real instances via
  `new ForeignKeyDefinition(...)`. This is straightforward — the constructor
  takes positional args that map directly to the parsed options. `activerecord-cli`
  does not currently value-import the class (the live-DB bin imports only the
  `IntrospectedTable` _type_), so PR 1 adds a **new value import** from
  `@blazetrails/activerecord` into the sibling parser file.

- **Absent FK `name:` is the COMMON case, and the synthesized name won't
  round-trip.** The dumper writes `name:` only when `isExportNameOnSchemaDump`
  is true — i.e. when the name does NOT match `/^fk_rails_[0-9a-f]{10}$/`
  (`schema-dumper.ts:1113-1117`, `schema-definitions.ts:131-133`). For the
  overwhelmingly common Rails auto-named FK, no `name:` is written, so the
  synthesized name is the **default path**, not an edge case — the PR 1 FK
  test's primary fixture should be the no-`name:` case. This is harmless:
  `generateModels` reads `fk.name` **only** inside the composite-FK TODO
  comment (`model-codegen.ts:241`) and nowhere else — `belongsTo`/`hasMany`
  names derive from `fk.column`/`toTable`, so the fabricated name never leaks
  into association names. One thing to flag so nobody assumes otherwise: the
  synthesized `fk_rails_${fromTable}_${col}` deliberately does NOT match Rails'
  `fk_rails_<10hex>` shape, so it would **not** satisfy the
  `isExportNameOnSchemaDump` suppression on a subsequent re-dump (it'd be
  re-emitted as an explicit `name:`). The parsed FK is for codegen only; it
  does not round-trip back through the dumper.

## Non-goals

- Do **not** change `trails-tsc` or `parseSchemaTs` behavior. The companion
  plan (`trails-tsc-schema-ts-migration.md`) owns that surface.
- Do **not** add association inference beyond what `addForeignKey` in
  `schema.ts` already expresses. Polymorphic and STI detection from column
  names is a separate future enhancement.
- Do **not** remove `introspectForeignKeys` / `introspectPrimaryKey` /
  `introspectColumns` from `@blazetrails/activerecord` — other consumers may
  exist and they belong in the runtime package regardless.
- Do **not** touch `ar schema:dump` / `trails-schema-dump` — those are the
  companion plan's territory.

## Acceptance criteria

- `ar models:dump --schema db/schema.ts` emits the same class/association
  structure as `ar models:dump --database-url <url>` against the same
  underlying schema, **for schemas representable in `schema.ts`** — i.e.
  default-`id`, UUID, `id: false`, and composite PKs. Tables with a single
  custom-named PK are explicitly out of parity scope until the prerequisite
  `SchemaDumper` fix lands (see Risks). Verified by the PR 2 integration test:
  a schema.ts fixture with two tables and one FK produces the same output as
  running the live-DB path against a SQLite database built from the same DDL.
- No `Base.establishConnection()` is called when `--schema` is the active
  path — confirmed by running `trails-models-dump --schema db/schema.ts`
  with `DATABASE_URL` unset and no DB running.
- Convention default (PR 4): bare `ar models:dump` with `db/schema.ts`
  present uses the schema path; without it, falls back to `DATABASE_URL`.
- `--schema` tests pass for: two-table schema with one FK, composite-PK
  table, table with `id: false`, table with UUID PK.
- No existing `trails-models-dump` tests regressed (live-DB path still
  exercises the DB introspection pipeline).
- `grep -r "no database URL" packages/activerecord-cli/src` still matches
  only the error branch (live-DB fallback error is preserved).
