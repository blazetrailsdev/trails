# Audit: banning `Base.connection` in the AR suite (helper.rb:27)

Story: `audit-permanent-connection-checkout-disallowed`
(RFC 0071 — ar-test-helper-suite-wide-config-fidelity).

## Status update (re-measured against `main`, 2026-07-25)

The measurements below were taken before PRs #5323, #5327 and siblings landed.
**Re-running the same instrumentation against current `main` changes the
picture substantially** — most of the infrastructure findings are already fixed:

| Finding                              | Then                   | Now on `main`                                         |
| ------------------------------------ | ---------------------- | ----------------------------------------------------- |
| 2 — `use-fixtures.ts:610`            | 1685 hits (86%)        | **1983 hits (95.5%) — still open**                    |
| 2 — `use-transactional-tests.ts:67`  | 2 hits                 | 2 hits — still open                                   |
| 3 — `test-setup-dy.ts:50,65`         | 170 hits, boot blocker | **fixed** — no `Base.connection`                      |
| 4 — `core.ts:1147` (`cachedFindBy`)  | bug                    | **fixed** by #5323 (`withPooledOrDirectConnection`)   |
| 4 — `insert-all.ts:76`               | bug                    | **fixed** by #5323                                    |
| 4 — `setup-second-pool.ts:51,79`     | 2 hits                 | **fixed**                                             |
| 4 — `encryption/test-helpers.ts:161` | same shape             | **fixed**                                             |
| 4 — `model-schema.ts:41`             | 10 hits                | 11 hits — **the only remaining production site**      |
| test-file sites                      | 33 / 23 files          | 34 / 24 files (adds `base-prevent-writes.test.ts:88`) |

Current totals: **2077 hits**, of which 1983 (95.5%) are the single
`use-fixtures.ts:610` line. The scan was also widened from `Base\.connection` to
`\.connection` (114 → 129 files), which is what surfaced the extra site.

Two corrections to the recommendation below, both learned from #5323:

1. **Do not port internal call sites to `withConnection`.** It resolves through
   `connectionPool()` and raises `ConnectionNotDefined` for models backed by
   `Model.adapter = x` (and HABTM join models), where the deprecated getter took
   its `_adapter` fast path. Use `withPooledOrDirectConnection(modelClass, fn)`
   from `connection-handling.ts`. This is caught only by PG/MySQL adapter
   suites — on SQLite the ambient `Base` pool answers and the test passes
   against the _wrong_ database.
2. **Flipping the flag does not prove internal fidelity.** Internal query paths
   are wrapped in `withQueryConnection` (17 call sites), which leases via
   `pool.withConnection` and therefore makes `isPermanentLease()` false — inner
   `.connection` reads return `activeConnection` and never reach the gate. The
   flip locks in current behavior and prevents regression; converging internals
   onto Rails' threaded-yielded-connection shape is separate work.

Follow-up work is tracked by RFC 0073 (`permanent-connection-checkout-disallowed`). The original audit follows unchanged.

## Summary

Rails' `activerecord/test/cases/helper.rb:27` sets
`ActiveRecord.permanent_connection_checkout = :disallowed` suite-wide so that a
`Base.connection` permanent checkout raises anywhere in the suite. trails has
the flag (`ar-config.ts:126`) and a faithful, test-pinned enforcement branch
(`connection-handling.ts:453-476`) but no setup file sets it.

The 114-file / 440-site blast radius quoted in the story does not survive
measurement. The flag only fires when the pool's lease is _permanent_
(`pool.isPermanentLease()`, `connection-adapters/abstract/connection-pool.ts:640`), which the fixture pin
clears exactly as in Rails — so most textual `Base.connection` occurrences never
reach the gate. Instrumenting the `disallowed` branch and running **all 114
files** (see Method) gives the exact population:

- **1951 enforcement hits**, of which **1685 (86%) come from one line** —
  `use-fixtures.ts:610`, the default fixture connection thunk.
- **33 test-file call sites across 23 files** — the entire test-side migration.
  Not 440, not 114.
- **4 production-code call sites**, two of them previously unknown:
  `insert-all.ts:76` and `core.ts:1147`. Rails uses `with_connection` in both
  places. These are real fidelity bugs, and they are precisely what helper.rb's
  ban exists to surface ("to ensure it's not used internally").

**Recommendation: flip the flag**, after two small infrastructure PRs. Total
~120 LOC across three follow-up slots. The two production bugs are worth fixing
whether or not the flip ever lands.

## Method

Set `permanentConnectionCheckout = "disallowed"` in `test-setup-ar.ts` and
replaced the `throw` at `connection-handling.ts:462` with a `console.warn`
printing the first non-internal stack frame — so violations accumulate over a
whole run instead of aborting it at the first one. (With the raise intact, every
AR file fails at _collection_; see finding 3.) Then ran the full set of 114
files carrying a textual `Base.connection`.

