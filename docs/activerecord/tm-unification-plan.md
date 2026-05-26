# TM unification plan

Status tracker for the multi-phase effort to route every database
adapter through `TransactionManager` (TM), retire the test-only
`SchemaAdapter` wrapper, and migrate every AR test file to
once-per-file schema setup with transactional fixtures.

> **Status (2026-05-22):** Phases 1–8 closed. Phase 9a merged.
> Phase 9b: 9b-1 (PG) and 9b-2a–e (MySQL incl. Table.star) merged
> 2026-05-20→21. **9b-3 closed misdesigned (#2189) — fallback stays per
> Rails parity** (live production code for HABTM join models where
> `_modelClass._adapter` is null). Don't reopen as "delete the fallback."
>
> 9b-4 (`SchemaAdapter` delete) is collapsed with **pool epic Phase F**
> — see [`connection-pooled-test-adapter-plan.md`](connection-pooled-test-adapter-plan.md).
> Path 2 (sidecar) work tracks there too: 2a #2202, 2b #2206, 2c-2
> batch 1 #2219, batch 2 #2230. (#2236 reverted by #2239.)
>
> Phase 6 mechanical ceiling reached — bulk-migration phase done; the
> ~37 remaining files all hit hazard buckets (inline DDL / MariaDB
> savepoints / PG sequence drift / `test:compare` carve-out conflicts)
> and need per-file surgery, not another mechanical sweep. The
> savepoint-tolerance fix (~50–100 LOC) unblocks the `dependent:` cluster.

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
  remained on the dormant fallback (PG landed in 9b-1; MySQL landed in
  9b-2a–e).
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

**9b-3 — closed as misdesigned (#2189 closed, no merge).** The
plan-doc claim that the `_arelVisitor` fallback at
`relation.ts:3614-3619` was "dead code after all three adapters
expose `arelVisitor`" was wrong. CI proved it: 4 SQLite HABTM
destroy-callback tests crashed when the fallback was removed,
because `_modelClass._adapter` is `null` for auto-generated HABTM
join-table models, and the fallback's
`new Visitors.ToSql(undefined)` produces the DELETE FROM SQL those
tests rely on.

The fallback matches Rails' `AbstractAdapter#arel_visitor` default
(`abstract_adapter.rb:1190` — defaults to `ToSql.new(self)`, never
throws). The Rails-shape end state matches what trails already has.

**Don't reopen as "delete the fallback."** If anyone ever revisits,
the prerequisite is wiring an adapter onto HABTM join-table models
so `_modelClass._adapter` is never null on the `deleteAll` path —
that's separate, larger work, not a 1-line deletion.
([[project_phase9b3_fallback_is_not_dormant]])

**9b-4 — slim `SchemaAdapter` into `TestAdapterFixtures` (NOT delete
entirely).**

The original plan-doc framing of "delete `SchemaAdapter` entirely; ~148
type-level consumer sweep; net -400 LOC" was wrong. #2189's
investigation revealed `SchemaAdapter` is NOT pure delegation. It
carries three load-bearing test-fixture concerns:

1. **Async-chain TX visibility filtering** (`_txLockStorage()`
   AsyncContext + `_txVisible()` gate). Tests share `_sharedAdapter`
   across `Promise.all` branches; without filtering, branch B's
   `currentTransaction()` would see branch A's TM frame as joinable
   and bypass the TM mutex.
2. **Manual TX depth tracking** (`_manualTxDepth` instance counter).
   Direct `beginTransaction`/`commit`/`rollback` callers (migrations,
   fixtures, query-cache tests) bypass `withinNewTransaction`; the
   counter is a parallel signal that `_txVisible()` honors. Decrements
   only on success — failed COMMIT can leave PG/MySQL mid-transaction
   and the driver clears `inTransaction` only when COMMIT succeeds.
3. **DDL tracking** (`recordDdlTracking()` on `executeMutation`/`exec`).
   Updates `_createdTables` / `_createdColumns` used by
   `adapterKnownTables` so `defineSchema` skips redundant
   introspection.

These exist specifically because trails tests share one adapter across
concurrent async chains for transactional-fixture speed. Production
uses a connection pool — each connection has its own TM stack — so
chain isolation comes for free there. The wrapper IS a test fixture,
not a vestigial pure-delegation layer.

**Design: Path A (slim + rename).** ~200-250 LOC PR.

- **Rename** `SchemaAdapter` → `TestAdapterFixtures` to reflect what
  it actually is. Keep the file at `packages/activerecord/src/test-adapter.ts`
  (or relocate to `test-helpers/` if the rename makes that more
  natural; agent decides).
- **Remove pure-delegation methods** (~30 of them: `quote*`,
  `schemaCache`, `createTableDefinition`, `tables`, `clearCacheBang`,
  `emptyInsertStatementValue`, `isWriteQuery`, `buildExplainClause`,
  `typeCast`, `lookupCastTypeFromColumn`, `currentDatabase`,
  `supportsIndexesInCreate`/`supportsAdvisoryLocks`/`supportsInsertConflictTarget`,
  `getDatabaseVersion`, `getAdvisoryLock`/`releaseAdvisoryLock`,
  `isNoDatabaseError`, `isPreventingWrites`, `arelVisitor`,
  `adapterName`, `pool`, `cleanup`, etc.). Consumers should reach the
  inner adapter directly for these.
- **Keep** the three load-bearing concerns: TX visibility filter,
  manual TX depth, DDL tracking. These stay as instance state on the
  fixture wrapper.
- **`createTestAdapter()` returns** either `{ adapter, fixtures }` or
  reshapes such that callers get the real adapter directly with the
  fixtures attached as a sidecar. The agent picks the shape that
  fits the existing 18 `.innerAdapter` callers cleanly.
- **Type alias `TestDatabaseAdapter`** either deletes (137 type-level
  refs become `DatabaseAdapter`) or stays as an alias of
  `DatabaseAdapter` for backward compat. Agent decides based on sweep
  complexity.

**Why not Path B (actually delete).** Path B would mean migrating the
three concerns into production code: TX visibility into
`TransactionManager` as per-chain `AsyncContext<symbol>` marker;
manual TX depth into `AbstractAdapter` per-instance counter; DDL
tracking as an `AbstractAdapter` exec hook. That muddies production
with test-fixture concerns and is the wrong abstraction. Production
never shares an adapter across async chains (connection pool); chain
isolation isn't needed there. Path A respects the abstraction
boundary.

### Success criteria (Phase 9 overall)

- `test-adapter.ts` (or the relocated fixtures module) ≤200 LOC,
  scoped to the three load-bearing concerns and factory glue
- `createTestAdapter()` exposes the real adapter directly to callers
  that need it (no `.innerAdapter` hop)
- All tests pass on all three DB adapters
- Production `:memory:` SQLite paths get the same compat treatment as
  tests did (no regex; the Arel visitor emits correct SQL — already
  shipped in 9a)

## Bonus follow-up — `defineSchema` native type mappings

`defineSchema`'s `COLUMN_TYPE_MAP_MYSQL` and `COLUMN_TYPE_MAP_SQLITE`
route several AR types to VARCHAR even though both adapters have
native columns. #2197 fixed `binary`; 4 downgrades remain:

| Type       | MySQL native                | SQLite native | Bug surface  |
| ---------- | --------------------------- | ------------- | ------------ |
| `date`     | DATE                        | date          | MySQL+SQLite |
| `time`     | TIME                        | time          | MySQL+SQLite |
| `datetime` | DATETIME (correct on MySQL) | datetime      | SQLite only  |
| `json`     | JSON (5.7+)                 | json (3.38+)  | MySQL+SQLite |

Each downgrade may be papering over a serialize-path bug (like the
`binary` case was — the fixture column type was wrong, not the AR
serialization). Diagnostic loop:

1. Change the mapping in `define-schema.ts` to the native column type
2. Run tests against PG/MySQL/SQLite (live, not just SQLite — SQLite's
   weak type affinity hides bugs)
3. Each failure: trace to either a fixture mismatch (fix at the
   fixture/serialize layer), a type-layer serialize bug (fix the
   AR type's `serialize` to emit the native-column-accepted format),
   or a real limitation (keep the downgrade with a sharper comment
   citing the specific blocker)

Estimated split: 4 separate small PRs if each downgrade has a
distinct root cause, or a single ~150-300 LOC PR if multiple share a
fix. Ship ≤300 LOC and defer the rest if all-at-once busts the
ceiling.

PG mappings are already native and correct; do not change them.

## Post-Phase 9 cleanup — `test-adapter.ts` audit

The 9b-4 rename (#2194) shipped, but the aggressive slim was deferred
when Proxy-based delegation surfaced subtle encryption-uniqueness
regressions. Post-rename `test-adapter.ts` is 769 LOC; the cleanup
audit identified three paths.

### Path 1 — relocate test-helper concerns into `test-helpers/` — in flight

~150 LOC mechanical relocation. Four groups: DDL tracking (trackers,
parser, snapshot/restore, `recordDdlTracking` function), fixture
refcount (`pushSkipGlobalReset` / `popSkipGlobalReset`), transactional-
tests config (`setUseTransactionalTests` / `getUseTransactionalTests`),
export hygiene. Wrapper class structure untouched.

After path 1, `test-adapter.ts` drops to ~620 LOC.

### Path 2 — sidecar refactor (recommended over path 3)

`createTestAdapter()` returns the real adapter (`SQLite3Adapter` /
`PostgreSQLAdapter` / `Mysql2Adapter`) directly. The three load-bearing
concerns (TX visibility, manual TX depth, DDL tracking) move to a
separate `TestAdapterFixtures` handle that consumers explicitly use
when they need fixture behavior. **No wrapper.** No delegation, no
Proxy, no reach-in.

This is the Rails-parity end state — Rails has no wrapper, so
`Base.connection` returns the real adapter and tests use it directly.
The `.innerAdapter` reach-in pattern (18 callers across the codebase)
disappears.

#### Why path 2 over path 3

Path 3 was originally proposed as "keep the wrapper, delete the ~30
pure-delegation methods." But auditing the 18 `.innerAdapter` callers
shows the deviation is the _wrapper itself_, not the delegations:

| Group                                                 | Count | What it reaches for                            | Path-3 effect               | Path-2 effect                |
| ----------------------------------------------------- | ----- | ---------------------------------------------- | --------------------------- | ---------------------------- |
| 1 — `transactionManager`                              | ~4    | Getter not exposed on wrapper                  | Adds reach-in               | Gone (real adapter has it)   |
| 2 — schema dumper / PG-only methods                   | 9     | Type mismatch + `addExclusionConstraint`/etc   | Adds reach-in               | Gone (real adapter has them) |
| 3 — raw `execQuery`/`exec`                            | 4     | Pure cosmetic noise; wrapper already delegates | Could just delete the token | Gone                         |
| 4 — helper unwrap in `with-transactional-fixtures.ts` | 3     | Bridges wrapped/unwrapped                      | Stays                       | Gone (nothing to unwrap)     |

Path 3 _worsens_ the deviation — deleting delegation methods forces
more callers into `.innerAdapter` reach-in. Path 2 eliminates the
deviation entirely.

#### Path 2 vs the 9b-4 Proxy attempt

The 9b-4 agent's failed Proxy delegation hit the encryption uniqueness
regression. Sidecar is NOT a Proxy — it's a clean break:
`createTestAdapter()` returns `{ adapter: realAdapter, fixtures:
TestAdapterFixtures }` (or a similar shape that fits the 18 callers).
No method-name forwarding, no opaque dispatch, no delegation magic.
The encryption uniqueness path doesn't traverse any of that under
sidecar.

#### Sizing

Path 2 is a bigger surface than path 3:

- Reshape `createTestAdapter()` return type
- Update 18 `.innerAdapter` callers (group 1-3 above) to access the
  real adapter directly; the 3 helper-internal sites (group 4) become
  a defensive null-check that disappears
- Update 137 `TestDatabaseAdapter` type-level refs (alias becomes
  `DatabaseAdapter` or a `{adapter, fixtures}` shape)
- Migrate the three load-bearing concerns into the sidecar object

Probably 2-3 PRs to land safely:

- (a) Add the sidecar shape alongside the existing wrapper; new
  consumers use sidecar
- (b) Migrate the 18 `.innerAdapter` callers to the new shape
- (c) Delete the old `TestAdapterFixtures` wrapper

### Path 3 — deprecated

Original audit suggested deleting the ~30 pure-delegation methods on
the wrapper. Don't do this. The `.innerAdapter` audit revealed that
path 3 worsens the Rails deviation rather than fixing it. Path 2
supersedes path 3 entirely.

## Critical files

- `packages/activerecord/src/test-adapter.ts`
- `packages/activerecord/src/relation.ts` (the `_arelVisitor()` fallback)
- `packages/activerecord/src/test-helpers/with-transactional-fixtures.ts`
- `packages/activerecord/src/connection-adapters/{sqlite3,postgresql,mysql}-adapter.ts`
- `packages/arel/src/visitors/{to_sql,postgresql,sqlite,mysql}.ts`
