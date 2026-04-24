# trails-models-dump — CLI plan

Sibling to `trails-schema-dump`. Reverse-engineers TS `@blazetrails/activerecord` model classes from a live database, mirroring the bin layout, flag conventions, and error format of `trails-schema-dump` exactly.

Rails has no first-party equivalent (closest: third-party `annotate`, `rails-erd`). We land it where Rails would keep a db-introspecting tool — alongside `trails-schema-dump` inside `@blazetrails/activerecord`'s `bin/`.

---

## 1. File layout

```
packages/activerecord/
├── src/
│   ├── bin/
│   │   ├── trails-schema-dump.ts     # existing, 93 lines — we mirror this
│   │   └── trails-models-dump.ts     # NEW — thin CLI (~100 lines)
│   ├── model-codegen.ts              # NEW — pure codegen (~250 lines)
│   ├── model-codegen.test.ts         # NEW — unit tests (~300 lines)
│   └── schema-introspection.ts       # existing; add introspectForeignKeys()
├── package.json                      # bin entry + "exports" updates
└── tsconfig.json                     # already covers src/bin/**
```

The pure generator lives separately from the CLI so it's unit-testable against fabricated `IntrospectedTable[]` input with no database. The CLI is a thin wrapper (connect → introspect → call generator → write). This split matches the separation already used in `bin/trails-schema-dump.ts` (I/O) vs `schema-columns-dump.ts` (pure logic).

---

## 2. Prerequisites

### 2a. `introspectForeignKeys()` wrapper

`adapter.foreignKeys(tableName)` is already implemented on all three adapters:

