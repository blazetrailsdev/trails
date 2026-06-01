# activerecord — prioritized work plan (test:compare 100% + Rails fidelity)

> **Snapshot 2026-06-01.** A prioritized, dependency-sensitive, **executable**
> ordering of the PRs that close `test:compare` to 100% and finish
> Rails-fidelity cleanup. Each story carries our source anchors (`file:line`),
> the Rails source reference, the tests it moves, an LOC estimate,
> dependencies, and an acceptance line.
>
> **Anchor verification status:** Waves 0–3 `file:line` anchors were verified
> against the tree on 2026-06-01. Waves 4–7 anchors are doc-sourced and **to be
> confirmed by the campaign's audit PR** — line numbers drift (e.g. the
> 100-plan's `destroyAssociations` "persistence.ts:1236" is actually `:1313`
> today), so re-`grep` before editing. Never trust a cited line blindly.
>
> Sources: [`activerecord-index.md`](activerecord-index.md),
> [`activerecord-100-plan.md`](activerecord-100-plan.md),
> [`activerecord-gaps.md`](activerecord-gaps.md),
> [`adapter-architecture-cleanup.md`](adapter-architecture-cleanup.md),
> [`activerecord-type-audit.md`](activerecord-type-audit.md), plus the live
> in-tree skip histogram. The 100-plan owns batch detail; this doc owns the
> **order** and the **per-story spec**.
>
> **Goals:** (1) `test:compare` 100%; (2) Rails fidelity.
> `api:compare` is already closed (4969/4969).

## How to read this plan

**Counts are indicative; refresh before starting any story.** The per-file
numbers in `activerecord-100-plan.md` Part 2 are dated **2026-05-18 and are
stale** — e.g. `hash-config` showed 34 pending there but has **0** live
`it.skip` today (shipped since). Authoritative source of truth:

```bash
pnpm test:compare --cached --json --package activerecord     # matched/skipped/missing per file (JSON)
pnpm test:compare --package activerecord --incomplete        # rendered per-file table, complete files hidden
grep -rn "BLOCKED:" packages/activerecord/src --include='*.test.ts' \
  | sed 's/.*BLOCKED: //' | cut -d' ' -f1 | sort | uniq -c | sort -rn   # category histogram
```

**Rails source lives at `vendor/rails/activerecord/`** — `lib/active_record/…`
for implementation, `test/cases/…` for tests. (The 100-plan's
`scripts/api-compare/.rails-source/…` path no longer exists — do not use it.)

**Two work shapes — every test:compare story is one or the other:**

- **un-skip** — an `it.skip(...)` stub already exists with a
  `BLOCKED/ROOT-CAUSE/SCOPE` annotation. Flip it, fix the named cause, commit.
- **port-missing** — Rails has the test, we never wrote it (`missing > 0`, no
  stub). Generate stubs with `pnpm test:stubs` (→
  `scripts/test-compare/generate-stubs.ts`), then write bodies under the
  **exact** Rails name (CLAUDE.md: never rename).

**Ready vs audit-gated.** Stories in Waves 0–3 carry verified line numbers and
are ready to dispatch. The association (285) + relation (199) tail in Wave 7 is
**audit-gated by design**: per the 100-plan methodology the first PR of each
deep cluster is a **read-only `/audit-report`** that produces the sized,
line-numbered slots. Fabricating line numbers for ~480 tests across dozens of
files would be wrong (the staleness above proves why) — the audit is the spec
step, and this plan schedules it explicitly.

**Story template:**

```
### Story <id> — <title>   `[un-skip|port|impl|fidelity]`  ~<LOC>  ·  dep: <ids|none>
- Ours:   <path:line> — <what to change>
- Rails:  vendor/rails/<path:line> — <reference behavior>
- Tests:  <test file> — <which / count> (refresh via test:compare)
- Done:   <acceptance criterion>
```

## Current state

- **api:compare**: 100% — not a goal.
- **test:compare**: 6826/7867 (86.8%), ~1034 skipped (refresh — stale).
- **In flight**: only PR #2762 (schema.ts parser PR B). The rest of the
  backlog below is open.

### Live skip-annotation histogram (ground truth, 2026-06-01)

```
associations 285 │ relation 199 │ adapter-pg 185 │ schema 119 │ adapter-mysql 62
connection-pool 60 │ fixture 36 │ transactions 32 │ migration 15 │ type 14
GVL 8 │ query-cache 4 │ i18n 4 │ serialization 3 │ adapter-sqlite 2   (+~40 malformed)
```

