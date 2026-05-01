# Quoting Cleanup: Follow-up PR Plan

Follow-up to `quoting-refactor.md`. Each PR ≤300 LOC (CLAUDE.md ceiling),
ordered so the correctness fixes land first and the hygiene work can run
in parallel after. File:line refs are against the worktree at HEAD
(`worktree-quoting-pr8`); Rails refs are under
`scripts/api-compare/.rails-source/`.

## Alternative: drive this with `api:compare --privates-only`

Before hand-rolling the list, consider spiking `api:compare --privates-only`
for the four quoting modules (the same pattern that drove
`arel-privates-100-plan.md` and the activemodel privates track). It would
auto-surface the **missing-method** items here (PRs A, F, J's stub list
plus `quoted_date`, `encode_array`, `type_cast_array`,
`type_cast_range_value`, `type_casted_binds`, `lookup_cast_type`) and
give a continuous regression metric. It will **not** catch the
behavioral or structural items — contract inversions (PR D), extra
methods that shouldn't exist (PR C `mysqlQuote`), signature drift
(PR B `column` arg), `RegExp` subclassing (PR I), or memoization
shape (PR H). Recommended sequence: PR A first (smallest correctness
fix, establishes the binding pattern), then the privates-compare
spike, then PRs B–K with the spike's deficit list folded in.

## Dependency graph

```
PR A ──► PR B ──► PR C
  │                │
  └──► PR D        ├──► PR E
                   │
                   └──► PR F, G, H, I, J  (parallel, after C)

PR K  (decision-only; schedule after A–E)
```

- **A → B**: B reuses A's "bind PG instance override" pattern.
- **A → D**: D removes the deprecated `pgQuoteString` re-export A introduces.
- **B → C**: C is the largest behavioral change; B-in-place catches default-value regressions.
- **C → E**: sanitization callers may currently depend on `mysqlQuote`'s post-process.
- **C → F/G/H/I/J**: independent of each other but all benefit from C landing first to avoid merge conflicts in the adapter classes.

| PR  | Title                                              | Tier | Est. LOC  |
| --- | -------------------------------------------------- | ---- | --------- |
| A   | PG `quoteString` instance override                 | P0   | ~80       |
| B   | `quoteDefaultExpression` `column` arg on interface | P0   | ~150      |
| C   | Eliminate `mysqlQuote` SQL post-process            | P0   | ~250      |
| D   | Standalone `quoteString` contract fix              | P1   | ~120      |
| E   | `sanitization.ts` drop abstract/quoting imports    | P1   | ~80       |
| F   | `quoteSchemaName` public + dedupe `quoteLiteral`   | P1   | ~60       |
| G   | MySQL matcher tightening                           | P1   | ~80       |
| H   | Identifier-quote memoization                       | P1   | ~120      |
| I   | `ColumnMatcher` → plain function                   | P2   | ~150      |
| J   | PG `Bit::Data` hex + dedupe `isSqlLiteral`         | P2   | ~80       |
| K   | MySQL `quotedTrue` re-litigation (decision PR)     | P2   | ~30 + RFC |

---

## PR A — PG `quoteString` instance override

**Why.** `pgAdapter.quoteString(s)` currently falls through to
`AbstractAdapter.quoteString` (backslash-doubling). Rails PG goes
through `connection.escape(s)` (`postgresql/quoting.rb` `quote_string`).
The PG-specific helper exists but is never bound to the class.

**Rails reference:**

- `activerecord/lib/active_record/connection_adapters/postgresql/quoting.rb`
  → `quote_string(s)` calls `valid_raw_connection.escape(s)`.

**Trails files / changes:**

1. `packages/activerecord/src/connection-adapters/postgresql/quoting.ts:129`
   — split `pgQuoteString` into two exports:
   - `pgEscapeString(s: string): string` — escape-only (E-escape
     heuristic body, no surrounding quotes).
   - `pgQuoteStringLiteral(s: string): string` — wraps with `'…'` or
     `E'…'`. Implemented via `pgEscapeString`.
     Keep `pgQuoteString` as a deprecated re-export of
     `pgQuoteStringLiteral` for one PR cycle, then remove in PR D.
