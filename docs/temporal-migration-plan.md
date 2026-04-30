# Temporal migration — status & follow-ups

The end-to-end Temporal migration is **complete**. Every datetime / time /
timestamp value in the data layer round-trips through `Temporal.*` types
with microsecond (and nanosecond, where the DB supports it) precision
preserved. Postgres / MySQL / SQLite adapters read and write Temporal
directly; the application surface (`Base#created_at`, `touch`, multi-param
build, mutation tracker, comparison validator, serializer) is Temporal
end-to-end. The 12-PR cutover landed across PRs #900 through #1019; the
ESLint rule `blazetrails/no-native-date` (#1019) locks the cleanup in
across `arel`, `activesupport`, `activemodel`, `activerecord`, `actionpack`,
`actionview`, `rack`, `trailties`, `website`. Public-surface follow-ups
(`TimeWithZone` ns-precision #1027, `Notifications::Event#time` #1030,
`Logger#formatter` #1031, `MessageVerifier` expiry #1037) have all
shipped.

## Standing decisions (still load-bearing)

- **No `Date` interop in datetime APIs.** `TimeWithZone` and every other
  Temporal-accepting API rejects `Date` at the type and runtime boundary.
  Users converting from `Date`-typed code call
  `Temporal.Instant.fromEpochMilliseconds(date.getTime())` themselves at
  the edge.
- **ISO 8601 is the canonical serialized form.** `toJSON` emits ISO
  strings with microsecond precision via
  `toString({ smallestUnit: "microsecond" })`. `bigint` is not used as
  a wire format.
- **`pg` type parsers are per-connection, not global.** We pass `types`
  to every `Pool`/`Client` we open so sibling `pg.Client` users in the
  same process see default `Date` behavior.
- **MySQL adapters force `dateStrings: true` + `SET time_zone = '+00:00'`.**
  We never trust the driver to decode datetime columns.

## Remaining gap: activesupport `Date`-returning helpers

Audit (2026-04-30) of `arel`, `activemodel`, `activerecord`, `activesupport`:

- `arel`, `activemodel`, `activerecord`: **0 functions return `Date`.**
  Remaining `instanceof Date` references are defensive guards in
  quoters / serializers / comparators (`abstract/quoting.ts:66,102`,
  `mysql/quoting.ts:172,219`, `sqlite3/quoting.ts:80,131`,
  `postgresql/oid/range.ts:217`, `attribute-mutation-tracker.ts:9`,
  `serialization.ts:194`, `model.ts:1833,1842`, `comparison.ts:46`,
  `relation.ts:2291,4113,4204`, `query-methods.ts:789,791`,
  `time-zone-conversion.ts:37`, `quote-array.ts:14`, `dot.ts:506,540`,
  `to-sql.ts:1372,1442`, `node.ts:143`, `database-statements.ts:967`).
  Each survives only to narrow legacy `Date` _inputs_ away — they
  become unreachable once the helpers below stop emitting `Date`.
- `activesupport/time-ext.ts`: **38 exported helpers return `Date`.**
  Every Rails `Time` core-ext (`beginningOfDay`, `endOfMonth`,
  `nextWeek`, `ago`, `since`, `floor`, `ceil`, `toDate`, `toTime`, …).
- `activesupport/duration.ts`: **4 methods return `Date`** (`Duration#since`,
  `#ago`, `#fromNow`, `#until`).
- `activesupport/time-with-zone.ts:122`: private `_toDate()`.
- `activesupport/time-travel.ts:30`: helper returning `new Date(...)`.

**Direction:** activesupport keeps **accepting** `Date` for ergonomic
input, but every helper **returns** `Temporal.Instant`. After the
return-side flip, the activerecord defensive `instanceof Date` guards
become unreachable and get deleted in a sweep PR.

## Open follow-ups

Each PR ≤300 LOC. The chain is independent — any can land first.

### F-6c — `time-ext.ts` arithmetic (≈6 helpers)

- `ago`, `since`
- `floor`, `ceil`
- `change`, `advance`

Same shape. `floor` / `ceil` switch their `ms` parameter to a
Temporal `Duration` to keep precision below 1 ms reachable.

### F-6d — `time-ext.ts` predicates & coercions (≈6 helpers)

- `past?`, `future?` — accept `Date | Temporal.Instant`, compare via
  `Temporal.Now.instant()`.
- `toDate`, `toTime` — these are the Rails-equivalents of
  `Time#to_date` / `Time#to_time`. Return `Temporal.PlainDate` /
  `Temporal.Instant` respectively.
- `toFs`, `strftime` — already string-returning; just narrow the
  input type to also accept Temporal.

### F-6e — `duration.ts` `since` / `ago` / `fromNow` / `until`

`Duration#since(date?)`, `#ago(date?)`, `#fromNow()`, `#until(date?)`
return `Temporal.Instant`. Default arg flips from `new Date()` to
`Temporal.Now.instant()`.

### F-6f — `time-with-zone.ts:122` private `_toDate()`

Audit callers: if the only consumer is the now-removed `Date`
interop boundary, delete it. Otherwise return `Temporal.Instant` and
update callers.

### F-6g — `time-travel.ts:30` mock now

`new Date(Date.now() + _timeOffset)` → `Temporal.Now.instant().add({
nanoseconds: _timeOffsetNs })`. Keep the mock plumbing through
`Temporal.Now`.

### F-6h — Sweep `instanceof Date` guards in arel / activemodel / activerecord

Once F-6a..g have shipped, the input pipeline can no longer carry a
`Date`. The defensive `instanceof Date` branches enumerated above
become dead code. Delete them, drop the corresponding `// boundary:`
and `@boundary-file:` annotations, and tighten the function
signatures to `Temporal.*` only. Expected scope: ~25 sites across
`activerecord` (quoting + relation), `activemodel` (mutation
tracker, serializer, model, comparison), and `arel` (visitors,
quote-array). Mostly deletions.
