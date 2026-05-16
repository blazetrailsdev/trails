# TM unification plan

Plan for routing every database adapter through `TransactionManager`
(TM) so `_transactionFallback` in
`packages/activerecord/src/transactions.ts` can be deleted entirely.
This refactor unblocks `docs/shared-adapter-test-suite-plan.md` Phase 3
(transactional fixtures), eliminates the savepoint name-collision class
of bugs (PR #1624 band-aid), and removes the HABTM workarounds added in
PR #1609.

## Current state (the diagnosis)

Two parallel transaction paths exist.

**Path 1 — TM path.** `transactions.ts:130-176` dispatches into the TM
path when the adapter exposes `withinNewTransaction`. Routes through
`TransactionManager.withinNewTransaction` in `abstract-adapter.ts:
930-934`, which manages `RealTransaction` / `SavepointTransaction` /
`RestartParentTransaction` on its `_stack`. Savepoints are named
`active_record_${stack.length}` in `abstract/transaction.ts:875`.

**Path 2 — Fallback path.** `_transactionFallback` at
`transactions.ts:178-246`. Maintains its own `_savepointCounter`
(line 82) and `_adapterLocks` WeakMap (lines 65-80). Savepoints were
named `active_record_${++_savepointCounter}` until PR #1624 renamed
the prefix to `active_record_fallback_N` to dodge name collisions
with TM-managed savepoints on the same connection.

The duck-type probe at `transactions.ts:141-144` chooses between them:

```ts
typeof (adapter as any).withinNewTransaction === "function" &&
  !(currentTransaction() === null && adapter.inTransaction);
```

### Why Path 2 is still active

`SchemaAdapter` (the test wrapper) in `test-adapter.ts` is a plain class
that wraps a real adapter via `this.inner`. It does NOT extend
`AbstractAdapter` and therefore does NOT expose `withinNewTransaction`.
Every test that calls `Model.transaction()` through a
`SchemaAdapter`-backed model takes Path 2.

The second clause of the probe — `inTransaction && currentTransaction()
=== null` — exists to detect "external transaction" started outside TM
(e.g. transactional fixtures issuing raw `BEGIN`). When that condition
holds, the TM path is bypassed even on adapters that have TM.

### Symptoms in the wild

- **PR #1612 / PR #1624 flake**: name collision when fallback's
  `active_record_1` matched TM's `active_record_1` on the same
  connection (PG 25P01, MySQL/MariaDB 1305).
- **HABTM PR #1609**: workarounds added in
  `collection-association.ts:670-689` (skip transaction wrapper for
  HABTM) and `has-many-through-association.ts:107-147` (use `insertAll`
  instead of `save`) because the fallback's lifecycle leaked savepoint
  operations across error boundaries (PG 25P02, MariaDB uncaught
  rejection with no upstream frame).
- **Second copy of the probe**: `withTransactionReturningStatus`
  (`transactions.ts:668-759`) re-does the same `hasTransactionManager`
  check at lines 700-703 and has its own manual fallback callback-
  scheduling block at lines 729-757.

### Rails equivalence

Rails has no fallback. `database_statements.rb:352-360` always calls
`within_new_transaction`; `TransactionManager` is the only path. External
transactions work because the fixture's `beginDbTransaction` goes onto
the TM stack — the TM stack is the truth.

## Design goals

1. Delete `_transactionFallback` entirely from `transactions.ts`.
2. Delete `_savepointCounter`, `_adapterLocks`, `_afterFailureActions`,
   and `acquireAdapterLock` from `transactions.ts`.
3. Delete the `hasTransactionManager` / `withinNewTransaction` probes
   from `withTransactionReturningStatus`.
4. Make `SchemaAdapter` route through TM by delegating
   `withinNewTransaction` (and supporting hooks) to `this.inner`.
5. Wire transactional-fixture setup through TM's `beginTransaction` so
   the `inTransaction && currentTransaction() === null` guard is no
   longer needed.
6. Remove the HABTM workarounds from PR #1609 once TM handles nested
   savepoints correctly through `SchemaAdapter`.
7. Zero regressions across all three adapters and the SQLite in-memory
   default.

## Phase 1 — `SchemaAdapter` gains `withinNewTransaction` delegation — closed (#1627)

**Followups:**

- ~50 LOC (**Phase 8**, new) — Push per-connection mutex into `TransactionManager.withinNewTransaction` using AsyncContext-based recursive locking; make `materializeTransactions()` wait on in-flight materialization rather than early-return. Resolves 3 documented limitations (intra-tx materialize race, after_commit reentry outliving TM frame, mutex placement diverging from Rails' `@connection.lock.synchronize`).
- Pre-existing notes: `_withinNewTxLocks` lives in `SchemaAdapter` not `TransactionManager` (Phase 8 fixes). Reentrancy gated on `AsyncContext<true>` not actual TM frame ownership. `_manualTxDepth` per-`SchemaAdapter` instance not per-inner-connection (Phase 7 deletes SchemaAdapter).
- Architectural: every concurrency limitation traces back to "two logical contexts sharing one TM stack" via trails' `_sharedAdapter` pattern. Future Phase 1 followups should resist adding more virtualization layers; focus on retiring `SchemaAdapter` (Phase 7).

## Phase 2 — Remove `_transactionFallback` and supporting infra — closed (#1658)

**Followups:**

- ~50–80 LOC (Phase 8) — Move per-inner-adapter mutex from `test-adapter.ts` into `TransactionManager#within_new_transaction` (Rails uses `connection.lock.synchronize` inside TM itself). Then `test-adapter.ts` drops its mutex shim.
- ~5 LOC investigation — Stale `_savepointCounter` field on `sqlite3-adapter.ts:171`. Class-private (unrelated to deleted module-level). Grep-confirm whether still used; if TM owns savepoint naming now, may be dead.

**Pre-existing notes:**

- HABTM `assign ids` skipped test (`has-and-belongs-to-many-associations.test.ts:987`) original BLOCKED rationale ("routes through `_transactionFallback`") no longer true; worth re-running unskipped — Phase 2 may have incidentally fixed it.
- Outermost-wTRS accounting deleted on assumption TM's `add_transaction_record` handles `update()`-wraps-`save()` correctly. Tests green but no test specifically exercises "inner wTRS in intermediate fallback tx commits while outer rolls back" scenario — regression watchpoint.

## Phase 3 — Wire transactional fixtures through TM — closed (#1642)

## Phase 4 — Remove HABTM workarounds — closed (#1642)

**Phase 3+4 followups:**

- **~130 LOC pure deletion** — `_transactionFallback` is now dead. Drop from `transactions.ts`: `_afterFailureActions`, `_adapterLocks`, `acquireAdapterLock`, `_savepointCounter`, `_transactionFallback`, and the call site at the tail of `transaction()`. This is "Phase 2 deletion proper" — its own follow-up PR (clean diff).
- **~30–50 LOC deletion** — Simplify `withTransactionReturningStatus` (`transactions.ts:668-759`): remove `hasTransactionManager` branch (lines 700-703), manual fallback callback-scheduling block (lines 729-757), and `isOutermostWtrs` accounting. Belongs with the Phase 2 deletion PR.
- **HABTM/HMT insert-record parity (deferred)** — `insertHabtmRecord` still bypasses Rails' two-step (target save + through save via `save_through_record`). We persist the join row only. Larger semantic change, out of plan-doc scope.
- **Phase 8 cross-file PG flakes** — observed during local verification: HABTM/HMT/nested-through files green in isolation, mixed runs surface 5–18 cross-file races. Tracked under Phase 8 (TM-internal mutex, `connection-adapters/abstract/transaction.ts:1009`).

## Phase 5 — Universal `defineSchema` adoption — partial (#1633, #1686, #1693, #1697)

**Remaining (post-#1697):**

- `packages/activerecord/src/calculations.test.ts` — 7596 LOC, 101 `freshAdapter()` sites, no `defineSchema` yet. Likely 2–3 sub-PRs by describe-block cluster.
- `packages/activerecord/src/enum.test.ts` — 2018 LOC, 75 `freshAdapter()` sites. One PR via async-freshAdapter pattern (proven on `core.test.ts` in #1697).
- `associations/association-scope.test.ts` — 1118 LOC standalone.
- `associations/inverse-associations.test.ts` — 1717 LOC, may need 2 PRs.
- `relation/where.test.ts` — 2062 LOC, 45 `_tableName` overrides.
- root cluster B remainder (finder/persistence/primary-keys/validations) — may have landed in a parallel sub-PR.

**Pattern note from #1697:** `core.test.ts` async-freshAdapter pattern (shared `TEST_SCHEMA` constant, helper async, sed-replace, flip sync `it()` to async) reusable for `enum.test.ts`. `calculations.test.ts` has too many distinct tables for one shared schema — per-describe `beforeEach` `defineSchema` (the pattern from `callbacks.test.ts`).

**Possible STI gap:** `callbacks.test.ts` "inheritance of callbacks" uses `class Dog extends Animal`; runtime queries `dogs` not `animals`. May indicate STI table-name inheritance isn't applied without explicit `_tableName`. Worth a separate investigation.

**#1693 encryption-cluster followups (~115 LOC):**

- ~80 LOC — Migrate all `EncryptedBook*` factories to one shared `encrypted_books` table (Rails fixtures all set `self.table_name = "encrypted_books"`; we get per-class inflected tables). Behavior-equivalent for current tests; fidelity gap if cross-class sharing is asserted.
- ~30 LOC — Real `binary` → BLOB mapping in `defineSchema`'s `COLUMN_TYPE_MAP_MYSQL` (today routes `binary` → `string`/VARCHAR; MariaDB CI caught 255-char ceiling on encrypted ciphertext, fixed via `text` workaround in #1693). BLOB mapping with opt-in flag cleaner; alt: document gotcha in JSDoc.
- ~5 LOC — Narrow `Schema[string]` cast in `makeFreshModel` local type.

**#1633 migrated 32 of 100 files** (smaller files, full `scoping/` cluster, contained `associations/` files, most of `relation/` except `where.test.ts`). 68 files remain.

**Phase 5 remainder (~1500 LOC over 4–5 PRs, ≤300 LOC each by directory):**

- associations/ remainder (~25 files; `association-scope.test.ts` 1118 LOC + `inverse-associations.test.ts` 1717 LOC → 2–3 splits).
- encryption/ cluster (~9 files; best as one PR extending `test-helpers.ts` with `installEncryptionSchema(adapter)`, ~80 LOC).
- root cluster (~25 files: calculations, callbacks, core, enum, finder, persistence, primary-keys, validations, etc.).
- `relation/where.test.ts` standalone (~2062 LOC, 45 `_tableName` overrides with namespaced prefixes + composite-PK fixtures).

**Pattern catalogue from #1633** (for follow-up agents):

1. **Per-test setup (default):** `let adapter; beforeEach(async () => { adapter = createTestAdapter(); await defineSchema(adapter, {...}); })`.
2. **Module-level lazy-init:** when models declared at describe-scope, use `let _adapter = createTestAdapter()` at module load + reassign in `beforeEach`.
3. **Wrapped shape** for composite PK / STI / no-PK: `{ columns: {...}, primaryKey: [...] | false }`. `primaryKey` is required (it's the discriminator).

- **Common bug:** calling `freshAdapter()` more than once per test sets `_needsCleanup = true` and wipes the schema. One adapter per test, reused everywhere.
- **Rails inflector parity:** trails matches `String#underscore` consecutive-caps rule (`RAUser` → `ra_users`, not `r_a_users`).

**Audit script** (`scripts/audit-define-schema.ts`) reports 108 offenders — higher than the 68 real failures because it surfaces files that declare models without exercising the DB. AR_NO_AUTO_SCHEMA=1 test run is the gate, not zero audit offenders.

## Phase 6 — Hoist `defineSchema` from `beforeEach` to once-per-file

**Goal.** Stop dropping and recreating tables between every test.
Schema defined once per file (or per worker); per-test isolation
delegated to transactional fixtures (Phase 3).

**Prerequisites.** Phase 3 (fixtures wired through TM) and Phase 5
(every test calls `defineSchema`).

**Files touched.**

- `packages/activerecord/src/test-helpers/test-setup-ar.ts` —
  replace `resetTestAdapterState` per-test with `BEGIN`/`ROLLBACK`.
- `packages/activerecord/src/test-helpers/define-schema.ts` — make
  `defineSchema` idempotent so re-running it across files is a no-op
  when the tables already match.
- Test files — promote `beforeEach(defineSchema)` to module-level or
  `beforeAll`.

**Implementation.**

`test-setup-ar.ts`'s global `beforeEach` becomes:

```ts
beforeEach(async () => {
  await adapter.beginTransaction();
});
afterEach(async () => {
  await adapter.rollback();
});
```

The `resetTestAdapterState` call (currently runs `dropAllTables`
before every test) goes away. Tables persist; data is rolled back.

**Risk.** Tests that mutate schema mid-body (rare but exists for
migration tests) bypass transactional fixtures. They need an
opt-out — Rails handles this with `self.use_transactional_tests =
false` per test class.

**Success criteria.**

- Test suite wall-clock time drops measurably (drop-all-tables is
  the dominant per-test cost on real DBs; transactional rollback is
  near-free).
- No test relies on cross-test schema state.
- The `_createdTables` / `_createdColumns` module state is
  read-only after suite init.

**LOC estimate.** Net ~50 LOC deletions in test-helpers; minor
reorganization in test files.

## Phase 7 — Delete `SchemaAdapter` recovery infrastructure — BLOCKED on Phase 5 completion

**Attempted** post-#1669 (Phase 8 unblocked the mutex side); deletion is not actually mechanical because **Phase 5 is only partially done** (32 of 100 files migrated via #1633; 68 remain). `SchemaAdapter`'s lazy-setup is load-bearing for the unmigrated files — deleting it would break the unmigrated test suite.

**Sequencing fix:** Phase 5 (universal `defineSchema` adoption) must complete first. Phase 7 follows mechanically once `SchemaAdapter`'s consumers are all on the explicit `defineSchema` path.

**Goal.** With Phase 5 + 6 landed, the lazy-setup and error-recovery
paths in `test-adapter.ts` are dead code. Delete them.

**Prerequisites.** Phase 5 (universal `defineSchema`) and Phase 6
(transactional fixtures). Validate dead-code claim by running CI
with `AR_NO_AUTO_SCHEMA=1` set unconditionally for one cycle.

**Files touched.**

- `packages/activerecord/src/test-adapter.ts`
- `packages/activerecord/src/base.ts` (the `_setOnAdapterSetHook`
  caller)

**Delete.**

- `registerModel`, `extractColumnsFromModels`, `processPendingModels`,
  `lookupDeclaredColumnType`, `sqlTypeForAttribute`, `sqlType`,
  `execDdlWithSavepoint` (consumers gone), `dropTrackedTables`,
  the `_registeredModelClasses` / `_pendingModels` / `_pendingCpk`
  / `_declaredColumns` / `_createdTables` / `_createdColumns`
  module state, the `_setupLock` / `_cleanupPromise` machinery,
  `setup()`, `handleMissingSchemaError`, `extractTableFromSql`,
  `noAutoSchema()`, and `_setOnAdapterSetHook` in `base.ts`.

**Keep (for now).**

- `fixSqliteCompat` — moves to Phase 8.
- The TM delegation methods (`withinNewTransaction`,
  `currentTransaction`, etc.) added in Phase 1.
- The `_withinNewTxLocks` mutex — moves to Phase 8 (into TM).
- The `quote*` / `schemaCache` / explain delegations.

**Risk.** Phase 5/6 audit incomplete — a test silently relying on
recovery still passes (somehow) but loses coverage. Mitigate by
running CI with `AR_NO_AUTO_SCHEMA=1` for one full cycle before
deleting the code.

**Success criteria.**

- `test-adapter.ts` shrinks from ~1100 LOC to ~250-400 LOC.
- No test failures across all three DB adapters.
- `executeMutation` / `execute` no longer need the savepoint-retry
  loops (recovery is gone, so a failing query just throws).

**LOC estimate.** ~-700 LOC.

## Phase 8 — Push the per-connection mutex into `TransactionManager` — closed (#1669)

Every public stack-mutating TM method (`beginTransaction`, `commitTransaction`, `rollbackTransaction`, `materializeTransactions`, `withinNewTransaction`) now routes through `synchronize` — direct mirror of Rails `@connection.lock.synchronize` at `abstract/transaction.rb:507, 581, 594, 611, 623`.

**Accepted limitation:** Promise.all-inside-tx race. `synchronize` uses AsyncContext-stored owner-symbol for reentrance. JS AsyncContext propagates to forked branches (Promise.all children, fire-and-forget tasks scheduled inside body), so siblings inherit holder's token and bypass mutex. No fix without async-resource identity APIs that user-facing AsyncLocalStorage doesn't expose. Top-level Promise.all IS serialized — only spawn-inside-tx pattern is exposed.

**Unblocks Phase 7** (delete `SchemaAdapter` entirely, ~−700 LOC). `_withinNewTxLocks` / `_acquireWithinNewTxLock` are now gone from `test-adapter.ts`. `_setupLock` and `_manualTxDepth` + `_txVisible` async-chain hiding logic still present but separate machinery — likely all deletable in Phase 7.

**Phase 8 followups:**

- ~5–10 LOC — Revisit `_setupLock` in `test-adapter.ts` as part of Phase 7.
- Consider re-marking `synchronize()` as `@internal` after Phase 7 deletes the SchemaAdapter caller.

## Phase 9 — Collapse `SchemaAdapter` to a SQL-compat shim or delete

**Goal.** After Phase 7+8, `SchemaAdapter` is just `fixSqliteCompat` plus quote/explain delegation pass-throughs. Move SQL compat into the SQLite adapter itself (where it belongs) and delete the wrapper.

**Files touched.**

- `packages/activerecord/src/connection-adapters/sqlite3-adapter.ts`
  — absorb `fixSqliteCompat` into `execute` / `executeMutation`.
- `packages/activerecord/src/test-adapter.ts` — delete the class;
  `createTestAdapter()` returns the inner adapter directly.
- `packages/activerecord/src/index.ts` and re-exports.
- Tests that referenced `SchemaAdapter` types via
  `TestDatabaseAdapter`.

**Implementation.**

`fixSqliteCompat` handles three things:

1. Stripping `FOR UPDATE` / `FOR SHARE` — SQLite doesn't lock at
   the row level. Could push into the Arel SQLite visitor instead.
2. Wrapping `OFFSET` without `LIMIT` — SQLite syntax requirement.
   Belongs in `SQLite3Adapter.execute` or its visitor.
3. Unwrapping parenthesized compound SELECTs — SQLite syntax
   requirement. Same place.

Once these move, `SchemaAdapter` has nothing left to do.

**Risk.** The compat shims are exercised by real production usage,
not just tests — moving them into the adapter changes behavior for
non-test callers (the `:memory:` SQLite path in browser-compat,
etc.). Likely a net positive but needs explicit testing.

**Success criteria.**

- `test-adapter.ts` either deleted or ≤50 LOC of factory glue.
- `createTestAdapter()` returns a `PostgreSQLAdapter` /
  `Mysql2Adapter` / `SQLite3Adapter` instance directly.
- Production code that runs against `:memory:` SQLite gets the same
  compat treatment as tests did.

**LOC estimate.** Net -300 LOC (after migrating compat helpers).

## Net result

Across Phases 5-9, `test-adapter.ts` goes from ~1100 LOC of wrapper
machinery to ≤50 LOC (or 0). The error class — DDL inside lazy
transactions, SAVEPOINT-before-BEGIN, MySQL implicit commits during
recovery, shared-adapter concurrency — disappears because the code
that triggers it is gone. Test setup matches Rails (`schema.rb`
upfront, transactional fixtures), tests reference real adapters
directly, and the docs / type signatures simplify accordingly.

## Risks and unknowns

1. **`setup()` re-entrancy with TM stack.** `SchemaAdapter.setup()`
   calls `processPendingModels` → `execDdlWithSavepoint`, which uses
   `this.inner.createSavepoint` directly (not through TM). After
   Phase 1, TM may have an open frame when setup runs. DB-level
   correctness is fine; TM accounting is bypassed for DDL savepoints
   intentionally. Needs a dedicated test.

2. **`beginTransaction()` + `commit()` direct pairs.** The pg
   adapter's `commit()` at line 1349 already routes through TM
   (`openTransactions > 0` check). Existing pattern works; no change.

3. **`SchemaAdapter` wrapping real adapters that already have TM.**
   After Phase 1, `withinNewTransaction` on `SchemaAdapter` delegates
   to `this.inner.withinNewTransaction`. The inner adapter holds the
   connection and the TM stack. `SchemaAdapter` has no TM of its own.
   This is correct because the connection lives on `this.inner`.

4. **Multiple `SchemaAdapter` instances sharing one inner adapter.**
   `_sharedAdapter` is a module-level singleton; all `SchemaAdapter`
   instances wrap the same inner adapter and therefore share TM. Wanted.

5. **`_adapterLocks` WeakMap serialization.** ~~After Phase 2 deletes
   the fallback, the per-adapter mutex disappears. Real adapters use
   connection pools — concurrent callers get different connections,
   each with its own TM stack.~~ **Disproven by PR #1627 MariaDB CI**:
   the test harness uses a single `_sharedAdapter` so concurrent
   `Promise.all([Model.create, Model.create])` callers share the same
   TM `_stack` and corrupt instrumenter state. Rails handles this with
   `connection.lock.synchronize` around `within_new_transaction`; PR
   #1627 restores parity by adding `_withinNewTxLocks` (per-inner-
   adapter mutex on outermost `withinNewTransaction`). The proper fix
   is to push the lock into `TransactionManager` itself (mirror Rails)
   so non-test callers get the same protection — tracked as a Phase 8
   item.

6. **`resetTransaction()` and live wrappers.** `AbstractAdapter.
resetTransaction()` (`abstract-adapter.ts:877-888`) replaces
   `_transactionManager` with a fresh instance. `SchemaAdapter`
   delegations read `this.inner._transactionManager` at call time, so
   they pick up the new TM. Correct by construction.

7. **Phase 2 vs Phase 3 ordering.** The `inTransaction` guard is
   load-bearing protection against double-BEGIN when fixtures issue
   raw BEGIN. Phase 2 removes the guard; Phase 3 wires fixtures
   through TM. Land them together (single PR ~150 LOC), or land
   Phase 3 first, then Phase 2.

## Critical files

- `packages/activerecord/src/test-adapter.ts`
- `packages/activerecord/src/transactions.ts`
- `packages/activerecord/src/connection-adapters/abstract-adapter.ts`
- `packages/activerecord/src/connection-adapters/abstract/transaction.ts`
- `packages/activerecord/src/associations/collection-association.ts`
- `packages/activerecord/src/associations/has-many-through-association.ts`
