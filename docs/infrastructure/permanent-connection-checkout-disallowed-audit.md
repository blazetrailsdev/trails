# Audit: banning `Base.connection` in the AR suite (helper.rb:27)

Story: `audit-permanent-connection-checkout-disallowed`
(RFC 0071 — ar-test-helper-suite-wide-config-fidelity).

## Summary

Rails' `activerecord/test/cases/helper.rb:27` sets
`ActiveRecord.permanent_connection_checkout = :disallowed` suite-wide so that a
`Base.connection` permanent checkout raises anywhere in the suite. trails has
the flag (`packages/activerecord/src/ar-config.ts:126`) and a faithful
enforcement branch (`connection-handling.ts:453-476`) but no setup file sets it.

The 114-file / 440-site blast radius quoted in the story is **almost entirely a
false alarm**. The flag only fires when the pool's lease is _permanent_
(`pool.isPermanentLease()` — `connection-pool.ts:640`, sticky lease is `null`),
which the fixture pin clears, exactly as in Rails. Measured empirically (see
Method), a 10-file slice carrying **137 of the 440 textual sites produced only 5
test-file violations**. The real blockers are three pieces of _infrastructure_,
one of which is a single line.

The recommendation is therefore **flip the flag**, after two small
infrastructure PRs. Total estimated work is ~120 LOC across three follow-up
stories, not a 114-file migration.

**Enforcement is faithful but has one hole:** `connection-handling.ts:455`
short-circuits on `this._adapter` _before_ consulting the flag, so any model
with a directly assigned adapter (`Model.adapter = x`) bypasses the ban
entirely. That is a trails-only fast path with no Rails counterpart, and it is
the reason a flip will under-report rather than over-report.

## Method

Two passes, both recorded here because they disagree and the empirical one is
the trustworthy half.

1. **Empirical.** Temporarily set `permanentConnectionCheckout = "disallowed"`
   in `test-setup-ar.ts` and replaced the `throw` in
   `connection-handling.ts:462` with a `console.warn` that prints the first
   non-internal stack frame, so violations accumulate instead of aborting the
   run at the first one. Ran 10 representative files
   (`adapter`, `primary-keys`, `locking`, `defaults`, `persistence`,
   `connection-handling`, `reserved-word`, `inheritance`, `explain`,
   `timestamp`). Both edits were reverted; nothing in this PR changes runtime
   behavior.
2. **Static.** Classified all 114 files by whether they carry a fixture/pin
   helper or a `.adapter =` assignment. This over-credits shielding (a file with
   `fixtures({})` still runs module-scope and `beforeAll` code before the pin)
   and is included only as a rough map.

## Finding 1 — enforcement path is faithful, with one bypass

`connection-handling.ts:453-476` mirrors `connection_handling.rb:265-295`
arm-for-arm: `deprecated` warns then leases, `disallowed` raises
`ActiveRecordError` with Rails' message, `true` falls through, and the
non-permanent branch returns `activeConnection`. `isPermanentLease()`
(`connection-pool.ts:640`) mirrors `permanent_lease?`.

The divergence is line 455:

```ts
if ((this as any)._adapter) return (this as any)._adapter;
```

This precedes the flag check, so `Model.adapter = someAdapter` (116 occurrences
across 32 test files) makes `Model.connection` a silent no-op for the ban. Rails
has no such path. This does not block the flip — it only means the flip catches
fewer violations than Rails' would. Worth a note in whichever story flips the
flag; not worth removing here, since the fast path predates RFC 0071 and removal
would be its own migration.

## Finding 2 — the fixture default is the single dominant violator

`use-fixtures.ts:610`:

```ts
const getConnection = connection ?? (() => Base.connection);
```

Every `fixtures({...})` call with no explicit `connection` option resolves its
adapter through the deprecated getter, and it does so _before_ the pin makes the
lease sticky. This accounted for **402 of the 417 recorded violations** in the
10-file slice — i.e. 96% of all enforcement hits come from this one line.

Rails' equivalent machinery never touches `Base.connection`:
`test_fixtures.rb:179` and `:194` both call `pool.lease_connection` on the pool
obtained from the connection handler.

`use-transactional-tests.ts:67` (`withTransactionalFixtures(() => Base.connection, …)`)
is the same defect in the smaller opt-in helper.

## Finding 3 — the schema-load setup file violates at boot

`test-setup-dy.ts:50` and `:65` call `Base.connection` during suite setup. With
the flag on and the raise intact, **every AR test file fails at collection**
before a single test runs — this is what the first experiment produced. Any flip
must land after these two are converted.

