# `setupFixtures` / `useHandlerTransactionalFixtures` caller audit

Foundational audit for **RFC 0062 (transactional-fixtures burndown)**. Produces
the per-cluster conversion story cut so the sweep is scoped correctly — it is
**not** a uniform "replace `setupFixtures` with `fixtures({})`" rename. Different
callers have different correct destinations, enumerated below.

Counts are from `main` as of 2026-07-04, gathered with:

```sh
cd packages/activerecord/src
git grep -l 'setupFixtures'                       -- '*.test.ts' | grep -v test-helpers/   # 125
git grep -l 'useHandlerTransactionalFixtures'     -- '*.test.ts' | grep -v test-helpers/   #  66
git grep -l -E '(^|[^A-Za-z])fixtures\('          -- '*.test.ts' | grep -v test-helpers/   # 183
```

All 125 `setupFixtures` callers partition cleanly (every
`useHandlerTransactionalFixtures` caller also calls `setupFixtures`, so the pair
set is exactly the intersection).

## Wiring identity

`fixtures({...})` (`test-helpers/fixtures.ts:64`) composes exactly:

```text
setupHandlerSuite()                              # via setupFixtures()
+ withTransactionalFixtures(() => Base.connection)  # via useHandlerTransactionalFixtures()
+ useFixtures(...)                               # the fixture data + schema slice
```

So `setupFixtures()` (= `setupHandlerSuite()`, `fixtures.ts:91`) and
`useHandlerTransactionalFixtures()` (= `withTransactionalFixtures(() =>
Base.connection)`, `use-handler-transactional-fixtures.ts:34`) are the
**decomposed pair** of the same wiring `fixtures({})` collapses. `fixtures()`
itself calls `setupHandlerSuite()` internally (`use-fixtures.ts:664`), which is
why a `setupFixtures()` line beside a `fixtures(...)` call is dead double-wiring.

## No-fixture-data surface decision

**Decision: use the empty-array form `fixtures([], { … })` for pair-only files —
no new helper.**

`useFixtures` already treats an empty array as a vacuously-correct zero-fixture
case (`use-fixtures.ts:439-443`): "an empty array is vacuously correct for both
the by-name and tableless overloads (both seed zero fixtures and return `{}`)".
So `fixtures([], { … })` runs `setupHandlerSuite()` +
`withTransactionalFixtures(() => Base.connection)` + `useFixtures([])` — the exact
suite-wiring + per-test transaction the pair provides, with no fixture data
loaded and no canonical schema created (the default `schema: TEST_SCHEMA` derives
an empty slice for zero requested sets, a no-op). Each pair replaces to a single
`fixtures([], …)` call; a file's existing schema setup — whichever form it uses
(`createTable`, `defineSchema`, or none at all when the block rides the canonical
schema) — is orthogonal and left untouched.

Two properties of Bucket A files are load-bearing for the conversion stories and
must not be under-scoped:

- **Table creation is not a defining trait.** Rails' fixture wiring is per-test
  transactional setup (`setup_fixtures` / `teardown_fixtures`,
  `vendor/rails/activerecord/lib/active_record/test_fixtures.rb:108-133`), fully
  independent of how — or whether — a suite creates its tables. In Bucket A,
  ~30 of the 54 files call **no** `createTable()` at all (e.g.
  `attribute-methods.test.ts`, `base.test.ts`, most `associations/*`,
  `validations/*`): they ride the canonical schema. Others create tables via
  `createTable` or `defineSchema`. The conversion touches only the pair, never
  the schema setup.
- **A file may hold several pairs, not one.** The pair is per-`describe`, so
  files split into multiple suites carry one pair each — e.g.
  `attribute-methods.test.ts` and `base.test.ts` have **3** pairs,
  `autosave-association.test.ts` / `dirty.test.ts` / `normalized-attribute.test.ts`
  have 2. Conversion is per pair (per `describe`), not one edit per file.

Rejected alternative: a retained combined no-data helper (e.g.
`setupTransactionalSuite()`). It would be a second public surface for something
`fixtures([], …)` already expresses, cutting against RFC 0062's goal of one
Rails-faithful entry point.

Non-transactional pair variants (a handful pass `useTransactionalTests: false`
semantics by omitting `useHandlerTransactionalFixtures`) are Bucket C, not
Bucket A — see below.

## Buckets