85 of the 114 executed on the sqlite lane; 29 are adapter-lane files excluded by
the vitest project config, so their sites are unmeasured — see Residual risk.
Both edits were reverted; this PR changes no runtime code.

One test failed under instrumentation:
`connection-handling.test.ts:145` — _"#connection raises an error if
ActiveRecord.permanent_connection_checkout == :disallowed"_ — because the
instrumentation removed the very throw it asserts. That is a clean confirmation
that trails' enforcement is already pinned by a Rails-named test.

## Finding 1 — enforcement is faithful and test-pinned, with one bypass

`connection-handling.ts:453-476` mirrors `connection_handling.rb:274-295`
arm-for-arm: `deprecated` warns then leases, `disallowed` raises
`ActiveRecordError` with Rails' message, `true` falls through, and the
non-permanent branch returns `activeConnection`. `isPermanentLease()`
(`connection-adapters/abstract/connection-pool.ts:640`) mirrors `permanent_lease?`. The raise is pinned by
`connection-handling.test.ts:145`.

The divergence is line 455, _above_ the flag check:

```ts
if ((this as any)._adapter) return (this as any)._adapter;
```

`Model.adapter = someAdapter` (116 occurrences across 32 test files) therefore
makes `Model.connection` a silent no-op for the ban. Rails has no such fast
path. This does not block the flip — it means the flip catches _fewer_
violations than Rails' would, so the 33-site figure below is a floor, not a
ceiling. Worth a note in the flip PR; removing the fast path is its own
migration.

## Finding 2 — the fixture default is 86% of the problem, and it is one line

`use-fixtures.ts:610`:

```ts
const getConnection = connection ?? (() => Base.connection);
```

Every `fixtures({...})` call without an explicit `connection` option resolves
its adapter through the deprecated getter, before the pin makes the lease
sticky. **1685 of 1951 hits.**

Rails' equivalent machinery never touches `Base.connection`:
`test_fixtures.rb:179` and `:194` both call `pool.lease_connection` on the pool
retrieved from the connection handler.

`use-transactional-tests.ts:67` (`withTransactionalFixtures(() => Base.connection, …)`)
is the same defect in the smaller opt-in helper (2 hits).

## Finding 3 — the schema-load setup file violates at boot

`test-setup-dy.ts:50` and `:65` call `Base.connection` during suite setup — 85
hits each, i.e. once per file that ran. With the raise intact, **every AR test
file fails at collection** before a single test runs. Any flip must land after
these two are converted.

Both are mechanical: line 50 passes the connection to
`supportsExpressionIndex(...)`, line 65 casts it to call `tableExists`. Both sit
in `await`-capable module scope, so `await Base.leaseConnection()` substitutes
directly.

## Finding 4 — four production-code violations, two of them real fidelity bugs

This is the finding the story was looking for. Rails bans `Base.connection` in
its suite specifically to catch internal use, and trails has four such sites.

| Site                                       | Hits | Rails counterpart                                              | Verdict                           |
| ------------------------------------------ | ---: | -------------------------------------------------------------- | --------------------------------- |
| `core.ts:1147` (`cachedFindBy`)            |    1 | `core.rb:442` — `with_connection do \|connection\|`            | **bug**                           |
| `insert-all.ts:76` (`InsertAll.execute`)   |    1 | `insert_all.rb:12` — `relation.model.with_connection do \|c\|` | **bug**                           |
| `model-schema.ts:41` (`reflectionAdapter`) |   10 | `model_schema.rb:381/406/412` — `with_connection` throughout   | deliberate fallback; needs review |
| `test-helpers/setup-second-pool.ts:51,79`  |    2 | test helper, no direct counterpart                             | mechanical                        |

`core.ts:1147` and `insert-all.ts:76` are straightforward: Rails wraps both in
`with_connection` and trails reads the deprecated getter, so both can flip the
lease permanent on a caller that never asked for one. Neither was known before
this audit.

`model-schema.ts:41` is different — its JSDoc states the `?? klass.connection`
fallback is deliberate, preserving throw-behavior for `try`/`catch` callers.
That one needs a real look, not a mechanical rewrite, and gets its own story.

## Call-site inventory

Textual `Base.connection` in `packages/activerecord/src`: 440 sites across 114
`*.test.ts` files, plus 27 in non-test files — mostly prose in comments, with
only 7 live calls. `vendor/rails/activerecord/test` carries 18 textual sites in
total.

Note that the `Base\.connection` grep that scoped this story **cannot see the
production bugs in finding 4**: `core.ts:1147` and `insert-all.ts:76` spell it
`this.connection` and `model.connection`. The grep simultaneously over-counts
the tests by ~13× and misses the two findings that matter. Instrumenting the
gate is the only reliable way to enumerate this.

