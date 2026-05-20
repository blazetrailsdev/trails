# TM unification plan

Status tracker for the multi-phase effort to route every database
adapter through `TransactionManager` (TM), retire the test-only
`SchemaAdapter` wrapper, and migrate every AR test file to
once-per-file schema setup with transactional fixtures.

Phases 1–4, 7, 8 are closed. Phase 5 (universal `defineSchema`) is
complete. Phase 6 mechanical bulk migration is complete; the
remainder is sized per-file surgery. Phase 9a is merged for SQLite;
Phase 9b extends it to PG/MySQL and deletes `SchemaAdapter`.

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

- `SchemaAdapter.arelVisitor` (test-adapter.ts:709-719) now delegates
  to the inner adapter **for SQLite only**. The gate at line 718
  (`if (this.inner?.adapterName !== "sqlite") return undefined`) and
  its comment reserve the PG/MySQL flip for Phase 9b.
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

**9b-1 — activate PG `arelVisitor` delegation.** Flip the gate at
`test-adapter.ts:718` to also pass `postgres`. Audit
`Visitors::PostgreSQL` against
`vendor/rails/.../arel/visitors/postgresql.rb` for parity. Triage
surfaced failures: fix the visitor where it diverges from Rails; gate
test assertions where they hardcode dormant-fallback output.
Estimated ~200-300 LOC.

**9b-2 — activate MySQL `arelVisitor` delegation.** Same pattern.
MariaDB CI is the canary; expect identifier-quote-style assertion
fails since the dormant fallback emits ANSI `"` quotes but
`Visitors::MySQL` emits backticks. Estimated ~150-250 LOC.

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