## The dependency spine (why this order)

Rule (from the 100-plan): **isolated → integrated**. `associations`/`relation`
touch everything, so closing them early means re-opening them every time a
lower-tier fix lands. The two biggest buckets (285 + 199 ≈ 44% of all skips)
come **last**.

Four hard architectural blockers gate the most downstream work — the critical path:

1. **ConnectionHandler P9 port** → gates connection-pool (60) + per-thread
   query-cache + multi-db. _Lead PR: Story 4.1._
2. **AliasTracker / join-table aliasing** → gates nested-through / eager /
   join-model un-skips. _Lead PR: Story 7.2._
3. **`type_for_attribute` cast refactor** (>300 LOC) → gates enum write-casting
   - several relation/type tests. _Lead PR: Story 3.PG-enum._
4. **Global Arel visitor removal** → not a test:compare blocker, but de-risks
   all adapter/SQL work and kills the per-file `syncHandlerVisitor` dance
   (~635 sites). _Lead PRs: Stories 1.1–1.6._

**Externally blocked — do NOT schedule:**

- `StandaloneConnection` (`connection-adapters/standalone-connection.test.ts`, 4
  tests) — vendored `connection_pool.rb` has no `StandaloneConnection`; needs a
  Rails source refresh.
- `adapter.ts` deletion / `DatabaseAdapter` removal — Phase G fixtures (deferred).
- `accepts_nested_attributes_for` (`associations/nested-error.test.ts`, 4) — Phase G.

Permanent skips (`load_async`, GVL, Marshal/YAML, rake/dbconsole) are
**reclassified, not implemented** — Story 0.1.

---

## Wave 0 — Free denominator + tracking hygiene (tests-only, no deps, do first)

### Story 0.1 — Reclassify permanent-skips into `unported-files.ts` `[port-meta]` ~60 LOC · dep: none

- Ours: `scripts/api-compare/unported-files.ts` — add entries. Shape (verified):
  whole-file `{ testFile: "<ruby>_test.rb" }`, or per-test
  `{ testFile, tests: ["test_name", …], className?: string }`.
- Targets: `relation/load_async_test.rb` + `FutureResult` (28), GVL/thread
  (`grep -rn "BLOCKED: GVL" …`, 8), Marshal/YAML/`serialization` (3 + scattered),
  `SimpleDelegator where` (2).
- Rails: n/a (these have no JS analog — Ruby thread pool / Marshal / GVL).
- Done: the named tests drop from BOTH the Ruby denominator and the skipped
  backlog; `pnpm test:compare --json` total Ruby count decreases by ~40.

### Story 0.2 — BLOCKED-annotation normalization sweep `[tests-only]` ~tests · dep: none

- Ours: the ~40 malformed tags surfaced by the histogram (`needs`, `requires`,
  `F2`, `D-1`, `Same`, `same`, `no`, `TS`, `trails`, `Migrator`,
  `postgres-only`, `pin_connection!/unpin_connection!`, …). Re-tag to the
  canonical `BLOCKED: <category>` vocabulary (100-plan "BLOCKED vocabulary").
- Done: histogram has zero non-vocabulary buckets; the grep contract is sound.
  Prereq for trusting every count below.

---

## Wave 1 — Fidelity foundation: global Arel visitor removal (de-risks Waves 2–3)

Supersedes #2600. **57** production (non-test) `.toSql()` callers remain
(`grep -rn "\.toSql()" packages/activerecord/src --include='*.ts'
--exclude='*.test.ts' | grep -v "connection.toSql\|adapter.toSql"`). Route each
through the connection's visitor. Siblings off `main`, non-overlapping files,
**A → B → C**.

- Rails reference (all of Phase A): adapters own their visitor —
  `vendor/rails/activerecord/lib/active_record/connection_adapters/abstract_adapter.rb`
  (`@visitor = arel_visitor`) and compile through it via
  `…/abstract/database_statements.rb:12` (`to_sql(arel)`). Rails has **no**
  process-global visitor. Our analog already exists:
  `connection-adapters/abstract/database-statements.ts` `toSql(arel)`.

### Story 1.1 — Phase A1: DDL/metadata callers `[fidelity]` ~80 LOC · dep: none