Measured hits by source (full 114-file run):

| Source                                                             |    Hits |
| ------------------------------------------------------------------ | ------: |
| `test-helpers/use-fixtures.ts:610`                                 |    1685 |
| `test-setup-dy.ts:50` / `:65`                                      | 85 each |
| `test-helpers/use-fixtures.test.ts` (10 sites)                     |      32 |
| `model-schema.ts:41`                                               |      10 |
| all other test-file sites (33 sites / 23 files)                    |      42 |
| `use-transactional-tests.ts:67`                                    |       2 |
| `setup-second-pool.ts:51,79` · `insert-all.ts:76` · `core.ts:1147` |  1 each |

### The 33 test-file sites to convert (23 files)

Helper self-tests (`use-fixtures.test.ts`, `use-transactional-tests.test.ts`,
`with-transactional-fixtures.test.ts`, `naked-fixtures.test.ts`,
`repair-validations.test.ts`, `handler-resolved-adapter.test.ts`) are excluded
from this list — they exercise the helpers of findings 2 and 3 and mostly
resolve themselves once those land.

```
associations/cp-count-disable-joins-through.test.ts:28
associations/disable-joins-association-scope.test.ts:10
associations/disable-joins-composite-key.test.ts:25
associations/disable-joins-composite-nested.test.ts:38
associations/disable-joins-nested-through.test.ts:29
associations/disable-joins-polymorphic-nonid-pk.test.ts:69,130
associations/disable-joins-routing-widening.test.ts:28
associations/eager-singularization.test.ts:24
associations/loader-methods.test.ts:57
associations/required.test.ts:16,24
bigint-roundtrip.test.ts:20
bind-parameter.test.ts:89
column-names-sync-virtual-exclusion.test.ts:31
connection-handling.test.ts:145          # intentional — asserts the raise
date.test.ts:29
delegated-type.test.ts:55
dirty.test.ts:118
enum.trails.test.ts:424
establish-connection.test.ts:133,150,171,188,199,245
locking.test.ts:70,677
primary-keys.test.ts:32,574
unsafe-raw-sql.test.ts:28
view.test.ts:22,47
```

`connection-handling.test.ts:145` must stay as-is: it is the Rails-named test
that asserts the raise. `establish-connection.test.ts` (6 sites) is the largest
single cluster and is about connection wiring, so several of its sites may also
be intentional.

## Residual risk

29 of the 114 files are adapter-lane
(`adapters/postgresql/**`, `adapters/abstract-mysql-adapter/**`, and
`sp.test.ts` / `schema-authorization.test.ts` etc.) and did not execute on the
sqlite lane, so their sites are **unmeasured**. Static inspection puts ~20
textual sites there. The flip PR should run PG and MySQL lanes in CI before
merging; that is the one place where the 33-site figure could grow.

The `_adapter` fast path (finding 1) also hides an unknown number of sites, in
the opposite direction — they simply never reach the gate today.

## Recommendation

Flip the flag, in this order. Do not flip before slots A and B are merged.

### Slot A — route the fixture machinery off `Base.connection` (~20 LOC)

- Closes finding 2.
- `use-fixtures.ts:610`, `use-transactional-tests.ts:67`.
- Mirror `test_fixtures.rb:179/194`: retrieve the pool from the connection
  handler and lease from it instead of reading the deprecated getter.
- Removes 86% of the enforcement surface on its own. Low risk, high leverage —
  worth doing regardless of whether the flip ever happens.

### Slot B — fix the production violations (~40 LOC)

- Closes finding 4, except `model-schema.ts`.
- `core.ts:1147` → `with_connection` per `core.rb:442`.
- `insert-all.ts:76` → `with_connection` per `insert_all.rb:12`.
- `test-setup-dy.ts:50,65`, `setup-second-pool.ts:51,79`,
  `encryption/test-helpers.ts:161` (finding 3; the last was not hit in this run
  but is the same shape).
- `model-schema.ts:41` is explicitly **out of scope** — its fallback is
  load-bearing for `try`/`catch` callers and deserves its own story.

### Slot C — set `disallowed` in `test-setup-ar.ts` and convert the residue (~60 LOC)

- Set the flag beside the other suite-wide config in `test-setup-ar.ts`,
  mirroring `helper.rb:27`.
- Convert the 33 sites listed above, less `connection-handling.test.ts:145`.
- Run PG and MySQL lanes in CI — the adapter-lane files are the unmeasured risk.
- Note in the PR body that `connection-handling.ts:455`'s `_adapter` fast path
  makes the ban narrower than Rails' (finding 1).

### Not recommended

Fanning this out into a per-file migration campaign. The 114-file figure that
motivated the story is 23 files once measured.
