# Quoting Refactor: Thread Adapter Through All Call Sites

> **Status (2026-05-01):** Phases 0–3 merged
> (#1051, #1058, #1065, #1068, #1070, #1072, #1075). The hot path
> (sanitization, query-methods, database-statements) and abstract +
> PostgreSQL schema layers all route quoting through the adapter's
> `Quoting` interface. **Remaining:** Phase 4 (model-schema +
> internal-metadata + primary-key + migration + alias-tracker +
> association-scope) and Phase 5 (remove the
> `adapter?: "sqlite" | "postgres" | "mysql"` enum from
> `abstract/quoting.ts`). Until Phase 5 lands, the enum still exists and
> the abstract module still has dialect branches.

## Problem

Rails routes every quoting call through the connection adapter:
`connection.quote(value)`, `connection.quote_table_name(name)`. The
`Quoting` module is mixed into `AbstractAdapter`; each concrete adapter
overrides what differs (PG: backslash escaping, `escape_bytea`; MySQL:
backtick identifiers, control-char escaping; SQLite: `1`/`0` booleans,
double-quote identifiers). Call sites never touch the module
functions directly. **Booleans:** Rails abstract returns `"TRUE"`/`"FALSE"`;
PG and MySQL both inherit this default; only SQLite overrides
`quoted_true → "1"`.

Trails has the per-adapter modules in place
(`connection-adapters/{postgresql,mysql,sqlite3}/quoting.ts`) and the
adapter classes' `override quote()` methods exist, but most non-adapter
call sites still import the standalone `quote` / `quoteIdentifier` /
`quoteTableName` from `abstract/quoting.ts` and pass an `adapter` enum
string. Concrete consequences:

1. **Identifier quoting can regress to abstract defaults on MySQL.**
   `sanitization.ts:120–122` and other callers don't always thread
   `adapterName` through, so identifier quoting falls back to
   abstract double-quotes — wrong for MySQL (backticks).

2. **`adapter?` enum parameter duplicates OO dispatch.**
   ~16 callers pass `"sqlite" | "postgres" | "mysql"` strings into the
   abstract module, where switch statements then re-derive what
   already lives on the per-adapter modules. Routing through
   `connection.quoteX(...)` collapses two layers (string-enum +
   per-adapter module) into one.

3. **MySQL `quotedTrue` divergence — flagged, NOT fixed by this refactor.**
   Trails MySQL `mysql/quoting.ts:34` returns `"1"`. Rails MySQL does
   NOT override `quoted_true`; it inherits `"TRUE"` from
   `abstract/quoting.rb:166`. Pre-existing trails-vs-Rails divergence
   — separate follow-up question (intentional ergonomics, or revert?).
   Out of scope for this plan.

## Goal

Every quoting call goes through the active connection adapter,
matching Rails' `connection.quote` dispatch. After the refactor:

- No file outside `connection-adapters/{abstract,postgresql,mysql,sqlite3}/`
  imports from `abstract/quoting.ts`.
- The `adapter?: "sqlite" | "postgres" | "mysql"` parameter is removed
  from the abstract module.
- Each adapter class implements a shared `Quoting` interface so call
  sites can depend on a contract, not a concrete class.

## Rails source (file-anchored)

| File                                                                         | What's there                                                                                                                                                                           |
| ---------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `activerecord/lib/active_record/connection_adapters/abstract/quoting.rb`     | Base `Quoting` module — `quote`, `quote_string`, `quoted_true/false`, etc.                                                                                                             |
| `connection_adapters/postgresql/quoting.rb`                                  | PG overrides — `quote_string` (`E'…'`), `quote_table_name`/`quote_column_name`, `escape_bytea`. **Does NOT override `quoted_true/false`** — inherits `"TRUE"`/`"FALSE"` from abstract. |
| `connection_adapters/mysql/quoting.rb` (mixed into `abstract_mysql_adapter`) | MySQL overrides — backtick identifiers, control-char escaping, `unquoted_true/false → 1/0`. **Does NOT override `quoted_true/false`** — inherits `"TRUE"`/`"FALSE"`.                   |
| `connection_adapters/sqlite3/quoting.rb`                                     | SQLite overrides `quoted_true → "1"` / `quoted_false → "0"` (only adapter that overrides bool literals); double-quote identifiers.                                                     |
| `activerecord/lib/active_record/sanitization.rb`                             | `sanitize_sql_array`, `replace_bind_variable`, `quote_bound_value` — calls `connection.quote(value)`                                                                                   |

Rails source is fetched into `scripts/api-compare/.rails-source/` by
`scripts/api-compare/fetch-rails.sh` (also run as part of
`pnpm api:compare`). Grep there directly when a specific override is
needed.

## Phase 0 — Complete adapter quoting modules

### Per-adapter gap (audited 2026-04-30)

✅ = function exists, ⚠️ = exists but has a bug or partial coverage,
❌ = missing.

| Method                           | abstract                    | postgresql             | mysql                     | sqlite3                     |
| -------------------------------- | --------------------------- | ---------------------- | ------------------------- | --------------------------- |
| `quote(value)`                   | ✅ `abstract/quoting.ts:57` | ✅ `pg/quoting.ts:164` | ✅ `mysql/quoting.ts:172` | ✅ `sqlite3/quoting.ts:69`  |
| `quoteString(s)`                 | ✅ `:149`                   | ✅ `pg/quoting.ts:129` | ✅ `mysql/quoting.ts:88`  | ✅ `sqlite3/quoting.ts:65`  |
| `quoteIdentifier(name)`          | ✅ `:21`                    | ✅ `pg/quoting.ts:82`  | ✅ `mysql/quoting.ts:67`  | ✅ `sqlite3/quoting.ts:61`  |
| `quoteTableName(name)`           | ✅ `:33`                    | ✅ `pg/quoting.ts:86`  | ✅ `mysql/quoting.ts:50`  | ✅ `sqlite3/quoting.ts:45`  |
| `quoteColumnName(name)`          | ✅ `:45`                    | ✅ `pg/quoting.ts:125` | ✅ `mysql/quoting.ts:57`  | ✅ `sqlite3/quoting.ts:52`  |
| `quoteTableNameForAssignment`    | ✅ `:158`                   | ✅ `pg/quoting.ts:144` | ❌                        | ✅ `sqlite3/quoting.ts:102` |
| `quoteDefaultExpression(v)`      | ✅ `:177`                   | ✅ `pg/quoting.ts:191` | ❌                        | ✅ `sqlite3/quoting.ts:114` |
| `quotedTrue` / `quotedFalse`     | ✅ `:194`/`:208`            | ✅ `:62`/`:70`         | ✅ `:34`/`:42`            | ✅ `:29`/`:37`              |
| `unquotedTrue` / `unquotedFalse` | ✅ `:201`/`:215`            | ✅ `:66`/`:74`         | ✅ `:38`/`:46`            | ✅ `:33`/`:41`              |
| `quotedBinary(value)`            | ✅ `:380`                   | ✅ `pg/quoting.ts:160` | ✅ `mysql/quoting.ts:98`  | ✅ `sqlite3/quoting.ts:106` |
| `typeCast(value)`                | ✅ `:90`                    | ✅ `pg/quoting.ts:216` | ✅ `mysql/quoting.ts:216` | ✅ `sqlite3/quoting.ts:128` |
| `castBoundValue(value)`          | ✅ `:114`                   | ❌                     | ✅ `mysql/quoting.ts:112` | ❌                          |
| `sanitizeAsSqlComment(v)`        | ✅ `:390`                   | ❌                     | ❌                        | ❌                          |
| `columnNameMatcher`              | ✅ `:403`                   | ✅ `pg/quoting.ts:277` | ✅ `mysql/quoting.ts:124` | ✅ `sqlite3/quoting.ts:324` |
| `columnNameWithOrderMatcher`     | ✅ `:419`                   | ✅ `pg/quoting.ts:296` | ✅ `mysql/quoting.ts:147` | ✅ `sqlite3/quoting.ts:328` |
| `lookupCastTypeFromColumn`       | ✅ `:132`                   | ✅ `pg/quoting.ts:322` | ❌                        | ❌                          |

### Phase 0 work items (PR 1)

**Required for the Quoting interface (Phase 1):**

- [x] **Add `quoteIdentifier` to all three adapter modules.**
      PG and SQLite re-export their `quoteColumnName` (both already do
      double-quote escaping). MySQL re-exports its backtick variant.
      Removes the abstract fall-back as the only `quoteIdentifier` source.

**Required for full interface (bundle with Phase 1 if size allows):**

- [ ] MySQL `quoteTableNameForAssignment(table, attr)` — backtick
      variant of the abstract default.
- [ ] MySQL `quoteDefaultExpression(value)` — delegate to MySQL
      `quote()`; abstract delegates to its own `quote`.
- [ ] PG / SQLite `castBoundValue` — delegate to abstract default.
- [ ] PG / MySQL `sanitizeAsSqlComment` — re-export from abstract
      (database-agnostic).
- [ ] MySQL / SQLite `lookupCastTypeFromColumn` — re-export abstract
      shape; PG already has its own with `checkIntegerRange`.

**Estimated size:** ~150 LOC + tests (under the 300-LOC ceiling).

## Phase 1 — Define the Quoting interface (PR 2)

**New file:** `packages/activerecord/src/connection-adapters/abstract/quoting-interface.ts`

```ts
export interface Quoting {
  quote(value: unknown): string;
  quoteString(s: string): string;
  quoteIdentifier(name: string): string;
  quoteTableName(name: string): string;
  quoteColumnName(name: string): string;
  quoteTableNameForAssignment(table: string, attr: string): string;
  quoteDefaultExpression(value: unknown): string;
  quotedTrue(): string;
  quotedFalse(): string;
  unquotedTrue(): boolean | number;
  unquotedFalse(): boolean | number;
  quotedBinary(value: Uint8Array): string;
  typeCast(value: unknown): unknown;
  castBoundValue(value: unknown): unknown;
  sanitizeAsSqlComment(value: string): string;
  columnNameMatcher(): RegExp;
  columnNameWithOrderMatcher(): RegExp;
}
```

**Wire `implements Quoting` on:**

- `AbstractAdapter` — `connection-adapters/abstract-adapter.ts:118`.
  Currently has only `quote()` (`:169`) and `typeCast()` as instance
  methods. Add the rest by binding the standalone abstract functions
  (this is the base layer; subclasses override).
- `PostgreSQLAdapter` — `postgresql-adapter.ts:85`. Already overrides
  `quoteTableName(:1890)`, `quote(:1902)`, `typeCast(:1906)`. Bind the
  remaining methods from `pg/quoting.ts`.
- `AbstractMysqlAdapter` — `abstract-mysql-adapter.ts:90`. Already
  overrides `quote(:156)`, `quoteString(:574)`, `quotedBinary(:481)`.
  Bind the rest from `mysql/quoting.ts`.
- `SQLite3Adapter` — `sqlite3-adapter.ts:82`. Already overrides
  `quote(:466)`. Bind the rest from `sqlite3/quoting.ts`.

**Use the `this`-typed top-level function pattern from CLAUDE.md.**
Each `quoting.ts` module exports the standalone functions; adapter
classes assign them as instance properties so the class satisfies
`Quoting` without delegation wrappers:

```ts
// abstract-adapter.ts
import { quote, quoteString /* … */ } from "./abstract/quoting.js";
export class AbstractAdapter implements Quoting {
  quote = quote;
  quoteString = quoteString;
  // …
}
```

Subclasses re-bind only the methods that diverge.

**Estimated size:** ~120 LOC (1 new file + ~10 method bindings on each
of 4 adapter classes).

## Phase 2 — Tier 1 (hot path) call sites

| File / line                                                                                 | Current import                                               | Change                                                                                                                                                                                                                                |
| ------------------------------------------------------------------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `sanitization.ts:9–14, 120–122, 315, 326, 332, 338`                                         | `quote, quoteIdentifier, quoteTableName`                     | Accept `quoter: Quoting` on `sanitizeSqlForConditions`, `quoteBoundValue`, `replaceBindVariables`. Model class methods pass `this.connection`.                                                                                        |
| `relation/query-methods.ts:19–23, 687–688, 1708`                                            | `quote, quoteTableName as quoteTable`                        | `:687–688` → `this.model.connection.quote(value)`. `:1708` → drop the `?? quoteTable(name, dialect)` fallback; adapter is always present.                                                                                             |
| `relation.ts:16–20`                                                                         | `columnNameMatcher, defaultSqlTimezone, formatInstantForSql` | These are dialect-agnostic helpers (regex + datetime formatting), not real quoting. Re-house under `connection-adapters/abstract/sql-formatting.ts` and update the import; document and skip from "no abstract/quoting imports" rule. |
| `connection-adapters/abstract-adapter.ts:32, 170`                                           | `quote as abstractQuote, typeCast as abstractTypeCast`       | After Phase 1 the class binds these by reference; drop the wrapper at `:169`.                                                                                                                                                         |
| `connection-adapters/abstract/database-statements.ts:24, 516, 538, 859, 860, 876, 885, 889` | `quoteIdentifier, quoteTableName, quoteColumnName, quote`    | Already a mixin on the adapter — switch each callsite from `quoteTableName(t)` to `this.quoteTableName(t)`.                                                                                                                           |

**PR split (each ≤300 LOC):**

- **PR 3** — sanitization: `quoter` param plumbed through 3 functions
  - ~12 caller updates. ~150 LOC.
- **PR 4** — query-methods rewire + relation.ts neutralization. ~120 LOC.
- **PR 5** — database-statements internal sweep (mechanical
  `quoteX(name)` → `this.quoteX(name)` × ~20 sites). ~80 LOC.

**Behavioral test required (in PR 3):** identifier-quoting parity —
`sanitizeSqlForConditions(["? = 1", "users.name"], mysqlAdapter)` emits
backtick-quoted identifier (`` `users`.`name` ``), not double-quoted.
Same shape for PG (`"users"."name"`) and SQLite (`"users"."name"`).

## Phase 3 — Tier 2 (DDL / schema)

The schema files all already receive `adapterName` as a constructor
parameter and pass it as a string to the standalone functions. Replace
`adapterName: string` with `adapter: Quoting`.

| File / line                                                                                                 | Sites                          | Notes                                                                                                                             |
| ----------------------------------------------------------------------------------------------------------- | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| `connection-adapters/abstract/schema-statements.ts:30, 53, 57, 225, 237, 242, 305, 318, 685`                | 9                              | Methods like `_qi(name) → quoteIdentifier(name, this.adapterName)` collapse to `this.adapter.quoteIdentifier(name)`.              |
| `connection-adapters/abstract/schema-creation.ts:23, 70, 83, 95, 105–117, 121, 137, 141, 152, 161–170, 182` | 18                             | Heaviest single file; constructor takes `adapterName`. Switch to `adapter: Quoting`.                                              |
| `connection-adapters/abstract/schema-definitions.ts:2, 737, 813, 830, 841, 848, 858`                        | 7                              | Same pattern.                                                                                                                     |
| `connection-adapters/postgresql/schema-creation.ts:10, 33–34`                                               | 2 — imports `abstract/quoting` | Must use `pg/quoting` (or `this.adapter`). The current `"postgres"` string args are no-ops since abstract treats them as default. |
| `connection-adapters/postgresql/schema-definitions.ts:23, 329, 341, 345, 347`                               | 4                              | Same — switch to PG quoting.                                                                                                      |

**PR split:**

- **PR 6** — abstract schema-creation + schema-definitions (share the
  constructor change). ~250 LOC.
- **PR 7** — abstract schema-statements + PG schema-creation /
  schema-definitions (PG fix is small; bundle). ~200 LOC.

## Phase 4 — Tier 3 (model / migration / association)

| File / line                                                               | Sites | Change                                                                                                                                                    |
| ------------------------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model-schema.ts:13, 65, 70, 310, 316, 318, 319, 325, 332, 336, 340, 374` | 12    | Class methods (`createTable`, `dropTable`, `quotedTableName`) have `this.adapter` — replace `quoteX(name, adapterName)` with `this.adapter.quoteX(name)`. |
| `migration.ts:14, 1290, 1298`                                             | 3     | Migrations have `connection`. Use `connection.quoteIdentifier` / `quoteTableName`.                                                                        |
| `internal-metadata.ts:11, 50, 88, 116`                                    | 4     | Holds `_adapterName`; replace with `_adapter: Quoting`.                                                                                                   |
| `attribute-methods/primary-key.ts:6, 116–117`                             | 2     | Helper takes `adapter` string param — switch to `Quoting`. Callers already have `this.constructor.connection`.                                            |
| `associations/alias-tracker.ts:8, 40`                                     | 1     | `quoteTableName(name)` (regex anchor) — builder takes a `quoter: Quoting` arg, threaded from the relation.                                                |
| `associations/association-scope.ts:13, 500–517`                           | ~5    | Already has connection on the scope context; replace direct imports.                                                                                      |

**PR split:**

### PR 8 — model-schema + internal-metadata + primary-key (~200 LOC)

Common pattern across all three files: replace
`quoteX(name, this._adapterName)` (or `adapterName` constructor arg)
with `this._adapter.quoteX(name)`, holding a `Quoting` reference
instead of a dialect string.

#### Step-by-step

1. **`packages/activerecord/src/internal-metadata.ts`** —
   - Lines 23–116. The class currently holds `private _adapter` (the
     adapter instance) and a derived
     `private get _adapterName(): "sqlite" | "postgres" | "mysql"`
     (line 45). The `_adapter` field already satisfies `Quoting`
     after quoting-refactor PR 2.
   - **Delete** the `_adapterName` getter and every callsite that
     consumes it (lines 50, 85, 88, 116). Replace with direct calls
     on `this._adapter`:
     ```ts
     // before
     return quoteIdentifier(name, this._adapterName);
     // after
     return this._adapter.quoteIdentifier(name);
     ```
   - Line 85 (`_adapterName === "postgres" ? "TIMESTAMP" : "DATETIME"`)
     is a SQL-type choice, **not quoting** — leave the conditional
     logic but base it on a different adapter capability check
     (`this._adapter instanceof PostgreSQLAdapter`, or a typed
     `adapterCapabilities` getter). If unclear, keep as-is and
     leave a TODO referencing this plan.
   - Update the import at line 11 to drop `quoteIdentifier`/
     `quoteTableName` from `abstract/quoting.js`.

2. **`packages/activerecord/src/model-schema.ts`** —
   Lines 13, 65, 70, 310, 316, 318–319, 325, 332, 336, 340, 374.
   Class methods (`createTable`, `dropTable`, `quotedTableName`,
   etc.) already have `this.adapter` (or `this.connection`) in
   scope. For each callsite:
   ```ts
   // before
   `${quoteIdentifier(pk, adapterName)} INTEGER PRIMARY KEY`
   // after
   `${this.adapter.quoteIdentifier(pk)} INTEGER PRIMARY KEY`
   ```
   The `detectAdapterName(this.adapter)` line at 305 disappears —
   delete it and any branches that switched purely on the dialect
   string for **identifier quoting**. Type-related branches
   (lines 316–319, MySQL `BIGINT AUTO_INCREMENT` vs PG `SERIAL`)
   remain but should switch on `instanceof` or a capability check.

3. **`packages/activerecord/src/attribute-methods/primary-key.ts`** —
   Lines 6, 116–117.
   - Line 6: drop the `quoteX from "abstract/quoting.js"` import.
   - Lines 116–117: helper currently takes `adapter: string`. Change
     signature to `adapter: Quoting` (or rename the param). Callers
     are class methods that already have `this.constructor.connection`.

4. **Compliance grep within the changed files** —
   `grep -nE 'from.*abstract/quoting' packages/activerecord/src/{model-schema,internal-metadata,attribute-methods/primary-key}.ts`
   should report 0 matches after the change.

#### Tests

- Existing tests for `internal-metadata`, `model-schema`,
  `primary-key` are sufficient if they pass — the SQL output is
  identical. Add one new assertion per file confirming the
  identifier comes from `this._adapter.quoteIdentifier`:
  ```ts
  it("uses adapter quoting for table names", () => {
    const adapter = mockAdapterWith({ quoteIdentifier: () => "<<X>>" });
    new InternalMetadata(adapter, ...).quotedTableName();
    expect(...).toContain("<<X>>");
  });
  ```

#### Verification

- `pnpm --filter @blazetrails/activerecord test` green.
- `pnpm parity:schema` unchanged (these files emit DDL; if a fixture
  changes it's a bug, not expected drift).

---

### PR 9 — migration + association-scope + alias-tracker (~150 LOC)

#### Step-by-step

1. **`packages/activerecord/src/migration.ts`** —
   Lines 14, 1290, 1298.
   - Line 14: drop `quoteIdentifier`/`quoteTableName` import from
     `abstract/quoting.js`.
   - Lines 1290, 1298: migrations already hold `this.connection`
     (the adapter). Replace `quoteIdentifier(x, dialect)` with
     `this.connection.quoteIdentifier(x)`.

2. **`packages/activerecord/src/associations/alias-tracker.ts`** —
   Lines 8, 40.
   - Line 8: drop the `quoteTableName` import.
   - Line 40: the static `initialCountFor(name, tableJoins)` calls
     `quoteTableName(name)` (no dialect, so it falls through to the
     abstract default). The method is static, so threading
     `this.connection` is not an option. Two viable shapes:

     **A.** Make the method instance-bound: move `initialCountFor`
     onto the `AliasTracker` instance and pass `this._quoter` (a
     `Quoting` field added to the constructor) to the regex
     builder.

     **B.** Keep the method static but add a `quoter: Quoting`
     parameter; callers (search `grep -rn "initialCountFor" packages/`)
     pass their connection.

     Recommendation: **A**. The constructor at line 17 already
     accepts a `pool` indirectly via `create(pool, …)` at line 23;
     thread `pool.withConnection().quoter` (or equivalent) into a
     `_quoter` field. Confirms the regex anchor uses MySQL backticks
     for MySQL connections.

3. **`packages/activerecord/src/associations/association-scope.ts`** —
   Lines 13, 500–517 (~5 sites).
   - Line 13: drop the abstract-quoting import.
   - The scope context already carries the connection; replace
     each `quoteX(name, dialect)` with
     `scopeContext.connection.quoteX(name)`.

4. **Compliance grep** —
   ```sh
   grep -nE 'from.*abstract/quoting' \
     packages/activerecord/src/migration.ts \
     packages/activerecord/src/associations/alias-tracker.ts \
     packages/activerecord/src/associations/association-scope.ts
   ```
   should report 0.

#### Tests

- Existing migration / association tests must remain green.
- `alias-tracker.test.ts` — new test: build a tracker with a MySQL
  quoter, call `initialCountFor("users", joins)` against a join
  containing `` JOIN `users` ON … ``, assert count = 1. Same with
  PG/SQLite (double-quoted identifiers).
- Mirror Rails test names from
  `scripts/api-compare/.rails-source/activerecord/test/cases/associations/alias_tracker_test.rb`.

#### Verification

- `pnpm --filter @blazetrails/activerecord test`.
- `pnpm parity:query` green; MySQL fixtures involving aliased
  joins should now match the regex correctly under backtick
  quoting (this is the load-bearing behavior — was previously
  silently passing because `quoteTableName(name)` defaulted to
  double-quotes which never matched the backticked SQL produced
  by the visitor).

## Phase 5 — Remove the `adapter?:` parameter (PR 10)

Once Phases 0–4 land, this is dead code:

```sh
# Should report 0 callers outside the per-adapter quoting.ts files
grep -rn '"sqlite" | "postgres" | "mysql"' \
  packages/activerecord/src/connection-adapters/abstract/quoting.ts
```

**Steps:**

1. Remove the `adapter?: "sqlite" | "postgres" | "mysql"` parameter from
   `abstract/quoting.ts:21, 33, 45` (`quoteIdentifier`,
   `quoteTableName`, `quoteColumnName`).
2. Drop the in-function `if (adapter === "mysql")` / `"sqlite"` branches
   — routing is now done by which module's function each adapter class
   binds.
3. `quoting.test.ts:21` and `sql-default.test.ts:3` are tests of the
   abstract module specifically; their imports stay inside the
   `abstract/` boundary and remain valid.
4. Final compliance grep (acceptance #1).

**Estimated size:** ~80 LOC removed, no new code.

## Test plan

In addition to existing tests:

1. **Per-adapter `quoteIdentifier` parity test** —
   `pgAdapter.quoteIdentifier("foo") === '"foo"'`,
   `mysqlAdapter.quoteIdentifier("foo") === "\`foo\`"`,
`sqliteAdapter.quoteIdentifier("foo") === '"foo"'`. Same shape for
`quoteTableName`and`quoteColumnName`.
2. **`where`-through-adapter integration** —
   `Model.where("users.id = ?", 1).toSql()` quotes the identifier with
   the right adapter (backticks on MySQL, double-quotes elsewhere).
3. **Sanitization parity** —
   `sanitizeSqlForConditions(["users.name = ?", "x"], mysqlAdapter)`
   emits backtick identifier; same for PG / SQLite.
4. **`api:compare` non-regression** — Quoting interface methods land
   on adapter classes;
   `pnpm tsx scripts/api-compare/compare.ts --package activerecord --privates`
   should be flat or improve.

## Sequencing & PR sizing

```
PR 1 ──► PR 2 ──► PR 3, 4, 5  (phase 2, parallel after PR 2)
                  PR 6, 7     (phase 3, parallel after PR 2)
                  PR 8, 9     (phase 4, parallel after PR 2)
                              └─► PR 10 (phase 5, after all above)
```

| PR  | Phase | Scope                                            | Est. LOC | Status        |
| --- | ----- | ------------------------------------------------ | -------- | ------------- |
| 1   | 0     | uniform `quoteIdentifier` across adapter modules | ~50      | merged #1051  |
| 2   | 1     | `Quoting` interface + adapter `implements`       | ~120     | merged #1058  |
| 3   | 2     | sanitization through `quoter`                    | ~150     | merged #1065  |
| 4   | 2     | query-methods + relation neutralize              | ~120     | merged #1068  |
| 5   | 2     | database-statements `this.quoteX`                | ~80      | merged #1070  |
| 6   | 3     | abstract schema-creation + schema-definitions    | ~250     | merged #1072  |
| 7   | 3     | abstract schema-statements + PG schema files     | ~200     | merged #1075  |
| 8   | 4     | model-schema + internal-metadata + primary-key   | ~200     | open          |
| 9   | 4     | migration + alias-tracker + association-scope    | ~150     | open          |
| 10  | 5     | remove `adapter?:` param                         | ~80      | open          |

Total: 10 PRs, all under the 300-LOC ceiling. PRs 8/9 parallel; PR 10
gates on both.

## Acceptance criteria

1. **No external imports of abstract quoting:**

   ```sh
   grep -rn 'from.*abstract/quoting' packages/activerecord/src --include='*.ts' \
     | grep -v 'connection-adapters/abstract/' \
     | grep -v 'connection-adapters/postgresql/quoting.ts' \
     | grep -v 'connection-adapters/mysql/quoting.ts' \
     | grep -v 'connection-adapters/sqlite3/quoting.ts' \
     | grep -v 'connection-adapters/abstract-adapter.ts'
   ```

   returns no results. (Test files under `abstract/` are exempt.)

2. **Adapter-specific identifier quoting is correct (behavioral):**
   - `new PostgreSQLAdapter(...).quoteIdentifier("foo") === '"foo"'`
   - `new Mysql2Adapter(...).quoteIdentifier("foo") === "\`foo\`"`
   - `new SQLite3Adapter(...).quoteIdentifier("foo") === '"foo"'`

   Boolean literals stay at Rails parity (PG/MySQL `quote(true) === "TRUE"`,
   SQLite `quote(true) === "1"`); not changed by this refactor.

3. **Full `Quoting` interface coverage:** each adapter class satisfies
   `implements Quoting` with no `// @ts-expect-error`.

4. **No `adapter?:` enum parameter:**

   ```sh
   grep -rn '"sqlite" | "postgres" | "mysql"' packages/activerecord/src
   ```

   matches only documentation strings, not function signatures.

5. **Tests:** `pnpm test` and `pnpm test:types` green.

6. **Parity:** `pnpm parity:schema` and `pnpm parity:query` no
   regressions; private `api:compare` non-decreasing.

## Notes

- Purely internal refactor — no public API changes.
- Arel's `SubstituteBindCollector` already uses the right pattern
  (quoter interface injection); no changes there.
- MySQL's runtime SQL transformation (`mysqlQuote(sql)` that converts
  `"` to backticks) becomes redundant once all schema/relation paths
  use MySQL's quoting directly — removable as a follow-up after Phase
  4, not part of this refactor.