- Ours: `schema-migration.ts`, `internal-metadata.ts`, `migration.ts` — replace
  `<node>.toSql()` with `this.connection.toSql(<node>)` (connection in scope).
- Done: DDL/metadata SQL is connection-derived; touched tests green.

### Story 1.2 — Phase A2: persistence + base toSql callers `[fidelity]` ~70 LOC · dep: none

- Ours: `persistence.ts:223,259,286,562,956,1001` (the `toSql()` callers —
  `:259,286,956` are `adapter.toSql ? … : x.toSql()` ternaries, `:223` the
  `connection.toSql ? …` form, `:562,1001` bare `x.toSql()` — all → unconditional
  `connection.toSql(x)`); `base.ts` `ctor.connection` toSql sites.
- Done: no `: x.toSql()` fallback remains in persistence/base.

### Story 1.3 — Phase A3: calculations + statement-cache + insert-all `[fidelity]` ~70 LOC · dep: none

- Ours: `relation/calculations.ts` (sites at 228, 265, 302, 390, 399, 415, 434,
  437, 448, 460, 739 — note `:225` already routes through
  `connection.visitor.compile`, mirror it), `statement-cache.ts` (`connection`
  param in scope), `insert-all.ts:133`.
- Done: calculation/insert SQL connection-derived.

### Story 1.4 — Phase A4: grep-sweep remainder `[fidelity]` ~60 LOC · dep: 1.1–1.3

- Ours: remaining hits from the 57-caller grep above. Any genuinely
  adapter-less caller stays on the arel default `ToSql` (acceptable — a
  dialect-agnostic context).
- Done: zero production `<node>.toSql()` with a connection in scope.

### Story 1.5 — Phase B: drop AR's global-sync sites `[fidelity]` ~30 LOC · dep: 1.4

- Ours: `base.ts:979` (`setToSqlVisitor(…)` in the `Base.adapter =` setter) —
  delete; `test-setup-ar.ts` reset becomes a no-op.
- Keep: `setToSqlVisitor` + default `ToSql` stay in **arel** (`packages/arel`,
  `nodes/node.ts:33-35` `new _registry.ToSql!().compile(this)`) — arel is
  dialect-agnostic and its tests rely on the default. We only remove AR
  injecting a dialect into it.
- Done: no production path mutates the arel global.

### Story 1.6 — Phase C: delete the `syncHandlerVisitor` test dance `[tests-only]` ~per-grep · dep: 1.5

- Ours: ~635 `syncHandlerVisitor`/`setupHandlerSuite` sites
  (`grep -rn "syncHandlerVisitor\|setupHandlerSuite" packages/activerecord/src`).
  With the global no longer dialect-synced these `beforeEach` calls are dead.
- Done: grep returns zero; full AR suite green in CI.

**Parallel fidelity items (any time, independent files):** DatabaseTasks
**P3-5** — move the `puts` formatting from the CLI into
`tasks/database-tasks.ts` `migrateStatus()` (~911) to match
`vendor/rails/activerecord/lib/active_record/railties/databases.rake` /
`DatabaseTasks#migrate_status` (~302); `inheritance.ts`
`initializeInternalsCallback` JSDoc fix (~2 LOC); type-audit **W1b** variadic
overloads (`relation.ts:~822,941` `as any`).

---

## Wave 2 — Tier 1 isolated un-skips (low-dep, high mechanical yield)

All siblings off `main`. **Refresh each count first** — several 2026-05-18
numbers have already dropped.

### Story 2.1 — DB-config cluster `[un-skip + port]` ~250 LOC · dep: none

- Ours: `database-configurations/resolver.test.ts` (live 3 skips; snapshot said
  16 — many were `missing`, port them), `database-selector.test.ts` (live 1),
  `database-configurations/hash-config.test.ts` (live **0** — likely done,
  verify), `url-config.test.ts` (live 0).
- Rails: `vendor/rails/activerecord/test/cases/database_configurations/resolver_test.rb`,
  `database_selector_test.rb`, `…/hash_config_test.rb`, `…/url_config_test.rb`;
  impl in `lib/active_record/database_configurations/…`.
- Defer: `merge-and-resolve-default-url-config.test.ts` 7 skips — gated on
  ConnectionHandler P9 (Wave 4).
- Done: each file at matched==total, 0 skipped, 0 missing.

### Story 2.2 — forbidden-attributes + view `[un-skip/port]` ~200 LOC · dep: none

