# Temporal migration plan

## Problem

`activerecord` represents every datetime/time/timestamp value as a JS `Date`,
whose internal state is a single `number` of **milliseconds** since the
Unix epoch. Postgres, MySQL, and SQLite all support **microsecond**
precision (Postgres also supports timezone-aware timestamps without lossy
conversion). Round-tripping a `timestamp(6)` column through `Date` silently
truncates the bottom three digits.

Concrete symptoms today:

- `quotedDate` (`packages/activerecord/src/connection-adapters/abstract/quoting.ts:202`)
  produces `YYYY-MM-DD HH:MM:SS.NNNNNN`, but the bottom three digits are
  always `000` because they come from `getUTCMilliseconds() * 1000`.
- All cast/serialize paths in `Type::DateTime`, `Type::Time`, `Type::Date`
  (`packages/activemodel/src/type/date-time.ts`, `time.ts`, `date.ts`)
  feed values through `new Date(String(value))`, which drops microseconds
  even when the source string had them.
- `pg` and `mysql2` both auto-decode datetime columns into `Date` before
  we ever see them, so the precision loss happens _inside the driver_,
  not in our code.

Goal: thread the TC39 `Temporal` API (`Temporal.Instant`,
`Temporal.PlainDateTime`, `Temporal.PlainDate`, `Temporal.PlainTime`,
`Temporal.ZonedDateTime`) end-to-end so microsecond (and nanosecond, where
the DB supports it) precision is preserved on read, write, and
round-trip.

## Type mapping (decided)

| Source                                        | Type returned                           | Notes                                                   |
| --------------------------------------------- | --------------------------------------- | ------------------------------------------------------- |
| Postgres `timestamptz` (1184)                 | `Temporal.Instant`                      | wire text has offset; lossless to instant               |
| Postgres `timestamp` (1114)                   | `Temporal.PlainDateTime`                | no zone in wire text; do not invent one                 |
| Postgres `date` (1082)                        | `Temporal.PlainDate`                    |                                                         |
| Postgres `time` (1083)                        | `Temporal.PlainTime`                    |                                                         |
| Postgres `timetz` (1266)                      | `Temporal.PlainTime` + offset attribute | see "timetz mapping" below                              |
| MySQL `TIMESTAMP`                             | `Temporal.Instant`                      | server interprets in session tz; see "MySQL session tz" |
| MySQL `DATETIME`                              | `Temporal.PlainDateTime`                | naive by definition                                     |
| MySQL `DATE`                                  | `Temporal.PlainDate`                    |                                                         |
| MySQL `TIME`                                  | `Temporal.PlainTime`                    |                                                         |
| SQLite `datetime`/`timestamp`                 | `Temporal.Instant` (UTC convention)     |                                                         |
| SQLite `date`                                 | `Temporal.PlainDate`                    |                                                         |
| SQLite `time`                                 | `Temporal.PlainTime`                    |                                                         |
| `Temporal.Now.instant()` (defaults / `touch`) | `Temporal.Instant`                      | matches Rails' `:utc` default                           |

### timetz mapping

