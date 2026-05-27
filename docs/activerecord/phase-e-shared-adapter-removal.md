# Phase E — delete `_sharedAdapter`, AsyncContext filter, manual TX depth

> **Status (2026-05-27):** E1 (this doc + concurrency safety-net) in flight.
> E2–E5 gated on D-1..N reaching zero bypass sites.

Cleanup phase. After all test files are on the connection pool (Phase D complete),
delete the singleton state and the trails-specific chain-isolation patch over it.

Parent epic: [`connection-pooled-test-adapter-plan.md`](connection-pooled-test-adapter-plan.md).

## Invariant under protection

**Two concurrent `Base.transaction()` calls from unrelated async chains must NOT
observe each other's transaction state** (`currentTransaction()`, `inTransaction`,
`openTransactions`).

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
bypass. The new path is `pool.pinConnectionBang(false)` → `pool.leaseConnection()`
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