- Ours: `forbidden-attributes-protection.test.ts` (16), `view.test.ts` (21).
- Rails: `test/cases/forbidden_attributes_protection_test.rb`, `view_test.rb`.
- Done: both files at 100%.

### Story 2.3 — validations root + i18n `[port + un-skip]` ~250 LOC · dep: none

- Ours: `validations/validations.test.ts` (Batch Audit-V1: ~19 **missing**
  Rails bodies — `validate`/`validate!`, `save_without_validation`, numericality
  edges, `validators` introspection), `validations/i18n-validation.test.ts` (4),
  `validations/association-validation.test.ts` (1).
- Rails: `test/cases/validations_test.rb`, `validations/i18n_validation_test.rb`,
  `validations/association_validation_test.rb`.
- Note: `pnpm test:stubs` generates the missing stubs for `validations_test.rb`.
- Done: validations files at 100%.

### Story 2.4 — type cluster + shared InTimeZone helper `[impl + un-skip]` ~180 LOC · dep: none

- Ours: port the `InTimeZone` test helper **once** (Batch 65/86a both need it;
  ROOT-CAUSE notes `date-time-precision.test.ts` "timeZoneAwareAttributes not
  yet wired"). Wire `Base.timeZoneAwareAttributes` read path + `TimeZoneConverter`
  serialize/deserialize. Then un-skip `numeric-data.test.ts` (4), `date.test.ts`
  (1), `attribute-methods.test.ts:908,912` (BLOCKED: type), PG
  `timestamp.test.ts:140,149`.
- Rails: `test/cases/numeric_data_test.rb`, `date_test.rb`,
  `attribute_methods_test.rb`; impl `lib/active_record/attribute_methods/time_zone_conversion.rb`.
- Done: BLOCKED:type histogram bucket → near 0.

---

## Wave 3 — Tier 2 adapter + schema (largest isolated yield: pg 185 + schema 119 + mysql 62)

After Wave 1 (connection-derived SQL). PG/MySQL type files are independent
siblings; the schema-dumper subtrack is ordered.

### Story 3.1 — KNOWN_DSL_TYPES expansion `[impl]` ~30 LOC · dep: none

- Ours: `schema-dumper.ts:163` `KNOWN_DSL_TYPES` (12 entries) doesn't cover all
  `DSL_HELPER_METHODS` (`:187`); `sqlTypeToDsl` (`:229`) falls through for
  `timestamptz`, `citext`, `jsonb`, `uuid`, `hstore`, `ltree`, `tsvector`,
  `inet`, `macaddr`, `xml`, `money`, `int4range`…`daterange`. Expand to cover
  `DSL_HELPER_METHODS` (or add the SQL types to `SQL_TYPE_MAP`).
- Done: CTAS/SchemaDumper round-trips those types; prereq for 3.2.

### Story 3.2 — schema-dumper table/partition/comment polish `[impl + un-skip]` ~80 LOC · dep: 3.1

- Ours: `schema-dumper.ts` `emitTable` (~913) — wire `tableOptions()` (make the
  dump loop async), forward `comment` (emit `COMMENT ON TABLE`), wire
  `tablePartitionDefinition`.
- Rails: `lib/active_record/connection_adapters/abstract/schema_dumper.rb`.
- Tests: `schema-dumper.test.ts` (live 31), PG `SchemaCreateTableOptionsTest`
  partition tests.
- Done: dumper round-trip tests green.

### Story 3.3 — route `emitTable` through the `columnSpec` hook `[impl, architectural]` ~50 LOC · dep: 3.1

- Ours: `connection-adapters/abstract/schema-dumper.ts:33` `columnSpec` / `:53`
  `prepareColumnOptions` are **dead vs live dumps** — `schema-dumper.ts`
  `emitTable` (~943) builds `colspec` inline and never calls them, so every
  adapter's `prepareColumnOptions` override is unreachable (#1723).
- Done: `emitTable` calls `columnSpec`; PG/SQLite/MySQL snapshots updated;
  unblocks per-adapter dumper fidelity.

### Story 3.4 — SchemaDumpingHelper port + charset-collation dump `[impl + port]` ~165 LOC · dep: 3.3

- Ours: port `SchemaDumpingHelper#dump_table_schema` (live-DB schema-dump →
  string). Then Batch 52: `charset-collation.test.ts` "schema dump includes
  collation" + SQL-fragment unit tests.
- Rails: `test/support/schema_dumping_helper.rb`; `test/cases/adapters/mysql2/
charset_collation_test.rb:79-84`.
- Done: charset-collation + the SchemaDumpingHelper-gated schema un-skips green.

### Story 3.PG-\* — PostgreSQL type families `[un-skip + impl]` ~200–250 LOC each · dep: 3.3 for dump-bearing ones

One sibling PR per family (adapter-pg = 185 skips). Each: our
`adapters/postgresql/<x>.test.ts` ↔ Rails
`vendor/rails/.../test/cases/adapters/postgresql/<x>_test.rb`; impl in
`lib/active_record/connection_adapters/postgresql/oid/<x>.rb`.

- `serial` (12, Audit-PG1), `array` (8), `hstore` (9), `range`, `interval`,
  `uuid` (3), `money` (3), `bytea` (3), `network`/`cidr`/`inet` (Batch 132/57),
  oid families, `timestamp` (7, reuses InTimeZone from 2.4).
- Done per file: matched==total.

### Story 3.PG-enum — enum write-casting (`type_for_attribute` refactor) `[impl, BLOCKER #3]` >300 LOC, split · dep: none

- Ours: `where({ enumCol: "label" })` value serialization isn't wired through
  the type caster (serialize path shipped #2687; cast path remains). Requires
  the `type_for_attribute` cast refactor — split via `<base>`/`<base>b`.
- Rails: `lib/active_record/enum.rb`, `lib/active_record/model_schema.rb`
  (`type_for_attribute`).
- Tests: `relation` "missing with enum\*" (5), enum where-casting cases.
- Done: string-label enum predicates cast correctly; the 5 relation enum skips green.

### Story 3.MY-\* — MySQL adapter fidelity `[un-skip + impl]` ~250 LOC bundles · dep: none

- Ours/Rails: `adapters/abstract-mysql-adapter/*` ↔
  `test/cases/adapters/abstract_mysql_adapter/*_test.rb`; impl
  `mysql2-adapter.ts`, `connection-adapters/abstract_mysql_adapter.rb`.
- Bundles: Audit-M1 `adapter-prevent-writes` (11), `case-sensitivity` (7),
  `bind-parameter` (6), B110/B131/B49 (column-metadata + default parsing —
  `mysql2-adapter.ts#columns` ~1082, `new_column_from_field` parity),
  `mysql-boolean` (6), `mysql-enum` (3).
- Done: adapter-mysql histogram bucket → near 0.

### Story 3.misc — generic adapter + comment `[un-skip + port]` ~250 LOC · dep: 3.3 for comment

- Ours: `adapter.test.ts` (live ~70 — split into clusters), `comment.test.ts`
  (17, table/column comments).
- Rails: `test/cases/adapter_test.rb`, `comment_test.rb`.

---

## Wave 4 — connection-pool / multi-db (gated cluster, 60)

### Story 4.1 — ConnectionHandler P9 port `[impl, BLOCKER #1]` ~250 LOC, split · dep: none

- Ours: `connection-handling.ts`, `connection-adapters/connection-handler.ts`
  surface — full `ConnectionHandler` port.
- Rails: `lib/active_record/connection_adapters/abstract/connection_handler.rb`,
  `…/connection_pool.rb`.
- Unblocks: `merge-and-resolve-default-url-config.test.ts` (7), zero-arg
  `run()` / `complete()` follow-ups (gaps doc), pool-attachment query-cache
  tests (Wave 6).
- Done: ConnectionHandler tests green; the 7 merge-and-resolve skips un-blocked.

### Story 4.2 — second named pool (ARUnit2Model) `[impl + un-skip]` ~150 LOC · dep: 4.1

- Ours: add a second named connection pool to test infra (Rails' `ARUnit2Model`).
- Rails: `test/cases/helper.rb` (`ARUnit2Model`), `multiple_db_test.rb`.
- Unblocks: `MultiDbMigratorTest` ×7, `PrimaryClassTest` ×2,
  `multiple-db.test.ts` (11).

### Story 4.3 — pool/handler file campaign `[un-skip]` ~250 LOC × N · dep: 4.1

- Ours/Rails: `connection-adapters/connection-handler.test.ts` (11),
  `connection-pool.test.ts` (10), `connection-management.test.ts` (11),
  `connection-swapping-nested.test.ts` (7), `pooled-connections.test.ts` (3),
  handlers-multi-_ ↔ matching `test/cases/connection_adapters/_\_test.rb`.
- 🚫 Skip `standalone-connection.test.ts` (4) — externally blocked.

---

## Wave 5 — Tier 3 transactions + migration (32 + 15)

### Story 5.1 — transaction callbacks + isolation `[un-skip + impl]` ~250 LOC · dep: none

- Ours: `transaction-callbacks.test.ts` (15), `transaction-isolation.test.ts`,
  `transaction-instrumentation.test.ts` (2), `transactions.test.ts` (1);
  Batch 80 (`update()` calls property setters), Batch 81 (new-record rollback
  dirty-tracking — snapshot DB-original values; **high risk**).
- Rails: `test/cases/transaction_callbacks_test.rb`, `transactions_test.rb`;
  impl `lib/active_record/transactions.rb`.

### Story 5.2 — migration runner `[un-skip + impl]` ~200 LOC · dep: none

- Ours: `migration.test.ts` (7), `invertible-migration.test.ts` (4); Batch 48
  (CommandRecorder `changeTable` inversion), B132 (`migration.ts:~1908` delegate
  to `adapter.createTableDefinition`), Batch 153 (MockMigration port +
  `test-adapter.ts` raise-on-duplicate gate).
- Rails: `test/cases/migration_test.rb`, `invertible_migration_test.rb`; impl
  `lib/active_record/migration.rb`, `migration/command_recorder.rb`.

---

## Wave 6 — query-cache (gated on Wave 4)

### Story 6.1 — query-cache un-skips `[un-skip + impl]` ~120 LOC · dep: 4.1

- Ours: `query-cache.test.ts` (live ~25; live mixin shipped #2662/#2672/#2684).
  Remaining is per-thread architecture depending on the pool — Batch 64 wiring
  remainder; `Base.cache`/`uncached` class methods; `QueryCache.run`/`complete`
  - `installExecutorHooks` (Phase 4, was blocked on ConnectionHandler PR 6 →
    unblocked by 4.1).
- Rails: `test/cases/query_cache_test.rb`; impl
  `lib/active_record/connection_adapters/abstract/query_cache.rb`.

---

## Wave 7 — Tier 4 integrated: associations (285) + relation remainder — LAST

Infra PRs first, then per-file campaigns. Each campaign's exact slots come from
a `/audit-report` pass (read-only, no PR) per 100-plan methodology — schedule
the audit as the campaign's first task.

### Association infra (unblocks the campaigns)

#### Story 7.1 — wire `destroyAssociations` `[impl]` ~40 LOC · dep: none

- Ours: `persistence.ts:1313` `destroyAssociations(this): void {}` is an **empty
  stub**. Wire into the `destroy()` flow; then delete the HABTM `beforeDestroy`
  bridge + `HABTM_DESTROY_INSTALLED` flag in
  `associations/builder/has-and-belongs-to-many.ts`.
- Rails: `lib/active_record/associations.rb` (`dependent`), HABTM destroy path.
- Unblocks: Batch 37 HABTM structural; `habtm-destroy-order.test.ts`.

#### Story 7.2 — AliasTracker port `[impl, BLOCKER #2]` ~280 LOC, split · dep: none

- Ours: port `AliasTracker` so `_addThroughAssociation` emits Rails-canonical
  aliases (`taggings_authors_join`, …); `join-dependency.ts` consumers; add
  schema-qualified-name helper (B35).
- Rails: `vendor/rails/activerecord/lib/active_record/associations/alias_tracker.rb`.
- Tests: `nested-through-associations.test.ts:1405` ("a table referenced
  multiple times") + `:1450` ("scope on polymorphic reflection"); risk: ~30
  currently-green nested-through join tests must stay green.
- Unblocks: alias-naming skips across `eager`, `join-model`, `nested-through`.

#### Story 7.3 — composite-FK HMT write (Batch 20) `[impl]` ~150 LOC · dep: none

- Ours: auto-derive composite FK `[shop_id, order_id]` from CPK parents.
- Rails: `test/cases/associations/…` `Cpk::Order has_many :order_agreements`.
- Unblocks: Batch 14 CPK `setIds`.

#### Story 7.4 — JoinDependency HABTM + whereBang references (Batch 74) `[impl]` ~60 LOC · dep: 7.2

- Ours: `JoinDependency.addAssociation` returns null for `hasAndBelongsToMany` —
  add `_addHabtmAssociation`; `query-methods.ts#whereBang` call
  `PredicateBuilder.references(opts)` for hash args.
- Rails: `lib/active_record/associations/join_dependency.rb`, `relation/query_methods.rb` (`where!`).
- Unblocks: `Song.includes(:albums).where(...)` form.

#### Story 7.5 — collection-target dedup / inverse-of (B119) `[impl]` ~120 LOC · dep: none

- Ours: `collection-association.ts` `replaceOnTarget` (~748) accept `inversing`
  - hold `_replacedOrAddedTargets` WeakSet; dedup `<<`/`build`/`load`.
- Rails: `lib/active_record/associations/collection_association.rb`,
  `inverse_of` wiring.
- Unblocks: `inverse-associations.test.ts` (23).

### Association + relation campaigns (audit-gated)

Each row: schedule `/audit-report <slug>` → triage into ~250-LOC slots → un-skip.
Ours ↔ Rails (`vendor/rails/activerecord/test/cases/<ruby>`):

| Campaign         | Ours                                                        | Rails                                                       | ~skips | Needs                       |
| ---------------- | ----------------------------------------------------------- | ----------------------------------------------------------- | -----: | --------------------------- |
| eager            | `associations/eager.test.ts`                                | `associations/eager_test.rb`                                |     70 | 7.2, 7.4                    |
| join-model       | `associations/join-model.test.ts`                           | `associations/join_model_test.rb`                           |     41 | 7.2; DidYouMean (B1972)     |
| strict-loading   | `strict-loading.test.ts`                                    | `strict_loading_test.rb`                                    |     30 | —                           |
| has-one          | `associations/has-one-associations.test.ts`                 | `associations/has_one_associations_test.rb`                 |     28 | fixture data folded in      |
| relation-scoping | `scoping/relation-scoping.test.ts`                          | `scoping/relation_scoping_test.rb`                          |     28 | STI type-constraint (#1983) |
| inverse          | `associations/inverse-associations.test.ts`                 | `associations/inverse_associations_test.rb`                 |     23 | 7.5                         |
| habtm            | `associations/has-and-belongs-to-many-associations.test.ts` | `associations/has_and_belongs_to_many_associations_test.rb` |     23 | 7.1                         |
| where            | `relation/where.test.ts`                                    | `relation/where_test.rb`                                    |     23 | polymorphic fixtures        |
| cascaded-eager   | `associations/cascaded-eager-loading.test.ts`               | `associations/cascaded_eager_loading_test.rb`               |     18 | 7.2                         |
| has-one-through  | `associations/has-one-through-associations.test.ts`         | `associations/has_one_through_associations_test.rb`         |     16 | —                           |
| nested-through   | `associations/nested-through-associations.test.ts`          | `associations/nested_through_associations_test.rb`          |     12 | 7.2                         |
| where-chain      | `relation/where-chain.test.ts`                              | `relation/where_chain_test.rb`                              |     12 | join aliasing               |
| callbacks        | `associations/callbacks.test.ts`                            | `associations/callbacks_test.rb`                            |     12 | —                           |
| counter-cache    | `counter-cache.test.ts`                                     | `counter_cache_test.rb`                                     |      5 | Batch 134                   |

**Relation still-blocked (flag, schedule after infra):** `eager_load` toSql +
STI + non-preload (3, assoc track A5); `missing`-with-enum (5, → Story 3.PG-enum

- join aliasing); parameterized join strings R6c (2, design needed).

---

## Net path to 100%

1. **Wave 0** trims the target (reclassify permanent-skips; normalize tags).
2. **Waves 2–3** are the highest mechanical yield (~280 isolated skips) and the
   safest to parallelize across agents.
3. **Waves 4 & 7.1–7.5** clear the four architectural blockers everything else
   waits on.
4. **Wave 7 campaigns** are the long tail (~300 association+relation skips),
   each opened by a read-only audit, executed last.

## Conventions (CLAUDE.md — apply to every story)

- ≤500 LOC per PR; split via non-overlapping **sibling** branches off `main`
  (`<base>`/`<base>b`/`<base>c`), **not** stacked PRs.
- Use `scripts/start-worktree.sh`; leave the default worktree for the user.
- Open in draft; run `/link <PR#>` after opening; `/post-merge-findings` after merge.
- Never rename Rails-derived test names; run only touched test files locally.
- Refresh counts with `pnpm test:compare --cached --package activerecord` after each merge.