Postgres `timetz` is a `time of day` plus a fixed offset (e.g.
`14:23:55.123456+02`). Rails (`activerecord/lib/active_record/connection_adapters/postgresql/oid/`)
has no dedicated OID class for `timetz`; it falls through to the
generic `OID::SpecializedString` text path and surfaces as a string in
the model. The PostgreSQL docs themselves
([§8.5.3](https://www.postgresql.org/docs/current/datatype-datetime.html))
describe `timetz` as "only a small subset of the issues that arise when
combining time zones with date/time" — i.e. second-class.

We do **not** invent a new Temporal subtype. Instead, the cast returns
a `Temporal.PlainTime` and stores the offset as a sibling attribute on
the column's value object: `{ time: Temporal.PlainTime, offset:
string }`. Public-facing access is `model.startTime.time` and
`model.startTime.offset`. `quote()` reassembles the wire form.
Justification: matches Rails' "the time component is the data, the
offset is metadata" treatment, and avoids `Temporal.PlainTime` claiming
a zone it can't represent.

### Default-timezone behavior

`ActiveRecord::Base.defaultTimezone === "local"` is **not** mirrored as a
type swap. Users who want a zoned view call
`instant.toZonedDateTimeISO(zone)` or use the `TimeWithZone` helper. This
keeps attribute types stable across timezone configuration.

## Driver / adapter support

### `pg` (node-postgres) — used by `postgresql-adapter`

- **No native Temporal support.** `pg`'s default OID parsers
  (`timestamp` 1114, `timestamptz` 1184, `date` 1082, `time` 1083,
  `timetz` 1266) all funnel through `new Date(...)` and were written
  before Temporal existed.
- **Per-connection parser tables, not global.** `pg.types.setTypeParser`
  mutates a process-global registry that other libraries
  (drizzle, pg-boss, raw `pg.Client` users in the same process) also
  read. We **must not** mutate it. Instead, every `Client`/`Pool` we
  open passes a `types` option containing our own
  `getTypeParser(oid, format)` function — `pg` uses that per-connection
  table when present and falls back to the global only when absent.
  Implementation lives in
  `connection-adapters/postgresql/temporal-type-parsers.ts`.
- **Wire-format quirks the parsers must handle.**
  - Space separator, not `T`: `'2026-04-26 14:23:55.123456+00'`.
  - Two-digit offset: `+00`, not `+00:00`. `Temporal.Instant.from` is
    strict; we normalize the string before parsing
    (`replace(' ', 'T')`, expand offset to `±HH:MM`, then parse).
  - Sentinels: `'infinity'`, `'-infinity'` → `DateInfinity` symbols
    (see "Sentinels" below).
  - BC dates: `'0044-03-15 12:00:00 BC'` → strip `BC` and negate the
    year before constructing the Temporal value.
  - MySQL-style zero-dates do not occur on Postgres.
- **Writing — text protocol.** `quote()` emits the full microsecond
  string for Temporal types. Specified in step 2.
- **Writing — extended (prepared) protocol.** `pg` calls
  `prepareValue(v)` which calls `v.toPostgres()` if defined, else
  `String(v)` for objects. We define a small `bindAsPostgresText`
  helper that converts Temporal types to their canonical wire string
  _before_ binding (we never let `pg` see a raw Temporal object). This
  lives in `abstract/database-statements.ts` alongside the existing
  `quote` path so both protocols share one formatter.

### `mysql2` — used by `mysql2-adapter` / `abstract-mysql-adapter`

- **No Temporal support.** Default decode is `Date`; `dateStrings: true`
  gives raw strings. We always set `dateStrings: true` for trails
  connections.
- **`typeCast(field, next)` for read.** Centralized in
  `connection-adapters/mysql/temporal-type-cast.ts`. Returns:
  - `DATETIME`/`TIMESTAMP` → string (deferred to `Type::DateTime`).
    The cast layer, not `typeCast`, decides PlainDateTime vs Instant.
  - `DATE`/`TIME`/`YEAR` → string, deferred similarly.
  - All others → `next()`.
- **`TIMESTAMP` requires session tz.** MySQL stores `TIMESTAMP` as UTC
  internally but **interprets and emits** wall-clock strings in
  `@@session.time_zone`. To convert the returned string to a real
  `Temporal.Instant`, the adapter must know the session zone. We pin
  it: every connection runs `SET time_zone = '+00:00'` on connect (we
  already do this for some paths; make it universal). Documented in
  `mysql2-adapter` connect hook. The `Type::DateTime#cast` for MySQL
  then parses the string as UTC `Instant`.
- **Bind path — prepared statements.** `mysql2` prepared mode
  serializes parameters via its own writer; `Date` is supported,
  Temporal is not. We convert Temporal → string at the bind boundary
  (`abstract/database-statements.ts`) for both adapters. No raw
  Temporal value reaches `mysql2`'s param writer.

### `better-sqlite3` — used by `sqlite3-adapter`

- **No coercion.** SQLite returns TEXT/INTEGER/REAL verbatim. All
  parsing happens in `Type::DateTime`. No driver work.
- `CURRENT_TIMESTAMP` is second-precision; sub-second only exists in
  values we wrote. After step 2 (`quotedDate` writes microseconds),
  reads round-trip exactly.
- **Bind path.** `better-sqlite3` rejects unknown object types in
  binds. Same Temporal-to-string conversion at the bind boundary.

### Summary

| Adapter          | Driver Temporal? | Read hook                                                     | Write hook                            | Driver work |
| ---------------- | ---------------- | ------------------------------------------------------------- | ------------------------------------- | ----------- |
| postgresql       | no               | per-connection `types.getTypeParser`                          | `quote` (text) + bind shim (extended) | medium      |
| mysql2 / trilogy | no               | `dateStrings: true` + `typeCast` + pinned `+00:00` session tz | `quote` + bind shim                   | medium      |
| sqlite3          | n/a              | `Type::DateTime` cast                                         | `quote` + bind shim                   | small       |

## Sentinels and out-of-range values

Postgres can return values that have no Temporal equivalent. Rails
returns `Float::INFINITY` for some, `nil` for zero-dates, etc. Decision:

- Add `DateInfinity` and `DateNegativeInfinity` symbols in
  `activemodel/src/type/internal/sentinels.ts`. Attribute types become
  `Temporal.Instant | typeof DateInfinity | typeof DateNegativeInfinity`
  for the columns where Rails returns `±Infinity`.
- BC year: Temporal supports negative years natively; the parser
  handles the suffix.
- MySQL zero-dates (`'0000-00-00'`, `'0000-00-00 00:00:00'`): cast to
  `null` (matches Rails `emulate_booleans`-era behavior). Configurable
  per-connection via the existing zero-date handling already in the
  MySQL adapter.

These shapes are blocking for step 4; the parsers must handle them on
day one or real Postgres data crashes the cast layer.

## Surface area to update

Numbers from `grep -rn 'new Date\|instanceof Date'`: ~250 hits across
~52 files in `packages/activerecord/src` alone, plus ~30 in
`packages/activemodel/src`, plus `activesupport/src/time-with-zone.ts`.
Most of those are tests, migrated alongside the production code that
exercises them.

### Wall-clock vs duration vs monotonic

Not every `new Date()` is a wall-clock value. Before migration, classify
each site:

- **Wall clock** (replace with Temporal): `created_at`/`updated_at`
  defaults, `touch`, multi-parameter assignment, type casts,
  `quotedDate`, OID parsers, fixture timestamps.
- **Duration / elapsed** (replace with `performance.now()` for elapsed
  ms; do not use Temporal): log subscriber timing,
  `transaction.ts:149` notification timestamp, query duration in
  `database-statements`, cache-key generation when used as a "bumped
  recently?" heuristic.
- **Epoch seconds for cache** (replace with
  `Math.floor(Temporal.Now.instant().epochMilliseconds / 1000)` or
  keep `Date.now()` _if_ lint-allowlisted): `cache-key.ts` uses
  seconds-precision and is fine on `Date.now()`.

The audit pass (step 8) tags each site explicitly. The lint rule
(step 9) has separate diagnostics for "use Temporal here" vs "use
`performance.now()` here" so it doesn't push duration code into a wrong
replacement.

### `activemodel` — base type system

- `type/date-time.ts`, `date.ts`, `time.ts` — `cast`/`serialize` produce
  Temporal types per the mapping table.
- `attribute-mutation-tracker.ts:5` — Temporal values are immutable, so
  the clone branch becomes a no-op return.
- `validations/comparison.ts:11` — branch on the constructor; use
  `Temporal.Instant.compare` / `PlainDate.compare` / etc.
- `serialization.ts:180` — `value.toString()`; Temporal serializes to
  ISO 8601 with native precision.
- `model.ts:1770,1786` — multi-parameter assignment.

> **Note on `activemodel` consumers.** `activemodel` is a separate
> public package (validation without AR). This migration changes its
> public type contract. Pre-release, that's fine, but it must be
> announced in the package CHANGELOG and the matching dx-tests updated.

### `activerecord` — adapter & quoting layer

- `connection-adapters/abstract/quoting.ts` (`quotedDate`, `quotedTime`,
  L55/L83). New formatter functions:
  `formatInstantForSql(instant, { precision })`,
  `formatPlainDateTimeForSql(pdt, { precision })`,
  `formatPlainDateForSql`, `formatPlainTimeForSql`. Precision is taken
  from the column where available; defaults to microsecond. Nanosecond
  is preserved if the DB column supports it (Postgres
  `timestamp(6)`-and-below truncates server-side, so nanosecond writes
  are lossy by the DB, not by us).
- `sqlite3/quoting.ts:93,145`, `mysql/quoting.ts:182,224` — call the
  new formatters.
- `abstract/database-statements.ts:943` and bind path — Temporal-to-
  string shim before parameter binding (extended/prepared protocols).
- `abstract/transaction.ts:149` — duration site, not wall clock; use
  `performance.now()`.

### `activerecord` — Postgres OID layer

- `oid/date.ts`, `oid/date-time.ts`, `oid/timestamp-with-time-zone.ts`,
  `oid/range.ts:207` — return Temporal. `timestamp-with-time-zone.ts`'s
  long-standing comment about "JS Date can't represent UTC vs local"
  becomes the motivating example in the changelog.

### `activerecord` — application surface

- `timestamp.ts:22,107` — `currentTimeFromProperTimezone` returns
  `Temporal.Instant`.
- `persistence.ts:1114` — `touch`.
- `insert-all.ts` — defaults.
- `multiparameter-attribute-assignment.ts` — splits build
  `Temporal.PlainDateTime`.
- Audit (step 8): `internal-metadata.ts`, `migration.ts`, `core.ts`,
  `relation.ts`, `relation/query-methods.ts`, `base.ts`,
  `model-codegen.ts`, `integration.ts` — each classified
  wall-clock/duration/cache before replacement.

### `activesupport`

- `time-with-zone.ts` — re-implement on `Temporal.ZonedDateTime`.
  Public methods (`inTimeZone`, `+`/`-` arithmetic, `toString`) keep
  Rails shapes. This is the user-facing entry point: docs steer users
  who want display formatting toward `TimeWithZone` rather than raw
  `Temporal.Instant`.

### Schema / dump / type generation

- **`trails-tsc` virtualizer must update before runtime flips.** The
  virtualizer (`type-virtualization/`) synthesizes attribute types
  from `schema-columns.json`. If runtime starts returning Temporal in
  step 5 but the virtualizer still emits `Date` until step 7, every
  user model fails typecheck against runtime output. Fix: virtualizer
  type emission moves to step 3 (the same PR that flips
  `Type::DateTime`'s return type). Codegen for written `.d.ts` files
  follows in step 7.
- `bin/trails-schema-dump.js` is unaffected — it dumps schema, not
  types.

### Boundary: external consumers (actionview, actionpack, JSON)

`Date.toJSON()` and `Temporal.Instant.toJSON()` both produce ISO 8601,
but with different precisions. Anywhere we hand a value to:

- `JSON.stringify` → fine (Temporal `toJSON` is defined).
- HTML view layer (actionview helpers) → audit; some helpers expect
  `Date`-shaped objects with `getFullYear()` etc. Either accept
  Temporal, or convert at the boundary with a documented adapter.
- Session/cookie serialization, log payloads → must round-trip ISO
  strings without `new Date(...)` truncation. Lint catches the
  obvious cases.

A boundary audit lands in step 6 (alongside `time-with-zone`).

### Testing

- The lint rule applies to **production and test code**, with one
  carve-out: a shared test helper
  `packages/activesupport/src/testing/temporal-helpers.ts` exposes
  `instant(iso)`, `plainDateTime(iso)`, etc. Tests use these instead
  of `new Date(...)`. The lint rule allowlists this file.
- Precision-sensitive tests (`bigint-roundtrip`, `quoting`,
  `timestamp`, `time-travel`) get explicit microsecond assertions.
- `api:compare` / `test:compare`: test names are unchanged, so
  matching is unaffected. The comparator's own date handling
  (`scripts/api-compare/`) audited for `Date` use; it's ours and is
  migrated in step 8.

## Runtime / dependency considerations

- **Polyfill required.** `@js-temporal/polyfill` is the source of
  `Temporal` until V8 ships it stable in Node LTS. Single shared
  re-export at `packages/activesupport/src/temporal.ts` makes the
  swap a one-file change.
- **TypeScript:** `lib.es2026.intl.temporal` plus the polyfill's
  ambient types in `tsconfig.base.json`.
- **Bundle size:** ~50 kB minified; acceptable for server-side ORM.
- **Performance.** Polyfill is slower than `Date` (10–50× on
  micro-benchmarks). Out of scope for this migration — we are spiking
  correctness, not optimizing. Revisit once V8 ships Temporal natively
  in Node LTS.

## MySQL existing-data note (post-1.0)

trails is pre-release, so this migration breaks no production data.
For documentation purposes when we ship 1.0:

A MySQL `TIMESTAMP` column's stored bytes are always UTC, but its
_displayed_ string depends on `@@session.time_zone` at read time. After
this migration, trails connects with `SET time_zone = '+00:00'`. A user
upgrading an app whose previous code wrote `TIMESTAMP` values via a
non-UTC session will see _the same UTC instants_ — the wire
representation changes, the stored data does not. `DATETIME` is naive
(no timezone interpretation) and is unaffected.

The migration guide (when 1.0 ships) will recommend:

1. Run `SELECT @@global.time_zone, @@session.time_zone;` on the live
   DB to confirm the existing assumption.
2. If the old codepath assumed `system` and the host TZ is not UTC,
   `DATETIME` columns may have been written as wall-clock-in-host-TZ
   strings. The Temporal cast (`PlainDateTime`) will surface them
   correctly; the user is responsible for whatever zone interpretation
   they want — same as Rails.

No action required for trails' own pre-release tests.

## Strategy: hard cutover, no flag

trails is pre-release with no users; no backwards-compat constraint.
We rip `Date` out of the datetime path entirely rather than maintaining
a dual-mode (`Date` | `Temporal`) branch. Reasons:

- Every cast / quoter / OID parser / mutation-tracker / serializer /
  validator / multi-param site would need an `if (flag)` branch —
  doubling surface area in ~80 files.
- Generated attribute types can't be cleanly dual-typed:
  `created_at: Date | Temporal.Instant` forces every read to narrow.
- Rails has no `Time` vs `DateTime` config knob; trails should not
  invent one.
- One-time pre-1.0 cutover beats permanent maintenance of a legacy
  branch.

## PR sequence

Each PR ships behavior end-to-end and keeps `pnpm test` and
`pnpm test:types` green. Ordering preserves the invariant:
**at every commit, `Type::DateTime`'s declared return type matches
what the runtime produces, and what `quotedDate` accepts.**

Notation per PR: **Files**, **Tests**, **DoD** (definition of done),
and **Blocked by**.

### ~~PR 1 — Polyfill, sentinels, helpers~~ ✓ merged #900

### ~~PR 2 — Bind-boundary string formatters~~ ✓ merged #909

The dual-typed window is now open. `quote()`, `typeCast()`, and
`temporalToBindString()` in all adapters accept both `Date` and
Temporal. The window closes at PR 6.

### PR 3a — `activemodel` cast layer flip

The first half of the original "PR 3". Scope: just the activemodel
type system; no virtualizer, no activerecord changes.

- **Files (modified):**
  - `packages/activemodel/src/type/date-time.ts` — `cast` returns
    `Temporal.Instant | Temporal.PlainDateTime` based on input shape
    (offset present → Instant; otherwise PlainDateTime). `serialize`
    returns the canonical string.
  - `packages/activemodel/src/type/date.ts` — `Temporal.PlainDate`.
  - `packages/activemodel/src/type/time.ts` — `Temporal.PlainTime`;
    `userInputInTimeZone` returns `Temporal.ZonedDateTime`.
  - `packages/activemodel/src/attribute-mutation-tracker.ts:5` —
    Temporal-immutable branch (no clone).
  - `packages/activemodel/src/validations/comparison.ts:11` — branch
    on constructor, dispatch to `Temporal.X.compare`.
  - `packages/activemodel/src/serialization.ts:180` — `value.toJSON()`.
  - `packages/activemodel/src/model.ts:1770,1786` — multi-parameter
    builds `Temporal.PlainDateTime`.
- **Tests:** rewrite `type/date-time.test.ts`, `date.test.ts`,
  `time.test.ts`, `comparison-validation.test.ts`,
  `serialization.test.ts` to use the new helpers from PR 1. Assert
  microsecond preservation in `cast`/`serialize`.
- **DoD:** activemodel typecheck and tests pass; `Type::DateTime#cast`
  returns Temporal; activerecord still compiles because activerecord
  hasn't _consumed_ the new return type yet (stored in `unknown`-typed
  attribute slots, which is the current state).
- **Blocked by:** PR 1.

### PR 3b — `trails-tsc` virtualizer emits Temporal types

The second half of the original "PR 3". Without this, every user
model breaks at typecheck the moment runtime starts handing back
Temporal — so it lands in the same train but as its own reviewable
unit.

- **Files (modified):**
  - `packages/activerecord/src/type-virtualization/` (the column-to-TS
    type emitter) — map `datetime`/`timestamptz` → `Temporal.Instant`,
    `timestamp` → `Temporal.PlainDateTime`, `date` → `Temporal.PlainDate`,
    `time` → `Temporal.PlainTime`.
- **Tests:** snapshot tests under `type-virtualization/` for each
  column type. Update fixtures in
  `dx-tests/declare-patterns.test-d.ts` and
  `virtualized-dx-tests/virtualized-patterns.test-d.ts`.
- **DoD:** `pnpm test:types` green; emitted types match runtime cast
  output from PR 3a.
- **Blocked by:** PR 3a.

### PR 4 — SQLite driver path (smallest adapter, validates the shape)

Of the three adapters, SQLite has the least driver coupling — pick
it first to prove the cast layer end-to-end before touching `pg` /
`mysql2`.

- **Files (modified):**
  - `packages/activerecord/src/connection-adapters/sqlite3-adapter.ts`
    — register `DateType`/`DateTimeType`/etc. unchanged; document
    that no driver work is required.
  - `…/sqlite3/quoting.ts` — switch to Temporal-only when given
    Temporal (already accepts both from PR 2).
- **Tests:** `sqlite3/quoting.test.ts` rewritten to assert microsecond
  round-trip via real `better-sqlite3` calls (existing test file, just
  swap the Temporal helpers in).
- **DoD:** SQLite `INSERT` then `SELECT` of a microsecond timestamp
  preserves all six digits.
- **Blocked by:** PR 3a (cast layer must already return Temporal).

### PR 5a — Postgres driver path: per-connection type parsers

- **Files (new):**
  - `…/connection-adapters/postgresql/temporal-type-parsers.ts` — a
    `getTypeParser(oid, format)` factory keyed on OIDs
    1082/1083/1114/1184/1266. Reuses parsers from PR 1.
- **Files (modified):**
  - `…/connection-adapters/postgresql-adapter.ts` — pass
    `{ types: { getTypeParser } }` to `new pg.Pool` /
    `new pg.Client`. Explicitly _do not_ call `pg.types.setTypeParser`
    anywhere (fail CI if grep finds it).
  - `…/postgresql/oid/date.ts`, `…/oid/date-time.ts`,
    `…/oid/timestamp-with-time-zone.ts`, `…/oid/range.ts:207` —
    return Temporal directly. Sentinel handling lands here:
    `'infinity'` → `DateInfinity`, BC → negated year.
- **Tests:** `postgresql-adapter.test.ts` cases for each OID
  including infinity, BC, and microsecond round-trip. Add a
  cross-process test asserting a sibling `pg.Client` (no trails
  wrapping) still gets default `Date` behavior — proves we didn't
  pollute the global registry.
- **DoD:** Postgres microsecond + sentinel round-trip green; sibling
  `pg.Client` unaffected.
- **Blocked by:** PR 3a.

### ~~PR 5b — MySQL driver path: `dateStrings` + `typeCast` + pinned tz~~ ✓ merged #930

- **Files (new):**
  - `…/connection-adapters/mysql/temporal-type-cast.ts` — `typeCast`
    callback returning strings for DATETIME/TIMESTAMP/DATE/TIME/YEAR.
- **Files (modified):**
  - `…/connection-adapters/mysql2-adapter.ts` and
    `…/abstract-mysql-adapter.ts` — connect-options merge in
    `dateStrings: true`, the `typeCast` from above, and a post-connect
    `SET time_zone = '+00:00'`.
  - `…/mysql/quoting.ts` — Temporal-only branch (already accepts both
    from PR 2).
- **Tests:** `mysql2-adapter.test.ts` microsecond round-trip;
  zero-date → `null` cast; verify that changing the server's global
  TZ doesn't change our session's behavior.
- **DoD:** MySQL microsecond round-trip green on both `mysql2` and
  `trilogy` adapters; zero-date handling matches Rails.
- **Blocked by:** PR 3a.

### ~~PR 6 — Close the dual-typed window~~ ✓ open #939

PRs 4, 5a, 5b have removed every caller that passes `Date` into the
formatters. This PR deletes the `Date` overload from PR 2.

- **Files (modified):**
  - `…/abstract/quoting.ts` — drop `Date` from `quotedDate` /
    `quotedTime` / formatter signatures. Old `getUTCMilliseconds() *
1000` formatting code deleted.
  - `…/abstract/database-statements.ts:943` — type guard narrows to
    Temporal only.
- **Tests:** assert at the type level (`expectTypeOf`) that
  `quotedDate(new Date())` is a TS error.
- **DoD:** `grep -rn 'instanceof Date' packages/activerecord/src/connection-adapters` finds zero hits.
- **Blocked by:** PR 4, PR 5a, PR 5b.

### PR 7 — Application-layer defaults

- **Files (modified):**
  - `packages/activerecord/src/timestamp.ts:22,107` —
    `currentTimeFromProperTimezone` returns `Temporal.Instant`
    (`Temporal.Now.instant()`).
  - `…/persistence.ts:1114` — `touch` default.
  - `…/insert-all.ts` — defaults.
  - `…/multiparameter-attribute-assignment.ts` — splits build
    `Temporal.PlainDateTime`.
- **Tests:** `timestamp.test.ts`, `time-travel.test.ts`,
  `persistence.test.ts`, `insert-all.test.ts` — assert
  `created_at` / `updated_at` are Temporal with microsecond
  precision.
- **DoD:** new records persist a microsecond-precise `created_at`;
  reload preserves it.
- **Blocked by:** PR 6.

### PR 8 — `TimeWithZone` Temporal-native rewrite

- **Files (modified):** `packages/activesupport/src/time-with-zone.ts`
  — internals become `Temporal.ZonedDateTime`. Public methods
  (`inTimeZone`, arithmetic, `toString`, `toJSON`) keep Rails
  shapes. Per the "no Date interop" decision, the constructor
  rejects `Date`.
- **Tests:** `time-with-zone.test.ts` rewritten.
- **DoD:** `TimeWithZone` round-trips through ISO 8601 with
  microseconds; constructor rejects `Date` at type and runtime.
- **Blocked by:** none (PR 1 merged; standalone chain).

### PR 9 — External-boundary audit (actionview / actionpack / logs)

Per the boundary section: anywhere we hand a Temporal value across a
package boundary, audit and fix.

- **Files (modified, candidates — exact list determined by audit
  grep):** `packages/actionview/src/helpers/date-helper.ts`-style
  helpers, `packages/actionpack/src/cookies.ts`-style serializers,
  log subscribers in `activerecord` and `activesupport`.
- **Tests:** add a "round-trip via JSON" test for cookie/session
  paths asserting microsecond preservation.
- **DoD:** every consumer of a `created_at` / `TimeWithZone` value
  outside activerecord typechecks against Temporal and round-trips
  ISO without precision loss.
- **Blocked by:** PR 8.

### PR 10 — Schema dump + codegen `.d.ts` flip

- **Files (modified):** `packages/activerecord/src/model-codegen.ts`
  and any other `.d.ts` writer. `bin/trails-schema-dump.js` is
  unchanged (its output is a JSON schema, not types).
- **Tests:** snapshot tests for generated `.d.ts` per column type;
  `pnpm test:types` is the gate.
- **DoD:** generated declaration files reference `Temporal.*`
  consistently with the virtualizer (PR 3b).
- **Blocked by:** PR 3b (virtualizer is the source of truth; codegen
  follows).

### PR 11 — Audit pass for incidental `Date` use

Sweep the long tail. Each file gets classified before replacement.

- **Files (modified):** `core.ts`, `migration.ts`,
  `internal-metadata.ts`, `model-codegen.ts` (any non-type uses),
  `relation.ts`, `relation/query-methods.ts`, `base.ts`,
  `integration.ts`, `cache-key.ts`, `transaction.ts:149` (duration
  → `performance.now()`), log subscribers, `scripts/api-compare/`'s
  own date handling.
- **Tests:** existing tests; this PR is mostly green-already.
- **DoD:** outside the test-helpers file and any documented JS↔Date
  interop boundaries, `grep -rn 'new Date\|instanceof Date'
packages/*/src` returns zero hits.
- **Blocked by:** PR 10.

### PR 12 — ESLint enforcement

Locks in the cleanup so it can't regress.

- **Files (new):**
  - `eslint-plugin-trails-internal/` (workspace package) — exports
    two rules:
    - `no-native-date` — flags `NewExpression` on `Date`,
      `MemberExpression` on `Date.{now,parse,UTC}`,
      `BinaryExpression` `instanceof Date`, and `TSTypeReference`
      named `Date`.
    - `no-temporal-for-duration` — flags
      `Temporal.Now.instant().epochMilliseconds` subtraction
      patterns; suggests `performance.now()`.
- **Files (modified):** `eslint.config.js` (root) — register the
  plugin and enable both rules at `error`. Allowlist
  `packages/activesupport/src/testing/temporal-helpers.ts`.
- **Tests:** rule unit tests with valid/invalid fixtures.
- **DoD:** `pnpm lint` green on the whole repo with the rule at
  `error`. Any regression PR fails CI.
- **Blocked by:** PR 11.

### Dependency graph

```
(PR 1 ✓) (PR 2 ✓)
 ├── PR 3a ─── PR 4 ──┐
 │       └── PR 5a ──┼── PR 6 ── PR 7 ──┐
 │       └── PR 5b ──┘                  │
 ├── PR 3a ── PR 3b ── PR 10 ── PR 11 ── PR 12
 └── PR 8 ── PR 9
```

PRs 3a, 8 are now unblocked. PRs 4, 5a, 5b are independent of each
other and can land in any order (or in parallel) once PR 3a merges.
PR 8 / 9 form their own short chain. The critical path is
3a → 3b → 10 → 11 → 12.

## Decisions

- **No `Date` interop anywhere.** `TimeWithZone` and every other
  Temporal-accepting API reject `Date` at the type and runtime
  boundary. Users converting from `Date`-typed code call
  `Temporal.Instant.fromEpochMilliseconds(date.getTime())` themselves
  at the edge. Rationale: keeps `Date` from sneaking back in via
  ergonomic shortcuts, and the lint rule (step 9) stays meaningful.
- **ISO 8601 is the canonical serialized form.** Default `toJSON`
  emits ISO strings (microsecond precision via
  `toString({ smallestUnit: 'microsecond' })`). `bigint`
  `epochNanoseconds` is available as a method call but is **not** a
  public attribute or serialization shape. Cache keys, JSON payloads,
  log lines, and cookie/session round-trips all use ISO strings.
