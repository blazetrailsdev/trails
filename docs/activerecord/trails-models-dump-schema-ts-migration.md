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

Add a second public function to the existing
`packages/activerecord-cli/src/tsc-wrapper/schema-ts-parser.ts` alongside
the existing `parseSchemaTs`:

```ts
// Re-uses the IntrospectedTable type from @blazetrails/activerecord
// (already a dep of activerecord-cli) so no new interface is needed.
export function parseSchemaForModels(source: string, filePath: string): IntrospectedTable[];
```

Returning `IntrospectedTable[]` directly — rather than defining a parallel
`SchemaModelTable` interface — keeps the type at the call site trivial: the
result slots straight into `generateModels` without a mapping step, and no
new exported shape needs stabilising. `activerecord-cli` already imports
`IntrospectedTable` for the live-DB path, so there is no new dependency.

Keeping it in the same file reuses all the existing AST-walk helpers
(`strLiteral`, `objPropValue`, `parseCreateTable`, `walkBody`, etc.) and
avoids a second parse of the same source file.

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
name, onDelete, onUpdate, deferrable, validate)` — use the real class so
     the result is assignable to `ForeignKeyDefinition[]` without casting.
     (`ForeignKeyDefinition` is a class with instance methods; plain objects
     do not satisfy the type.)
   - Attach the `ForeignKeyDefinition` to the relevant `fromTable` entry.

3. Return `IntrospectedTable[]` with one entry per `createTable` call,
   annotated with the `addForeignKey` entries collected in step 2.

**`--schema` dispatch in `trails-models-dump`:**

Add a `--schema <path>` flag. When present:

- Read the file, call `parseSchemaForModels`, map to `IntrospectedTable[]`,
  pass to `generateModels`.
- No `Base.establishConnection()`. No DB URL required.
- `sourceHint` is the resolved path to `schema.ts`.

The `--database-url` / `$DATABASE_URL` path is **kept unchanged** for now.
When neither `--schema` nor a DB URL is available, prefer auto-discovering
`db/schema.ts` relative to CWD (see PR 4).

## Work breakdown (sized, sibling PRs off `main`)

Per repo convention these are **non-overlapping sibling PRs**, not a stack.

### PR 1 — Extend `schema-ts-parser.ts` with `parseSchemaForModels` (~150 LOC)

- Extend `synthesizePk`-family logic to capture composite PK column names
  from the `primaryKey: [...]` option literal array (~20 lines).
- New `visitAddForeignKey` visitor that walks top-level `addForeignKey`
  calls and constructs `ForeignKeyDefinition` instances (~55 lines).
- New exported `parseSchemaForModels` function returning `IntrospectedTable[]`
  (~25 lines).
- Unit tests: composite PKs, FKs with and without explicit options,
  FK column default inference, tables with `id: false`, multiple tables
  with cross-table FKs (~60 lines).
- **`parseSchemaTs` and `SchemaColumnsByTable` are untouched** — zero risk
  to the `trails-tsc` path.

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

- **PG enum types.** Emitted as `t.enum("col", { enum_type: "..." })`.
  `parseColumnStatement` already handles `method === "column"` and passes
  the DSL method through as the type. The enum case (`method === "enum"`) can
  be treated identically — pass `type: "enum"` through. Codegen doesn't use
  column types. No special-casing needed.

- **`ForeignKeyDefinition` is a class, not an interface.** It carries instance
  methods (`isCustomPrimaryKey`, `isExportNameOnSchemaDump`, etc.). Plain
  object literals are NOT structurally assignable to `ForeignKeyDefinition[]`
  in TypeScript. The parser must construct real instances via
  `new ForeignKeyDefinition(...)`. This is straightforward — the constructor
  takes positional args that map directly to the parsed options. The class is
  already imported in `activerecord-cli` (via the live-DB path's
  `introspectForeignKeys` return type).

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
  underlying schema. Verified by the PR 2 integration test: a schema.ts
  fixture with two tables and one FK produces the same output as running
  the live-DB path against a SQLite database built from the same DDL.
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
