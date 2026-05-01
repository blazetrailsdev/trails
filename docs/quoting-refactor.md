# Quoting: Rails-Fidelity Audit (post-refactor)

> **Status (2026-05-01):** The 10-PR quoting refactor (#1051, #1058,
> #1065, #1068, #1070, #1072, #1075, plus #1086–#1088) has landed. Every
> non-adapter call site routes through `connection.quoteX(...)` and the
> `Quoting` interface; the `adapter?: "sqlite" | "postgres" | "mysql"`
> enum is gone from `abstract/quoting.ts`. **This document is the
> follow-up audit:** what still diverges from Rails, what's a smell, and
> what the remaining cleanup PRs should do. Goal — make the TS feel as
> much like the Ruby counterparts as possible.

## Executive summary

1. **`quoteString` has an inverted contract on per-dialect standalones.**
   `mysql/quoting.ts:88` and `sqlite3/quoting.ts:65` wrap with `'...'` and
   return a SQL literal; Rails `quote_string` is _escape-only_. The
   adapter-class instance methods are correct, but the standalones break
   the contract. Documented in `quoting-interface.ts:28–30`, but unfixed.
2. **`PostgreSQLAdapter` never installs a `quoteString` override.** The
   PG-specific `pgQuoteString` (E-escape heuristic) exists but isn't
   bound to the class — so `pgAdapter.quoteString(s)` falls through to
   the abstract backslash-doubling form. Rails PG calls
   `connection.escape(s)` here.
3. **`mysqlQuote` SQL post-process is still live** in `mysql2-adapter.ts`
   (line 215, called from :281, :338, :497, :521). It text-scans built
   SQL to convert `"ident"` → `` `ident` ``. Rails has no analogue —
   identifiers should leave the visitor in the right dialect already.
4. **MySQL `quotedTrue`/`quotedFalse` deliberately diverges from Rails**
   (returns `"1"`/`"0"`; Rails MySQL inherits `"TRUE"`/`"FALSE"`). The
   override keeps `quote(true)` and `quotedTrue()` self-consistent, but
   it's a Rails-fidelity break worth re-litigating now that the
   interface is in place.
5. **`quoteDefaultExpression` lost its `column` parameter** on the
   interface (`quoting-interface.ts:46`) and on the abstract
   implementation (`abstract/quoting.ts:166`). Rails always passes
   `column` so the type can serialize before quoting (load-bearing for
   array columns, enums, UUIDs, etc.). PG re-adds it as an optional;
   abstract drops it entirely.

## Method-by-method comparison

### `abstract/quoting.rb` → `abstract/quoting.ts`

| Rails method                                   | TS (file:line)                       | Status           | Notes                                                                                                                                                                                                         |
| ---------------------------------------------- | ------------------------------------ | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quote(value)`                                 | `quote` :50                          | diverges         | TS lacks `BigDecimal`, `Type::Binary::Data`, `Type::Time::Value`. Temporal replaces Date/Time. Acceptable for JS.                                                                                             |
| `type_cast(value)`                             | `typeCast` :83                       | diverges         | Same — drops Ruby-only types.                                                                                                                                                                                 |
| `cast_bound_value(value)`                      | `castBoundValue` :107                | matches          | Identity.                                                                                                                                                                                                     |
| `lookup_cast_type_from_column(column)`         | `lookupCastTypeFromColumn` :125      | diverges         | Rails resolves via instance `type_map`. TS takes optional `QuotingHost` param; falls back to returning `sqlType` string. The `QuotingHost` shape is awkward and unused in PG (where the real override lives). |
| `quote_string(s)`                              | `quoteString` :142                   | matches          | Escape-only on the abstract. (Per-dialect standalones diverge — see smells.)                                                                                                                                  |
| `quote_table_name_for_assignment(table, attr)` | `quoteTableNameForAssignment` :151   | matches          |                                                                                                                                                                                                               |
| `quote_default_expression(value, column)`      | `quoteDefaultExpression(value)` :166 | **diverges**     | Drops `column` arg; no type serialization before quoting.                                                                                                                                                     |
| `quoted_true/false`, `unquoted_true/false`     | :183/:190/:197/:204                  | matches          | `"TRUE"`/`"FALSE"`, `true`/`false`.                                                                                                                                                                           |
| `quoted_date(value)`                           | —                                    | **missing**      | TS uses Temporal-specific `formatInstantForSql`; no unified `quotedDate()` on the interface.                                                                                                                  |
| `quoted_time(value)`                           | —                                    | **missing**      | SQLite handles inline (`2000-01-01` prefix at sqlite3/quoting.ts:87). No shared abstract method.                                                                                                              |
| `quoted_binary(value)`                         | `quotedBinary` :369                  | matches          | `'#{quote_string(value)}'`.                                                                                                                                                                                   |
| `sanitize_as_sql_comment(value)`               | `sanitizeAsSqlComment` :379          | matches          |                                                                                                                                                                                                               |
| `type_casted_binds(binds)` (private)           | `typeCastedBinds` stub :428          | **missing**      | `NotImplementedError` stub — never callable.                                                                                                                                                                  |
| `lookup_cast_type(sql_type)` (private)         | `lookupCastType` stub :435           | **missing**      | Stub.                                                                                                                                                                                                         |
| `column_name_matcher`                          | `columnNameMatcher()` :392           | diverges (shape) | Rails uses recursive regex (`\g<2>`); JS can't, so TS unrolls 2 levels. Functionally approximate.                                                                                                             |
| `column_name_with_order_matcher`               | `columnNameWithOrderMatcher()` :408  | diverges (shape) | Same — 2-level unrolled.                                                                                                                                                                                      |

### `postgresql/quoting.rb` → `postgresql/quoting.ts`

| Rails method                                                   | TS (file:line)                                          | Status                  | Notes                                                                                                                                                                                                    |
| -------------------------------------------------------------- | ------------------------------------------------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `escape_bytea(value)`                                          | `escapeBytea` :235                                      | diverges                | Rails delegates to libpq. TS implements `\x` hex manually. Equivalent on the wire.                                                                                                                       |
| `unescape_bytea(value)`                                        | `unescapeBytea` :242                                    | diverges                | Same — manual hex + legacy octal.                                                                                                                                                                        |
| `check_int_in_range(value)`                                    | `checkIntegerRange` :335 (alias `checkIntInRange` :333) | diverges                | Rails honors `ActiveRecord.raise_int_wider_than_64bit`; TS always raises. Rails uses Ruby int coercion; TS uses `Number.isSafeInteger` which is stricter on float-encoded ints.                          |
| `quote(value)`                                                 | `quote` :164                                            | diverges                | Missing `OID::Bit::Data` _hex_ branch (`X'…'`); only `B'…'` is handled. `OID::Array::Data` uses `value.toString()` instead of `encode_array`. Numeric.finite? branch duplicates the string fall-through. |
| `quote_string(s)`                                              | `quoteString` :129                                      | **diverges (contract)** | Rails: `connection.escape(s)` (escape-only). TS: heuristic E-escape _and_ wraps with `'...'` — returns full literal. Inverts Rails contract. Also: not installed as instance override (see smell #2).    |
| `quote_table_name_for_assignment(_table, attr)`                | :144                                                    | matches                 |                                                                                                                                                                                                          |
| `quote_schema_name(name)`                                      | `quoteSchemaName` :151                                  | diverges (visibility)   | Standalone is correct; class method on `PostgreSQLAdapter:3313` is `private` — Rails has it public.                                                                                                      |
| `quoted_date(value)`                                           | —                                                       | **missing**             | Rails adds BCE handling (` BC` suffix). TS has no analogue.                                                                                                                                              |
| `quoted_binary(value)`                                         | `quotedBinary` :160                                     | matches                 | `'\\xHEX'`.                                                                                                                                                                                              |
| `quote_default_expression(value, column)`                      | `quoteDefaultExpression` :191                           | diverges                | Missing the `column.type == :uuid && value.include?("()")` UUID-function passthrough. Uses `typeMap?` param instead of resolving from `self`.                                                            |
| `type_cast(value)`                                             | `typeCast` :216                                         | diverges                | Drops Ruby `Rational`. Acceptable.                                                                                                                                                                       |
| `lookup_cast_type_from_column(column)`                         | :322                                                    | diverges (shape)        | Explicit `typeMap` param vs Rails `self.type_map`.                                                                                                                                                       |
| `encode_array` (private)                                       | stub :371                                               | **missing**             | `NotImplementedError`. Array quoting only works via `value.toString()`.                                                                                                                                  |
| `type_cast_array` (private)                                    | stub :385                                               | **missing**             |                                                                                                                                                                                                          |
| `type_cast_range_value` (private)                              | —                                                       | **missing**             | TS handles inline at :349 with `String()`.                                                                                                                                                               |
| `QUOTED_COLUMN_NAMES` / `QUOTED_TABLE_NAMES` (Concurrent::Map) | —                                                       | **missing**             | No identifier memoization. Rails caches per class.                                                                                                                                                       |
| `column_name_matcher`                                          | :277                                                    | matches (intent)        | String-composed, no recursive `\g`. Handles `::type`, quoted multi-part. Faithful.                                                                                                                       |

### `mysql/quoting.rb` → `mysql/quoting.ts`

| Rails method                     | TS (file:line) | Status                         | Notes                                                                                                                                                                        |
| -------------------------------- | -------------- | ------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `cast_bound_value(value)`        | :112           | diverges                       | Drops `Rational`/`BigDecimal` handling. `String(value)` covers numeric/bigint.                                                                                               |
| `unquoted_true/false`            | :38/:42        | matches                        | `1`/`0`.                                                                                                                                                                     |
| `quoted_true/false`              | :34/:42        | **extra-in-trails**            | Rails MySQL does NOT override these — inherits `"TRUE"`/`"FALSE"`. Trails returns `"1"`/`"0"` to stay self-consistent with `quote(true)`. Deliberate; documented; un-Rails.  |
| `quoted_binary(value)`           | :98            | matches                        | `x'HEX'`.                                                                                                                                                                    |
| `unquote_identifier(identifier)` | :105           | diverges                       | Rails strips first+last only if leading backtick. TS checks both ends.                                                                                                       |
| `type_cast(value)`               | :216           | **diverges (structural)**      | Rails passes `Time`/`TimeWithZone` to mysql2 as Ruby Time (driver-side formatting). TS pre-formats to strings via Temporal. Different model — TS has no live driver Time.    |
| `quote_table_name(name)`         | :50            | diverges                       | Rails wraps the whole name then `gsub('.','`.`')`. TS splits on `.` first then wraps each part. Equivalent for `schema.table`; differs for backticked names containing dots. |
| `quote_column_name(name)`        | :57            | matches                        |                                                                                                                                                                              |
| `column_name_matcher`            | :124           | **diverges (over-permissive)** | TS adds integer literals and `"double-quoted"` identifiers. Rails MySQL only matches `` `\w+` `` and bare `\w+`.                                                             |
| `column_name_with_order_matcher` | :147           | **diverges (over-permissive)** | TS adds `NULLS FIRST/LAST`; Rails MySQL has none.                                                                                                                            |

### `sqlite3/quoting.rb` → `sqlite3/quoting.ts`

| Rails method                                    | TS (file:line)                                   | Status                      | Notes                                                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------ | --------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `quote(value)`                                  | :69                                              | diverges (shape)            | Rails only overrides `Numeric.finite?`; TS reimplements full dispatch instead of chaining `super`. Equivalent output.                                           |
| `quote_string(s)`                               | :65                                              | **diverges (contract)**     | Rails: `SQLite3::Database.quote(s)` (escape-only). TS wraps with `'...'`. Inverts contract.                                                                     |
| `quote_table_name_for_assignment(_table, attr)` | :102                                             | matches                     |                                                                                                                                                                 |
| `quoted_time(value)`                            | —                                                | diverges                    | Rails normalizes to 2000-01-01 then calls `quoted_date`. TS handles `PlainTime` inline at :87 with `2000-01-01` prefix. No named method.                        |
| `quoted_binary(value)`                          | :106                                             | matches                     | `x'HEX'`.                                                                                                                                                       |
| `quoted_true/false`, `unquoted_true/false`      | :29/:37/:33/:41                                  | matches                     | `"1"`/`"0"`/`1`/`0`.                                                                                                                                            |
| `quote_default_expression(value, column)`       | :114                                             | diverges                    | Function/Proc branch close to Rails. TS handles `null` explicitly (Rails falls through to `quote(nil)`). Missing `column` arg path.                             |
| `type_cast(value)`                              | :128                                             | diverges                    | Drops `BigDecimal`/`Rational`. For infinite floats TS returns `null`; Rails would emit `"Infinity"`.                                                            |
| `column_name_matcher`                           | `ColumnMatcher` :299, `columnNameMatcher()` :324 | **diverges (architecture)** | TS subclasses `RegExp` and overrides `.test()`/`.exec()` with a hand-written parser. No Rails analogue; brittle for callers that introspect `.source`/`.flags`. |
| `QUOTED_COLUMN_NAMES` / `QUOTED_TABLE_NAMES`    | —                                                | **missing**                 | No memoization.                                                                                                                                                 |

## Smell list (file:line)

1. **`quoteString` contract inversion** — `mysql/quoting.ts:88`,
   `sqlite3/quoting.ts:65` return SQL literals; Rails `quote_string` is
   escape-only. Either rename to `quoteStringLiteral` or fix bodies.
2. **`PostgreSQLAdapter` missing `quoteString` override** — `pgQuoteString`
   exists but is never bound. `pgAdapter.quoteString(s)` falls through to
   abstract backslash-doubling.
3. **`quoteSchemaName` is `private`** on `postgresql-adapter.ts:3313`.
   Rails public; not callable through `Quoting` or external schema code.
4. **`quoteLiteral` is `private`** on `postgresql-adapter.ts:3339` and
   duplicates `quoteString`. Rails has neither — kill it or merge.
5. **`mysqlQuote` SQL text transform** — `mysql2-adapter.ts:215`,
   called from :281, :338, :497, :521. Re-quotes `"ident"` → `` `ident` ``
   on built SQL. Rails never does this; existence implies some path
   still emits double-quote identifiers for MySQL.
6. **`_adapterNameFromConfig`** — `connection-pool.ts:336`. String
   heuristic on `dbConfig.adapter` to derive dialect before the first
   connection. No Rails analogue. Architectural leak from the late-bind
   pool model.
7. **`ColumnMatcher extends RegExp`** — `sqlite3/quoting.ts:299`. No
   Rails analogue. Looks like a regex, parses like a parser; breaks any
   caller using `.source`/`.flags`/`.lastIndex`.
8. **Standalone `abstract/quoting.ts` imports from production code** —
   `sanitization.ts:14` still pulls `quote`, `quoteString`,
   `quoteIdentifier`, `quoteTableName`. Tests are exempt; sanitization
   is not. Should go through the adapter on the call.
9. **`quoteDefaultExpression` interface drops `column`** —
   `quoting-interface.ts:46`, `abstract/quoting.ts:166`. PG re-adds as
   optional. Should be `column?: ColumnLike` on the interface so
   adapters can serialize through the type system before quoting.
10. **Duplicate `isSqlLiteral`** — `abstract/quoting.ts:418` and
    `postgresql/quoting.ts:354`. Same `constructor.name` duck-type check.
11. **PG `Bit::Data` hex branch missing** — `pg/quoting.ts:168` only
    handles `B'…'`. Rails branches on `value.binary?`/`value.hex?`.

## Follow-up PRs (prioritized)

### P0 — correctness

1. **PG `quoteString` override.** Add
   `override quoteString = (s) => pgQuoteString(s).slice(1, -1);` (or
   refactor `pgQuoteString` into escape-only + `pgQuoteLiteral`). One
   PR; tests for backslash-bearing strings round-tripping correctly.
2. **Remove `mysqlQuote`.** Audit every site that builds SQL feeding
   `mysql2-adapter.ts:281,338,497,521`. Replace double-quote identifier
   emission with `this.quoteIdentifier`/`this.quoteColumnName`. Then
   delete the method. Stop relying on string post-processing.
3. **Add `column?` to `quoteDefaultExpression`** on the interface and
   abstract impl. Thread the type-serialize step (`lookupCastType(column.sqlType).serialize(value)`)
   in front of the quote call where the column is present.

### P1 — Rails fidelity

4. **Resolve `quoteString` standalone contract** in `mysql/`, `sqlite3/`.
   Rename to `quoteStringLiteral` _or_ make escape-only and fix call
   sites. Pick one; the current ambiguity is a latent bug.
5. **Make `quoteSchemaName` public** on `PostgreSQLAdapter`. Optionally
   add to a `PostgreSQLQuoting` interface that extends `Quoting`.
6. **Tighten MySQL matchers.** Drop integer literals, double-quoted
   identifiers, and `NULLS FIRST/LAST` from `mysql/quoting.ts:124,147`.
7. **Identifier-quote memoization.** Per-class `Map<string,string>` for
   `quoteColumnName`/`quoteTableName`, mirroring Rails'
   `Concurrent::Map`. Hot path; measurable.
8. **`sanitization.ts:14`** — drop `abstract/quoting` imports; route
   through `quoter: Quoting` already on the call sites post-PR-1065.

### P2 — shape hygiene

9. **Replace `ColumnMatcher`** with a plain function or an object
   exposing only `.test()`. Don't subclass `RegExp`.
10. **Document or restructure `_adapterNameFromConfig`**. Either accept
    that pool-proxy needs a string before connect (and add a comment
    explaining why Rails doesn't), or change pool init so the adapter
    class is selected up front.
11. **Dedupe `isSqlLiteral`** into one shared util.
12. **Add the PG `Bit::Data` hex branch** to `pg/quoting.ts:164`.
13. **Re-litigate MySQL `quotedTrue`/`quotedFalse`.** Either revert to
    Rails inheritance (`"TRUE"`/`"FALSE"`) and accept the
    `quote(true) === "1"` vs `quotedTrue() === "TRUE"` inconsistency
    Rails lives with, or document this as an intentional permanent
    deviation in `mysql/quoting.ts:34` and stop calling it a smell.

## What's already faithful — don't touch

- Boolean inheritance: abstract `"TRUE"`/`"FALSE"`, SQLite override
  `"1"`/`"0"`. Matches Rails.
- `quoteTableNameForAssignment`: SQLite/PG return column-only;
  abstract/MySQL return `table.column`. Correct.
- `sanitizeAsSqlComment`: faithful port of the Ruby gsub! sequence.
- `castBoundValue`: identity on abstract, numeric coercion on MySQL.
- PG `IntegerOutOf64BitRange` + `checkIntegerRange` — correct, the
  always-on raise is the safer JS default.
- Temporal-based datetime formatting (`formatInstantForSql`, MySQL
  6-digit, SQLite `2000-01-01` prefix) — the right call for JS.
- `quotedBinary` per dialect — all match Rails.
- PG `quoteTableName` correctly handles already-quoted identifiers via
  `splitSchemaQualifiedName` (more correct than naive split on `.`).
- `AbstractMysqlAdapter#quoteString` instance override is escape-only
  and correctly distinct from the standalone literal-wrapping form.
- PG `columnNameMatcher`/`columnNameWithOrderMatcher` string-composed
  approximation of the recursive Ruby regex.
- `escape_bytea`/`unescape_bytea` standalone `\x` hex implementations.

## Acceptance for the cleanup track

1. `grep -rn "from.*abstract/quoting" packages/activerecord/src --include='*.ts'`
   matches only files inside `connection-adapters/{abstract,postgresql,mysql,sqlite3}/`
   and `*.test.ts`. (Currently fails on `sanitization.ts:14`.)
2. `grep -rn "mysqlQuote" packages/activerecord/src` returns zero.
3. Each adapter's `quoteString(s)` is escape-only and matches its Rails
   counterpart's behavior on `"o'brien"` and `"a\\b"`.
4. `Quoting` interface's `quoteDefaultExpression` accepts an optional
   `column` and at least PG/SQLite serialize through it before quoting.
5. `pnpm parity:schema` and `pnpm parity:query` no regressions.
