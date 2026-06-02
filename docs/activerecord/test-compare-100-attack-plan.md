# activerecord → test:compare 100% — attack plan

> **Snapshot 2026-06-02** (generated from a live `pnpm test:compare --cached
--json --package activerecord`, `generatedAt 2026-06-02T14:49:36Z`). This doc
> is the **complete, grouped inventory** of every remaining test:compare gap plus
> a **prioritized, dependency-sequenced story list** sized for ≤500-LOC PRs.
>
> It complements [`workplan.md`](workplan.md) (which owns per-story specs for the
> already-identified open waves) by adding the full per-file gap table, the
> CI-lane mapping, and an explicit phase ordering. Where a story already has a
> deep spec in `workplan.md`, this doc links to it rather than duplicating.
>
> **Refresh before starting any story** — counts drift on every merge:
>
> ```bash
> pnpm test:compare --cached --json --package activerecord   # per-file matched/skipped/missing
> pnpm test:compare --package activerecord --incomplete      # rendered table, complete files hidden
> grep -rhn "BLOCKED:" packages/activerecord/src --include='*.test.ts' \
>   | sed -E 's/.*BLOCKED: //; s/".*//' | sort | uniq -c | sort -rn   # blocker histogram
> ```

## 1. Current state

| Metric                 | Value                         |
| ---------------------- | ----------------------------- |
| Ruby tests             | 7856                          |
| Matched (incl. skip)   | 7849                          |
| **Passing-matched**    | **6959 (88.6%)**              |
| Skipped                | **890**                       |
| Missing (never ported) | **3**                         |
| Wrong-describe         | **15**                        |
| Misplaced              | **4**                         |
| api:compare            | 100% (4969/4969) — not a goal |

**Path to 100% = drive `skipped → 0` and `missing → 0`, and relocate the 15
wrong-describe + 4 misplaced tests.** That is the entire arithmetic.

### How CI exercises adapters (source-verified — the subtle part)

CI runs **three AR test jobs** (`.github/workflows/ci.yml`), all gated by the
`activerecord_affected` path filter. **None of them set `TEST_ADAPTER`** — so it
defaults to `sqlite3` everywhere, and `vitest.config.ts` (`ADAPTER_SPECIFIC_EXCLUDE`,
keyed on `TEST_ADAPTER`) **excludes the `adapters/postgresql/**`and MySQL dirs in
every job.** What the PG/MySQL jobs actually do is re-point the **core** suite at
a live backend via`PG_TEST_URL`/`MYSQL_TEST_URL`:

| CI job           | Image / env                                     | Runs (file set)                                                          | Backend  |
| ---------------- | ----------------------------------------------- | ------------------------------------------------------------------------ | -------- |
| `sqlite-tests`   | default                                         | core + `adapters/sqlite3/**`                                             | SQLite   |
| `postgres-tests` | `postgres:17`, `PG_TEST_URL`, `AR_DB_FORKS=4`   | **same core set** (PG dirs excluded); runs `describeIfPg` branches       | Postgres |
| `mariadb-tests`  | `mariadb:11`, `MYSQL_TEST_URL`, `AR_DB_FORKS=4` | **same core set** (MySQL dirs excluded); runs `describeIfMysql` branches | MariaDB  |

**Consequence — two distinct buckets:**

| Bucket                                                      | Skips | Files | CI status                                                                         |
| ----------------------------------------------------------- | ----: | ----: | --------------------------------------------------------------------------------- |
| **core** + `adapters/sqlite3/**`                            |   755 |   109 | ✅ run on all 3 backends (core PG/MySQL behavior **is** proven via `describeIf*`) |
| `adapters/postgresql/**`                                    |    94 |    30 | ⚠️ **excluded in CI** (no `TEST_ADAPTER=postgresql` job) — local-verify only      |
| `adapters/abstract_mysql_adapter/**` + `adapters/mysql2/**` |    41 |    15 | ⚠️ **excluded in CI** (no `TEST_ADAPTER=mysql2` job) — local-verify only          |