| Bucket                | What                                                                                                                                                                             | Count | Conversion target                                                                                                                                             |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A** — pair, no data | `setupFixtures()` + `useHandlerTransactionalFixtures()` pair(s), no fixture map, no `fixtures(...)` call (schema comes from canonical / `createTable` / `defineSchema`, or none) |    54 | Replace each pair with `fixtures([], { … })`; leave schema setup untouched. Files may hold multiple pairs (per `describe`) — convert every pair               |
| **B** — redundant     | `setupFixtures()` on a file that already calls `fixtures(...)` (which re-wires the suite)                                                                                        |    28 | Delete the `setupFixtures()` line (+ its import if now unused). Zero behavior change                                                                          |
| **C** — sf-only       | `setupFixtures()` only — no transaction, no fixture data (pure handler wiring / shared-DB shield with manual `createTable()`)                                                    |    31 | Keep `setupFixtures()`; no transactional wrapper wanted (many are PG-DDL suites that break under txn wrapping). No conversion needed beyond confirming intent |
| **D** — mixed         | `setupFixtures()` + `useHandlerTransactionalFixtures()` **and** a `fixtures(...)` call in the same file (per-`describe` split)                                                   |    12 | Per-`describe` hand conversion: data blocks → `fixtures([...] )`, no-data blocks → `fixtures([], …)`, drop redundant top-level pair                           |