2. `packages/activerecord/src/connection-adapters/postgresql-adapter.ts`
   (around the other `override quote*` lines near :1890–:1906) — add:
   ```ts
   override quoteString = (s: string): string => pgEscapeString(s);
   ```
3. New test `postgresql/quoting.test.ts`:
   - `pgEscapeString("o'brien")` → `o''brien`
   - `pgEscapeString("a\\b")` → `a\\\\b`
   - `pgAdapter.quoteString("o'brien")` matches Rails behavior
     (`SELECT quote_literal('o''brien')` round-trip).

**Acceptance:** new tests pass; no other call sites change behavior
(parity:query/schema unchanged).

---

## PR B — `quoteDefaultExpression(value, column?)`

**Why.** Rails `quote_default_expression(value, column)` always passes
`column` so the type can serialize the value before quoting. Trails
dropped `column` from the interface, so adapters can't serialize through
the type system from a generic call site.

**Rails reference:**

- `abstract/quoting.rb` `quote_default_expression(value, column)` →
  `quote(type.serialize(value))`.
- `postgresql/quoting.rb` adds the
  `column.type == :uuid && value.include?("()")` passthrough.

**Trails changes:**

1. `connection-adapters/abstract/quoting-interface.ts:46` — change
   signature to `quoteDefaultExpression(value: unknown, column?: ColumnLike): string;`
   (define `ColumnLike` as `{ sqlType: string; type?: string }` in the
   interface file).
2. `connection-adapters/abstract/quoting.ts:166` — accept `column?`,
   when provided look up the cast type via the host's `lookupCastType`
   and call `.serialize(value)` before quoting. When absent, current
   body unchanged.
3. `connection-adapters/postgresql/quoting.ts:191` — switch optional
   `typeMap` plumbing to `column?`, lookup via the adapter's `typeMap`.
   Add the UUID-function passthrough:
   `if (column?.type === "uuid" && typeof value === "string" && value.includes("()")) return value;`
4. `connection-adapters/sqlite3/quoting.ts:114` — accept `column?`;
   delete the explicit `null → "NULL"` branch (let it fall through to
   `quote(null)`).
5. `connection-adapters/mysql/quoting.ts` — accept `column?` (no body
   change beyond signature).
6. Update all bindings on adapter classes (search:
   `grep -n "quoteDefaultExpression" packages/activerecord/src/connection-adapters/*-adapter.ts`).
7. Tests: add a "serializes through column type" assertion per adapter;
   add the PG UUID `uuid_generate_v4()` passthrough test mirroring
   `activerecord/test/cases/adapters/postgresql/quoting_test.rb`.

**Acceptance:** existing migration / model-schema fixtures unchanged;
new column-arg tests pass.

---

## PR C — Eliminate `mysqlQuote` SQL post-process

**Why.** `mysql2-adapter.ts:215` defines a private `mysqlQuote(sql)`
that text-scans built SQL converting `"ident"` → `` `ident` ``. Called
from :281, :338, :497, :521. Rails has no analogue — visitors emit the
right dialect on first pass. This is the single biggest "this isn't how
Rails does it" remaining.

**Rails reference:**

- `activerecord/lib/active_record/connection_adapters/abstract_mysql_adapter.rb`
  — `execute`/`exec_query` pass SQL straight to the driver. No post-process.

**Trails changes:**

1. Audit producers — for each of the four call sites, trace what builds
   the SQL string (visitors, schema statements, internal queries) and
   ensure the path uses `this.quoteIdentifier`/`this.quoteColumnName`
   instead of the abstract default.
