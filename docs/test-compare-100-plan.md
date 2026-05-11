# activerecord test:compare → 100% Plan

**Snapshot 2026-05-08:** `5999/7930 tests (75.6%) | 320/320 files | 0 misplaced`. **1929 skipped + 8 wrong-describe.**

The api:compare scoreboard is closed at 100% (4969/4969 methods). Remaining work is test:compare un-skips — getting Rails-mirrored test bodies to actually run and pass.

**PR sizing target: ~250 LOC** (range 220–280 within the 300-LOC hard ceiling from CLAUDE.md). No small PRs (review-cycle overhead per PR is fixed; 50-LOC PRs aren't worth it). No huge PRs (anything ≥300 needs to split). If a slot is too small, **bundle adjacent gaps** until it hits ~250; if too big, **split** along a natural seam. The audit PR for each category produces a triage output that's pre-sized for ~250-LOC work slots.

Use the **test:compare prompt template** (`/home/dean/github/blazetrailsdev/test-compare-prompt-template.md`) when spawning un-skip agents.

---

## Strategy

**Audit first, work second, integrated last.**

For each `BLOCKED:` category, the plan has two phases:

1. **Audit PR.** Read Rails feature source + test file end-to-end; identify obvious impl gaps without writing un-skip code. Capture findings in PR body. Don't ship test un-skips in the audit PR.
2. **Work PRs.** Triage from the audit produces a list of specific gaps. Each gap becomes a sized slot. Tests un-skip naturally as gaps close.

**Within categories, isolated → integrated:**

- Tier 1 (do first): isolated behaviors with bounded code surface — `type`, `i18n`, `validation`, `query-cache`, `load-async`, `serialization`, `encryption`.
- Tier 2: adapter-level — `adapter-pg`, `adapter-mysql`, `adapter-sqlite`, `schema`, `connection-pool`.
- Tier 3: mid-layer features — `transactions`, `migration`.
- Tier 4 (do last): highly-integrated — `relation`, `STI`, `associations`. These touch everything; closing them earlier means re-opening them every time a Tier 1–3 fix lands.

**Permanent / out-of-scope:** `rake`, `GVL`, partial `serialization` (Marshal/YAML) live in `scripts/api-compare/unported-files.ts`. The "Doesn't translate" section at the bottom is the canonical record.

---

## Category status

| Tier | Category          | Skipped | Audit | Notes                                                       |
| ---- | ----------------- | ------- | ----- | ----------------------------------------------------------- |
| 1    | `type`            | 67      | open  | Type system; isolated. Most tests un-skip with cast fixes.  |
| 1    | `i18n`            | 15      | open  | Translation / message generation                            |
| 1    | `validation`      | 2       | open  | Trivial finisher                                            |
| 1    | `query-cache`     | 28      | open  | Bounded subsystem                                           |
| 1    | `load-async`      | 39      | open  | Narrow feature; `FutureResult`                              |
| 1    | `serialization`   | 70      | open  | Most likely already in `unported-files.ts`; audit confirms  |
| 1    | `encryption`      | 10      | open  | Encryption subsystem; small residual                        |
| 2    | `adapter-pg`      | 442     | open  | Largest bucket; per-type files (range, hstore, array, etc.) |
| 2    | `adapter-mysql`   | 122     | open  | Per-feature (connection, active-schema, warnings, ...)      |
| 2    | `adapter-sqlite`  | 9       | open  | Almost free                                                 |
| 2    | `schema`          | 211     | open  | Schema introspection + dumper                               |
| 2    | `connection-pool` | 209     | open  | Pool / handler / pool config                                |
| 3    | `transactions`    | 39      | open  | Transaction / savepoint / isolation                         |
| 3    | `migration`       | 87      | open  | Migration runner                                            |
| 4    | `relation`        | 272     | open  | Touches everything; do late                                 |
| 4    | `STI`             | 6       | open  | Tangled with inheritance/relation                           |
| 4    | `associations`    | 516     | open  | Largest; touches relation+STI+joins. Last.                  |
| —    | `rake`            | 96      | n/a   | Permanent; mostly excluded. See "Doesn't translate".        |
| —    | `GVL`             | 28      | n/a   | Permanent. See "Doesn't translate".                         |
| —    | `unknown`         | 89      | open  | Triage PR — categorize each into the vocab above.           |

Re-run distribution any time:

```bash
grep -rh '^\s*//\s*BLOCKED:' packages/activerecord/src/ \
  | sed 's/.*BLOCKED: //' | awk '{print $1}' | sort | uniq -c | sort -rn
```

---

## Workflow per category

### Audit PR (the first PR for any open category)

**Goal:** read the Rails feature + test surface end-to-end, identify obvious impl gaps in our codebase, file specific work slots.

**Scope:**

- Read every `def` in the relevant Rails source files (`scripts/api-compare/.rails-source/activerecord/lib/active_record/<feature>/`).
- Read the corresponding Rails test files end-to-end.
- For each Rails method/test, locate the TS counterpart. Note: missing impl, signature mismatch, behavioral divergence, or test-side fixture gap.
- **Don't ship un-skips in the audit PR** — the goal is the inventory.
- Output: a markdown audit document (committed to the branch under `docs/audits/<category>.md` or returned as PR-body content) listing each gap with:
  - File / symbol
  - Rails source reference
  - Type: `missing` / `partial-impl` / `signature-drift` / `test-helper-gap` / `fixture-gap`
  - Estimated LOC to close
  - Test count it would unblock
  - **Suggested bundling**: group small gaps (<100 LOC each) into ~250-LOC work slots so each downstream PR hits the sizing target. Avoid recommending standalone <100-LOC PRs.

The audit's **triage output is itself pre-sized**: each suggested work-PR slot lists the gaps it covers, totalling ~220–280 LOC. Parent reviews and spawns slots from the suggested list.

**LOC budget:** the audit doc itself is ≤300 LOC (it's all prose). No source changes.

**Workflow:**

1. Spawn agent with the prompt template from `/home/dean/github/blazetrailsdev/test-compare-prompt-template.md` adapted for audit (no un-skips, output is the inventory).
2. Agent ships the audit doc as a draft PR.
3. Parent reviews; triage the inventory into specific work slots.
4. Each work slot becomes a separate PR using the standard test-compare-prompt-template flow.

### Work PRs (after audit)

**Goal:** un-skip tests for a specific gap (or cluster of related gaps) identified in the audit.

Use the **standard test:compare prompt template** at `/home/dean/github/blazetrailsdev/test-compare-prompt-template.md`. Substitute `<TARGET FILE>`, `<RAILS REFERENCE>`, `<BUCKET>`, `<EXPECTED COUNT>`.

The template enforces:

- 1:1 Rails-port for test names + variables + function calls
- Acceptable language deviations vs. Trails gaps
- `BLOCKED:` / `ROOT-CAUSE:` / `SCOPE:` annotation format
- "Workarounds = bugs" rule
- Per-test loop: pass / surgical fix (≤20 LOC) / sharpen-and-skip
- `/post-pr` reporting after merge

---

## Tier 1 — Isolated behaviors

These have bounded code surface and minimal cross-cutting concerns. Audit each, then work through the resulting slots in parallel.

### `type` — 67 skipped

**Files:** `base.test.ts` (20), `date-time-precision.test.ts` (18), `enum.test.ts` (10), `date-time.test.ts` (10), `type/type-map.test.ts` (9). Plus residual in adapter-specific type files.

**Audit scope:**

- Rails source: `lib/active_record/type/*.rb`, `lib/active_model/type/*.rb`.
- Read each `Type` subclass: cast / serialize / deserialize / changedInPlace / typeForAttribute.
- Identify gaps in TS Type implementations vs. Rails. Common shapes: `cast` returns wrong type, `serialize` doesn't handle edge cases, `precision`/`scale`/`limit` not propagated.

### `i18n` — 15 skipped

**Files:** `validations/i18n-validation.test.ts`, `validations/i18n-generate-message-validation.test.ts`.

**Audit scope:**

- Rails source: `lib/active_record/translation.rb`, `lib/active_model/errors.rb`, `lib/active_model/validations.rb` (translation paths).
- Read I18n integration: `humanAttributeName`, `errors.add` translation lookup, `errors.full_messages` formatting.
- Likely surfaces gaps in our `@blazetrails/activesupport` I18n surface or in AR's translation hooks.

### `validation` — 2 skipped

Trivial finisher. Audit + close in one PR.

### `query-cache` — 28 skipped

**Files:** `query-cache.test.ts`.

**Audit scope:**

- Rails source: `lib/active_record/query_cache.rb`, `connection_adapters/abstract/query_cache.rb`.
- Read cache wiring: middleware integration, connection-level enable/disable, statement-cache interaction.

### `load-async` — 39 skipped

**Files:** `relation/load-async.test.ts`, `future-result.test.ts`.

**Audit scope:**

- Rails source: `lib/active_record/future_result.rb`, `lib/active_record/relation.rb` async paths.
- Some Rails async semantics rely on GVL release timing and won't translate (track separately under `GVL`).
- Real subset: `loadAsync` returning a `FutureResult`-shaped wrapper, `then`/`schedule` semantics.

### `serialization` — 70 skipped

**Audit scope:**

- Most likely already excluded via `unported-files.ts` (Marshal/YAML cases). Audit confirms which residual is real.
- Real gaps likely in `serialize :col, coder:`, `IndifferentCoder`, custom coders.
- Output: a delta PR moving anything Marshal/YAML-shaped into `unported-files.ts` if not already there, plus a list of real serialization-attribute gaps.

### `encryption` — 10 skipped

Small residual. Audit covers `EncryptableRecord`, `Encryptor`, `encryption/scheme.ts`. Likely 1–2 work PRs.

---

## Tier 2 — Adapter-level

### `adapter-pg` — 442 skipped (largest bucket)

**Top files:** `range.test.ts` (37 — L-2 in flight), `postgresql-adapter.test.ts` (33), `schema.test.ts` (24), `bytea.test.ts` (~14), `virtual-column.test.ts` (19), `infinity.test.ts` (18), `foreign-table.test.ts` (17), `datatype.test.ts` (15), `uuid.test.ts` (14), `interval.test.ts` (13), `connection.test.ts` (13), and per-type files (hstore, array, citext, money, ltree, network, geometric, etc.).

**Audit scope:** per-type-file. The audit isn't one PR — it's one audit per pg-type cluster (range, hstore, array, uuid/timestamp/bytea, etc.). Several have already been audited inline by the work PRs that established their patterns (#1306, #1312, #1325, #1323).

**Strategy:** audit + work in pairs per type. Already-merged audits inform the next:

1. ✅ pg/range — #1306 + #1351 (L-1) shipped; L-2 in flight.
2. ✅ pg/array — #1312, #1320, #1343 shipped.
3. ✅ pg/hstore — #1325 shipped.
4. ✅ pg/bytea + pg/timestamp — #1323 shipped (uuid annotations only).
5. **pg/postgresql-adapter** (33) — #1331 partial; finish remaining via audit.
6. **pg/schema** (24) — schema test integration.
7. **pg/virtual-column** (19) — generated columns.
8. **pg/infinity** (18) — `Float::INFINITY`, `Date::Infinity` quoting.
9. **pg/foreign-table** (17).
10. **pg/datatype** (15) — type composition tests.
11. **pg/uuid** (14) — finish uuid round-trip beyond #1323's annotations.
12. **pg/interval** (13).
13. **pg/connection** (13).
14. Long tail: citext, money, ltree, network, geometric, enum, composite, full_text, cidr, change_schema, bit_string, partitions, rename_table, deferred_constraints, optimizer_hints, prepared_statements_disabled, statement_pool, type_lookup, domain, extension_migration, collation, create_unlogged_tables, referential_integrity, numbers, date, case_insensitive, explain, transaction, nested transaction, schema_authorization, invertible.

### `adapter-mysql` — 122 skipped

**Top files:** `abstract-mysql-adapter/connection.test.ts` (14 after #1326), `active-schema.test.ts` (14), `mysql2/mysql2-adapter.test.ts` (9), `warnings.test.ts` (9), `table-options.test.ts` (9), `schema.test.ts` (8), `quoting.test.ts` (8), `charset-collation.test.ts` (7).

**In flight:** Story H (mysql infra gaps), G-followup (timeout test).

**Audit scope:** per-file. Several already audited inline by #1326 (connection). Remaining files audit fresh.

### `adapter-sqlite` — 9 skipped

**Files:** `sqlite3-adapter.test.ts` (6), `transaction.test.ts` (1), `statement-pool.test.ts` (1), `explain.test.ts` (1).

Tiny — bundle audit + work into one PR.

### `schema` — 211 skipped

**Audit scope:**

- Rails source: `connection_adapters/abstract/schema_*.rb`, `schema_dumper.rb`, `schema_migration.rb`.
- Per-file: `schema.test.ts`, `schema-dumper.test.ts`, `change-schema.test.ts`, `migration.test.ts` schema-related slices.

### `connection-pool` — 209 skipped

**Audit scope:**

- Rails source: `connection_adapters/abstract/connection_pool*.rb`, `connection_handler*.rb`.
- Many cases already excluded as `GVL`. Real residual: pool-config / handler / role+shard semantics.

---

## Tier 3 — Mid-layer

### `transactions` — 39 skipped

**Audit scope:**

- Rails source: `lib/active_record/transactions.rb`, `connection_adapters/abstract/transaction.rb`.
- Story K (#1348) + K-followup (#1354) closed the savepoint-state work. K-followup-2 (in flight) closes the inner-savepoint commit.
- Audit identifies remaining gaps after those land.

### `migration` — 87 skipped

**Audit scope:**

- Rails source: `lib/active_record/migration.rb`, `migration/*.rb`, `command_recorder.rb`.
- Per-file: `migration.test.ts`, `command-recorder.test.ts`, adapter-specific migration tests.
- Already audited inline by #1317 (deprecator + default_strategy) + #1357 (Migrator async loader). Audit covers the remainder.

---

## Tier 4 — Highly integrated (do last)

These touch everything; landing them earlier means re-opening them every time a Tier 1–3 fix surfaces a new edge case. Wait until Tier 1–3 audits + first-wave work PRs are mostly in.

### `relation` — 272 skipped

**Audit scope:**

- Rails source: `lib/active_record/relation.rb` + `relation/*.rb` (already at 100% on api:compare). Behavioral fidelity is the open work.
- Per-file: `relation.test.ts`, `relation/where.test.ts`, `relation/where-chain.test.ts`, `relation/predicate-builder.test.ts`, `relation/calculations.test.ts`, `relation/finder-methods.test.ts`, `relation/batches.test.ts`, `relation/spawn-methods.test.ts`, `relation/delegation.test.ts`.

### `STI` — 6 skipped

**Audit scope:** small but tangled. Audit reads `inheritance.ts` + `inheritance.test.ts` end-to-end against Rails `inheritance.rb`. Most gaps will surface as `findSubclass` / `discriminate_class_for_record` divergences.

### `associations` — 516 skipped (largest)

**Audit scope:**

- Rails source: 30+ files in `lib/active_record/associations/`.
- Per-feature-file: `associations.test.ts` (50), HABTM (43), join-model (41), autosave (39), `has_many :through` (38), `has_one` (28), reflection (22), `has_one :through` (22), `has_many :through disable_joins` (19).
- Audit per association feature, then per-test work PRs.

---

## Triage `unknown` — 89 skipped

Single audit PR — re-categorize each `BLOCKED: unknown` annotation under the controlled vocabulary above. Some will move to `unported-files.ts`; others get a real category. ~30–60 LOC of annotation edits.

---

## Tracking & cadence

- Run `pnpm test:compare --package activerecord` after each merge.
- Open all PRs as draft; run `/link <PR#>` after opening.
- Per CLAUDE.md: do NOT rename Rails-derived test names.
- After each work PR merges, run `/post-pr` with findings (out-of-scope gaps, fixture-model needs, infrastructure shortfalls).

---

## Tests that don't translate to TypeScript / Node

Permanently not-portable tests are excluded via `UNPORTED_FILES` in
`scripts/api-compare/unported-files.ts` (whole-file entries with `testFile`).
This drops them from both the Ruby denominator and the skipped backlog.

**PR that added whole-file exclusions: #1304** — 8097 → 7970 Ruby tests (−127), 2211 → 2085 skipped (−126).
**PR that added per-test exclusion infra: #1305** — 7970 → 7930 Ruby tests (−40), 2085 → 2048 skipped (−37).

### YAML / Marshal / Ruby object serialization ✓ excluded

- `test/cases/yaml_serialization_test.rb` (**excluded**)
- `test/cases/binary_test.rb` (**excluded**)
- `test/cases/marshal_serialization_test.rb` (**already excluded**)
- `test/cases/coders/yaml_column_test.rb` (**already excluded**)
- `test/cases/message_pack_test.rb` (**already excluded**)
- `test/cases/serialized_attribute_test.rb` — 19 YAML/class-serializer cases (per-test excluded)
- `test/cases/base_test.rb` — 7 Marshal cases (per-test excluded)

### Ruby concurrency / thread / GVL ✓ partially excluded

- `test/cases/transaction_isolation_test.rb` — 7 cases (**excluded**)
- `test/cases/schema_loading_test.rb` — 3 cases (**excluded**)
- `test/cases/reload_models_test.rb` — `ActiveSupport::Dependencies` (**excluded**)
- `test/cases/connection_pool_test.rb` — 11 GVL thread cases (per-test excluded)
- `test/cases/base_test.rb` — 2 GVL thread-handler cases (per-test excluded)
- `test/cases/relation/load_async_test.rb` cases that assert GVL release while a query runs (mixed file — fold into next exclusion touch)

### Process / Signal / fork

- `connection_handler_test.rb` cases asserting `Process.fork` cleanup (mixed file — fold into next exclusion touch)
- `test/cases/reaper_test.rb` — 1 fork case (per-test excluded)

### Rake / dbconsole shell-out ✓ excluded

- `adapters/postgresql/postgresql_rake_test.rb` (37 cases) (**excluded**)
- `adapters/mysql2/mysql2_rake_test.rb` (26 cases) (**excluded**)
- `adapters/sqlite3/sqlite_rake_test.rb` (17 cases) (**excluded**)
- `adapters/{postgresql,mysql2,sqlite3}/dbconsole_test.rb` (16 cases) (**excluded**)

### Fixtures ✓ already excluded

- `test/cases/fixtures_test.rb` (111), `fixture_set/file_test.rb` (14), `test_fixtures_test.rb` (4)

### Ruby exception classes / object model

- `NameError#missing_name?`, `Module#prepend` ordering, `singleton_class` semantics
- `active_record_test.rb` cases on `ActiveRecord::Base.singleton_class.ancestors`

### Encoding / String semantics ✓ excluded

- `binary_test.rb` `Encoding::ASCII_8BIT` vs `Encoding::UTF_8` (**excluded**)
- `bytea_test.rb` cases on Ruby `String#encoding`

### Symbols

- Cases distinguishing `Symbol` from `String`

---

## Workflow for unskipping tests

(Reference — the canonical workflow lives in `/home/dean/github/blazetrailsdev/test-compare-prompt-template.md`.)

### Per-test loop

For each `it.skip(...)` (or `xit(...)`, `test.skip(...)`, `describe.skip(...)`):

1. Attempt to un-skip and run.
2. **Pass** → un-skip, commit.
3. **Failing with surgical fix (≤20 LOC, in-scope)** → fix, un-skip, commit.
4. **Failing with deep gap** → leave skipped; upgrade the annotation to the format below.

LOC budget per PR: ≤300 total diff.

### Skip annotation format

```ts
it.skip("rails-test-name-verbatim", () => {
  // BLOCKED: <category>
  // ROOT-CAUSE: <file>#<symbol>: <one-sentence cause>
  // SCOPE: ~<N> LOC <fix description>; affects ~<M> tests
});
```

Three required lines, in this order:

- `BLOCKED: <category>` — controlled vocabulary, see below. The grep contract.
- `ROOT-CAUSE:` — one-sentence specific cause naming the file/symbol involved.
- `SCOPE:` — rough fix size + how many other tests likely share this cause.

### Controlled vocabulary

| Category                   | Meaning                                                                          |
| -------------------------- | -------------------------------------------------------------------------------- |
| `BLOCKED: STI`             | Single-table inheritance routing                                                 |
| `BLOCKED: associations`    | Specific association feature (specify which: habtm / inverse / through / ...)    |
| `BLOCKED: encryption`      | Encryption subsystem gap                                                         |
| `BLOCKED: schema`          | Schema introspection / dumper / definition gap                                   |
| `BLOCKED: transactions`    | Transaction / savepoint / isolation gap                                          |
| `BLOCKED: query-cache`     | Query cache behavior                                                             |
| `BLOCKED: load-async`      | Async query / future result                                                      |
| `BLOCKED: GVL`             | Ruby thread / GVL — likely permanent → `unported-files.ts`                       |
| `BLOCKED: serialization`   | Ruby Marshal / YAML round-trip — likely permanent → `unported-files.ts`          |
| `BLOCKED: rake`            | Rake / dbconsole shell-out — likely permanent → `unported-files.ts`              |
| `BLOCKED: fixture`         | Fixture loader feature (whole subsystem already in `unported-files.ts`)          |
| `BLOCKED: migration`       | Migration runner feature                                                         |
| `BLOCKED: connection-pool` | Connection pool / handler / pool config gap                                      |
| `BLOCKED: relation`        | Relation API gap (specify which: where / scope / batches / ...)                  |
| `BLOCKED: i18n`            | I18n message / translation gap                                                   |
| `BLOCKED: validation`      | Validator behavior gap (specify which: uniqueness / length / numericality / ...) |
| `BLOCKED: type`            | Type cast / serialize / deserialize gap (specify which Type)                     |
| `BLOCKED: adapter-pg`      | PostgreSQL-specific adapter gap                                                  |
| `BLOCKED: adapter-mysql`   | MySQL-specific adapter gap                                                       |
| `BLOCKED: adapter-sqlite`  | SQLite-specific adapter gap                                                      |
| `BLOCKED: range`           | pg/range type behavior                                                           |
| `BLOCKED: unknown`         | Could not categorize from context; needs human triage                            |

Adding a new category: pick a kebab-case slug, document in this table.

### Cross-file consolidation pass

```bash
grep -rn "BLOCKED:" packages/activerecord/src --include='*.test.ts' \
  | sed 's/.*BLOCKED: //' | cut -d' ' -f1 | sort | uniq -c | sort -rn
```

Output ranks subsystems by blocked-test count. The biggest groups become focused subsystem-fix PRs.

### Why this is better than per-test issues

- Agents don't file 50 issues for 50 tests blocked by 5 root causes.
- Annotation lives next to the failing test; no issue-tracker round-trip needed.
- The grep is rerunnable; priorities update as state shifts.