Both are straightforward: line 50 passes the connection to
`supportsExpressionIndex(...)`, line 65 casts it to call `tableExists`. Both sit
in an `await`-capable module scope, so `await Base.leaseConnection()` works
directly.

## Finding 4 — a production-code violation

`model-schema.ts:41`:

```ts
function reflectionAdapter(klass: any): any {
  return threadedConnectionFor(klass) ?? klass.connection;
}
```

The fallback arm fired 3 times in the slice. This is precisely the case Rails'
ban exists to surface ("to ensure it's not used internally"). Rails'
`model_schema.rb:381/406/412` uses `with_connection { |c| … }` throughout and
never falls back to the getter. The existing JSDoc acknowledges the fallback is
deliberate — it preserves throw-behavior for `try`/`catch` callers — so this
needs a real look, not a mechanical rewrite.

Other non-test `Base.connection` sites that were not exercised by the slice and
need the same treatment: `test-helpers/setup-second-pool.ts:52,79` and
`encryption/test-helpers.ts:161`.

## Call-site inventory

Textual `Base.connection` in `packages/activerecord/src`: 440 sites / 114
`*.test.ts` files, plus 27 in non-test files (most of which are prose in
comments — only 8 are live calls).

For reference, `vendor/rails/activerecord/test` carries 18 textual sites in
total. The 24× gap is real drift, but it is concentrated in helpers, not spread
across tests.

### Empirical result (10 files, 137 textual sites)

| Source                                     | Violations |
| ------------------------------------------ | ---------: |
| `test-helpers/use-fixtures.ts:610`         |        402 |
| `test-setup-dy.ts:65`                      |         10 |
| `test-setup-dy.ts:50`                      |         10 |
| `model-schema.ts:41` (`reflectionAdapter`) |          3 |
| `primary-keys.test.ts:32`, `:574`          |          2 |
| `locking.test.ts:70`, `:677`               |          2 |
| `connection-handling.test.ts:145`          |          1 |

Extrapolating the test-file rate (5 violations from 137 textual sites) across
all 440 gives roughly **15–20 genuine test-file call sites** suite-wide — a
one-PR migration, not a campaign. The extrapolation is rough: the slice
deliberately favored high-count files, and adapter-lane files
(`adapters/postgresql/**`, `adapters/abstract-mysql-adapter/**`) were not
exercised, so their rate is unmeasured.

### Static classification (all 114 files, coarse)

| Class                                   | Files | Textual sites |
| --------------------------------------- | ----: | ------------: |
| carries a fixture/pin helper            |    70 |           345 |
| assigns `.adapter =` (fast-path bypass) |     2 |             5 |
| neither ("unshielded")                  |    42 |            90 |

The empirical pass contradicts this table in both directions — `locking.test.ts`
is classed unshielded yet only 2 of its 13 sites fired, while `primary-keys.test.ts`
is classed pinned yet fired twice at module scope. Treat the table as a map of
where to look, not as a violation count.

## Recommendation

Flip the flag, in this order. Do not flip before slots A and B are merged.

### Slot A — route the fixture machinery off `Base.connection` (~20 LOC)

- Closes finding 2.
- `use-fixtures.ts:610`, `use-transactional-tests.ts:67`.
- Mirror `test_fixtures.rb:179/194`: resolve the pool from the connection
  handler and lease from it, rather than reading the deprecated getter.
- Removes 96% of the enforcement surface on its own. Low risk, high leverage —
  worth doing regardless of whether the flip ever happens.

### Slot B — convert the setup + helper call sites (~40 LOC)

- Closes findings 3 and 4 (partially).
- `test-setup-dy.ts:50,65`, `test-helpers/setup-second-pool.ts:52,79`,
  `encryption/test-helpers.ts:161`.
- All sit in `await`-capable scope; `await Base.leaseConnection()` substitutes
  directly.
- `model-schema.ts:41` is explicitly **out of scope** here — the fallback arm is
  load-bearing for `try`/`catch` callers and deserves its own story.

### Slot C — set `disallowed` in `test-setup-ar.ts` and fix the fallout (~60 LOC)

- Set the flag next to the other suite-wide config in `test-setup-ar.ts`,
  mirroring `helper.rb:27`.
- Convert the residual test-file call sites the flip surfaces (expected 15–20).
- Run the full suite in CI, not locally; adapter lanes are the unmeasured risk.
- Note in the PR body that `connection-handling.ts:455`'s `_adapter` fast path
  means the ban is narrower than Rails' (finding 1).

### Not recommended

Fanning this out into a per-file migration campaign. The 114-file figure that
motivated the story does not survive measurement.