So the PG/MySQL **splits exist and are valuable** (they catch backend-specific
behavior in core tests), but the **135 adapter-_dir_ skips are still not run by
CI** until a dedicated `TEST_ADAPTER=postgresql`/`mysql2` job is added — see Story
I-5. Locally, run them with
`TEST_ADAPTER=postgresql PG_TEST_URL=… pnpm vitest run <file>` (MariaDB locally is
port 13306; CI uses 3306). Watch env-specific divergences (e.g. db-default
collation `utf8mb4_bin` locally vs CI's fresh `mariadb:11`).

## 2. Strategy & ordering principles

1. **isolated → integrated** (from the 100-plan). `associations` (265) and
   `relation` (170) touch everything; closing them early means re-opening them
   on every lower-tier fix. They come **last** (Phase 4).
2. **Architectural unblockers gate the most files** — do them first (Phase 1).
   The schema-dumper `columnSpec` unification alone gates ~60 skips
   (schema_dumper, comment, view-dump, defaults-dump, mysql_enum dump, charset).
3. **Bounded framework clusters in parallel** (Phase 2) — pool, migration,
   transactions, query-cache, nested-attributes, insert_all, fixtures. Each is
   self-contained and CI-runnable.
4. **Adapter type-families** (Phase 3): the `adapters/<db>/**` dirs are excluded
   from all current CI jobs (no `TEST_ADAPTER=postgresql`/`mysql2` lane), so they
   are local-verify-only until **Story I-5** adds a dedicated job. The un-skip
   work can proceed in parallel (verified locally); I-5 makes it CI-gated.
5. **≤500 LOC per PR**, split via non-overlapping **sibling** branches off
   `main` (`<base>`/`<base>b`/`<base>c`), never stacked. (CLAUDE.md)
6. **Never rename a Rails-derived test name.** Fix the implementation.
7. Each deep association/relation cluster opens with a read-only `/audit-report`
   that sizes the un-skip slots (Phase 4 methodology, from the 100-plan).

### Phase dependency spine

```
Phase 0  hygiene + reclassification ───────────────── do now, unblocks clean measurement
Phase 1  architectural unblockers ── 1A dumper-U2/U3 │ 1B type_for_attribute │ 1C serialize │ 1D pluck-cast │ 1E TEST_ADAPTER CI job
            │            │              │                                                    │
            ▼            ▼              ▼                                                    ▼ (CI-gates Phase 3)
Phase 2  bounded clusters (pool · migration · transactions · query-cache · nested-attrs · insert_all · fixtures) ── parallel
Phase 3  adapter type-families (PG 94 · MySQL 41) ── local-verify now; CI-gated once 1E lands; deps: 1A/1C for dump/serialize cases
Phase 4  integrated tail: associations (265) + relation (170) ── LAST, audit-gated, deps from 1A/1B satisfied
```

---

## Phase 0 — Hygiene & reclassification `[quick wins, ~1–2 PRs]`

Cheap, high-leverage: fixes the non-skip arithmetic and stops permanent skips
from counting. Do these first so the percentage reflects real work.

### Story H-1 — relocate the 4 misplaced + 15 wrong-describe tests `[move]` ~tests-only · dep: none

- **Misplaced (4):** all in `migration_test.rb` — `changing columns`,
  `changing column null with default`, + 2 more currently living in
  `adapters/postgresql/change-schema.test.ts`; convention says they belong in
  `migration.test.ts`. Move them (don't rewrite).
- **Wrong-describe (15):** `postgresql_adapter_test.rb` (8),
  `has_many_associations_test.rb` (4), `sqlite3/explain_test.rb` (2),
  `encrypted_fixtures_test.rb` (1). Tests exist but sit under the wrong
  `describe` block — move to the Rails-matching describe.
- **Done:** `totalMisplaced 0`, `totalWrongDescribe 0`.

### Story H-2 — port the 3 genuinely-missing tests `[port]` ~small · dep: none

- `associations_test.rb` (1 missing), `abstract_mysql_adapter/connection_test.rb`
  (1, MySQL — verify locally), `connection_handlers_multi_db_test.rb` (1).
- Generate stubs via `pnpm test:stubs`, write bodies under the **exact** Rails
  name. **Done:** `totalMissing 0`.

### Story H-3 — reclassify the residual permanent skips `[hygiene]` ~20 skips · dep: none

**Source-verified 2026-06-02:** the workplan asserts these are "already
reclassified," but a tight scan of the counted-skip files still finds **~19 live
`it.skip`** that cannot be implemented in a JS runtime and must be reclassified
to make 100% reachable. Known live offenders (refresh before starting):

| file                                       |   n | category                                          |
| ------------------------------------------ | --: | ------------------------------------------------- |
| `base.test.ts`                             |   6 | YAML round-trip / cross-version YAML deserialize  |
| `query-cache.test.ts`                      |   4 | forked-process / cross-thread / shared-connection |
| `connection-adapters/schema-cache.test.ts` |   2 | YAML/Marshal dump                                 |
| `associations/extension.test.ts`           |   2 | Marshal of extended association                   |
| `prepared-statement-status.test.ts`        |   1 | thread-and-instance-specific                      |
| `has-one` / `has-many-through` / `habtm`   |   3 | Marshal of loaded assoc cache                     |
| `adapters/postgresql/hstore.test.ts`       |   1 | YAML/Marshal coder                                |

Plus the externally-blocked `standalone_connection_test.rb` (4) and any
`load_async`/GVL cases (the tight scan found the 4 query-cache thread cases; a
full grep also matches Ruby-thread-pool / `rake`/`dbconsole` names in _unmapped_
files — those don't count toward 890 and are out of scope).

- Move each into `scripts/api-compare/unported-files.ts` (or the
  documented-divergence list) so it stops counting as a live skip. Includes the
  `resolver.test.ts` "url missing scheme" JS-vs-Ruby divergence (`workplan.md`
  Wave 0).
- **Audit each candidate against `unported-files.ts` before reclassifying** — do
  not bury a real gap. **100% is reached partly by this reclassification** (a
  legitimate, repo-sanctioned move), not by implementing the impossible.
- **Done:** every remaining live skip is genuinely implementable.

---

## Phase 1 — Architectural unblockers `[gate downstream — do early]`

### Story I-1 — Epic 3.3-U2/U3: schema-dumper `columnSpec` unification `[impl, multi-PR]` ~90 + ~120 LOC · dep: none (U3 dep: U2)

The single highest-leverage unblock. Routes live dumps through the Rails-shaped
`columnSpec` hook. **Full spec in [`workplan.md`](workplan.md) Epic 3.3-U.**

- **Gates:** `schema_dumper_test.rb` (22), `comment_test.rb` (17), `view_test.rb`
  dump-bearing cases (~6 of 21), `defaults_test.rb` dump cases, `mysql_enum`
  dump, `charset_collation` collation dump, `column_definition_test.rb` (3).
- **U2** (~90 LOC): `AdapterSchemaSource` carries dsl-type in `type` + raw SQL
  in new `sqlType`; convert remaining dialect Ruby-isms to TS text.
- **U3** (~120 LOC, dep U2): route `emitTable` through `columnSpec` /
  `columnSpecForPrimaryKey` + `formatColspecRaw`; reconcile defaults; PG serial
  dump folds into PG subclass; verify live PG/MySQL.
- **Done:** schema_dumper + comment dump-bearing skips green.

### Story I-2 — `type_for_attribute` cast refactor (enum write-casting) `[impl, BLOCKER]` >300 LOC, split · dep: none

**Full spec in [`workplan.md`](workplan.md) Story 3.PG-enum.** The last
architectural blocker. **Source-verified:** `typeForAttribute` already exists and
is used (`enum.ts:78`, `model_schema`); the gap is specifically the
**where/predicate-builder cast path** — `where({ enumCol: "label" })` value
serialization isn't routed through the type caster (serialize path shipped #2687;
cast path remains).

- **Gates:** `relation` "missing with enum\*" (5), enum where-casting cases,
  general enum label mass-assignment (`mysql_enum` "enum with attribute"; PG
  `enum_test.rb`).
- Split via `<base>`/`<base>b`. **Done:** the 5 relation enum skips green +
  string-label enum predicates cast.

### Story I-3 — general `serialize` write-path `[impl]` ~150–300 LOC · dep: none

**Spec in [`workplan.md`](workplan.md) Wave 3 cross-cutting.** Wire
`Base.serialize` to decorate the cast type with `Type::Serialized` (exists at
`type/serialized.ts`, unused) instead of the read-only `readAttribute`
monkey-patch.

- **Gates:** PG `array_test.rb` serialize machinery (part of 6), `bytea_test.rb`
  serialize, `hstore_test.rb` 2 serialize-coder skips, json/yaml dump-on-write.
- **Done:** dump-on-write parity for json/yaml/array/hash/binary.

### Story I-4 — wire `pluck`/`calculate` result type-casting `[impl]` ~40–100 LOC · dep: none

**Source-verified 2026-06-02 — smaller than the workplan implies.** The cast
helpers already exist from #917: `typeCastPluckValues` / `typeCastCalculatedValue`
in `relation/calculations.ts:718,731`, surfaced as private methods
`relation.ts:5406,5411`. **But nothing calls them** — `pluck()` / `calculate()`
return raw driver values. The job is **wiring the existing methods into the live
paths** (cast via `Result.columnTypes`, OID-based, per Rails
`type_cast_pluck_values`/`type_cast_calculated_value`), not writing them.

- **Touches:** `calculations.test.ts` (6), `relation/select.test.ts` (some of
  10), PG `numbers_test.rb`. **Done:** pluck/calc return typed values.

### Story I-5 — add a `TEST_ADAPTER=postgresql`/`mysql2` CI job `[infra]` ~40 LOC ci.yml · dep: none

**Source-verified gap.** The `postgres-tests`/`mariadb-tests` jobs run the _core_
suite against a live backend but **exclude** `adapters/<db>/**` because
`vitest.config.ts` keys `ADAPTER_SPECIFIC_EXCLUDE` on `TEST_ADAPTER`, which no CI
job sets. So the 135 adapter-dir skips (and their un-skips) are never exercised
in CI.

- The adapter dirs are excluded from the _shared_ run on purpose (the comment at
  `vitest.config.ts:17` warns adapter-specific files construct their own adapter
  and collide with shared-suite table drops). So the fix is a **dedicated job**
  that sets `TEST_ADAPTER=postgresql` + `PG_TEST_URL` (and a sibling for
  `mysql2`) and runs **only** the adapter dirs — not flipping `TEST_ADAPTER` on
  the existing core jobs.
- **Done:** CI runs `adapters/postgresql/**` and the MySQL dirs green; Phase 3
  un-skips become CI-gated instead of local-verify-only.

---

## Phase 2 — Bounded framework clusters `[parallel, CI-runnable]`

These are self-contained, run on the default SQLite lane, and parallelize across
agents. Order within the phase is by yield × independence.

### Story F-1 — `insert_all_test.rb` cluster (41) `[un-skip + impl]` — split into sibling PRs

The **largest single core file** and CI-runnable. Tag is `relation`. Refresh and
triage the 41 into sub-clusters (likely: `upsert_all`, returning-clause,
on-duplicate/conflict, unique-by, record-timestamps). Each sub-cluster ≤500 LOC
as its own sibling PR. **Audit-first recommended** given the size.

- **Done:** `insert_all` skips → 0 on SQLite.

### Story F-2 — connection-pool / multi-db campaign (51) `[un-skip]` ~250 LOC × N · dep: none

**Spec in [`workplan.md`](workplan.md) Story 4.3.** Cluster by file to stay
under 500 LOC:

- `transactions_test.rb` connection-pool-tagged subset, `connection_pool_test.rb`
  (8), `connection_handling_test.rb` (6), `connection_handler_test.rb` (4),
  `registration_test.rb` (4), `connection_management_test.rb` (2),
  `connection_handlers_multi_db_test.rb` (2), `unconnected_test.rb` (3),
  `disconnected_test.rb` / `invalid_connection_test.rb` / `reaper_test.rb` /
  `database_selector_test.rb` (1 each).
- **Verify each candidate against `unported-files.ts`** — fork/pid/thread cases
  are likely permanent (→ Story H-3). 🚫 `standalone_connection_test.rb` (4) is
  externally blocked.

### Story F-3 — migration runner campaign (26) `[un-skip + impl]` ~200 LOC · dep: none

**Spec in [`workplan.md`](workplan.md) Story 5.2.** Natural sibling split:
migration-copy (`migration_test.rb` 7) vs CommandRecorder-inversion
(`invertible_migration_test.rb` 4) + Batch 132 delegate. PG migration cases
(`uuid`, `invertible_migration`, `infinity`) ride Phase 3.

### Story F-4 — transactions + callbacks + touch (18 + 10 + 4) `[un-skip + impl]` · dep: none

**Spec in [`workplan.md`](workplan.md) Story 5.1 follow-ups.** `transactions_test.rb`
non-pool subset, `transaction_callbacks_test.rb` (10),
`transaction_instrumentation_test.rb` (2), `touch_later_test.rb` (4). Several are
HIGH-RISK (touch → transactional commit callbacks) — own story each.

### Story F-5 — query-cache residuals (5) `[un-skip + impl]` · dep: I-? (habtm setup for 2)

**Spec in [`workplan.md`](workplan.md) Story 6.1.** 2 need Post⇔Category HABTM
setup; `resetColumnInformation` + locked-relation cases are actionable;
forked/thread cases are permanent (→ H-3).

### Story F-6 — nested-attributes cluster (18 + 10 + 3) `[un-skip + impl]` · dep: partial Phase G

`nested_attributes_test.rb` (18), `nested_attributes_with_callbacks_test.rb`
(10), `forbidden_attributes_protection_test.rb` (3),
`associations/nested_error_test.rb` (4 — Phase G). Audit which need
`accepts_nested_attributes_for` deep features (Phase-G-gated) vs in-scope now.

### Story F-7 — fixtures-backed clusters (`adapter_test.rb` 51, `has_one_through` 11) `[un-skip]` · dep: none

`adapter_test.rb` (51, tagged `fixture`) needs accounts/posts/subscribers/
authors/Event/Book fixtures wired in (**spec in `workplan.md` Story 3.misc**).
`has_one_through_associations_test.rb` (11, fixture) similar. CI-runnable.

- **Sub-split** `adapter_test.rb`: schema cluster (~6), fixture cluster (~20),
  comment cluster (17 → gated on I-1), adapter-mysql/pg/transactions clusters
  (→ Phase 3). Ship the fixture + schema clusters first.

### Story F-8 — small core leftovers `[un-skip]` · dep: none

The 1–4-skip core files not in a campaign above: `locking_test.rb` (12 —
Optimistic\*), `aggregations_test.rb` (8), `readonly_test.rb` (7),
`base_prevent_writes_test.rb` (8), `sanitize_test.rb` (4), `reserved_word_test.rb`
(4), `instrumentation_test.rb` (4), `hot_compatibility_test.rb` (4),
`statement_cache_test.rb` (3), `suppressor_test.rb` (3), `batches_test.rb` (3),
`reflection_test.rb` (3), `column_definition_test.rb` (3 → I-1), and the long
1–2-skip tail (`clone`, `attributes`, `types`, `secure_token`, `delegated_type`,
`primary_class`, `log_subscriber`, …). Batch by theme into ≤500-LOC PRs;
several are Phase-1-gated (type, schema) — tackle after their unblocker.

---

## Phase 3 — Adapter type-families (PG 94 + MySQL 41) `[un-skip + impl]` · dep: I-5 (CI-gating); I-1/I-3 for dump/serialize cases

**Specs in [`workplan.md`](workplan.md) Story 3.PG-\* / 3.MY-\*.** These dirs are
**excluded from current CI** (see §1) — un-skips are local-verify-only until I-5
adds the `TEST_ADAPTER` job. Run locally with
`TEST_ADAPTER=postgresql PG_TEST_URL=… pnpm vitest run <file>` (or `mysql2` +
`MYSQL_TEST_URL`). Each adapter-dir file is its own small PR.

**PostgreSQL (~94, 30 files):** `transaction` (6), `array` (6, → I-3),
`referential_integrity` (5), `postgresql_adapter` (5), `optimizer_hints` (5),
`numbers` (5, → I-4), `enum` (5, → I-2), `deferred_constraints` (5),
`create_unlogged_tables` (5), `collation` (5), `transaction_nested` (4),
`rename_table` (4), `quoting` (4), `xml` (3), `type_lookup` (3), `hstore` (3, →
I-3), `date` (3), `composite` (3), `uuid` (2, migration), `explain` (2),
`domain` (2), + 11 singletons (`virtual_column`, `timestamp`, `statement_pool`,
`schema`, `invertible_migration`, `infinity`, `foreign_table`,
`case_insensitive`, `bytea` → I-3).

**MySQL (~41, 15 files):** `unsigned_type` (5), `transaction` (5),
`optimizer_hints` (5), `mysql_explain` (4), `auto_increment` (4), `sp` (3),
`set` (3), `nested_deadlock` (3), `virtual_column` (2), `mysql_enum` (2, → I-1/I-2),
`sql_types` (1), `count_deleted_rows_with_lock` (1), `charset_collation` (1, →
I-1), `mysql2_adapter` (1), `check_constraint_quoting` (1), `connection` (1
missing → H-2).

**Cross-adapter fidelity follow-ups** (from `workplan.md` Story 3.MY-\*): PG
`execQuery` prevent-writes guard (~1 LOC); `ReadOnlyError` message alignment (~5
LOC).

---

## Phase 4 — Integrated tail: associations (265) + relation (170) `[LAST, audit-gated]`

**Spec in [`workplan.md`](workplan.md) Wave 7.** All infra deps (7.1/7.2/7.4/7.5)
are satisfied on `main`. Each campaign opens with a read-only `/audit-report`
that sizes the un-skip slots into ≤250-LOC batches, then un-skips.

**⚠ Do Story 7.2 review-fix follow-up first** (`workplan.md`) — 4
`_namedInnerJoins` fixes never landed; they gate `merge()`-bearing eager cases.
**Source-verified 2026-06-02:** `merger.ts` has **0** references to
`_namedInnerJoins` (the field exists in `query-methods.ts:126` and is consumed at
`:2425`, but `mergeJoins` / `STRUCTURAL_FIELDS` / `isEmptyScope` /
`referencesEagerLoadedTables` don't see it) — confirmed still outstanding.

| Campaign          | File                                                                                                                                                                                                                                          | Skips | Notes / dep                                           |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----: | ----------------------------------------------------- |
| eager             | `associations/eager_test.rb`                                                                                                                                                                                                                  |    60 | 7.2-fix, 7.4 ✅; biggest                              |
| join-model        | `associations/join_model_test.rb`                                                                                                                                                                                                             |    36 | DidYouMean (B1972)                                    |
| has-one           | `associations/has_one_associations_test.rb`                                                                                                                                                                                                   |    27 | batch 1 ✅; batch 2 = replace cluster (`workplan.md`) |
| relation-scoping  | `scoping/relation_scoping_test.rb`                                                                                                                                                                                                            |    20 | STI type-constraint (#1983)                           |
| cascaded-eager    | `associations/cascaded_eager_loading_test.rb`                                                                                                                                                                                                 |    18 | batch 1 ✅; batches 2–5 (`workplan.md`)               |
| habtm             | `…/has_and_belongs_to_many_associations_test.rb`                                                                                                                                                                                              |    14 | 7.1 ✅; large file, split                             |
| relation/where    | `relation/where_test.rb`                                                                                                                                                                                                                      |    12 | polymorphic fixtures                                  |
| has-one-through   | `associations/has_one_through_associations_test.rb`                                                                                                                                                                                           |    11 | + disable-joins variant (5)                           |
| autosave          | `autosave_association_test.rb`                                                                                                                                                                                                                |    11 |                                                       |
| relation/select   | `relation/select_test.rb`                                                                                                                                                                                                                     |    10 | some → I-4                                            |
| eager-full-sti    | `associations/eager_load_includes_full_sti_class_test.rb`                                                                                                                                                                                     |     8 |                                                       |
| strict-loading    | `strict_loading_test.rb`                                                                                                                                                                                                                      |     7 | batch 1 landed; rest dep-clear                        |
| inverse           | `associations/inverse_associations_test.rb`                                                                                                                                                                                                   |     7 | 7.5 ✅                                                |
| relations         | `relations_test.rb`                                                                                                                                                                                                                           |     6 | largest file; cluster splits                          |
| where-chain       | `relation/where_chain_test.rb`                                                                                                                                                                                                                |     6 | join aliasing                                         |
| eager-singularize | `associations/eager_singularization_test.rb`                                                                                                                                                                                                  |     6 |                                                       |
| counter-cache     | `counter_cache_test.rb`                                                                                                                                                                                                                       |     5 | Batch 134                                             |
| left-outer-join   | `associations/left_outer_join_association_test.rb`                                                                                                                                                                                            |     3 |                                                       |
| + long tail       | inner_join(2), extension(2), eager_load_nested(2), bidirectional_destroy(1), belongs_to(1), required(1), has_many_through(1), finder(1), reload_assoc_cache(1), unsafe_raw_sql(2), statement_invalid(2), database_statements(2), + singletons |   ~25 | batch by theme                                        |

**Relation still-blocked (flag):** `eager_load` toSql + STI + non-preload (3);
`missing`-with-enum (5 → I-2); parameterized join strings R6c (2, design).

---

## Appendix A — full per-file gap table (155 files, 2026-06-02)

`skip` = matched-but-skipped, `m` = missing. `CI` column: ✅ = **core/sqlite3**
file, run by all three CI jobs (incl. against live PG/MariaDB via
`describeIf*`); ❌ = **adapter-dir** file (`adapters/postgresql/**` or MySQL),
**excluded from all current CI jobs** (no `TEST_ADAPTER` lane — see §1 / Story
I-5), local-verify only. Dominant blocker tag shown; refresh per file.

| skip |   m | CI  | file                                                                 | dominant blocker                     |
| ---: | --: | :-: | -------------------------------------------------------------------- | ------------------------------------ |
|   60 |   0 | ✅  | associations/eager_test.rb                                           | associations — eager-loading         |
|   51 |   0 | ✅  | adapter_test.rb                                                      | fixture                              |
|   41 |   0 | ✅  | insert_all_test.rb                                                   | relation                             |
|   36 |   0 | ✅  | transactions_test.rb                                                 | connection-pool                      |
|   36 |   0 | ✅  | associations/join_model_test.rb                                      | associations — join-model            |
|   27 |   0 | ✅  | associations/has_one_associations_test.rb                            | associations — has-one               |
|   22 |   0 | ✅  | schema_dumper_test.rb                                                | schema (→ I-1)                       |
|   21 |   0 | ✅  | view_test.rb                                                         | schema — view DDL / dump (→ I-1)     |
|   20 |   0 | ✅  | scoping/relation_scoping_test.rb                                     | relation — scoping                   |
|   18 |   0 | ✅  | nested_attributes_test.rb                                            | nested-attributes                    |
|   18 |   0 | ✅  | associations/cascaded_eager_loading_test.rb                          | associations                         |
|   17 |   0 | ✅  | comment_test.rb                                                      | schema — comment dump (→ I-1)        |
|   17 |   0 | ✅  | bind_parameter_test.rb                                               | relation — Relation API              |
|   14 |   0 | ✅  | associations/has_and_belongs_to_many_associations_test.rb            | associations — habtm                 |
|   13 |   0 | ✅  | quoting_test.rb                                                      | schema — quoting / type-cast         |
|   13 |   0 | ✅  | defaults_test.rb                                                     | schema (→ I-1)                       |
|   12 |   0 | ✅  | relation/where_test.rb                                               | relation — WHERE                     |
|   12 |   0 | ✅  | locking_test.rb                                                      | Optimistic\* locking                 |
|   11 |   0 | ✅  | autosave_association_test.rb                                         | associations — autosave              |
|   11 |   0 | ✅  | associations/has_one_through_associations_test.rb                    | fixture                              |
|   10 |   1 | ✅  | associations_test.rb                                                 | associations                         |
|   10 |   0 | ✅  | transaction_callbacks_test.rb                                        | transactions                         |
|   10 |   0 | ✅  | relation/select_test.rb                                              | relation (→ I-4)                     |
|   10 |   0 | ✅  | nested_attributes_with_callbacks_test.rb                             | nested-attributes                    |
|    8 |   0 | ✅  | connection_pool_test.rb                                              | connection-pool                      |
|    8 |   0 | ✅  | base_prevent_writes_test.rb                                          | relation — prevent-writes            |
|    8 |   0 | ✅  | associations/eager_load_includes_full_sti_class_test.rb              | associations                         |
|    8 |   0 | ✅  | aggregations_test.rb                                                 | relation — calculation               |
|    7 |   0 | ✅  | strict_loading_test.rb                                               | relation — StrictLoading             |
|    7 |   0 | ✅  | readonly_test.rb                                                     | relation — Relation API              |
|    7 |   0 | ✅  | migration_test.rb                                                    | migration (+ 4 misplaced)            |
|    7 |   0 | ✅  | associations/inverse_associations_test.rb                            | InverseOfAssociationRecursion        |
|    6 |   0 | ✅  | relations_test.rb                                                    | relation                             |
|    6 |   0 | ✅  | relation/where_chain_test.rb                                         | relation                             |
|    6 |   0 | ✅  | connection_handling_test.rb                                          | connection-pool                      |
|    6 |   0 | ✅  | calculations_test.rb                                                 | relation — calculation (→ I-4)       |
|    6 |   0 | ✅  | associations/eager_singularization_test.rb                           | associations                         |
|    6 |   0 | ❌  | adapters/postgresql/transaction_test.rb                              | adapter-pg                           |
|    6 |   0 | ❌  | adapters/postgresql/array_test.rb                                    | serialize machinery (→ I-3)          |
|    5 |   0 | ✅  | query_cache_test.rb                                                  | habtm setup needed                   |
|    5 |   0 | ✅  | counter_cache_test.rb                                                | associations                         |
|    5 |   0 | ✅  | base_test.rb                                                         | schema                               |
|    5 |   0 | ✅  | associations/has_one_through_disable_joins_associations_test.rb      | associations                         |
|    5 |   0 | ❌  | adapters/postgresql/referential_integrity_test.rb                    | adapter-pg                           |
|    5 |   0 | ❌  | adapters/postgresql/postgresql_adapter_test.rb                       | adapter-pg (+8 wrong-describe)       |
|    5 |   0 | ❌  | adapters/postgresql/optimizer_hints_test.rb                          | adapter-pg                           |
|    5 |   0 | ❌  | adapters/postgresql/numbers_test.rb                                  | adapter-pg (→ I-4)                   |
|    5 |   0 | ❌  | adapters/postgresql/enum_test.rb                                     | adapter-pg (→ I-2)                   |
|    5 |   0 | ❌  | adapters/postgresql/deferred_constraints_test.rb                     | adapter-pg                           |
|    5 |   0 | ❌  | adapters/postgresql/create_unlogged_tables_test.rb                   | adapter-pg                           |
|    5 |   0 | ❌  | adapters/postgresql/collation_test.rb                                | adapter-pg                           |
|    5 |   0 | ❌  | adapters/abstract_mysql_adapter/unsigned_type_test.rb                | adapter-mysql                        |
|    5 |   0 | ❌  | adapters/abstract_mysql_adapter/transaction_test.rb                  | adapter-mysql                        |
|    5 |   0 | ❌  | adapters/abstract_mysql_adapter/optimizer_hints_test.rb              | adapter-mysql                        |
|    4 |   0 | ✅  | touch_later_test.rb                                                  | associations — touch                 |
|    4 |   0 | ✅  | sanitize_test.rb                                                     | relation — SQL sanitization          |
|    4 |   0 | ✅  | reserved_word_test.rb                                                | SQLite adapter gap                   |
|    4 |   0 | ✅  | invertible_migration_test.rb                                         | migration — CommandRecorder          |
|    4 |   0 | ✅  | instrumentation_test.rb                                              | relation — Notifications             |
|    4 |   0 | ✅  | hot_compatibility_test.rb                                            | (untagged)                           |
|    4 |   0 | ✅  | connection_adapters/standalone_connection_test.rb                    | 🚫 externally blocked                |
|    4 |   0 | ✅  | connection_adapters/registration_test.rb                             | connection-pool                      |
|    4 |   0 | ✅  | connection_adapters/connection_handler_test.rb                       | connection-pool                      |
|    4 |   0 | ✅  | associations/nested_error_test.rb                                    | nested-attributes (Phase G)          |
|    4 |   0 | ✅  | associations/has_many_associations_test.rb                           | associations (+4 wrong-describe)     |
|    4 |   0 | ❌  | adapters/postgresql/transaction_nested_test.rb                       | adapter-pg                           |
|    4 |   0 | ❌  | adapters/postgresql/rename_table_test.rb                             | adapter-pg                           |
|    4 |   0 | ❌  | adapters/postgresql/quoting_test.rb                                  | adapter-pg                           |
|    4 |   0 | ❌  | adapters/abstract_mysql_adapter/mysql_explain_test.rb                | adapter-mysql                        |
|    4 |   0 | ❌  | adapters/abstract_mysql_adapter/auto_increment_test.rb               | adapter-mysql                        |
|    3 |   0 | ✅  | unconnected_test.rb                                                  | connection-pool                      |
|    3 |   0 | ✅  | tasks/database_tasks_test.rb                                         | (untagged)                           |
|    3 |   0 | ✅  | suppressor_test.rb                                                   | (untagged)                           |
|    3 |   0 | ✅  | statement_cache_test.rb                                              | relation                             |
|    3 |   0 | ✅  | reflection_test.rb                                                   | associations — reflection            |
|    3 |   0 | ✅  | forbidden_attributes_protection_test.rb                              | nested-attributes                    |
|    3 |   0 | ✅  | column_definition_test.rb                                            | schema (→ I-1)                       |
|    3 |   0 | ✅  | batches_test.rb                                                      | (untagged)                           |
|    3 |   0 | ✅  | associations/left_outer_join_association_test.rb                     | associations                         |
|    3 |   0 | ❌  | adapters/postgresql/xml_test.rb                                      | adapter-pg                           |
|    3 |   0 | ❌  | adapters/postgresql/type_lookup_test.rb                              | adapter-pg                           |
|    3 |   0 | ❌  | adapters/postgresql/hstore_test.rb                                   | serialization (→ I-3)                |
|    3 |   0 | ❌  | adapters/postgresql/date_test.rb                                     | adapter-pg                           |
|    3 |   0 | ❌  | adapters/postgresql/composite_test.rb                                | adapter-pg                           |
|    3 |   0 | ❌  | adapters/abstract_mysql_adapter/sp_test.rb                           | adapter-mysql                        |
|    3 |   0 | ❌  | adapters/abstract_mysql_adapter/set_test.rb                          | adapter-mysql                        |
|    3 |   0 | ❌  | adapters/abstract_mysql_adapter/nested_deadlock_test.rb              | adapter-mysql                        |
|    2 |   0 | ✅  | unsafe_raw_sql_test.rb                                               | relation                             |
|    2 |   0 | ✅  | transaction_instrumentation_test.rb                                  | transactions                         |
|    2 |   0 | ✅  | statement_invalid_test.rb                                            | relation                             |
|    2 |   0 | ✅  | relation/with_test.rb                                                | (untagged)                           |
|    2 |   0 | ✅  | primary_class_test.rb                                                | (untagged)                           |
|    2 |   0 | ✅  | log_subscriber_test.rb                                               | (untagged)                           |
|    2 |   0 | ✅  | inheritance_test.rb                                                  | fixture                              |
|    2 |   0 | ✅  | database_statements_test.rb                                          | relation                             |
|    2 |   0 | ✅  | connection_management_test.rb                                        | connection-pool                      |
|    2 |   0 | ✅  | connection_adapters/schema_cache_test.rb                             | schema                               |
|    2 |   0 | ✅  | clone_test.rb                                                        | (untagged)                           |
|    2 |   0 | ✅  | attributes_test.rb                                                   | type                                 |
|    2 |   0 | ✅  | attribute_methods/read_test.rb                                       | type                                 |
|    2 |   0 | ✅  | associations/inner_join_association_test.rb                          | associations                         |
|    2 |   0 | ✅  | associations/extension_test.rb                                       | associations                         |
|    2 |   0 | ✅  | associations/eager_load_nested_include_test.rb                       | associations                         |
|    2 |   0 | ❌  | adapters/postgresql/uuid_test.rb                                     | migration framework                  |
|    2 |   0 | ❌  | adapters/postgresql/explain_test.rb                                  | adapter-pg                           |
|    2 |   0 | ❌  | adapters/postgresql/domain_test.rb                                   | adapter-pg                           |
|    2 |   0 | ❌  | adapters/abstract_mysql_adapter/virtual_column_test.rb               | adapter-mysql                        |
|    2 |   0 | ❌  | adapters/abstract_mysql_adapter/mysql_enum_test.rb                   | schema-dumper columnSpec (→ I-1/I-2) |
|    1 |   1 | ✅  | connection_adapters/connection_handlers_multi_db_test.rb             | connection-pool                      |
|    1 |   0 | ✅  | types_test.rb                                                        | type                                 |
|    1 |   0 | ✅  | type_caster/connection_test.rb                                       | type                                 |
|    1 |   0 | ✅  | timestamp_test.rb                                                    | type                                 |
|    1 |   0 | ✅  | table_metadata_test.rb                                               | schema                               |
|    1 |   0 | ✅  | secure_token_test.rb                                                 | relation                             |
|    1 |   0 | ✅  | relation/update_all_test.rb                                          | relation                             |
|    1 |   0 | ✅  | relation/predicate_builder_test.rb                                   | relation                             |
|    1 |   0 | ✅  | relation/delegation_test.rb                                          | (untagged)                           |
|    1 |   0 | ✅  | reaper_test.rb                                                       | (untagged)                           |
|    1 |   0 | ✅  | prepared_statement_status_test.rb                                    | relation                             |
|    1 |   0 | ✅  | persistence/reload_association_cache_test.rb                         | associations                         |
|    1 |   0 | ✅  | numeric_data_test.rb                                                 | type                                 |
|    1 |   0 | ✅  | invalid_connection_test.rb                                           | connection-pool                      |
|    1 |   0 | ✅  | finder_test.rb                                                       | associations                         |
|    1 |   0 | ✅  | finder_respond_to_test.rb                                            | relation                             |
|    1 |   0 | ✅  | encryption/encryptable_record_test.rb                                | encryption                           |
|    1 |   0 | ✅  | encryption/concurrency_test.rb                                       | (untagged)                           |
|    1 |   0 | ✅  | disconnected_test.rb                                                 | connection-pool                      |
|    1 |   0 | ✅  | delegated_type_test.rb                                               | fixture + delegated-type touch       |
|    1 |   0 | ✅  | database_selector_test.rb                                            | connection-pool                      |
|    1 |   0 | ✅  | database_configurations/resolver_test.rb                             | (→ H-3 divergence)                   |
|    1 |   0 | ✅  | connection_adapters/merge_and_resolve_default_url_config_test.rb     | (untagged)                           |
|    1 |   0 | ✅  | column_alias_test.rb                                                 | schema                               |
|    1 |   0 | ✅  | associations/required_test.rb                                        | (untagged)                           |
|    1 |   0 | ✅  | associations/has_many_through_associations_test.rb                   | (untagged)                           |
|    1 |   0 | ✅  | associations/bidirectional_destroy_dependencies_test.rb              | associations                         |
|    1 |   0 | ✅  | associations/belongs_to_associations_test.rb                         | associations                         |
|    1 |   0 | ❌  | adapters/sqlite3/statement_pool_test.rb                              | adapter-sqlite                       |
|    1 |   0 | ✅  | adapters/sqlite3/explain_test.rb                                     | adapter-sqlite (+2 wrong-describe)   |
|    1 |   0 | ❌  | adapters/postgresql/virtual_column_test.rb                           | schema                               |
|    1 |   0 | ❌  | adapters/postgresql/timestamp_test.rb                                | adapter-pg                           |
|    1 |   0 | ❌  | adapters/postgresql/statement_pool_test.rb                           | (untagged)                           |
|    1 |   0 | ❌  | adapters/postgresql/schema_test.rb                                   | adapter-pg                           |
|    1 |   0 | ❌  | adapters/postgresql/invertible_migration_test.rb                     | migration                            |
|    1 |   0 | ❌  | adapters/postgresql/infinity_test.rb                                 | type                                 |
|    1 |   0 | ❌  | adapters/postgresql/foreign_table_test.rb                            | adapter-pg                           |
|    1 |   0 | ❌  | adapters/postgresql/case_insensitive_test.rb                         | adapter-pg                           |
|    1 |   0 | ❌  | adapters/postgresql/bytea_test.rb                                    | adapter-pg (→ I-3)                   |
|    1 |   0 | ❌  | adapters/mysql2/mysql2_adapter_test.rb                               | (untagged)                           |
|    1 |   0 | ❌  | adapters/mysql2/check_constraint_quoting_test.rb                     | adapter-mysql                        |
|    1 |   0 | ❌  | adapters/abstract_mysql_adapter/sql_types_test.rb                    | adapter-mysql                        |
|    1 |   0 | ❌  | adapters/abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb | adapter-mysql                        |
|    1 |   0 | ❌  | adapters/abstract_mysql_adapter/charset_collation_test.rb            | (→ I-1)                              |
|    1 |   0 | ✅  | adapter_prevent_writes_test.rb                                       | relation — prevent-writes            |
|    1 |   0 | ✅  | active_record_test.rb                                                | connection-pool                      |
|    0 |   1 | ✅  | adapters/abstract_mysql_adapter/connection_test.rb                   | (missing → H-2)                      |

## Appendix B — story index (dispatch order)

| Story   | Title                                                  | Phase |    ~Skips moved | Dep                                     |
| ------- | ------------------------------------------------------ | ----- | --------------: | --------------------------------------- |
| H-1     | relocate misplaced + wrong-describe                    | 0     |  0 (19 reclass) | —                                       |
| H-2     | port 3 missing tests                                   | 0     |      +3 matched | —                                       |
| H-3     | reclassify permanent skips                             | 0     |   shrinks denom | —                                       |
| I-1     | schema-dumper columnSpec U2/U3                         | 1     |             ~60 | —                                       |
| I-2     | type_for_attribute enum cast                           | 1     |             ~15 | —                                       |
| I-3     | general serialize write-path                           | 1     |             ~10 | —                                       |
| I-4     | pluck/calculate result cast (wire existing helpers)    | 1     |             ~15 | —                                       |
| I-5     | `TEST_ADAPTER` CI job (CI-gates 135 adapter-dir skips) | 1     | 0 (unlocks 135) | —                                       |
| F-1     | insert_all cluster                                     | 2     |              41 | —                                       |
| F-2     | connection-pool / multi-db                             | 2     |             ~45 | —                                       |
| F-3     | migration runner                                       | 2     |             ~15 | —                                       |
| F-4     | transactions + callbacks + touch                       | 2     |             ~30 | —                                       |
| F-5     | query-cache residuals                                  | 2     |              ~5 | F-7(habtm)                              |
| F-6     | nested-attributes                                      | 2     |             ~25 | partial G                               |
| F-7     | fixtures-backed (adapter_test, h1t)                    | 2     |             ~40 | I-1(comment)                            |
| F-8     | small core leftovers                                   | 2     |             ~50 | I-1/I-3/type                            |
| P3-\*   | adapter type-families (PG+MySQL)                       | 3     |            ~135 | I-5 (CI-gate); I-1/I-3 (dump/serialize) |
| 7.2-fix | \_namedInnerJoins review-fix                           | 4     |            gate | —                                       |
| W7-\*   | associations + relation campaigns                      | 4     |            ~300 | audit-gated                             |

> **Externally blocked / permanent (not on the path, → H-3 or deferred):**
> `standalone_connection_test.rb` (4), `accepts_nested_attributes_for` deep
> cases (Phase G), `load_async`/GVL/Marshal/fork/thread query-cache + pool cases.

## Appendix C — source-verification notes (2026-06-02)

Each phase's load-bearing claims were checked against the tree. Corrections
already folded into the stories above:

| Claim checked                                                       | Source                                                                    | Result                                                                                                                                                                                                                                                                                                                                                                                                |
| ------------------------------------------------------------------- | ------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **How CI exercises PG/MySQL**                                       | `ci.yml:466,487,527` + `vitest.config.ts:17-48`                           | ⚠️ **Two corrections.** (1) The 3 jobs DO exist and the PG/MariaDB ones run the **core** suite against a live backend (`PG_TEST_URL`/`MYSQL_TEST_URL`, exercising `describeIf*`). (2) But `TEST_ADAPTER` is never set in CI, so `ADAPTER_SPECIFIC_EXCLUDE` **drops `adapters/<db>/**`in every job** — the 135 adapter-dir skips are NOT CI-run today. → reframed Story I-5 (add a`TEST_ADAPTER` job). |
| I-1 `columnSpec`/`formatColspecRaw` exist (U1 landed)               | `connection-adapters/abstract/schema-dumper.ts`, `mysql/schema-dumper.ts` | ✅ Confirmed; `AdapterSchemaSource` sqlType/type collapse confirmed (comment at `mysql/schema-dumper.ts:17`).                                                                                                                                                                                                                                                                                         |
| I-2 `typeForAttribute` missing                                      | `enum.ts:78`, `table-metadata.ts:35`                                      | ⚠️ **Refined.** It exists & is used; gap is the where/predicate-builder cast path only.                                                                                                                                                                                                                                                                                                               |
| I-3 `type/serialized.ts` unused; `serialize.ts` monkey-patches read | `type/serialized.ts`, `serialize.ts:105-109`                              | ✅ Confirmed read-path `readAttribute` override.                                                                                                                                                                                                                                                                                                                                                      |
| I-4 pluck/calc don't cast                                           | `relation/calculations.ts:718,731`; `relation.ts:5406-5412`               | ⚠️ **Refined.** Cast helpers + private wrappers already exist (#917) but are **never called** from `pluck()`/`calculate()` — it's a wiring job (~40–100 LOC), not new code.                                                                                                                                                                                                                           |
| H-3 permanent skips "already reclassified"                          | tight scan of counted-skip files                                          | ⚠️ **Corrected.** ~19 live permanent `it.skip` remain in counted files (YAML/Marshal/thread/fork); must be reclassified. (A loose grep hits ~190 across _unmapped_ files — noise, out of scope.)                                                                                                                                                                                                      |
| Phase 4 `_namedInnerJoins` fixes outstanding                        | `relation/merger.ts` (0 refs), `query-methods.ts:126,895,2425`            | ✅ Confirmed still outstanding.                                                                                                                                                                                                                                                                                                                                                                       |
| Phase 0 misplaced live in PG change-schema                          | `adapters/postgresql/change-schema.test.ts:158,174`                       | ✅ Confirmed.                                                                                                                                                                                                                                                                                                                                                                                         |

**Not yet source-verified (trust `workplan.md` / refresh before starting):** the
per-cluster internals of Phase 2 (insert_all sub-clusters, migration-runner
slots) and Phase 4 (per-campaign audit slots) — these are sized by `/audit-report`
at dispatch time per the 100-plan methodology, so deep verification is deferred
to each story's audit PR rather than done up-front here.