2. Likely culprits to verify:
   - Arel visitor selection on MySQL (should already use MySQL visitor;
     if any abstract visitor leaks in, fix it).
   - Schema-statement helpers in
     `connection-adapters/abstract/schema-statements.ts` invoked via
     `mysql2-adapter.ts` execute paths — they should call
     `this.quoteIdentifier` (post-PR #1075 they do, but :281/:338 are
     `execute`/`exec_query` entry points: anything passing pre-formed
     SQL with `"ident"` quotes in it is the real problem).
3. Replace the four `this.mysqlQuote(sql)` calls with `sql`; delete
   `private mysqlQuote` and the `quoteString as mysqlQuoteString` import
   if no longer needed (line 11).
4. Behavioral test: run a `Model.where("users.id = ?", 1).first()` on a
   live MySQL connection and assert the wire SQL contains backticks,
   not double quotes (capture via the adapter's query log).
5. Add a regression guard: a unit test asserting
   `mysql2-adapter.ts` source contains no `mysqlQuote` symbol.

**Acceptance:**

- `grep -rn "mysqlQuote" packages/activerecord/src` returns zero
  (excluding the import alias `mysqlQuoteString` if still used).
- `pnpm parity:query` clean.
- MySQL test suite green.

**Risk.** This PR is the most likely to flush out latent producers.
Budget for a follow-up if a producer is large enough to need its own PR
— in that case, split into `C` (audit + producer fixes) and `Cb`
(remove `mysqlQuote`).

---

## PR D — Standalone `quoteString` contract fix

**Why.** `mysql/quoting.ts:88` and `sqlite3/quoting.ts:65` standalone
`quoteString` returns full `'…'` literals; Rails `quote_string` is
escape-only. Adapter instance methods are correct; standalones invert
the contract.

**Rails reference:**

- `mysql/quoting.rb` `quote_string(s)` → escape-only (calls driver).
- `sqlite3/quoting.rb` `quote_string(s)` → `SQLite3::Database.quote(s)`
  (escape-only).

**Trails changes:**

1. `mysql/quoting.ts:88` — rename current export to
   `mysqlQuoteStringLiteral` (wrapping form). Add a true escape-only
   `quoteString(s)` matching the abstract contract (already exists as
   the instance method body in `abstract-mysql-adapter.ts:574` — extract
   into the module).
2. `sqlite3/quoting.ts:65` — same: rename wrapping form to
   `sqliteQuoteStringLiteral`; add escape-only `quoteString(s)`.
3. Update internal callers (`mysql2-adapter.ts:11`,
   `sqlite3-adapter.ts` imports) to use the literal-form name where
   they currently expect wrapping.
4. Remove the deprecated `pgQuoteString` re-export from PR A.
5. Update `quoting-interface.ts:28–30` doc — anomaly resolved.

**Acceptance:** standalone `quoteString(s)` and instance
`adapter.quoteString(s)` produce identical escape-only output for all
three dialects.

---

## PR E — `sanitization.ts` drop `abstract/quoting` imports

**Why.** `sanitization.ts:9–14` still imports `quote`,
`quoteIdentifier`, `quoteTableNameForAssignment`, `quoteString`,
`castBoundValue` from `abstract/quoting.js`, and constructs an
`ABSTRACT_QUOTER` fallback (`:29`). Every production call already has a
real adapter; the fallback is dead in prod and only hides bugs.

**Rails reference:**

- `activerecord/lib/active_record/sanitization.rb` — every helper takes
  the connection (`connection.quote(value)`); no abstract fallback.

**Trails changes:**

1. `sanitization.ts:8–14` — delete the `abstract*` imports.
2. `sanitization.ts:28–35` — delete `ABSTRACT_QUOTER`.
3. Make every `Quoter` parameter required (drop `quoter = ABSTRACT_QUOTER`
   defaults). Search: `grep -n "quoter" packages/activerecord/src/sanitization.ts`.
4. Caller audit: any `sanitizeSqlForConditions(args)` call without an
   adapter is a bug; thread `this.connection` from the caller.
5. Run the acceptance grep:
   `grep -rn "from.*abstract/quoting" packages/activerecord/src --include='*.ts' | grep -v test | grep -v "connection-adapters/"`
   should return zero.

**Acceptance:** zero non-test, non-`connection-adapters/` imports of
`abstract/quoting.ts`.

---

## PR F — `quoteSchemaName` public + dedupe `quoteLiteral`

**Why.** `postgresql-adapter.ts:3313` declares `quoteSchemaName` as
`private`; Rails has it public (used by schema management).
`postgresql-adapter.ts:3339` `quoteLiteral` duplicates `quoteString`.

**Rails reference:**

- `postgresql/quoting.rb` `quote_schema_name(name)` — public.
- Rails has no `quote_literal`; PG schema queries use `quote(value)`.

**Trails changes:**

1. `postgresql-adapter.ts:3313` — remove `private`. Add `quoteSchemaName`
   to a new `PostgreSQLQuoting` interface (extends `Quoting`) in
   `postgresql/quoting-interface.ts` (new file, ~10 LOC).
2. `postgresql-adapter.ts:3339` — delete `quoteLiteral`. Audit callers
   (`grep -rn "quoteLiteral" packages/activerecord/src`); replace with
   `this.quote(value)` or `this.quoteString(value)` as appropriate per
   call site.
3. Tests: add a public-API test for `pgAdapter.quoteSchemaName("public")`.

---

## PR G — MySQL matcher tightening

**Why.** `mysql/quoting.ts:124` (`columnNameMatcher`) accepts integer
literals and `"double-quoted"` identifiers; Rails MySQL accepts only
`` `\w+` `` and bare `\w+`. `mysql/quoting.ts:147`
(`columnNameWithOrderMatcher`) accepts `NULLS FIRST/LAST`; Rails MySQL
does not.

**Rails reference:**

- `mysql/quoting.rb` `column_name_matcher` and
  `column_name_with_order_matcher` — backtick-only identifier atom; no
  NULLS FIRST/LAST clause.

**Trails changes:**

1. `mysql/quoting.ts:124` — drop integer-literal and `"…"` branches
   from the `id` atom.
2. `mysql/quoting.ts:147` — remove `NULLS (FIRST|LAST)` alternation.
3. Tests: mirror Rails test cases from
   `activerecord/test/cases/adapters/mysql2/quoting_test.rb` (search
   `column_name_matcher`).

**Risk.** May regress trails callers that depend on the over-permissive
matcher. If `safe_sql` / order-clause sanitization fails, those callers
were silently passing invalid input — fix them instead of widening the
matcher again.

---

## PR H — Identifier-quote memoization

**Why.** Rails uses `Concurrent::Map` for `QUOTED_COLUMN_NAMES` and
`QUOTED_TABLE_NAMES` per adapter class (`abstract/quoting.rb`). Trails
recomputes the regex replace on every call. Hot-path; the per-class cache
mirrors Rails 1:1.

**Rails reference:**

- `abstract/quoting.rb` `QUOTED_COLUMN_NAMES = Concurrent::Map.new`,
  `quote_column_name(name) { QUOTED_COLUMN_NAMES[name] ||= … }`.
- Same in `postgresql/quoting.rb`, `mysql/quoting.rb`, `sqlite3/quoting.rb`.

**Trails changes:**

1. Add `private static readonly QUOTED_COLUMN_NAMES = new Map<string,string>();`
   and `QUOTED_TABLE_NAMES = new Map<string,string>();` to each adapter
   class (`postgresql-adapter.ts`, `abstract-mysql-adapter.ts`,
   `sqlite3-adapter.ts`, `abstract-adapter.ts`).
2. Wrap the bound `quoteColumnName`/`quoteTableName` instance methods to
   consult/populate the class cache.
3. Eviction: none in Rails — identifiers are bounded; no need.
4. Test: cache hit returns same string ref; clearing via a test util
   (private method) restores cold path.

**Risk.** Caches at class level survive across tests in the same
process; ensure tests that mutate identifier shape aren't poisoned.

---

## PR I — `ColumnMatcher` → plain function

**Why.** `sqlite3/quoting.ts:299` subclasses `RegExp` and overrides
`.test()`/`.exec()` with a hand-written parser. No Rails analogue;
breaks any caller introspecting `.source`/`.flags`/`.lastIndex`.

**Rails reference:**

- `sqlite3/quoting.rb` `column_name_matcher` — recursive regex
  (`/x` extended mode); single Regexp object.

**Trails changes:**

1. Replace `ColumnMatcher` (`sqlite3/quoting.ts:299–319`) with a plain
   function `matchesSqliteColumnName(s: string): RegExpMatchArray | null`.
2. `columnNameMatcher()` (`:324`) — return an object with only the
   methods callers actually use (`{ test(s), exec(s) }`).
3. Audit callers: `grep -rn "columnNameMatcher" packages/activerecord/src`.
   Adjust any that touched `.source`/`.flags` (likely none).

---

## PR J — PG `Bit::Data` hex + dedupe `isSqlLiteral`

**Why.** `pg/quoting.ts:168` only handles `B'…'` Bit values (binary).
Rails branches on `value.binary?` / `value.hex?` (→ `X'…'`). Also,
`isSqlLiteral` exists in two places (`abstract/quoting.ts:418`,
`postgresql/quoting.ts:354`) with the same body.

**Rails reference:**

- `postgresql/quoting.rb` `_quote(value)` Bit branch:
  `value.binary? ? "B'#{value}'" : "X'#{value}'"`.

**Trails changes:**

1. `pg/quoting.ts:164` — add the hex branch. Define a `BitData`
   shape with `binary: boolean` and switch.
2. Move `isSqlLiteral` to a new `connection-adapters/abstract/sql-literal.ts`
   (~15 LOC). Re-export from `abstract/quoting.ts` and `pg/quoting.ts`
   for back-compat one cycle.

---

## PR K — MySQL `quotedTrue/False` decision

**Why.** `mysql/quoting.ts:34` returns `"1"`/`"0"`. Rails MySQL inherits
`"TRUE"`/`"FALSE"` from `abstract/quoting.rb`. The override keeps
`quote(true) === "1"` consistent with `quotedTrue() === "1"`. Rails
intentionally lives with the inconsistency (`quote(true) === "'t'"`
historically; now `"TRUE"`).

**This is a decision PR, not a code PR.** Two viable outcomes:

- **(a)** Revert to Rails behavior. Update `mysql/quoting.ts:34,42` to
  return `"TRUE"`/`"FALSE"`. Audit any MySQL fixture that hard-codes
  `"1"`/`"0"` for boolean literals.
- **(b)** Document the divergence as permanent. Replace the
  `abstract-mysql-adapter.ts:201–210` block with a stronger comment
  citing the Rails wart and the trails decision; remove from the
  follow-up audit.

Recommend running a quick poll of test fixtures to estimate (a)'s blast
radius before deciding. Pure decision/docs PR if (b); ~30 LOC + fixture
churn if (a).

---

## Acceptance for the whole track

1. `grep -rn "from.*abstract/quoting" packages/activerecord/src --include='*.ts' | grep -v test | grep -v "connection-adapters/"`
   → zero.
2. `grep -rn "mysqlQuote" packages/activerecord/src` → zero.
3. Each adapter's `quoteString(s)` is escape-only and matches its Rails
   counterpart on `"o'brien"`, `"a\\b"`, `" "`.
4. `Quoting.quoteDefaultExpression` accepts an optional `column` and at
   least PG/SQLite serialize through it.
5. `pnpm parity:schema` and `pnpm parity:query` no regressions; private
   `api:compare` for `activerecord` non-decreasing.