Bucket C is largely already-correct: these files intentionally have no per-test
transaction (PG DDL / schema-migration / type suites that
break under `fixtures({})` transactional wrapping (PR #4513) — 25P02 aborts).
They are inventoried for completeness but need **no conversion** — RFC 0062's
burndown target is the pair (A) and the redundant double-wiring (B). Bucket C
stories, if cut at all, are audit-only confirmations.

### Bucket A — pair, no data (54)

```text
adapters/abstract-mysql-adapter/adapter-prevent-writes.test.ts
adapters/postgresql/array.test.ts
adapters/postgresql/explain.test.ts
adapters/postgresql/virtual-column.test.ts
associations/association-scope-alias-tracker.test.ts
associations/association-scope.test.ts
associations/cp-count-disable-joins-through.test.ts
associations/disable-joins-association-scope.test.ts
associations/disable-joins-composite-key.test.ts
associations/disable-joins-composite-nested.test.ts
associations/disable-joins-nested-through.test.ts
associations/disable-joins-polymorphic-nonid-pk.test.ts
associations/disable-joins-routing-widening.test.ts
associations/eager-load-includes-full-sti-class.test.ts
associations/eager-singularization.test.ts
associations/required.test.ts
attribute-methods.test.ts
attribute-methods.trails.test.ts
attributes.test.ts
autosave-association.test.ts
base-prevent-writes.test.ts
base.test.ts
bigint-roundtrip.test.ts
column-names-sync-virtual-exclusion.test.ts
dirty.test.ts
encryption/contexts.test.ts
encryption/extended-deterministic-queries.test.ts
encryption/unencrypted-attributes.test.ts
encryption/uniqueness-validations.test.ts
finder-respond-to.test.ts
habtm-destroy-order.test.ts
i18n.test.ts
inheritance-namespaced.test.ts
lazy-schema-reflection.test.ts
log-subscriber.test.ts
mixin.test.ts
model-schema.test.ts
nested-attributes-with-callbacks.test.ts
normalized-attribute.test.ts
numeric-data.test.ts
reflection.test.ts
relation/build-joins-from-subquery-dedup.test.ts
relation/eager-shared-alias-tracker.test.ts
relation/mutation.test.ts
relation/value-accessor-semantics.test.ts
secure-password.test.ts
secure-token.test.ts
statement-cache.test.ts
suppressor.test.ts
token-for.test.ts
type/date-time.test.ts
validations/i18n-validation.test.ts
validations/length-validation.test.ts
validations/presence-validation.test.ts
```

### Bucket B — redundant `setupFixtures()` beside `fixtures(...)` (28)

```text
adapters/abstract-mysql-adapter/mysql-explain.test.ts
adapter.test.ts
annotate.test.ts
associations/association-scope-cache.test.ts
associations/callbacks.test.ts
associations/eager.test.ts
associations/getmodelcolumns-virtual-projection.test.ts
associations/has-many-through-associations.test.ts
associations/has-many-through-disable-joins-associations.test.ts
associations/inverse-associations.test.ts
associations/preloader-bigint-number-key-match.test.ts
callbacks.test.ts
clone.test.ts
connection-handling.test.ts
date.test.ts
insert-all.test.ts
json-serialization.test.ts
multiparameter-attributes.test.ts
multiple-db.test.ts
primary-keys.test.ts
query-cache.test.ts
relation/select-star-join-collision.test.ts
relation/select.test.ts
strict-loading.trails.test.ts
timestamp.test.ts
transactions.trails.test.ts
validations/uniqueness-validation.test.ts
validations/validations.test.ts
```

### Bucket C — `setupFixtures`-only, no txn / no data (31)

```text
adapters/abstract-mysql-adapter/schema-migrations.test.ts
adapters/postgresql/bytea.test.ts
adapters/postgresql/citext.test.ts
adapters/postgresql/composite.test.ts
adapters/postgresql/create-unlogged-tables.test.ts
adapters/postgresql/domain.test.ts
adapters/postgresql/enum.test.ts
adapters/postgresql/foreign-table.test.ts
adapters/postgresql/hstore.test.ts
adapters/postgresql/interval.test.ts
adapters/postgresql/ltree.test.ts
adapters/postgresql/money.test.ts
adapters/postgresql/network.test.ts
adapters/postgresql/numbers.test.ts
adapters/postgresql/range.test.ts
adapters/postgresql/schema-authorization.test.ts
adapters/postgresql/schema.test.ts
adapters/postgresql/timestamp.test.ts
adapters/postgresql/uuid.test.ts
adapters/postgresql/xml.test.ts
column-alias.test.ts
migration.test.ts
reflection.trails.test.ts
reserved-word.test.ts
sanitize.test.ts
statement-invalid.test.ts
table-metadata.test.ts
transaction-isolation.test.ts
type/integer.test.ts
types.test.ts
validations/numericality-validation.test.ts
```

### Bucket D — mixed per-`describe` (12)

```text
associations/belongs-to-associations.test.ts
associations/eager-load-nested-include.test.ts
associations/has-many-associations.test.ts
associations/join-model.test.ts
associations.test.ts
counter-cache.trails.test.ts
custom-locking.test.ts
delegate.test.ts
finder.test.ts
persistence.test.ts
persistence.trails.test.ts
relation.trails.test.ts
```

## Conversion story cut

Clusters are directory-grouped to minimise file-overlap conflicts between
parallel converters, sized well under the 500-LOC ceiling. Per-file edit size
varies: a Bucket A file may hold several per-`describe` pairs (each → one
`fixtures([], …)` call), a Bucket B file is a single-line delete, and Bucket D
files need per-`describe` judgement. LOC estimates below account for the
multi-pair files. Bucket C needs no conversion, so its stories are audit-only
confirmations that the intent (no transaction) is correct and can be deferred /
dropped.

| Story slug                                 | Bucket | Files | Notes                                                                              |
| ------------------------------------------ | ------ | ----: | ---------------------------------------------------------------------------------- |
| `convert-pair-adapters-associations-a`     | A      |    16 | adapters/_ + associations/_ (first half)                                           |
| `convert-pair-associations-encryption-a`   | A      |    14 | associations tail + encryption/\* + attribute/attributes                           |
| `convert-pair-core-relation-a`             | A      |    14 | base/dirty/reflection/relation/\* core                                             |
| `convert-pair-secure-validations-a`        | A      |    10 | secure-_, token, type, validations/_                                               |
| `convert-mixed-perdescribe-associations-d` | D      |     7 | associations/\* + associations.test.ts                                             |
| `convert-mixed-perdescribe-core-d`         | D      |     5 | counter-cache/custom-locking/delegate/finder/persistence/relation                  |
| `confirm-sfonly-no-txn-intent-c`           | C      |    31 | audit-only: confirm no-transaction intent (PG-DDL suites); no code change expected |

**Bucket B** is already owned by the pre-existing story
`converge-setupfixtures-redundant-next-to-fixtures` (RFC 0062), which covers all
28 files as one straight deletion. This audit supplies the concrete file list
above; no new Bucket B stories were cut (two duplicates were closed as
superseded by that story).

Bucket B lands before Bucket A/D in scheduling: pure deletions, lowest-risk, and
they shrink the caller count fastest.
