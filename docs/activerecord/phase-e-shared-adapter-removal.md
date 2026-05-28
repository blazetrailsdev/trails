# Phase E — delete `_sharedAdapter`, AsyncContext filter, manual TX depth

> **Status: Shipped 2026-05-28.**
>
> - E1 (#2514) — audit doc + concurrency safety-net test
> - E2 (#2527) — delete AsyncContext filter + `_manualTxDepth` from `TestAdapterFixtures`
> - E3 (#2533) — delete same from `SidecarFixtures`
> - E4 — skipped; delete-wrapper-class absorbed into F5 (#2545) instead
> - E5 (#2536) — delete `_sharedAdapter`; wire `createSidecarTestAdapter()` through pool

Cleanup phase. After all test files are on the connection pool (Phase D complete),
delete the singleton state and the trails-specific chain-isolation patch over it.

Parent epic: [`connection-pooled-test-adapter-plan.md`](connection-pooled-test-adapter-plan.md).

## Invariant under protection

**Two concurrent `Base.transaction()` calls from unrelated async chains must NOT
observe each other's transaction state** (`currentTransaction()`, `inTransaction`,
`openTransactions`). `Base.transaction()` routes through
`withinNewTransaction()`/`TransactionManager`, so the safety-net test drives
`withinNewTransaction()` directly — the invariant boundary is the same.

Today this is enforced by the `AsyncContext` flag in
`SidecarFixtures._txVisible()` / `TestAdapterFixtures._txVisible()`. After E2/E3
delete the filter, the pool's per-checkout connection serialization replaces it.

Safety-net test (added in E1):
`packages/activerecord/src/test-helpers/with-transactional-fixtures.test.ts` —
describe `"concurrency isolation: two concurrent transaction chains stay independent"`.

## Inventory (verified 2026-05-27)

All runtime definitions and call sites live in two files. Additional matches
exist in docs and tests (this file, `with-transactional-fixtures.test.ts`) but
carry no runtime semantics — the deletion PRs (E2–E5) only touch the two
implementation files listed below.

### `_sharedAdapter` — `packages/activerecord/src/test-adapter.ts`

```
grep -n "_sharedAdapter" packages/activerecord/src/test-adapter.ts
```

Key sites:

- Line 58: module-level declaration `let _sharedAdapter: any = null`
- Lines 83, 95, 106: initialised in the PG / MySQL / SQLite boot branches
- Line 152: returned by `createSidecarTestAdapter()`
- Lines 292, 321–323, 330–331: consumed in `cleanupTestAdapter` / `resetTestAdapterState`

E5 deletes all of these; `createSidecarTestAdapter()` moves to a pool checkout.

### `_txLockStorage` / `_txLockHeld` / `_txLockHeldAdapter` — two files

**`packages/activerecord/src/test-adapter.ts`** (the `TestAdapterFixtures` wrapper):

```
grep -n "_txLockStorage\|_txLockHeld\|_txLockHeldAdapter" packages/activerecord/src/test-adapter.ts
```

Lines 64–77: declaration + lazy factory.
Lines 408, 476: consumed in `_txVisible()` and `withinNewTransaction`.

**`packages/activerecord/src/test-helpers/sidecar-fixtures.ts`** (the sidecar):

```
grep -n "_txLockStorage\|_txLockHeld\|_txLockHeldAdapter" packages/activerecord/src/test-helpers/sidecar-fixtures.ts
```

Lines 25–41: declaration + lazy factory.
Lines 89, 100: consumed in `_txVisible()` and `withinNewTransaction`.

E3 deletes sidecar copy; E2 deletes wrapper copy (or wrapper is deleted wholesale).

### `_manualTxDepth` — two files

**`packages/activerecord/src/test-adapter.ts`** (the wrapper):
Lines 396, 408, 508, 517, 521.

**`packages/activerecord/src/test-helpers/sidecar-fixtures.ts`** (the sidecar):
Lines 69, 89, 125, 134, 139.

E3 deletes sidecar copy; E2 deletes wrapper copy.

### `_txVisible()` — two files

**`packages/activerecord/src/test-adapter.ts`**: lines 407–408, 494, 539, 544.
**`packages/activerecord/src/test-helpers/sidecar-fixtures.ts`**: lines 88–89, 109, 114, 119.

E3 / E2 deletes per above.

### Zero-count goal

After E2–E5 the grep commands above must return zero matches. The E1
concurrency test turns red if chain isolation regresses.

## Open questions — resolved

### SQLite `:memory:` pool-size-1 carve-out (does E5 keep it?)

**Decision: yes, keep pool-size-1 for shared-cache-blocked drivers.**

`test-adapter.ts` boot path (lines 222–228): the pooled SQLite factory uses
`file:trails_test_<workerId>?mode=memory&cache=shared` (from `_pooledSqliteDatabase()`).
This works for `node:sqlite` which supports shared-cache.

For `better-sqlite3` and `expo-sqlite`, `SQLITE_OMIT_SHARED_CACHE` is compiled in
(see plan doc "Resolved decisions → SQLite" section). Each connection would be a
private in-memory DB. The resolution (shipped in Phase A0 spike) is **pool size 1**
for those drivers so the single-connection requirement never arises.

E5 does NOT remove the pool-size-1 carve-out. It remains as the correct Rails-shape
answer for shared-cache-blocked drivers (a pool of one connection IS the shared DB).
The `_sharedAdapter` singleton is replaced by a pinned single-connection pool;
the behaviour is identical from the test's perspective.

What E5 DOES remove: the `_sharedAdapter` module variable and the direct-adapter
bypass. The new path is `pool.leaseConnection()`
for all drivers, with pool-size-1 doing the right thing implicitly for SQLite
(single connection serializes all `Promise.all` branches through the pool's lease
queue — no separate AsyncContext filter needed).

### `schemaCache.clear()` on reset — pool-fetched adapters

**Decision: clear at pool level by iterating checked-out adapters.**

Current code (`resetTestAdapterState`, line 323):

```ts
_sharedAdapter.schemaCache?.clear();
```

After E5, `_sharedAdapter` is gone. The pool owns the set of live adapter
instances. Rails clears schema cache at the pool level (`ConnectionPool#clear_cache!`)
rather than per-connection, matching the invariant that schema state is shared
across all connections in a pool.

Implementation path (E5): call `pool.connections.forEach(a => a.schemaCache?.clear())`
(`pool.connections` is the existing getter at `connection-pool.ts:470`) after `dropAllTables`.
`withTransactionalFixtures` already calls `schemaCache.clear()` in `afterEach`
for the per-test case; `resetTestAdapterState` covers the global-reset path.

No test changes needed — the existing `schemaCache` invalidation tests in
`with-transactional-fixtures.test.ts` exercise the per-test path and will catch
regressions regardless of whether the underlying adapter came from the singleton
or the pool.

## Sub-phases

| Phase | Scope                                                                                                                       | Gated on               |
| ----- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| E1    | Audit doc (this file) + concurrency safety-net test                                                                         | Nothing (merged first) |
| E2    | Delete `_txLockStorage`/`_txLockHeld`/`_manualTxDepth`/`_txVisible` from `TestAdapterFixtures` wrapper in `test-adapter.ts` | D-1..N at zero sites   |
| E3    | Delete same from `sidecar-fixtures.ts`                                                                                      | E2                     |
| E4    | Delete `TestAdapterFixtures` wrapper class (if D-1..N cleared all wrapper consumers)                                        | E3                     |
| E5    | Delete `_sharedAdapter` singleton; wire `createSidecarTestAdapter()` through pool checkout                                  | E4                     |

E2 and E3 can merge as one PR if they're under 300 LOC combined.

## PR workplan — E2 through E5

### PR E2 — delete AsyncContext filter + `_manualTxDepth` from `TestAdapterFixtures`

**Gated on:** D-1..N at zero bypass sites (all test files migrated to sidecar/pool path).

**File:** `packages/activerecord/src/test-adapter.ts`

Delete the following:

| Lines   | Symbol / block                                                                      |
| ------- | ----------------------------------------------------------------------------------- |
| 60–77   | `_txLockHeld`, `_txLockHeldAdapter` declarations + `_txLockStorage()` factory       |
| 391–396 | `_manualTxDepth` field declaration and comment                                      |
| 407–409 | `_txVisible()` method                                                               |
| 476     | `const storage = _txLockStorage();`                                                 |
| 477     | `const run = () => inner.withinNewTransaction(opts, fn);` (keep, rename)            |
| 481     | `const wrapped = storage.getStore() === true ? run : () => storage.run(true, run);` |
| 482     | `if (tm?.synchronize) return tm.synchronize(wrapped);`                              |
| 483     | `return wrapped();`                                                                 |
| 494     | `if (!this._txVisible()) return null;` guard in `currentTransaction()`              |
| 508     | `this._manualTxDepth++` in `beginTransaction()`                                     |
| 517     | `if (this._manualTxDepth > 0) this._manualTxDepth--;` in `commit()`                 |
| 521     | same decrement in `rollback()`                                                      |
| 539     | `if (!this._txVisible()) return false;` guard in `inTransaction`                    |
| 544     | `if (!this._txVisible()) return 0;` guard in `openTransactions`                     |

After deletion, `withinNewTransaction` simplifies to a direct delegation:

```ts
async withinNewTransaction<T>(
  opts: { isolation?: string | null; joinable?: boolean },
  fn: (tx?: unknown) => Promise<T> | T,
): Promise<T> {
  return (this.inner as any).withinNewTransaction(opts, fn);
}
```

And `currentTransaction`, `inTransaction`, `openTransactions` become unconditional delegations.

**Why this is safe:** E2 only deletes the filter from the `TestAdapterFixtures` wrapper. By the time E2 lands, D-1..N has reached zero, meaning NO test file calls `createTestAdapter()` (which returns a `TestAdapterFixtures` instance) with concurrent `Promise.all` transaction branches. All concurrent-fixture consumers have migrated to `createPooledTestAdapter()`, which provides natural isolation per connection. The wrapper's filter is therefore dead code at E2 merge time.

**LOC estimate:** ~40 deletions.

**Import cleanup:** If `_txLockHeld` / `_txLockHeldAdapter` were the only `AsyncContext`-typed consumers in this file, also drop the `AsyncContext` import from `getAsyncContext`. Verify with:

```
grep -n "AsyncContext\|getAsyncContext" packages/activerecord/src/test-adapter.ts
```

---

### PR E3 — delete AsyncContext filter + `_manualTxDepth` from `SidecarFixtures`

**Gated on:** E2 merged.

**File:** `packages/activerecord/src/test-helpers/sidecar-fixtures.ts`

Delete the following:

| Lines   | Symbol / block                                                                          |
| ------- | --------------------------------------------------------------------------------------- |
| 21      | `import { getAsyncContext, type AsyncContext }` (entire import if no other consumer)    |
| 25–41   | `_txLockHeld`, `_txLockHeldAdapter` declarations + `_txLockStorage()` factory           |
| 69      | `private _manualTxDepth = 0;` field                                                     |
| 88–90   | `_txVisible()` method                                                                   |
| 100–105 | body of `withinNewTransaction()` — simplifies to direct delegation (same as E2 pattern) |
| 109     | `if (!this._txVisible()) return null;` in `currentTransaction()`                        |
| 114     | `if (!this._txVisible()) return false;` in `inTransaction`                              |
| 119     | `if (!this._txVisible()) return 0;` in `openTransactions`                               |
| 125     | `this._manualTxDepth++` in `beginTransaction()`                                         |
| 134     | `if (this._manualTxDepth > 0) this._manualTxDepth--;` in `commit()`                     |
| 139     | same decrement in `rollback()`                                                          |

After deletion, `withinNewTransaction()` becomes:

```ts
async withinNewTransaction<T>(
  opts: { isolation?: string | null; joinable?: boolean },
  fn: (tx?: unknown) => Promise<T> | T,
): Promise<T> {
  return (this.adapter as any).withinNewTransaction(opts, fn);
}
```

The `currentTransaction()`, `inTransaction`, `openTransactions` accessors become unconditional delegations (or can be deleted entirely if callers always use the real adapter directly).

**Why this is safe:** After E2 the wrapper is already filter-free. By E3, `SidecarFixtures` delegates to the pool-leased adapter (via E5 or, during the transition, still the singleton but concurrency is pool-managed). The AsyncContext filter is pure overhead.

**Concurrency safety-net:** The E1 test (`concurrency isolation: two concurrent transaction chains stay independent`) must stay green. With the filter removed, isolation comes from the pool: each `createPooledTestAdapter()` call leases its own connection, so the two chains never share a `_sharedAdapter`. Run the test after E3 to confirm.

**LOC estimate:** ~50 deletions.

**Note:** If E2 and E3 are combined into one PR (total ≤ 300 LOC), the gating condition is still D-1..N at zero. The two files have no cross-file diff; combining is safe.

---

### PR E4 — delete `TestAdapterFixtures` wrapper class

**Gated on:** E3 merged AND `createTestAdapter()` has zero callers in the test suite.

**Verify zero callers:**

```
grep -rn "createTestAdapter\b" packages/
```

Must return zero results in `*.test.ts` files (the function itself and `TestDatabaseAdapter` type in `test-adapter.ts` are expected).

**Files:**

1. `packages/activerecord/src/test-adapter.ts` — delete:
   - Lines 110–114: `TestDatabaseAdapter` interface (if no external callers remain)
   - Lines 117–123: `createTestAdapter()` factory function
   - Lines 340–745: the merged `interface TestAdapterFixtures` + `class TestAdapterFixtures` declaration (the entire wrapper)
   - Lines 79: `let _factory: () => TestAdapterFixtures;` module-level factory variable
   - Lines 92, 103, 107: `_factory = () => new TestAdapterFixtures(...)` assignment in each boot branch

2. Check `test-adapter.ts` barrel exports and `index.ts`:
   ```
   grep -n "TestAdapterFixtures\|createTestAdapter\|TestDatabaseAdapter" packages/activerecord/src/index.ts
   ```
   Remove any re-exports of deleted symbols.

**Minimal retained shape after E4:**

`test-adapter.ts` keeps:

- The three boot branches (PG / MySQL / SQLite) without `_factory`
- `createSidecarTestAdapter()` (still used until E5)
- `createPooledTestAdapter()` (the replacement path)
- `cleanupTestAdapter()` and `resetTestAdapterState()` (still reference `_sharedAdapter` — cleaned in E5)
- All imports needed by the above

**LOC estimate:** ~370 deletions (the class is large). This is a single-file mechanical deletion — qualifies for the single-file ceiling waiver.

---

### PR E5 — delete `_sharedAdapter`; wire `createSidecarTestAdapter()` through pool

**Gated on:** E4 merged.

**Files:** `packages/activerecord/src/test-adapter.ts` and potentially `sidecar-fixtures.ts` (if SidecarFixtures constructor needs a pool-leased adapter).

**Deletions in `test-adapter.ts`:**

| Lines   | Symbol                                                                                 |
| ------- | -------------------------------------------------------------------------------------- |
| 58      | `let _sharedAdapter: any = null;` declaration                                          |
| 83      | `_sharedAdapter = new PostgreSQLAdapter(PG_TEST_URL);` + surrounding setup             |
| 95      | `_sharedAdapter = new Mysql2Adapter(MYSQL_TEST_URL);` + surrounding setup              |
| 106     | `_sharedAdapter = new SQLite3Adapter(":memory:");`                                     |
| 152     | `return { adapter: _sharedAdapter, fixtures: new SidecarFixtures(_sharedAdapter) };`   |
| 292     | `if (_sharedAdapter) await dropAllTables(_sharedAdapter);` in `cleanupTestAdapter()`   |
| 321–323 | `if (_sharedAdapter) { await dropAllTables...; _sharedAdapter.schemaCache?.clear(); }` |
| 330–331 | `restoreCanonicalSchemaSignaturesUnlessAdapter(_sharedAdapter)` / else branch          |

**Rewire `createSidecarTestAdapter()`** to use the pool:

```ts
export async function createSidecarTestAdapter(): Promise<{
  adapter: SidecarAdapter;
  fixtures: SidecarFixtures;
}> {
  const pool = await _establishPooledTestPool();
  const adapter = pool.leaseConnection() as SidecarAdapter; // synchronous
  return { adapter, fixtures: new SidecarFixtures(adapter) };
}
```

Note the signature becomes `async` — callers must `await createSidecarTestAdapter()`. Update all call sites.

Pin/unpin lifecycle (`await pool.pinConnectionBang({ fixture: true })` /
`await pool.unpinConnectionBang()`) belongs in `withTransactionalFixtures`, not the
factory — matching the existing pattern in `with-transactional-fixtures.ts:218–233`.

**Rewire `resetTestAdapterState()`** — replace `_sharedAdapter.schemaCache?.clear()` with pool-level clear:

```ts
const pool = await _establishPooledTestPool();
pool.connections.forEach((a) => a.schemaCache?.clear());
```

(`pool.connections` is the existing getter at `connection-pool.ts:470`.)

**SQLite pool-size-1 carve-out stays.** The `_pooledSqliteDatabase()` path (lines 222–228) already uses
`file:trails_test_<workerId>?mode=memory&cache=shared` for `node:sqlite`. For `better-sqlite3`
and `expo-sqlite` (which compile with `SQLITE_OMIT_SHARED_CACHE`), pool size is already forced
to 1. This carve-out is NOT removed in E5 — a pool of size 1 IS the shared-connection
equivalent for those drivers.

**Boot branch simplification:** The three `if (PG_TEST_URL) / else if (MYSQL_TEST_URL) / else`
branches that previously wired both `_sharedAdapter` and `_factory` can be reduced to just the
pool initialization (already handled by `_establishPooledTestPool()`). Drop all
`_sharedAdapter = new ...` assignments and the initial table-cleanup loops — `resetTestAdapterState()`
handles that via pool after boot.

**LOC estimate:** ~60 deletions + ~30 additions (pool rewire). Total ≤ 300 LOC.

**Verify zero grep matches after E5:**

```
grep -rn "_sharedAdapter" packages/activerecord/src/
grep -rn "_txLockStorage\|_txLockHeld\|_txLockHeldAdapter" packages/activerecord/src/
grep -rn "_manualTxDepth\|_txVisible" packages/activerecord/src/
```

All must return zero results. The E1 concurrency test must remain green.
