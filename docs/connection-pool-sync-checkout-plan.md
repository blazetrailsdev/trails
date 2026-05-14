# Connection pool: sync-checkout fix plan

## The bug

`ConnectionPool#checkout()` (sync) at `packages/activerecord/src/connection-adapters/abstract/connection-pool.ts:501` throws `ConnectionTimeoutError` immediately if every connection is leased. Only `checkoutAsync()` actually queues a waiter and waits up to `checkoutTimeout`.

`withConnection()` (line 627) calls the sync `checkout()` when the current lease is empty, then duck-types the callback's return value at line 630 to decide whether to release on `.finally()`. So when the pool is saturated:

- Rails behavior: the caller blocks up to `checkout_timeout` (default 5s), then raises.
- Our behavior: the caller fails fast with `ConnectionTimeoutError` even though, microseconds later, another async task would have released a connection.

This is a real divergence under load — any concurrent burst beyond `pool size` is rejected instead of being serialized.

## Root cause

The port mirrors Rails' API surface, where `checkout` is a blocking call on the calling thread. In JS, blocking is impossible, so the sync method degraded into "try once, throw on failure." `withConnection` then layered Promise-detection on top to handle async callbacks, which only works when a connection was already available.

In a JS-native design, **checkout is intrinsically async**. There is no sync path that can wait — so there should not be a sync path that pretends to be checkout at all.

## Fix

Three changes, smallest blast radius first.

### 1. Make `withConnection` async-first

Convert `withConnection` to `async` and always `await this.checkoutAsync(timeout)` when the lease is empty. Drop the `typeof result.then === "function"` duck-type — the function is uniformly async now, so sync callbacks just resolve immediately.

Signature change: `withConnection<T>(fn): T` → `withConnection<T>(fn): Promise<T>`. This is a breaking change for any caller that relied on synchronous return; audit shows the in-tree callers (`persistence.ts`, `transactions.ts`, `migration.ts`, `schema-cache.ts`, `base.ts`, `connection-handling.ts`, `alias-tracker.ts`, `tasks/database-tasks.ts`, `pending-migration-connection.ts`) are all already inside async code paths or can be made so trivially.

### 2. Demote sync `checkout()` to a fast-path assertion

Keep `checkout()` for the pinned/already-leased case (lines 502–512 — that path never blocks). For the unpinned path, either:

- **Option A (preferred):** rename to `_checkoutNonBlocking()` / `tryCheckout()` returning `DatabaseAdapter | undefined`, and delete the throwing branch. Callers that want "give me a connection right now or fail" call this and handle `undefined`. The Rails-shaped `checkout()` becomes a thin wrapper that just calls `await checkoutAsync()`.
- **Option B:** keep `checkout()` as-is but mark `@internal` + `@deprecated`, and migrate callers to `checkoutAsync()` one at a time.

Pick A. The Rails name is preserved on the async path where it semantically belongs.

### 3. Audit direct `checkout()` callers

Nine non-test files call `checkout` or `withConnection`. Walk each one:

- `transactions.ts` — transaction blocks must hold one connection for their duration; this is the load-bearing sticky-lease case. Ensure it goes through `checkoutAsync` and sets `lease.sticky = true`.
- `persistence.ts`, `base.ts`, `alias-tracker.ts` — query paths; flip to `await withConnection(...)`.
- `migration.ts`, `pending-migration-connection.ts`, `tasks/database-tasks.ts` — already async, mechanical change.
- `schema-cache.ts`, `connection-handling.ts` — verify they're not called from sync contexts (e.g. class-eval-time schema introspection). If they are, those call sites need to be made async first.

## Test plan

- New test in `connection-pool.test.ts`: saturate the pool, kick off an `await withConnection` from a second context, release the held connection mid-flight, assert the second waiter resolves with the released connection (not a timeout). Mirrors Rails' `test_checkout_behaviour`.
- New test: same setup but never release; assert the waiter rejects with `ConnectionTimeoutError` after `checkoutTimeout` ms (use fake timers).
- Existing `withConnection` tests: update expected return type to `Promise<T>`. Most likely already `await`-ing.

## Out of scope (follow-ups)

- `buildAsyncExecutor` returning `null` (line 986) — should return a Promise-bounded semaphore. Separate PR.
- `ExecutorHooks` wiring deferred pending ConnectionHandler PR 6. Separate.
- Middleware-level `withExecutionContext` integration in actionpack — separate plan, depends on this one landing.
- Default `pool` size — Rails inherits 5; appropriate default for Node services is much higher. Documentation change, not a code fix.

## Size estimate

Single PR, ~150–250 LOC including tests. Under the 300 LOC ceiling. No split needed.
