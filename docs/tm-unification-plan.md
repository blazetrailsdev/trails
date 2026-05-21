# TM unification plan

Status tracker for the multi-phase effort to route every database
adapter through `TransactionManager` (TM), retire the test-only
`SchemaAdapter` wrapper, and migrate every AR test file to
once-per-file schema setup with transactional fixtures.

Phases 1–4, 7, 8 are closed. Phase 5 (universal `defineSchema`) is
complete. Phase 6 mechanical bulk migration is complete; the
remainder is sized per-file surgery. Phase 9a (SQLite visitor) is
merged. Phase 9b-1 (PG visitor) is merged. Phase 9b-2 is in flight:
9b-2a (arel `Table.star` fix) merged, 9b-2b (MySQL gate flip +
assertion sweep) in review.

For closed-phase narrative and the original Path 1/Path 2 fallback
diagnosis, see the merged PRs cited in each phase header and the
broader history via `git log --grep="TM Phase" --oneline`.

> `[[slug]]` references point to Claude auto-memory entries stored
> outside the repo; they don't render as links on GitHub.

## Phase 6 — Hoist `defineSchema` from `beforeEach` to once-per-file — substantially complete

`withTransactionalFixtures` is the canonical pattern. Roughly 85 of
~120 candidate files have been migrated. The full PR list lives in
`git log --grep="TM Phase 6" --oneline`; key infra landings:

- **#2064** — schema-cache invalidation on rollback
- **#2108** — DDL-tracker snapshot/restore + `invalidateSchemaCache:
false` opt-out

### Hazard catalogue (spawn briefs must include)

1. **Inline DDL in `it()` bodies (PG + MySQL).** `createTable`,
   `CREATE INDEX`, `addColumn`, `defineSchema(`, `freshAdapter(`, or
   any helper wrapping DDL inside a test body breaks the outer-txn
   wrap on PG/MySQL. SQLite hides it.
   ([[feedback_tm_phase6_inline_ddl]])
2. **MariaDB savepoint conflict.** Tests using
   `dependent: :destroy/:nullify/:restrict` emit
   `SAVEPOINT active_record_1 does not exist` on MariaDB only.
   SQLite + PG tolerate. ([[feedback_tm_phase6_mariadb_savepoint]])
3. **PG sequence drift.** Autoincrement sequences don't roll back.
   Capture `.id` from creates instead of asserting literals.
   ([[feedback_tm_phase6_pg_sequence_drift]])
4. **Carve-out vs `test:compare`.** Adding a new top-level
   `describe(...)` to an existing file breaks `test:compare`
   matching. Use a file-level split (new file, same describe path) or
   an infra fix in the helper instead.
   ([[feedback_tm_phase6_carve_vs_testcompare]])

### Permanent skip list (excluded from the audit denominator)

- `migration.test.ts` — real DDL inside test bodies
- `transactions.test.ts` — top-level TM tests conflict with outer wrap
- `define-schema-pg-types.test.ts` — `defineSchema` IS the SUT
- `encryption.test.ts` — already on freshAdapter-per-test
- `adapters/sqlite3/json.test.ts` — per-test `:memory:`, nothing shared
- `test-helpers/{define-schema,use-fixtures}.test.ts` — `defineSchema`
  is the SUT / mocked adapters

### Remaining sized followups (per-file surgery)

Bundle into ~250 LOC PRs where possible. See
[[project_phase6_mechanical_ceiling]] for the audit that established
these as hazard-only.

- **~50-100 LOC** — MariaDB savepoint tolerance in
  `withTransactionalFixtures`. Three candidate designs in PR #2108
  post-merge findings; needs Rails-source dive. Unlocks the entire
  `dependent:` cluster in one shot.
- **~80 LOC** — `inheritance.test.ts` retry. ~20 tests starting at
  line 1063 shadow `adapter` with inline `freshAdapter()`. Needs
  either MariaDB-tolerance (above), per-file split, or an "ignore
  tests that establish their own adapter" mechanism in the helper.
- **~100 LOC** — `has-one-associations.test.ts` `dependent:` cluster.
  Same root cause; unblocked by the savepoint-tolerance fix.
- **~100 LOC** — `base.test.ts` retry with pre-declared
  `pres_tz_topics` and other in-test tables in file-level `beforeAll`.
- **~150 LOC** — `finder.test.ts` retry with inline-DDL pre-grep.
- **~5 LOC** — migrate one DML-only file to
  `withTransactionalFixtures(..., { invalidateSchemaCache: false })`
  to validate the new opt-out path on real CI.
- **Deferred (un-attempted)**:
  `has-and-belongs-to-many-associations.test.ts`, `join-model.test.ts`,
  `source-type-validation.test.ts`. Each has per-`it()` adapter
  ownership; structural restructure needed.

## Phase 9 — Collapse `SchemaAdapter` to a SQL-compat shim or delete

After Phase 7 deletion (#2035), `test-adapter.ts` was ~820 LOC of
mostly delegation pass-throughs with two pieces of non-delegation
logic:

1. **`fixSqliteCompat`** — three SQLite-specific SQL string fixes
   applied in `execute`/`executeMutation`
2. **`arelVisitor` returning `undefined`** — forced a dormant-visitor
   fallback in `Relation#_arelVisitor()` that emitted generic SQL
   leniently (`TRUE`/`FALSE` for booleans, all-ANSI identifier
   quoting, never reaching strict `quote()` — masking latent
   adapter-specific gaps)

### Phase 9a — activate `Visitors::SQLite`, delete `fixSqliteCompat` — closed (#2127, #2132)

- `SchemaAdapter.arelVisitor` flipped from hard-coded `undefined` to
  delegating to the inner adapter, **gated on `sqlite`**. PG/MySQL
  remained on the dormant fallback (PG was added in 9b-1; MySQL
  pending in 9b-2).
- `fixSqliteCompat` and `unwrapCompoundSelect` deleted
- `Relation#_toSql` set-op path simplified to plain
  `${left} ${op} ${right}` concatenation
- 6 lock-assertion tests gated `skipIf(adapterType === "sqlite")` —
  Rails' SQLite visitor canonically drops `FOR UPDATE`/`FOR SHARE`
- 4 encryption binary tests initially skipped in #2127, re-enabled in
  #2132 by mirroring Rails' `Type::Binary::Data` branch in
  SQLite/MySQL/PG `quote()` (matches `abstract/quoting.rb`)
- `test-adapter.ts` 819 → 775 LOC (−44)

### Phase 9b — activate PG/MySQL visitors, then delete `SchemaAdapter`

Each adapter activation surfaces its own pool of "always-broken under
live visitor" tests — tests that were silently passing only because
the dormant fallback in `relation.ts:3614-3619` emitted generic
all-ANSI SQL. Each adapter is its own PR; bundling risks a CI failure
that's hard to triage.

**9b-1 — activate PG `arelVisitor` delegation — closed (#2139).** The
gate at `test-adapter.ts:716` now passes both `sqlite` and `postgres`.
Smaller surface than 9a (3 files, +41/-27). 3 PG-bytea encryption
tests skipped pending a `type.serialize` follow-up; that work is
tracked in 9b-2d below.

**9b-2 — activate MySQL `arelVisitor` delegation.** Split into a
prerequisite arel fix and the gate flip proper:

- **9b-2a — `Table.star` → `Attribute` — closed (#2144).** First
  attempt (#2141, closed) surfaced 56 MariaDB failures rooted in
  mixed-quote SQL: `Table.star` in `packages/arel/src/table.ts` was
  a pre-baked ANSI `SqlLiteral` that bypassed the adapter visitor.
  Rails uses `table[Arel.star]` (an `Attribute`) so the visitor
  handles dialect quoting. #2144 restored that shape; SQLite/PG
  unchanged, MySQL now emits backticks via the visitor.
- **9b-2b — gate flip + assertion sweep — in flight (#2155).** Drops
  the adapter conditional from `test-adapter.ts:716` so all three
  adapters delegate. Sweep of ~50 hardcoded `'"name"'` assertions in
  `relation.test.ts` via a `Q(...)` helper that rewrites to backticks
  on MySQL. Split-out fixes already merged (each surfaced as the
  sweep proceeded):
  - **#2156** — `JoinDependency` identifier quoting routed through
    adapter helpers (LEFT OUTER JOIN clauses were hardcoded ANSI;
    same bug family as #2141 in a different code path).
  - **#2157** — `Relation#_applyOrderToManager` swapped `UnqualifiedColumn(table.get(col))` for `SqlLiteral(adapter.quoteColumnName(col))` to fix subquery-alias ORDER BY of unknown columns (MySQL's `UnqualifiedColumn` visitor override re-qualified). Tactical fix, not Rails-shaped — see 9b-2c.

**9b-2c — Rails-shape #2157's ORDER BY path — ~30-50 LOC followup.**
Rails' `preprocess_order_args` (`active_record/relation/query_methods.rb`)
routes unknown columns through
`arel_column(field) { |name| connection.quote_table_name(name) }`.
The yield returns a bare-quoted identifier, so Rails never constructs
an `UnqualifiedColumn` for ORDER BY — that node is reserved for
UPDATE-set semantics. #2157's fix emits equivalent SQL but bypasses
`arel_column`. Mirror that path so node construction matches Rails.
([[project_pr2157_followup_arel_column_path]])

**9b-2d — PG-bytea encryption `type.serialize` followup — ~30 LOC.**
3 encryption tests remain skipped on PG bytea after #2139. Route
`EncryptedAttribute` writes through `type.serialize` before reaching
`adapter.quote()`. Same root cause as 9a's SQLite encryption skips —
#2132 fixed those at the `quote()` layer (`Type::Binary::Data`
branch). The PG-bytea case needs the parallel fix at the
type-serialize layer, not at `quote()`. Likely also resolves any
MySQL BLOB skips 9b-2b surfaces.

**9b-2e — re-enable #2155's skips via Rails-idiomatic assertions —
sized per file, no shared helper.** 9b-2b (#2155) `.skip`s the ~50
tests in `relation.test.ts` (and any other files surfaced by CI)
whose assertions hardcode ANSI `"name"` quoting. **The `.skip` with
rationale is itself the correct Rails idiom** — Rails has no shared
adapter-quote-rewriting helper ([[feedback_no_q_wrap_helper]]).

Two options per skipped test, picked individually:

1. **Inline `Regexp.escape(quote_*_name(name))` in the assertion** —
   Rails' canonical pattern, no exported helper. From
   `vendor/rails/activerecord/test/cases/relation/predicate_builder_test.rb`:
   ```ruby
   assert_match %r{#{Regexp.escape(quote_table_name("topics.title"))} ~ 'rails'}i, ...to_sql
   ```
   In trails: `expect(sql).toMatch(new RegExp(escapeRegExp(adapter.quoteColumnName("name"))))`
   — full names, no abbreviation, no exported helper. If a single
   test has many quoted identifiers, a local
   `const escaped = (name) => escapeRegExp(adapter.quoteColumnName(name))`
   binding scoped to that test mirrors Rails' local lambda — but it
   stays local.
2. **Rewrite to behavior-based assertion** — assert the SQL
   _outcome_ (returned rows, computed values) instead of the SQL
   string structure. Often cleaner; some `.toSql()` assertions are
   really testing query construction that's better verified by
   executing the query and checking results.

When neither fits cleanly, the `.skip` stays. Don't ship a shared
helper; don't ship a post-hoc rewriter.

**9b-3 + 9b-4 — delete the dormant-visitor fallback and
`SchemaAdapter`.** Bundled because the fallback deletion is small (~50
LOC) and the dependent class deletion is the natural follow-on:

- Delete `relation.ts:3614-3619`'s
  `adapter?.arelVisitor ?? new Visitors.ToSql(adapter ?? undefined)`
  fallback (replace with a throw for the no-adapter edge case if any
  caller reaches it)
- Delete `SchemaAdapter` class; `createTestAdapter()` returns
  `PostgreSQLAdapter` / `Mysql2Adapter` / `SQLite3Adapter` directly
- Sweep ~148 consumers (mostly type-level `TestDatabaseAdapter`
  references)
- `test-adapter.ts` shrinks to ≤50 LOC of factory glue
- Estimated net -400 LOC

### Success criteria (Phase 9 overall)

- `test-adapter.ts` ≤50 LOC (or 0)
- `createTestAdapter()` returns the real adapter directly
- All tests pass on all three DB adapters
- Production `:memory:` SQLite paths get the same compat treatment as
  tests did (no regex; the Arel visitor emits correct SQL)

## Critical files

- `packages/activerecord/src/test-adapter.ts`
- `packages/activerecord/src/relation.ts` (the `_arelVisitor()` fallback)
- `packages/activerecord/src/test-helpers/with-transactional-fixtures.ts`
- `packages/activerecord/src/connection-adapters/{sqlite3,postgresql,mysql}-adapter.ts`
- `packages/arel/src/visitors/{to_sql,postgresql,sqlite,mysql}.ts`