- **SQLite3** (`packages/activerecord/src/connection-adapters/sqlite3-adapter.ts:843-891`) — `PRAGMA foreign_key_list`. Populates all 8 `ForeignKeyDefinition` fields including `onDelete`/`onUpdate`/`deferrable`.
- **PostgreSQL** (`packages/activerecord/src/connection-adapters/postgresql-adapter.ts:2586-2633`) — queries `pg_constraint` + `pg_class` + `pg_attribute`. Populates `validate` from `convalidated`.
- **MySQL2** (`packages/activerecord/src/connection-adapters/mysql2-adapter.ts:906-961`) — queries `information_schema.referential_constraints` + `key_column_usage`. Does **not** populate `deferrable` (MySQL doesn't support it).

What's missing is the `schema-introspection.ts` wrapper that current dump scripts already use for tables / columns / indexes / primary keys. Add:

```ts
// packages/activerecord/src/schema-introspection.ts (append)
import type { ForeignKeyDefinition } from "./connection-adapters/abstract/schema-definitions.js";

export async function introspectForeignKeys(
  adapter: DatabaseAdapter,
  table: string,
): Promise<ForeignKeyDefinition[]> {
  if (hasForeignKeys(adapter)) return adapter.foreignKeys(table);
  return schemaStatementsFor(adapter).foreignKeys(table);
}
```

Follows the same prefer-adapter / fallback-to-SchemaStatements pattern (with per-adapter memoized `SchemaStatements`) as its siblings. `SchemaStatements.foreignKeys()` itself degrades to `[]` when the adapter lacks `.foreignKeys()`, so adapters that haven't wired FK introspection yet degrade gracefully rather than crashing.

### 2b. `ForeignKeyDefinition` — exact shape

From `packages/activerecord/src/connection-adapters/abstract/schema-definitions.ts:77-128`:

```ts
export class ForeignKeyDefinition {
  readonly fromTable: string;
  readonly toTable: string;
  readonly column: string; // composite FKs: comma-separated, e.g. "a_id,b_id"
  readonly primaryKey: string; // composite FKs: comma-separated
  readonly name: string;
  readonly onDelete?: ReferentialAction;
  readonly onUpdate?: ReferentialAction;
  readonly deferrable?: "immediate" | "deferred" | false;
  readonly validate: boolean;
}

type ReferentialAction = "cascade" | "nullify" | "restrict" | "no_action" | "set_default";
```

**Critical gotcha**: `column` and `primaryKey` are **strings**, never arrays. Composite FKs appear as `"col1,col2"` — the generator must detect `.includes(",")` and emit a `// TODO composite FK` comment rather than try to split.

---

## 3. CLI surface

### Flags (mirrors `bin/trails-schema-dump.ts:30-62`)

```
trails-models-dump [flags]

  --database-url <url>        Connection URL. Falls back to DATABASE_URL env.
                              Supports --database-url=<url> form too.
  --out <path>                Write generated module to this file. Default: stdout.
  --ignore <t1,t2,...>        Skip these tables. Comma-separated; flag repeatable.
                              Added to the built-in ignore list
                              (schema_migrations, ar_internal_metadata).
  --only <t1,t2,...>          Generate models only for these tables.
                              Mutually exclusive with --ignore.
  --strip-prefix <str>        Remove this prefix from table names before classify().
                              _tableName on the class still preserves the original.
  --strip-suffix <str>        Remove this suffix before classify().
  --no-header                 Suppress the "GENERATED ..." timestamp comment.
  --format                    Run prettier over the output before writing.
                              Uses prettier resolved from the CWD.
  -h, --help                  Print usage and exit 0.
```

All flags accept both `--flag=value` and `--flag value` forms — line 43-44 of `bin/trails-schema-dump.ts` is the canonical split-both-ways parse we mirror.

### Exit codes (mirrors `bin/trails-schema-dump.ts:37,71,90`)

| Code | Meaning                                                                           |
| ---- | --------------------------------------------------------------------------------- |
| 0    | Success (including `--help`)                                                      |
| 1    | Any error — arg parsing, connection failure, introspection failure, write failure |

`trails-schema-dump` uses only `0`/`1`. We match for symmetry; the error message on stderr carries the specificity, not the exit code. Error format: `trails-models-dump: <message>\n` (same prefix convention as the sibling).

### Usage string

```
Usage: trails-models-dump [flags]
  --database-url <url>        (or env DATABASE_URL)
  --out <path>                (default: stdout)
  --ignore <t1,t2,...>
  --only <t1,t2,...>
  --strip-prefix <str>
  --strip-suffix <str>
  --no-header
  --format
  -h, --help
```

---

## 4. Generated module — exact shape

### Declaration style: static-block

Two declaration styles exist in trails today:

1. **Static-block** (`packages/activerecord/dx-tests/declare-patterns.test-d.ts:38-46`, `packages/activerecord/virtualized-dx-tests/virtualized-patterns.test-d.ts:46-52`) — the idiomatic user-written form:
   ```ts
   class Post extends Base {
     static {
       this.belongsTo("author");
     }
   }
   ```
2. **Post-class `Associations.*.call()`** (`packages/activerecord/src/test-fixtures.ts:290-301`) — used by internal test fixtures that need dynamic wiring.

**Codegen emits static-block form.** It's what real users write. Association names are strings (not class references), so class load order doesn't matter at the declaration site — resolution happens at query time.

### Output example

Input — `schema.sql`:

```sql
CREATE TABLE authors (id INTEGER PRIMARY KEY, name TEXT);
CREATE TABLE books (id INTEGER PRIMARY KEY, author_id INTEGER REFERENCES authors(id), title TEXT);
CREATE TABLE reviews (id INTEGER PRIMARY KEY, book_id INTEGER REFERENCES books(id), body TEXT);
```

Output:

```ts
// GENERATED by trails-models-dump from sqlite:blog.db on 2026-04-24T14:23:05.000Z.
// Do not edit by hand — re-run trails-models-dump to regenerate.
//
// 3 models, 4 associations derived from 2 foreign keys.

import { Base } from "@blazetrails/activerecord";

export class Author extends Base {
  static {
    this.hasMany("books");
  }
}

export class Book extends Base {
  static {
    this.belongsTo("author");
    this.hasMany("reviews");
  }
}

export class Review extends Base {
  static {
    this.belongsTo("book");
  }
}
```

### Shortest-form rule

Emit options only when convention is violated. This matches how users write models by hand.

| Situation                                                    | Emit                                                   |
| ------------------------------------------------------------ | ------------------------------------------------------ |
| `tableize(classify(name)) === name`                          | No `this._tableName = …`                               |
| Otherwise (irregular plural, stripped prefix, quirky plural) | `this._tableName = "<name>"`                           |
| Single FK column `<x>_id → <x>s.id` with conventional names  | `this.belongsTo("<x>")`                                |
| Inverse has_many, inferrable from FK                         | `this.hasMany("<tables>")`                             |
| FK column doesn't match `<assoc>_id`                         | `this.belongsTo("<x>", { foreignKey: "<col>" })`       |
| Inferred class name differs from `classify(toTable)`         | add `className: "<X>"`                                 |
| Non-default single PK (≠ `"id"`)                             | `this._primaryKey = "<col>"`                           |
| Composite PK                                                 | `this._primaryKey = ["<col1>", "<col2>"]` (array form) |

### Inflection round-trip (verified against `packages/activesupport/src/inflector/inflections.ts:194-212`)

| Input          | `classify()` | `tableize()` back | `_tableName` emitted?                       |
| -------------- | ------------ | ----------------- | ------------------------------------------- |
| `people`       | `Person`     | `people`          | No (irregular handled)                      |
| `series`       | `Series`     | `series`          | No (uncountable)                            |
| `sheep`        | `Sheep`      | `sheep`           | No (uncountable)                            |
| `author_books` | `AuthorBook` | `author_books`    | No                                          |
| `oauth_tokens` | `OauthToken` | `oauth_tokens`    | No                                          |
| `status`       | `Status`     | `statuses`        | **Yes** — `tableize("Status") !== "status"` |

The generator computes `tableize(classify(tableName))` for every table; emits `this._tableName = "<name>"` iff round-trip fails. This catches every quirky name in one rule.

---

## 5. Inference rules

For each `ForeignKeyDefinition { fromTable, toTable, column, primaryKey, name }`:

1. **Skip composite FKs** (`column.includes(",")`): add `// TODO composite FK ${name} (${column} → ${toTable}.${primaryKey})` inside the `fromTable`'s static block; no association. Continue.
2. **Derive `belongsToName`**: if `column` matches `^(.+)_id$`, use the `$1` capture. Otherwise, use `camelize(singularize(toTable), false)`.
3. **Derive `hasManyName`**: `fromTable` (tables are already plural, already snake_case).
4. **Convention check**:
   - `expectedForeignKey = underscore(belongsToName) + "_id"`
   - `expectedBelongsToClass = classify(toTable)` and `expectedHasManyClass = classify(fromTable)`.
5. **Emit** on `classify(fromTable)`: `this.belongsTo(belongsToName)` or with an options object containing only the keys where reality differs from expectation.
6. **Emit** on `classify(toTable)`: symmetric `this.hasMany(hasManyName)`.

**Ordering**: tables sorted alphabetically; within a class, `belongsTo` lines first then `hasMany`, alphabetical within each group. Stable diffs across regenerations.

---

## 6. Edge cases

Each row: detection signal + v1 behaviour. **v1** = implemented now; items without that marker ship a TODO/NOTE comment but no machinery.

| Edge case                                           | Detection signal                                                                                       | Behaviour                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Composite FK**                                    | `column.includes(",")`                                                                                 | **v1**: comment `// TODO composite FK ${name}` inside fromTable's static block. No association. No crash.                                                                                                       |
| **Composite PK**                                    | `introspectPrimaryKey` returns array length ≥ 2                                                        | **v1**: `this._primaryKey = ["<a>", "<b>"]`. Single-column FKs on the table still emit associations normally.                                                                                                   |
| **Non-default single PK**                           | `introspectPrimaryKey` returns string ≠ `"id"`                                                         | **v1**: `this._primaryKey = "<col>"`.                                                                                                                                                                           |
| **No PK (view)**                                    | `introspectPrimaryKey` returns `[]` (empty array — the helper normalizes adapter-level `null` to `[]`) | **v1**: skip the entire table. Log `// SKIPPED <name>: no primary key (likely a view)` in the header tally.                                                                                                     |
| **Self-referential FK**                             | `fromTable === toTable`                                                                                | **v1**: Name belongsTo by the column (`parent_id → belongsTo("parent")`). hasMany inverse named by the table (likely wrong — user will rename to `children`).                                                   |
| **Irregular / uncountable table**                   | `tableize(classify(t)) !== t`                                                                          | **v1**: emit explicit `this._tableName = "<t>"`. Covered by the round-trip rule (§4).                                                                                                                           |
| **Acronym-like table** (`oauth_tokens`, `api_keys`) | Inflector lacks acronym registration                                                                   | **v1**: emit `OauthToken`, `ApiKey` — matches current trails inflection. Users who want `OAuthToken` register an acronym in app init; generator does not.                                                       |
| **Polymorphic `belongs_to`**                        | Table has `<x>_id` (no FK constraint) + `<x>_type` (string column)                                     | v2: emit `// TODO polymorphic: this.belongsTo("<x>", { polymorphic: true })`. No regular belongsTo, no has_many inverse. Requires inspecting column list — IntrospectedTable includes `columns` for this check. |
| **STI**                                             | `type` column with string type, at least one inbound FK                                                | v2: treat as regular column. Emit `// NOTE: 'type' column present — if this is STI, declare subclasses manually`.                                                                                               |
| **`has_many :through` / HABTM**                     | Table has exactly 2 FKs, all other columns are PK / timestamps                                         | v2: emit regular belongsTo on the join model + hasMany on each side. Add `// NOTE: join table — consider has_many :through or hasAndBelongsToMany` on the join class.                                           |
| **Schema prefix/suffix**                            | No DB signal                                                                                           | **v1**: `--strip-prefix` / `--strip-suffix` flags. `_tableName` always preserves the original; classify runs on the stripped form.                                                                              |
| **Adapter returns no FKs**                          | `introspectForeignKeys` returns `[]`                                                                   | **v1**: class emitted without associations. Add `// WARNING: no foreign keys found for <table>` comment inside the class.                                                                                       |
| **Adapter lacks `.foreignKeys`**                    | `typeof adapter.foreignKeys !== "function"`                                                            | **v1**: wrapper returns `[]` (see §2a). Top-level header notes `no FK introspection available for this adapter; associations omitted`.                                                                          |
| **`--only` + `--ignore` both passed**               | Arg conflict                                                                                           | **v1**: exit 1 with `trails-models-dump: --only and --ignore are mutually exclusive\n`.                                                                                                                         |
| **`--out` path's directory doesn't exist**          | `ENOENT` on write                                                                                      | **v1**: `mkdirSync(dirname(out), { recursive: true })` before write. Matches `trails-schema-dump` behaviour.                                                                                                    |
| **`--format` without prettier available**           | `import("prettier")` rejects                                                                           | **v1**: fall back to raw output + `trails-models-dump: warning: --format requested but prettier not installed; writing unformatted\n` on stderr. Exit 0.                                                        |
| **Zero tables after filtering**                     | `--only`/`--ignore` filters everything                                                                 | **v1**: exit 1 with `trails-models-dump: no tables to generate (check --only/--ignore)\n`.                                                                                                                      |
| **Connection failure**                              | `Base.establishConnection` rejects                                                                     | **v1**: exit 1 with `trails-models-dump: failed to connect: <msg>\n`.                                                                                                                                           |

---

## 7. Generator API

`packages/activerecord/src/model-codegen.ts`:

```ts
import type { ForeignKeyDefinition } from "./connection-adapters/abstract/schema-definitions.js";

export interface IntrospectedTable {
  name: string;
  /**
   * PK column name(s) in PK-position order. Empty array means the table has
   * no primary key (likely a view) — skipped entirely. `null` is also
   * accepted for callers that want to construct IntrospectedTable from
   * lower-level sources that distinguish null-vs-empty.
   */
  primaryKey: string | string[] | null;
  foreignKeys: ForeignKeyDefinition[];
  /** Drives polymorphic + STI detection. */
  columns: { name: string; type: string }[];
}

export interface GenerateModelsOptions {
  /** Included in the header comment for provenance ("from sqlite:blog.db"). */
  sourceHint?: string;
  /** Stripped before classify(). _tableName still preserves the original. */
  stripPrefix?: string;
  stripSuffix?: string;
  /** Suppress the "GENERATED ... do not edit" header. */
  noHeader?: boolean;
  /** Injected for deterministic test snapshots. */
  now?: Date;
}

export function generateModels(tables: IntrospectedTable[], opts?: GenerateModelsOptions): string;
```

Pure function. No `node:fs`, no `Date.now()` (injected via `opts.now`), no `process.env`. Tests exercise it against hand-built arrays.

---

## 8. Test plan

### `model-codegen.test.ts` (15 cases, pure unit tests)

1. Empty tables → module with header + imports, no classes. Byte-identical output.
2. One table, no FKs, default PK `id` → one class, no `_tableName`, no `_primaryKey`.
3. One table, non-default PK `uuid` → `this._primaryKey = "uuid"`.
4. Two tables + one simple FK → belongs_to + has_many on both sides, no options.
5. FK with non-convention column (`written_by → authors.id`) → `this.belongsTo("author", { foreignKey: "written_by" })`.
6. Self-referential (`users.parent_id → users.id`) → `this.belongsTo("parent")` + `this.hasMany("users")`.
7. Composite FK (`column: "a_id,b_id"`) → TODO comment only.
8. Composite PK (`["tenant_id", "id"]`) → `this._primaryKey = ["tenant_id", "id"]`.
9. View (PK = null) → table omitted, header tally mentions it.
10. Irregular plural `people` → `class Person`, no `_tableName`.
11. Quirky plural `status` → `_tableName = "status"` (round-trip rule).
12. Polymorphic signal → TODO comment, no regular association (v2 — v1 emits no comment but still suppresses the bogus FK-based association).
13. Join table `authors_books(author_id, book_id, created_at)` → belongsTo on both, NOTE comment (v2 — v1 just treats it as any other table).
14. `stripPrefix: "blog_"` → `blog_posts → class Post`, `_tableName = "blog_posts"` preserved.
15. Deterministic: same input + same `opts.now` → same output twice (catches accidental `Math.random()`/`Date.now()` use).

### `bin/trails-models-dump.test.ts` (5 integration cases)

1. Missing `--database-url` and no `DATABASE_URL` env → exit 1, usage on stderr.
2. `--help` → exit 0, usage on stdout.
3. `--only` + `--ignore` together → exit 1 with the conflict message.
4. End-to-end against a tmp SQLite DB with a 3-table schema → snapshot match; snapshot compiles under `trails-tsc`.
5. `--format` with prettier unresolvable → warning on stderr, unformatted output, exit 0.

---

## 9. PR rollout

**PR 1 — `introspectForeignKeys()` wrapper + tests.**
Adds ~8 lines to `packages/activerecord/src/schema-introspection.ts`; extends the existing `schema-introspection.test.ts` with four cases (single FK, composite FK string shape, no-FK table, adapter missing `.foreignKeys` method). No new files. Reviewable in one sitting.

**PR 2 — `model-codegen.ts` + tests.**
New `packages/activerecord/src/model-codegen.ts` (~250 lines) and `model-codegen.test.ts` (15 cases). Pure TS, no DB. No CLI yet.

**PR 3 — `bin/trails-models-dump.ts` + package.json + integration tests.**
New CLI mirroring `bin/trails-schema-dump.ts` exactly:

- Shebang: `#!/usr/bin/env node`
- Imports `getFs`/`getPath` from `@blazetrails/activesupport` (same abstraction the sibling uses for testability).
- Arg parsing pattern at lines 30-62 of the sibling; flag set from §3 above.
- `Base.establishConnection(url)` at the line-74 equivalent.
- Calls `introspectTables` + per-table `introspectPrimaryKey`/`introspectColumns`/`introspectForeignKeys`, builds `IntrospectedTable[]`, calls `generateModels()`.
- Writes via `getFs().writeFileSync(out, output)` (where `output` ends with `"\n"` to match trails-schema-dump's convention).
- Update `packages/activerecord/package.json` bin map (currently line 44):
  ```json
  "bin": {
    ...,
    "trails-schema-dump": "./dist/bin/trails-schema-dump.js",
    "trails-models-dump": "./dist/bin/trails-models-dump.js"
  }
  ```
- README note under the existing trails-schema-dump docs.

**PR 4 — AR parity fixture bootstrap.**
Use `trails-models-dump` against each `ar-XX/schema.sql` to generate `ar-XX/models.ts`. Add a small `scripts/parity/fixtures/gen-ar-models.ts` that iterates and invokes the bin. Commit the outputs so fixtures stay deterministic without the tool in the hot path. This PR is the first real consumer, but isn't required for PRs 1-3 to land.

---

## 10. Non-goals

- **`models.rb` generation.** Rails side is hand-written for parity fixtures. One-way: trails TS only.
- **Round-trip / merge with an existing `models.ts`.** Regeneration overwrites. Users who want to customize should either regenerate into a `_generated/` path and extend, or stop regenerating and treat the file as hand-owned.
- **Scopes, validations, callbacks.** Nothing in the DB signals these.
- **`this.attribute(name, type)` column emission.** A plausible extension but requires column-type mapping across all adapters; defer until AR parity surfaces a need.
- **Decorator / virtualized-pattern output.** The virtualized path needs compile-time cleverness from trails-tsc; a CLI can't produce it. Explicit static-block declarations work universally.

---

## 11. Open questions

- **`ApplicationRecord` convention?** Rails idiom is `class X < ApplicationRecord`. Trails doesn't enforce one yet; generating `extends Base` directly is simplest. Add `--base-class <module>#<name>` later if users ask.
- **`--acronym OAuth,API` plumbing** to upgrade `OauthToken → OAuthToken`. Not v1; users post-process.
- **Column-type emission** as noted above.
