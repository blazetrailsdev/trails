# ActiveRecord post-100% — fidelity tracker

> **Status update 2026-05-22** — Inline batch list below is dated
> 2026-05-16; the pool epic (#2202/#2206/#2211/#2219/#2230/#2242/#2245)
> and recent un-skip work (#2229 batch 63 caseInsensitiveComparison,
> #2240 EncryptedBook variants) are not yet reflected in the body.
>
> Phase ordering / cross-doc dependencies live in
> [`activerecord-index.md`](activerecord-index.md). This doc owns the
> batch list; the index owns the sequencing.
>
> **Known to strip on next refresh:**
>
> - Batch 63 caseInsensitiveComparison async fix — closed by #2229.
> - Batch 28b (AliasTracker) — partially shipped (#670/#1869/#1850);
>   remaining is ~80 LOC for 2 BLOCKED tests + Rails-canonical alias
>   naming, not ~280 LOC.
> - Batch 45 `Base.adapter` permanent-checkout — superseded by pool epic
>   (`createPooledTestAdapter` + `pool.pinConnectionBang` in #2242/#2245).
> - Batch 138 connectsTo / Person fixture — may be partially superseded
>   by fixture-port PRs #2208/#2227/#2228.

**Snapshot 2026-06-01:** `activerecord 4969/4969 methods (100%)`. Public surface closed. test:compare at **6826/7867 (86.8%)**, 1034 skipped, 4 misplaced (refresh with `pnpm test:compare --cached --json --package activerecord`).

> **Merged 2026-06-01:** the former `activerecord-test-compare-100.md`
> per-file tracker is now **Part 2** of this doc (below the batch list).
> This doc owns both the batch list (Part 1) and the per-file backlog table
> (Part 2). Residual blocked/done gap items live in
> [`activerecord-gaps.md`](activerecord-gaps.md).

The api:compare scoreboard is **closed**. Everything below is post-100% Rails-fidelity work — test:compare un-skips driven by audit clusters plus accumulated fidelity polish. PRs target ~250 LOC (CLAUDE.md hard ceiling 500; range 220–280).

Closed work lives in `git log` — `git log --grep "audit Slot\|fidelity\|un-skip" origin/main`.

---

## Strategy + workflow

**Audit first, work second, integrated last.**

For each `BLOCKED:` category, the plan has two phases:

1. **Audit (read-only research; no PR).** Read Rails feature source + test file end-to-end; identify obvious impl gaps without writing un-skip code. Capture findings via the `/audit-report` skill — the deliverable is a markdown report, not a GitHub PR. The parent session triages the inventory into sized slots.
2. **Work PRs.** Triage from the audit produces a list of specific gaps. Each gap becomes a sized slot. Tests un-skip naturally as gaps close.

**Within categories, isolated → integrated:**

- Tier 1 (do first): isolated behaviors with bounded code surface — `type`, `i18n`, `validation`, `query-cache`, `load-async`, `serialization`, `encryption`.
- Tier 2: adapter-level — `adapter-pg`, `adapter-mysql`, `adapter-sqlite`, `schema`, `connection-pool`.
- Tier 3: mid-layer features — `transactions`, `migration`.
- Tier 4 (do last): highly-integrated — `relation`, `STI`, `associations`. These touch everything; closing them earlier means re-opening them every time a Tier 1–3 fix lands.

**PR sizing target: ~250 LOC** (range 220–280, comfortably within the 500-LOC hard ceiling from CLAUDE.md). No small PRs (review-cycle overhead per PR is fixed; 50-LOC PRs aren't worth it). No huge PRs (anything ≥500 needs to split). Bundle small adjacent gaps into ~250-LOC slots; split anything that overflows along a natural seam.

Use the **test:compare prompt template** (`$HOME/github/blazetrailsdev/test-compare-prompt-template.md`) when spawning un-skip agents.

### Audit (read-only research, no GitHub PR)

**Goal:** read the Rails feature + test surface end-to-end, identify obvious impl gaps in our codebase, file specific work slots.

**Hard rule:** no source/test code changes, no PR. Deliverable is a single `/audit-report <slug> <markdown>` invocation. See `$HOME/github/blazetrailsdev/audit-prompt-template.md` for the dispatch template.

**Audit body structure:** Coverage (what was read) → Gap inventory (each gap typed `missing` / `partial-impl` / `signature-drift` / `test-helper-gap` / `fixture-gap` / `annotation-drift`, with file+symbol, Rails reference, estimated LOC, tests it would unblock) → Suggested work-PR slots (each ~220–280 LOC).

**Step 0 — unported-files gate.** Before proposing any implementation slot, check `scripts/api-compare/unported-files.ts`. If any Rails source in scope is in `UNPORTED_FILES` (by `pattern` or `testFile`), propose **exclusion**, not implementation.

### Work PRs (after audit)

Use the standard test:compare prompt template at `$HOME/github/blazetrailsdev/test-compare-prompt-template.md`. Substitute `<TARGET FILE>`, `<RAILS REFERENCE>`, `<BUCKET>`, `<EXPECTED COUNT>`. The template enforces: 1:1 Rails-port for test names + variables + function calls; `BLOCKED:` / `ROOT-CAUSE:` / `SCOPE:` annotation format; "workarounds = bugs" rule; per-test loop (pass / surgical fix ≤20 LOC / sharpen-and-skip); `/post-merge-findings` reporting; `defineSchema` + `AR_NO_AUTO_SCHEMA` test-helper conventions.

### Per-test loop

For each `it.skip(...)` (or `xit(...)`, `test.skip(...)`, `describe.skip(...)`):

1. Attempt to un-skip and run.
2. **Pass** → un-skip, commit.
3. **Failing with surgical fix (≤20 LOC, in-scope)** → fix, un-skip, commit.
4. **Failing with deep gap** → leave skipped; upgrade the annotation to the format below.

## Skip annotation format

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

### Unported alternative

For permanently-not-portable tests (Ruby-only — Marshal/YAML/GVL/fork/Rake/dbconsole), use the `PERMANENT-SKIP` form and add the file/test to `scripts/api-compare/unported-files.ts`:

```ts
// PERMANENT-SKIP: Ruby-only (see scripts/api-compare/unported-files.ts) — <category>
```

Categories: `marshal`, `yaml`, `psych`, `gvl`, `fork`, `rake`, `pty`, `dbconsole`, `message-pack`, `future_result`, `ruby-encoding`, `env-tz`, `protected-params`, `ruby-module-semantics`. Add new kebab-case slugs as needed.

## BLOCKED vocabulary

| Category                   | Meaning                                                                                                                                                                                                         |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKED: STI`             | Single-table inheritance routing                                                                                                                                                                                |
| `BLOCKED: associations`    | Specific association feature (specify which: habtm / inverse / through / ...)                                                                                                                                   |
| `BLOCKED: encryption`      | Encryption subsystem gap                                                                                                                                                                                        |
| `BLOCKED: schema`          | Schema introspection / dumper / definition gap                                                                                                                                                                  |
| `BLOCKED: transactions`    | Transaction / savepoint / isolation gap                                                                                                                                                                         |
| `BLOCKED: query-cache`     | Query cache behavior                                                                                                                                                                                            |
| `BLOCKED: load-async`      | Async query / future result — likely permanent → `unported-files.ts`                                                                                                                                            |
| `BLOCKED: GVL`             | Ruby thread / GVL — likely permanent → `unported-files.ts`                                                                                                                                                      |
| `BLOCKED: serialization`   | Ruby Marshal / YAML round-trip — likely permanent → `unported-files.ts`                                                                                                                                         |
| `BLOCKED: rake`            | Rake / dbconsole shell-out — likely permanent → `unported-files.ts`                                                                                                                                             |
| `BLOCKED: fixture`         | Test needs a fixture set ported to TS. **Stays BLOCKED (not PERMANENT-SKIP).** TS-native fixture infrastructure shipped via `defineFixtures` / `useFixtures`; per-cluster fixture data folds into cluster work. |
| `BLOCKED: migration`       | Migration runner feature                                                                                                                                                                                        |
| `BLOCKED: connection-pool` | Connection pool / handler / pool config gap                                                                                                                                                                     |
| `BLOCKED: relation`        | Relation API gap (specify which: where / scope / batches / ...)                                                                                                                                                 |
| `BLOCKED: i18n`            | I18n message / translation gap                                                                                                                                                                                  |
| `BLOCKED: validation`      | Validator behavior gap (specify which: uniqueness / length / numericality / ...)                                                                                                                                |
| `BLOCKED: type`            | Type cast / serialize / deserialize gap (specify which Type)                                                                                                                                                    |
| `BLOCKED: adapter-pg`      | PostgreSQL-specific adapter gap                                                                                                                                                                                 |
| `BLOCKED: adapter-mysql`   | MySQL-specific adapter gap                                                                                                                                                                                      |
| `BLOCKED: adapter-sqlite`  | SQLite-specific adapter gap                                                                                                                                                                                     |
| `BLOCKED: range`           | pg/range type behavior                                                                                                                                                                                          |
| `BLOCKED: store`           | `Base.store` / `store_accessor` DSL — per-key getters/setters over a hash-typed column (hstore/json/yaml)                                                                                                       |
| `BLOCKED: unknown`         | Could not categorize from context; needs human triage                                                                                                                                                           |

Cross-file consolidation pass:

```bash
grep -rn "BLOCKED:" packages/activerecord/src --include='*.test.ts' \
  | sed 's/.*BLOCKED: //' | cut -d' ' -f1 | sort | uniq -c | sort -rn
```

## Tracking & cadence

- Run `pnpm test:compare --package activerecord` after each merge.
- Open all PRs as draft; run `/link <PR#>` after opening.
- Per CLAUDE.md: do NOT rename Rails-derived test names.
- After each work PR merges, run `/post-merge-findings` with anything out-of-scope.

## Tests that don't translate to TypeScript / Node

Permanently not-portable tests are excluded via `UNPORTED_FILES` in `scripts/api-compare/unported-files.ts` (whole-file entries with `testFile`, or per-test exclusions via `tests: [...]` for mixed files; optional `className?` for shared-name test classes). This drops them from both the Ruby denominator and the skipped backlog. Foundational exclusion PRs: #1304, #1305, #1391, #1392, #1396, #1397, #1400. Canonical list: YAML / Marshal / Ruby serialization, Ruby concurrency / GVL, process / fork, Rake / dbconsole, fixtures-internal tests, Ruby exception classes / encoding.

---

## Story count

~98 queued batches (some lettered sub-batches: 28b, 86a/b, 121a/b/c, 122a/b, 129a/b/c), ~16k LOC. Batches numbered sequentially; the next-to-ship is the lowest-numbered open batch. test:compare standing at 6568/7885 (83.3%) per snapshot above. GitHub is the source of truth for which batches have PRs in flight — search `feat(activerecord): batch N` in open PRs.

The `as any` legacy-cast cleanup sweep has been **superseded by `docs/activerecord-type-audit.md`** — the type-audit's 4-wave plan covers the same `(record as any)._readAttribute` / `.save` / `.destroy` removals more precisely. The 2 `bug-suspected` candidates remain in batches below for surgical verification.

---

## Queued batches

Bundled work-PR slots ready to spawn. Items removed as batches ship.

### Batch 3 — schema-dumper fidelity sweep (~110 LOC, risk: low) — bundles #144

Two `schema-dumper.ts` round-trip gaps that should land together (the Batch 144 KNOWN_DSL_TYPES expansion is a prerequisite for the partition tests' DSL emission).

- **PG schema-dump table/partition polish (~80 LOC, was Batch 3).** Unblocked by #1726.
  - ~30 LOC — Wire `tableOptions()` into `schema-dumper.ts:emitTable`. Requires making the dump loop async.
  - ~30 LOC — PG table comment schema dump: forward `adapterTableOpts.comment` in `emitTable`; add `COMMENT ON TABLE` emission after `createTable`.
  - ~20 LOC — PARTITION BY schema dump: 2 `BLOCKED: adapter-pg` partition tests in `SchemaCreateTableOptionsTest` flow through the same `fetchTableOptions → options:` path; need `tablePartitionDefinition` wired correctly + test bodies.
- **Schema-dumper KNOWN_DSL_TYPES expansion (~30 LOC, architectural, was Batch 144).** Followup from #1775. Latent CTAS / SchemaDumper round-trip gap. `schema-dumper.ts#sqlTypeToDsl` lowercases input, matches `SQL_TYPE_MAP` first, falls back to `KNOWN_DSL_TYPES` (only 12 entries). `DSL_HELPER_METHODS` entries missing from `KNOWN_DSL_TYPES` don't round-trip: `timestamptz`, `citext`, `jsonb`, `uuid`, `time`, `json`, `hstore`, `ltree`, `tsvector`, `inet`, `macaddr`, `xml`, `money`, `int4range`/`int8range`/`numrange`/`tsrange`/`tstzrange`/`daterange`. Expand `KNOWN_DSL_TYPES` to cover all `DSL_HELPER_METHODS` entries (or add the corresponding SQL types to `SQL_TYPE_MAP`). Should land before further CTAS / schema-dump fidelity work.

### Batch 14 — Autosave E-series CPK + nested-attributes — needs re-scope

**Audit finding (spawn aborted, no PR):** the three items are each materially deeper than the ~80 LOC estimate. Splitting honestly:

- **`queryConstraintsList` workaround removal — DROP from this batch.** Our impl already returns pk as array for base-class CPK models, mirroring Rails. The scalar-fallback at `autosave-association.ts:600-605` exists because `computePrimaryKey` collapses CPK to "id" via `composite_primary_key? ? (pk.includes("id") ? "id" : pk)` — Rails itself does this (`autosave_association.rb:583-586`). Removing without understanding which existing CPK autosave tests rely on it risks regression.
- **CPK `setIds` un-skip — gated on Batch 20.** The Rails test uses `Cpk::Order` (CPK parent) with `has_many :order_agreements`, requiring auto-derived composite FK `[shop_id, order_id]` on the child. We don't auto-derive composite FKs from CPK parents — that's Batch 20's "composite-FK has-many-through write support" (medium-high risk). Re-list under Batch 20 followup.
- **`nestedAttributesTarget` population — its own batch (~150–250 LOC).** The field lives on `CollectionAssociation` (`collection-association.ts:19`) but `CollectionProxy` (user-facing) doesn't expose or hold the association instance. Plumbing requires exposing inner association on the proxy OR moving the field. Additionally, `assignNestedAttributes` doesn't build child records (built lazily in `processNestedAttributes` at save time) — Rails-faithful `:nested_attributes_order` requires rearchitecting nested-attributes to build eagerly.

### Batch 28b — JoinDependency AliasTracker port (~280 LOC, risk: medium)

Followup from #1768 (28a closed: polymorphic source_type shipped). The remaining JoinDependency-alias tests are at `nested-through-associations.test.ts:1211` ("a table referenced multiple times" — Rails 437) and `:1217` ("scope on polymorphic reflection" — Rails 453); both still skipped pending Rails-canonical alias naming.

Adjacent to Batch 133 (other nested-through fidelity items from #1768). The adapter-aware quoting item there could land first to clean up the string-concat predicates this batch will inherit.

- ~80 LOC — Port test fixtures (`similar_posts`, `ordered_posts`) currently missing from our test file; port Rails test bodies verbatim.
- ~200 LOC — Port `AliasTracker` (Rails `activerecord/lib/active_record/associations/alias_tracker.rb`) so `_addThroughAssociation` emits Rails-canonical alias names (`taggings_authors_join`, etc.) when the same table appears multiple times in a nested-through join. Risk: 30+ currently-passing nested-through join tests must stay green.

### Batch 29 — HMT Slot D + A+B nested-through (~190 LOC, risk: medium)

**Theme:** Test coverage for JoinDependency + `_buildThroughScope` fix for nested-through chaining.

- ~30 LOC — Rails-mirrored test for `Author.joins(:ratings).where("ratings.value": N)` against nested-through chain — **shipped #1991 (BLOCKED)**.
- ~80–120 LOC (B) — Fix `CollectionProxy._buildThroughScope()` (`associations/collection-proxy.ts:2074`) for nested-through (through target is itself a through). Option B preferred: initialize CollectionProxy seed from `DisableJoinsAssociationScope`. Unblocks the #1991 BLOCKED test.
- ~30 LOC (B) — Regular (JOIN-based) `djMembersOrdered` / `djMembersDouble` produce wrong/unordered results when chaining `.where()` or `.reorder()`.
- ~10 LOC — `_dataAvailable()` / `runnableLoaders()` in `preloader/through-association.ts:108-169`. **Reassess before sizing** — current impl mirrors Rails `preloader/through_association.rb:39-68` verbatim; may not be a real divergence.
- ~20 LOC — `source_type` polymorphic-with-sourceType variant of nested-through preload test. **Reassess before opening** — `polymorphic-sti-through.test.ts:140-249` may already cover it.

### Batch 33 — HABTM Slot D options + parent_reflection (~50 LOC, risk: low)

- ~30 LOC — Add `parent_reflection` field to MiddleReflection / target hasMany reflection in HABTM builder (Rails `associations.rb:1884, 1905`).
- ~20 LOC — Tighten `habtmOptions → middle hasMany` to Rails' explicit allowlist; drop leakage of `readonly`/`dependent`/`inverseOf`.

### Batch 37 — HABTM Slot H structural (~200 LOC, risk: high)

**Theme:** Wiring `associationForeignKey` + `destroyAssociations` + distinct reflection.

- ~50 LOC — Wire `associationForeignKey` end-to-end through `createHabtmJoinModel` (target FK on right belongs_to) and `_resolveHabtmJoin`/`loadHabtm`. Today hardcoded as `${underscore(singularize(name))}_id`.
- ~30 LOC — Pass `options.foreignKey` into middle reflection options.
- ~80 LOC — Wire `destroyAssociations` stub in `persistence.ts:1221` into the destroy flow. Then refactor HABTM `beforeDestroy` to `destroy_associations` override module.
- ~40 LOC — Produce distinct hasMany-through reflection for public name (Rails' `has_many name, **hm_options`).

### Batch 39 — Annotation drift sweep (~tests-only) — bundles #57, #75

Three tests-only annotation-normalization passes. Bundle as one sweep PR — pure test housekeeping, no source risk.

- **HABTM annotation drift sweep (was Batch 39).** Re-tag mis-labeled `BLOCKED: habtm` tests. ~160 of 168 are mis-tagged. Re-tag across `has-and-belongs-to-many-associations.test.ts`, `eager.test.ts`, `nested-through-associations.test.ts`, `extension.test.ts`, `inner-join-association.test.ts`, `has-many-associations.test.ts`. Mirror #1641's STI annotation drift workflow.
- **PG network/cidr test cleanup (was Batch 57).** Pure test cleanup; impl gap (pgColumn semantic types) is folded into Batch 132. 3 stub tests in `cidr.test.ts` (`cidr column`, `cidr type cast`, `cidr invalid`) have no Rails source backing — find counterparts or delete. Possible missing file: `adapters/postgresql/inet.test.ts` mirroring Rails' `inet_test.rb` — likely consolidates with Batch 132's network.test port.
- **Schema Slot K annotation normalization (was Batch 75).** **Lands AFTER H-b/I/J.** Annotation normalization across all 128 BLOCKED annotations. Plus `schema change with prepared stmt` remains skipped (needs `adapter.preparedStatements` mode in PG test helper).

### Batch 45 — `Base.adapter` permanent-checkout → leased (architectural)

**Replaces the original Batch 45 leak-audit framing.** Audit found 3 of 5 items already shipped (checkoutAsync always called from withConnection per #1547; withConnection async/await dedupe per #1547; ExecutorHooks.complete resolver wired in `index.ts:11` via `setConnectionHandlerResolver`). The remaining test-suite leak isn't a sweep — it's structural.

**Root cause.** `Base.adapter` (`base.ts:997-1028`) calls `pool.checkout()` and caches the result on `_adapter` indefinitely. Each model permanently holds one pool connection; no checkin. Every test that touches a model leaks until process exit.

**Scope (needs design pass before sizing):**

- Replace permanent checkout with `withConnection`-style lease, OR
- Wire executor-driven release (use `ExecutorHooks` so connections return to pool when the request/test completes).

**Blast radius:** every model and every test in the AR test suite. Needs its own design pass + careful staged rollout (probably behind a flag, then flip).

**Dropped:** `buildAsyncExecutor` returns `null` at `connection-pool.ts:1061` — comment correctly notes JS single-threaded thread-pool N/A. Real semaphore would be ~30-60 LOC + tests but only matters once `Relation#loadAsync` actually fans out (it currently doesn't). Re-open if loadAsync parallelism lands.

### Batch 48 — MySQL active-schema Slot D residual (~50 LOC, risk: medium)

Most items from prior B48 shipped via #1871. Remaining:

- ~50 LOC — `CommandRecorder#changeTable` inversion support if not already covered by `command-recorder.ts:416` (audit found `_changeTable` bulk path may already invert; verify before opening PR).

### Batch 50 — MySQL mysql2-adapter B+C fidelity (~170 LOC, risk: medium)

- ~80 LOC — `Mysql2Adapter` `ConnectionError` branch + abstract `when nil → ConnectionNotEstablished`. Verify/add `DatabaseAlreadyExists` for `ER_DB_CREATE_EXISTS`.
- ~30 LOC — Wire `Rails.error.report` for `report` warning action at both `_flushWarnings` sites (mysql2-adapter.ts:1684 + postgresql-adapter.ts:1165). Blocked on global ErrorReporter singleton.

### Batch 52 — MySQL charset-collation residual (~165 LOC, gated on SchemaDumpingHelper)

**Gated on:** `SchemaDumpingHelper#dump_table_schema` port (live-DB schema-dump → string).

- ~15 LOC — Port `schema dump includes collation` test (Rails `charset_collation_test.rb:79-84`) to `charset-collation.test.ts`.
- ~150 LOC — Targeted SQL-fragment unit tests for the 4 #1568 helpers (DROP-vs-SET default fragment, undefined→null normalization at both sites, NULL-backfill UPDATE shape, comment-clearing). `abstract-mysql-adapter.test.ts` is live-DB only.

Adjacent gap: `abstract-mysql-adapter.ts` `buildCreateIndexDefinition` is a stub returning `{}`.

### Batch 53 — PG UUID Slot B associations + UUID FK binding (~250 LOC, risk: medium)

Plus: 1 test references "migration framework" gap — leave skipped with sharpened annotation.

### Batch 54 — PG virtual-column structural (~120 LOC, risk: medium)

- ~10 LOC — `addColumn` virtual + `comment` option: live-PG test that `changeColumnComment` reaches `pg_description` for virtual columns.
- ~10 LOC — Un-skip `schema dumping` test (`adapters/postgresql/virtual-column.test.ts:90`): `schema-dumper.ts:emitTable` bypasses `prepareColumnOptions` for virtual columns so `as`/`stored` never reach output.
- ~30 LOC — `_schemaLoadPromise` STI cascade regression test (`model-schema.ts:512–541`). Promote `_schemaLoadPromise` onto `SchemaHost` proper to remove the cast.

PG 18 will need `_pgGeneratedClause` server-version gate for `stored: false` → `VIRTUAL`. Single point of change.

### Batch 55 — PG interval secondary cleanups (~50 LOC, risk: low)

**Not in Batch 5.** Optional / cosmetic.

- ~50 LOC (low priority) — Refactor `SchemaDumper.columns()` to route `col.default` through `col.castType?.typeCastForSchema` when available; drop the `Duration` branch from `cleanDefault`. Auto-handles any future type with lossy `toString()`.
- ~50 LOC (optional) — `splitPgDefault` cast-aware numeric→Duration for `pg_get_expr` bare numerics → verbose-format deserialize. **Note:** "bare numeric" theory may itself be a misdiagnosis (per #1637); verify against PG 17+ first.
- ~5 LOC (cosmetic) — Once `t.interval(...)` DSL helper exists, simplify test regex to single alternative.
- Sweep — remove other BLOCKED comments around the codebase referencing the now-disproven `pg_get_expr returns bare numeric` theory.

### Batch 56 — PG long-tail + schema-cache scoped-schema sweep (~200 LOC, risk: low–medium) — bundles #76

PG long-tail Slot E+F+H items + Batch 76's `schema-cache.ts` / `changeColumn` work share the scoped-schema un-skips and benefit from landing together.

- **PG long-tail Slot E+F+H small (~105 LOC, was Batch 56).**
  - ~5 LOC (H) — Generalize `PostgreSQLAdapter.nativeType("datetime")` (~line 4066) to delegate to `this.nativeDatabaseTypes()["datetime"]` instead of `=== "timestamptz"` special-case.
  - ~10 LOC (E) — `schema load scoped to schemas` un-skip (needs `schema-cache.ts` clear).
  - ~20 LOC (E) — `schema dump scoped to schemas` un-skip: `enumTypes()` returns schema-qualified names for non-public schemas.
  - ~20 LOC (F) — Wire `type_for_attribute(column).deserialize(value)` for returned column values.
  - ~50 LOC (F) — PG-specific `fills auto populated columns on creation` test for single-PK IDENTITY (Rails `persistence_test.rb:87`).
- **Schema cross-slot dumper + changeColumn (~95 LOC, risk: medium, was Batch 76).**
  - ~15 LOC (F) — Wire `changeColumn` through `changeColumnForAlter` → `SchemaCreation#accept` (Rails routing).
  - ~20 LOC (E) — `schema load scoped to schemas` un-skip: needs `schema-cache.ts#clear` invalidation. (Overlap with the Batch 56 entry — implement once.)
  - ~50 LOC (E) — `schema dump scoped to schemas` un-skip in enum.test.ts: `enumTypes()` schema-scoped filtering + `with_test_schema` infra. (Overlap with Batch 56 entry — implement once.)

### Batch 59 — Relation typecast on SQL expressions (~unknown, low priority)

Carry-over from PG money slot: 3 BLOCKED tests pointing at generic Relation gaps — `sum`/`pluck` typecast on SQL expressions + `updateAll` BigDecimal serialize. Fold into a Relation cluster when picked up.

### Batch 60 — PG-adapter execInsert + datatype bundle (~140 LOC, risk: low)

Bundle of former B60 (execInsert unify) + B61 (datatype/citext aftermath) + B62 live-integration test to hit the PR target. PG mixin chain piece already shipped (`schemaStatements()` override + `dropTable` delegation in place).

- ~10 LOC — Promote `_instrumentedQueryOnClient` to a named internal helper and dedupe with `execQuery`'s inner lambda.
- ~30 LOC — Unify `execInsert` paths: abstract default (`abstract/database-statements.ts:1375`) bypasses `sqlForInsert` entirely; a separate standalone `execInsert` function (line 390) does the right thing but isn't wired. Wire it in. Then the PG-specific `pk === false` scaffolding (#1567) can be removed.
- ~15 LOC — Register remaining Rails-listed PG types: `Decimal`, `Enum`, `LegacyPoint`, `Vector` (verify which actually matter end-user-facing first — `Date`, `Bytea` already in `type-map-init.ts`).
- ~5 LOC — `schema-dumper.ts` spot-check `t.uuid(...)`, `t.cidr(...)`, `t.point(...)` emission round-trips.
- ~10 LOC — SchemaCache null-pool guard audit on `primaryKeys`/`indexes`/`dataSources`/`views`.
- ~10 LOC — Lift `columnForAttribute` schema-vs-attribute distinction into JSDoc on `model-schema.ts:493`.
- ~10 LOC — `delegated_type.test.ts` `touch account` test blocked on UUID PK + polymorphic touch.
- ~50 LOC — Live PG integration test for `dropTable("parent", { force: "cascade" })` end-to-end. Current tests use a fake adapter.

### Batch 63 — PG UUID Slot C uniqueness async (~60 LOC, risk: medium)

- ~30 LOC — `caseInsensitiveComparison` is async on PG (queries `pg_proc`) but `UniquenessValidator.buildRelation` is sync. **Concrete consequence:** for any non-string non-UUID column type where `canPerformCaseInsensitiveComparisonFor` returns false, `buildRelation` currently passes a `Promise` to `base.where()`, throwing `ArgumentError: Unsupported argument type`. UUID is fixed; other types are latent. Fix options: (a) make `buildRelation` async; (b) expose a sync `canPerformCaseInsensitiveComparisonForSync`.
- ~10–30 LOC audit — `typeObj?.type` was caught as a CI bug post-open (`Uuid.type` is a method, not a property). Audit other `.type` reads off type objects across the codebase.

### Batch 64 — connection-pool wiring tail (~123 LOC, mixed risk) — bundles #101

Two `connection-pool.ts` followups; landing together avoids touching the same file twice.

- **PG connection Slot A + D (~63 LOC, was Batch 64).**
  - ~3 LOC — `tableAliasLength()` override on `PostgreSQLAdapter` returning `this.maxIdentifierLength()`. Blocked by base-class sync `number` return — would widen to `Promise<number> | number`.
  - ~20 LOC — `connection-pool.ts:449,505,522` call `connection.verifyBang()` without `await`. Post-#1464 the PG override is async.
  - Test-infra refactor — Move `SQLSubscriber` from `adapters/postgresql/test-helper.ts` to a shared location when `adapters/abstract-mysql-adapter/connection.test.ts` is un-skipped.
- **Query-cache wiring remainder (~60 LOC; Phase 4 blocked for part, was Batch 101).**
  - ~15 LOC — Wire `Base.cache(&block)` / `Base.uncached(dirties:)` class methods resolving `connectionPool` then delegating to `pool.withQueryCache` / `pool.disableQueryCache`.
  - ~40 LOC (Phase 4, blocked on ConnectionHandler PR 6) — `QueryCache.installExecutorHooks` + `QueryCache.run`/`complete`. Unblocks ~6 pool-attachment tests.
  - ~5 LOC — `dirtiesQueryCache` on `NullPool` (hardcoded `true` at `connection-pool.ts:121`) — Rails also returns `true` unconditionally, nit.

### Batch 65 — PG infinity carry-over (~95 LOC, risk: medium)

- ~80 LOC — `InTimeZone` test helper + `Base.timeZoneAwareAttributes` wiring + `TimeZoneConverter` sentinel-aware wrapping + `reset_column_information` lifecycle. Unblocks 1 remaining skipped infinity test (`assigning 'infinity' on a datetime column with TZ aware attributes`). **Shares the InTimeZone helper with Batch 86a — bundle into whichever ships first.**
- ~5 LOC — Trace `temporalToBindString` PG infinity branch dead-or-not; delete if confirmed.
- ~10 LOC — Properly port `WhereClause#invert` so `buildNegated` doesn't need `callNegated` dispatch in handlers. `RangeHandler.callNegated` collapses to `node.invert()`.

### Batch 66 — PG json bypass + foreign-table (~85 LOC, risk: medium)

- ~5 LOC — Add a model-save round-trip test for TEXT columns with backslash values (e.g. `"a\\b"`) to exercise the Arel inline-quoting path. The regression test uses `executeMutation` (bind params) which doesn't touch `quote()`.
- ~5 LOC — `abstractQuote` Symbol branch still doubles backslashes without E-string.
- ~30–80 LOC — Wire `Base.primaryKey` to consult `adapter.primaryKey(tableName)` for tables without explicit PK (foreign tables). Touches `getPrimaryKeyAttr` `?? "id"` sentinel + `model-schema.ts` PK auto-detection. Un-skips 1 deferred test.

### Batch 67 — PG-adapter Slot C error reporter + splitPgDefault (~140 LOC, risk: medium)

- ~50 LOC — Railtie initializer constructing a default `ErrorReporter`, wiring a basic logger subscriber, calling `setErrorReporter()`. Closes the "Rails.error always exists" gap.
- ~60 LOC — Collapse `splitPgDefault` into `extractValueFromDefault` + `extractDefaultFunction` so parsing lives in the Rails-named instance methods. Update both call sites in `newColumnFromField` (~lines 2671 + 4310).
- ~30 LOC — Apply `:report` dispatch wiring to MySQL/SQLite `db_warnings_action` paths if/when they grow one.

### Batch 69 — Relation test-body bundle (~155 LOC, risk: low)

- ~50–80 LOC (G) — Un-skip `registering new handlers for joins`: scoped association where-clause expansion should propagate custom handlers into the lambda's evaluation context.
- ~100 LOC (B) — Polymorphic test bodies for 7 wired-but-skipped tests in `where.test.ts` (~lines 1014–1073, 1962). Fixture work, not impl.

inBatches deferred test ports (PostWithDefaultScope, `assertQueriesMatch` infra, table-alias path) → Batch 136.

### Batch 74 — Schema Slot H-b includes/where promotion (~60 LOC, risk: medium)

- ~5 LOC — `whereBang` in `query-methods.ts` should call `PredicateBuilder.references(opts)` for hash args (Rails `where!` auto-adds table refs). Unblocks `includes(:assoc).where("assoc.col": val)` auto-promotion without explicit `.references()`.
- ~50 LOC — HABTM support in `JoinDependency.addAssociation` (currently returns null for `"hasAndBelongsToMany"` type). `_addHabtmAssociation` analog to `_addThroughAssociation`. Prereq for Rails-exact `Song.includes(:albums).where(...)` form.
- ~5 LOC — `defaultJoinTableName` in `associations.ts` should derive from `model.tableName` not class name; currently loses schema prefix for `music.songs`-style tables.

### Batch 77 — Schema scoped dump deeper (~125-200 LOC, risk: medium)

- ~50–200 LOC (E) — `dumping schemas` / `dump foreign key targeting different schema` / `Active Record basics` (SchemaWithDotsTest) — root-caused to incomplete `schema.ts`. Fold into a schema-dumper-specific slot.

### Batch 78 — Schema-dumper recent batch #1472 (~30 LOC, risk: low)

- ~30 LOC — `MigrationContext.createTable` passes abstract `TableDefinition` to the callback; `t.exclusionConstraint`/`t.uniqueConstraint` aren't callable from schema-file blocks. Rails emits them inline. Fix: instantiate `PgTableDefinition` when `adapterName === "postgres"`, then exclusion/unique constraints can move inline. Closes the Sweep D Item 1 partial-ship.

### Batch 80 — Transactions update-setter fidelity (~20 LOC, risk: medium)

- ~20 LOC — Deeper `update should rollback on failure!` fidelity: needs `update()` to call property setters (not just `writeAttribute`) so `replyIds: []` collection-clear works inline. Pre-existing: Rails `assign_attributes` calls setters; our writeAttribute loop doesn't.

### Batch 81 — Transactions dirty-tracking new-record rollback (~50 LOC, risk: high)

- ~50 LOC — Dirty-tracking for new-record rollback: `topic.changes["title"]` returns `undefined` instead of `[null, "Jeff"]` after rollback. Root cause deeper than sweep A's guard fix — `state.attributes` snapshot in `rememberTransactionRecordState` captures user-written values, so `redetectChanges` produces no diff. Fix: snapshot _DB-original_ values (null for unsaved new records), or add separate DB-original tracking.

### Batch 86a — Timezone-aware attribute methods (~150 LOC, risk: medium)

Closes the `BLOCKED: type` cluster in `attribute-methods.test.ts:908,912` ("time attributes are retrieved in the current time zone", "setting time zone-aware attribute in other time zone") plus PG `timestamp.test.ts:140,149` ("timestamp with zone values with/without rails time zone support"). Shares the `InTimeZone` test helper + `TimeZoneConverter` sentinel-aware wrapping with Batch 65 — coordinate so only one batch ports the helper.

- `Base.timeZoneAwareAttributes` wiring on read path (currently `date-time-precision.test.ts:134` notes "not yet wired").
- `TimeZoneConverter` integration with `serialize`/`deserialize` round-trip.
- `reset_column_information` lifecycle (test helper to flip `timeZoneAwareAttributes` mid-test).

### Batch 86b — Unknown-triage deferred misc (~80 LOC)

Catch-all for the BLOCKED:unknown stubs surfaced by `audit-unknown-blocked` that didn't fit a dedicated cluster. Re-audit before picking up — likely splits further once concrete tests are named.

### Batch 90 — AR query-parity datetime precision (~80 LOC, risk: medium)

**Goal:** `Order.where(created_at: oneWeekAgo..now).toSql()` emits second-precision SQL matching Rails' `quoted_date` (no fractional seconds for unscaled DATETIME columns).

**Root cause.** Trails inlines dates from `Quoted` nodes with full precision. Added bind extraction for `compileWithBinds`, but `toSql()` still inlines.

**Options:**

- **Option A (BindParam-first, ~80 LOC):** In `predicate-builder/basic-object-handler.ts` + `range-handler.ts`, wrap Date values in `new Nodes.BindParam(queryAttribute)` instead of `Quoted`. Add a `quotedDateForBind` branch in `visitBindParam` that truncates to seconds. Don't change `visitQuoted` (INSERT precision preserved).
- **Option B (parity-runner side):** `paramSql` + binds comparison would close this in the diff layer without trails code changes.

**Risk:** Medium — touches every WHERE clause in the suite. Files (Option A): `predicate-builder/basic-object-handler.ts`, `predicate-builder/range-handler.ts`, `arel/src/visitors/to-sql.ts#visitBindParam`, plus `scripts/parity/fixtures/ar-01/`, `ar-52/`, `ar-65/`.

### Batch 93 — Test residuals multi-DB infra (~150 LOC, risk: medium)

- ~20 LOC — `reconnect after bad connection on check version` test: pg-npm pool has no single-connection version-stub hook. Needs `_databaseVersionForTest()` setter or injectable version-check hook.
- ~100–150 LOC — Second named connection pool equivalent to Rails' `ARUnit2Model` in the test suite. Unblocks `MultiDbMigratorTest` ×7 (#1531) + `PrimaryClassTest` ×2.

### Batch 94 — Audit aftermath bundle (~110 LOC, risk: low) — bundles #98

Two post-audit polish items; bundle to clear both above the no-tiny-PRs floor.

- **Sweep B test-infra (~90 LOC, was Batch 94).** ~50 LOC `with_env_tz` test-infra (stub `defaultSqlTimezone()` per-block via a module-level `_defaultSqlTimezoneOverride` + `withEnvTimezone(zone, fn)` test helper). Unblocks 2 base.test.ts tests. ~10 LOC `HashAccessor.write` json-branch regression test (path is correct today; needs a defensive test). ~30 LOC `SchemaDumper.fkIgnorePattern` configurability vs `ForeignKeyDefinition.isExportNameOnSchemaDump` hardcoded `fk_rails_` pattern. Either make `isExportNameOnSchemaDump` accept the configured pattern, or deprecate `fkIgnorePattern`.
- **`as any` audit verify (~20 LOC, was Batch 98).** Verify 2 `bug-suspected` candidates from the as-any audit: `relation.ts:4965` `(this.spawn() as any).asyncBang()` (possible swallowed promise) + `abstract/database-statements.ts:1827` `(relation as any).arel()` (verify sync on every host). If real, surgical fixes.

### Batch 95 — Sweep A reverts (need re-design, ~55 LOC)

- ~5 LOC — Remove `RangeType.encodeLiteral` pre-serialization workaround. Reverted: still load-bearing — removing it broke `range.test.ts > where by attribute with range`.
- ~20 LOC — Fix the BindParam route for range WHERE predicates so range values quote correctly. Unblocks the `RangeType.encodeLiteral` removal.
- ~30 LOC — `validateForeignKey` `!fSchema → public` heuristic. Reverted: the `pg_namespace` join diverged from Rails (which uses `t2.oid::regclass::text` + `search_path`).

### Batch 97 — Recent sweep TableDefinition + typeCastedBinds (~105 LOC, risk: medium)

- ~5 LOC — `typeCastedBinds` in `abstract/quoting.ts:~490` duplicates the one in `abstract/database-statements.ts` and still uses the old `typeof b.valueForDatabase === "function"` check. Unify to the getter-aware `"valueForDatabase" in b` form.
- ~50–100 LOC — `TableDefinition.toSql()` in `abstract/schema-definitions.ts:~926-1095` still branches on `_adapterName` for type SQL (SERIAL vs BIGINT AUTO_INCREMENT, BYTEA vs BLOB, etc.). Largely redundant with `SchemaCreation.typeToSql()` + `SchemaCreation.visitTableDefinition()`. Route through `SchemaCreation.accept()` and delete `toSql()`.

### Batch 100 — Autosave A preloader migration (~20 LOC, risk: low)

- ~20 LOC — Preloader → `associationInstanceSet` migration. ~5 `_preloadedAssociations.set` write sites remain (preloader/association.ts ×2, preloader/batch.ts ×1, relation.ts ×2). Update to call `record.associationInstanceSet(name, association)`; once done, `_loadedAssociation` collapses to a one-line Rails-shaped pure read.

### Batch 103 — Fixtures HABTM/CPK + enum (~50 LOC)

- ~10 LOC — `Company.status` as a true enum (currently declared `integer`); add `Model.enum("status", { ... })`. Deferred — no test currently relies on enum dispatch.
- ~30–50 LOC — HABTM/CPK join-row support in `defineFixtures`. The `Array.isArray(pk)` early throw at `define-fixtures.ts:163-167` blocks loading `DevelopersProject` CPK fixtures.

### Batch 104 — delegatedType (post-#1719 leftovers) (~25 LOC)

- ~15 LOC — `${role}Class` returns `resolveModel(foreign_type)` (instead of raw string); update existing `delegated class` and `delegated class with custom foreign_type` tests to register classes + assert `toBe(MessageClass)`. Then `${role}Name` mirrors Rails via `${role}Class.modelName.singular`.

### Batch 105 — Arel + activemodel type cleanup (~80 LOC)

- ~30 LOC — Tighten `normalizes()` overload from rest-param `[...string[], fn | Record]` to a discriminated union. Eliminates remaining `as unknown as string[]` casts and rejects invalid runtime calls at compile time.

### Batch 106 — Column#default lazy-deserialize (~30 LOC + 100-200 test-infra)

- ~30 LOC — Promote `sqlType` from optional on `Column` (abstract schema-dumper) to the `ColumnInfo` base interface.
- ~100–200 LOC (test-infra, not impl) — Fixture-table infra to unblock 13 remaining skipped tests (`MysqlDefaultExpressionTest` ×9, `DefaultsTestWithoutTransactionalFixtures` ×2, `PostgresqlDefaultExpressionTest` ×1, `Sqlite3DefaultExpressionTest` ×1).

### Batch 107 — MessageSerializer double-base64 (architectural, ~30 LOC)

- ~30 LOC — `MessageSerializer.encodeIfNeeded` double-base64 fix. **Architectural**: requires `Aes256Gcm` to store raw bytes (not base64 strings) in headers — a _breaking change_ for existing stored ciphertexts. Only ship with a migration path.

### Batch 108 — api:compare regression guard (process)

- **Process improvement** — `_`-prefix renames on Rails-named methods silently drop them from `api:compare` surface. Consider extending the `rails-private-jsdoc` ESLint rule to flag `_`-prefixed methods whose Rails counterpart is non-underscored. Permanent guardrail against the regression class.

### Batch 113b — calculations.test.ts mega-describe defineSchema (~150–250 LOC, risk: medium)

Followup from #1843. The single `describe("CalculationsTest", ...)` block at `calculations.test.ts:~2873` spans ~4200 LOC and still relies on auto-schema. 24 tables involved (`accounts`, `authors`, `conversations`, `orders`, `people`, `posts`, `products`, `rg_*`, `sl*`, `topics`, `users`, `vehicles`). Multiple tables share attribute names with conflicting types (e.g. `status` is `integer` in one subtest, `string` in another) so a single merged `defineSchema` won't work — split into sub-describes by table-set or use per-test `defineSchema` calls. Accounts for ~152 remaining failures in calculations.test.ts under `AR_NO_AUTO_SCHEMA=1`.

### Batch 120 — Virtual-attribute persistence path (~unknown, risk: medium)

Followup from #1749. Two tests currently skipped:

- `model with nonexistent attribute with default value can be saved`
- `attributes not backed by database columns return the default on models loaded from database`

Both silently passed under auto-schema because the DDL created a column from the `attribute()` declaration. Under `AR_NO_AUTO_SCHEMA=1` the real gap surfaces: trails INSERT path writes the non-existent column. Rails treats these as virtual attributes (not persisted, default returned on read). Rails source ref: `vendor/rails/activerecord/test/cases/attributes_test.rb:131, 305`.

- Skip non-DB-backed attributes when building the INSERT column list + when reading back from DB rows. Filter to schema-known columns. Then un-skip the two tests above.

### Batch 123 — Inflector `Human → humans` irregular pin (~5 LOC)

Followup from #1752. Trails' inflector pluralizes `Human → humen` (the `man → men` irregular fires on `-man` suffix). Rails' inflector treats `human → humans` correctly. Add `inflect.irregular("human", "humans")` to `packages/activesupport/src/inflector/inflections.ts` to override the `man → men` fallthrough.

Note for future migrators: until this lands, defineSchema tables for `Human`-modeled fixtures must be named `humen`.

### Batch 125 — Top-level `const adapter = freshAdapter()` audit (~tests-only sweep)

Followup from #1751. Latent bug pattern surfaced: top-level `const adapter = freshAdapter()` inside `describe()` shares one adapter across all tests, no cleanup. Convert to `let` + `beforeEach`.

```
grep -nE "^\s+const adapter = freshAdapter\(\)" packages/activerecord/src/*.test.ts
```

### Batch 130 — enum string-status describe cleanup (~30 LOC, risk: low)

Followup from #1747. Four "string status" Post tests hardcode `tableName = "string_status_posts"`; the table has no Rails analogue and exists only because the file declares `posts.status` as both integer and string in different `it()`s. Collapse by hoisting a `describe("EnumTest with string status", …)` with a single class declaration + rename the model `tableName` consistently, then drop `string_status_posts` from `TEST_SCHEMA`.

### Batch 134 — counter-cache resetCounters fidelity (~120 LOC, risk: low)

Followup from #1769. Distilled from triage annotations on the 7 remaining `resetCounters` skipped tests.

- ~10 LOC — Modular (namespaced) class-name resolution in `resetCounters` target lookup (covers "reset counters with modular association" and "reset counters with modularized and camelized classnames").
- ~10 LOC — Honor `reflection.options.className` in `resetCounters` target resolution ("reset counter with belongs_to which has class_name").
- ~15 LOC — Disambiguate two `belongs_to` to the same target class via reflection name ("reset the right counter if two have the same class_name" / "same foreign key").
- ~10 LOC — Short-circuit UPDATE when `SELECT COUNT(*)` matches stored value ("reset counter skips query for correct counter").
- ~15 LOC — Composite-PK WHERE generation ("reset counters for cpk model").
- ~30 LOC — Through-reflection branch: walk to join model and count via that table ("reset counter of has_many :through association").
- ~15 LOC — Apply reflection scope (`select`, `where`) when composing the COUNT ("reset counter works with select declared on association").

### Batch 136 — inBatches deferred follow-ups (~135 LOC, risk: low)

Followups from #1770.

- ~15 LOC — `useRanges` empty-scope auto-detection: compare `relation.toSql()` against `unscoped.all.toSql()`. Rails uses `(empty_scope && use_ranges != false) || use_ranges`; we only honor explicit `useRanges: true`.
- ~30 LOC — Multi-column lexicographic `useRanges` (extend to call `applyFinishLimit` instead of building flat `gteq.and(lteq)`). Today composite cursors silently fall back to `IN (...)`.
- ~20 LOC — Port `find in batches should ignore the order default scope` (inline `PostWithDefaultScope` with `defaultScope(rel => rel.order("title"))`; assert batch order is by id).
- ~40 LOC — `assertQueriesMatch` test helper (SQL pattern matcher) + port `find in batches should quote batch order` (+ `_with_desc_order`).
- ~30 LOC — `Relation.create` test infra + port `.find_each respects table alias`.

### Batch 138 — connectsTo polish + Person fixture (~50 LOC, risk: low)

Followups from #1776.

- ~20 LOC — Fold the SQLite + URL-passthrough branches of `establishWithConfig` into `buildAdapterArg` so both entry points share a single normalizer.
- ~30 LOC — Fixtures-style `Person` test model (or expand existing) so the un-skipped `establishing a connection in connected_to block uses current role and shard` test loads seeded rows and exercises `Person.first` like Rails does. Closes the shape gap (currently creates `people` inline).

### Batch 139 — insert-all option-surface + verifyAttributes via schemaCache (~190 LOC, risk: medium)

Followups from #1786.

- ~30 LOC — Thread `returning` / `recordTimestamps` through non-bang `Relation#insertAll` / `#insert` / `#upsertAll` / `#upsert` (and forward in `querying.ts`). Closes the bang/non-bang option-surface divergence (Rails accepts both kwargs on bang AND non-bang at `relation.rb:723, 765, 790, 910`).
- ~50–80 LOC — Switch `insert-all.ts#verifyAttributes` allowlist from `attributeNames()` to `schemaCache.columnsHash` lookup. Requires making constructor async (schema-cache reads are async) or pre-fetching in `InsertAll.execute`. Removes the `known.size === 0` soft-fail and matches Rails exactly.
- ~150 LOC (tests-only) — Sharpen remaining single-line `BLOCKED:` annotations in `insert-all.test.ts` (STI cluster, hasManyThrough, table-name-with-database, MySQL `VALUES()` raw SQL, type-cast+serialize consistency) into BLOCKED/ROOT-CAUSE/SCOPE format. Follow-on to #1786's first pass.

### Batch 140 — scope_for_create + CollectionProxy refactor (~150 LOC, risk: medium)

Followups from #1782.

- ~30 LOC — Drop redundant `{...this.scopeForCreate(), ...attrs}` pre-merges in `AssociationRelation#build/create/createBang` (association-relation.ts:62, :82, :105). Centralized application in base now covers them.
- ~40 LOC — Composite-FK / `queryConstraints` handling in `CollectionProxy._buildRaw` (collection-proxy.ts:660-666). Pre-existing on `main`. `[foreignKey as string]` stringifies arrays into `"a,b"`; should zip FK columns with PK components like `push()` does. Also falls back to `options.queryConstraints`.
- ~80 LOC — Move `CollectionProxy` off direct construction onto a real `Association` instance so `_applyScopeForCreate` collapses to the base helper. Eliminates the two-implementations risk (proxy's local `skipAssign` computation vs base's rich reflection).
- Rails-divergence note worth a ticket: CollectionProxy STI peek (`scope.type` selecting subclass before `new`) deviates from Rails' `Association#build_record` which constructs base class first. Probably a real Rails bug — file upstream.

### Batch 141 — Batch 37 prerequisite: destroyAssociations wiring (~40 LOC, risk: low)

Followup from #1781. Blocks the larger Batch 37 work.

- ~30 LOC — Wire `destroyAssociations` (no-op stub at `persistence.ts:1236`) into the standard `destroy()` flow. Then delete the `beforeDestroy` bridge install + `HABTM_DESTROY_INSTALLED` flag from `has-and-belongs-to-many.ts:241-254` (translation-layer hack from #1781).
- ~10 LOC — Switch HABTM `handleDependency()` to explicit `deleteAll("deleteAll")` to match Rails' strategy, decoupling join cleanup from the middle's `dependent:` option.

### Batch 142 — HMT composite-PK guards + typed errors (~50 LOC, risk: low)

Followups from #1774.

- ~10 LOC — `habtmOwnerPk`-style composite-PK guard in `buildHabtmThroughRecord`: throw `ConfigurationError` instead of producing undefined join FKs when `ownerPk` resolves to an array.
- ~15 LOC — Convert plain `Error` throws in `buildHabtmThroughRecord` to typed `ConfigurationError` / `HasManyThroughAssociationNotFoundError` (aligns with `associations/errors.ts`).
- ~20 LOC (conditional) — `@through_records` per-target cache in `HasManyThroughAssociation` (Rails' `compare_by_identity` hash). Only worth doing if double-build patterns surface in practice — `concat([x, x])` would create two join rows where Rails reuses one.
- ~5 LOC — Drop `validate:` propagation in `saveThroughRecord` to align with Rails' unconditional `save!` (only if a parity-test failure surfaces).

### Batch 143 — Migration introspection + Ruby-parity small items (~10 LOC, bundle with other migration work)

Followups from #1775. Tiny — bundle with future migration/schema-dump work per "no tiny PRs".

- ~3 LOC — PG `numeric(p)` no-scale: skip scale in `_introspectColumns` when `numeric_scale === 0` AND raw type has no comma (avoids dumping as `decimal(p, 0)`).
- ~5 LOC — PG `interval(p)` precision: `_normalizeIntrospectedType` doesn't map `interval`; add `interval → {type:"interval", precision}` and include in the dtPrec propagation conditional.
- ~2 LOC — `migrationsStatus` sort regex `/^\s*(-?\d+)/` accepts `-` but not `+`. Use `/^\s*([+-]?\d+)/` then `BigInt` for Ruby `String#to_i` parity.
- ~1 LOC — `smallserial` integer-byte miss: add `smallserial: 2` to `intByteLimit` (PG `smallserial` is backed by `int2`).

### Batch 145 — BeforeTypeCast alias sweep + ForDatabase test + naming polish (~75 LOC, risk: low)

Followups from #1790. Per-attr `<attr>BeforeTypeCast` getter generation shipped; the followups close adjacent gaps.

- ~30–50 LOC — Sweep other `<attr>_before_type_cast` tests across types (decimal/datetime/integer/json/array) currently skipped with "BTC alias not generated" root-cause. Grep `it.skip.*before.type.cast`; un-skip and port bodies.
- ~10 LOC — Wire `<attr>ForDatabase` aliases into a test to lock in the contract (currently only `<attr>BeforeTypeCast` is exercised via "cast value on write").
- ~15 LOC — Decide whether `savedChangeTo<X>Values` (predicate-vs-values disambiguation needed because TS method names can't carry `?`) should be the standard across all generated dirty methods. If yes, audit + rename for consistency; if no, document the divergence.
- Doc-hygiene: Move `it.skip("yaml round trip with store accessors")` in `hstore.test.ts` to the permanent-skips list (Ruby YAML/Marshal, no Node.js equivalent).

---

## B-series followups (post-merge findings track)

Batches identified via `/post-merge-findings` reports — `B<id>` numbers come from the audit's internal IDs, not the sequential `Batch <N>` queue. Listed separately so the numerical-batch queue stays clean. Treat as queued work; bundle with adjacent numerical batches when files overlap.

### Batch B127 — Metal \_performed flag removal (~30 LOC, risk: low)

Followup from #1799. Touch `abstract-controller/base.ts`, `action-controller/base.ts:137,195,228,484,510,532`, `action-controller/api.ts:29,41`; every `markPerformed()` caller must assign `_responseBody` first. `renderToString` snapshots `_status`/`_contentType`/`_headers` — cleaner future path is a `renderToBody`-style helper.

### Batch B119 — collection-proxy inversing dedup (~80 LOC, risk: medium)

Followup from #1801. Unblocks 6 skips at `inverse-associations.test.ts:~168,174,180,186,192,229`. Needs collection-proxy `<<`/`build`/`load` dedup; `replaceOnTarget` (`collection-association.ts:748`) should accept `inversing` param and hold `_replacedOrAddedTargets` WeakSet. Cleanup: `associations.ts:1047` casts `_cachedAssociations.get(assocName)` to `Base[]` unconditionally — add `Array.isArray` guard.

### Batch B110 — MySQL adapter fidelity sweep (~250 LOC, risk: medium) — bundles B131, B49

Three `mysql2-adapter.ts` / `mysql/schema-statements.ts` followups. May split into two PRs (interface polish + columns/defaults) if review burden warrants; otherwise land as one bundle.

- **B110 MySQL adapter interface polish (~90 LOC, was B110).** Followup from #1802. ~20 LOC add `createTableDefinition?` to `DatabaseAdapter` interface (drop `as unknown as {…}` cast at `abstract/schema-statements.ts:153–157`); ~30 LOC memoize `Mysql2Adapter#schemaStatements()` (`mysql2-adapter.ts:916`); ~40 LOC dedup `assertSafeMysqlIdentifier` (currently in `mysql/schema-creation.ts` + `abstract/schema-definitions.ts#toSql:~1148–1166, ~1250–1259`). Wire or delete the unused `mysql/schema-statements.ts:112` free helper.
- **B131 MySQL column metadata + default parsing (~120 LOC, was B131).** Followup from #1811. ~80 LOC port `new_column_from_field` default-function parsing (`CURRENT_TIMESTAMP`, `DEFAULT_GENERATED`, text-default unescape) into `Mysql2Adapter#columns` (`mysql2-adapter.ts:1082`) — share with logic already in `renameColumnForAlter`. ~40 LOC thread `MySQL::TypeMetadata` through `Mysql2Adapter#columns` → `MysqlColumn`; `autoIncrement`/`virtual` become getters off `typeMetadata.extra`; drop three explicit booleans + `__mysql` JSON discriminator in `schema-cache.ts:rehydrateColumn`. (B131 plan also has RecorderTableProxy Proxy rewrite ~60–100 LOC + mysqlQuote ANSI_QUOTES passthrough ~20 LOC still deferred.)
- **B49 MySQL columns helper extraction + bare-keyword defaults (~40 LOC, was B49).** Followup from #1880. ~10 LOC extract `requiresCreateTableInfo(field)` helper from `mysql/schema-statements.ts`, consume from `AbstractMysqlAdapter#columns` — eliminates drift between `newColumnFromField` branching and `needsCreateInfo` heuristic. ~30 LOC mirror bare-keyword function-default detection in `Mysql2Adapter.columns()` via `SHOW CREATE TABLE` for fields hitting broader branch — closes rename-fallback quoting gap (rare path). Larger architectural: ~50 LOC investigate `SchemaAdapter` wrapper forwarding for adapter-level overrides so `supportsBulkAlter` branch can be removed.

### Batch B128 — quoteDefaultExpression column forwarding (~40 LOC, risk: low)

Followup from #1810. `query-cache.ts:444–447` and `test-adapter.ts:1178–1181` `quoteDefaultExpression` delegates drop the `column` arg — forward it so `options.array`/`sqlType` survive. Also wire `schema-ar-models.markPhase5(adapter)` into `schema.test.ts` + `schema-authorization.test.ts`. Do NOT move the `[]`-strip inside `normalizeFormatType` (would silently break OID type-casting).

### Batch B132 — PG IPAddr + migration table-definition delegation (~160 LOC, risk: medium)

Followup from #1812. ~30 LOC fix IPAddr default-value stringification in schema dumps — render `"192.168.1.1"` not `{ address, prefixLength: 32 }`. ~80–120 LOC `migration.ts:1908` constructs abstract `TableDefinition` directly; delegate to `adapter.createTableDefinition` so PG/MySQL shorthand helpers work in migration replay. ~30 LOC `IPAddr` IPv6 IPv4-mapped preservation (`oid/cidr.ts`) — `::ffff:192.168.0.1` currently compresses to `::ffff:c0a8:1`. ~20 LOC pipe `TableDefinition#toSql` default branch through `adapter.typeToSql`.

### Batch B35 — join-dependency / HABTM aliasing sweep (~130 LOC, risk: medium) — bundles B133

Two `join-dependency.ts` followups touching adjacent code paths.

- **B133 polymorphic-source through-reflection (~80 LOC, was B133).** Followup from #1813. ~50 LOC port `ThroughReflection#check_validity!` polymorphic-source branch; collapses `return null` guards at `join-dependency.ts:189–197,738`. ~30 LOC extend `loadHasManyThrough` `sourceType` handling (`associations.ts:1320–1336`) to nested-through with polymorphic source. Rails-431 regression test still missing — gated on the loader fix.
- **B35 schema-qualified HABTM table aliasing (~50 LOC, was B35).** Followup from #1869. Schema-qualified HABTM tables in `_addThroughAssociation` / `addAssociation` in `join-dependency.ts`: dotted table name leaks as single quoted identifier. Extract `quoteSchemaQualified(name)` helper.

### Batch B135 — counter-cache faithful path + test isolation (~50 LOC, risk: medium)

Followup from #1815. ~30 LOC collapse `updateCounterCaches` (`associations.ts`) into the Rails-faithful `_createRecord`/`destroyRow` path (`counter-cache.ts:319–348`); removes touch forwarding at `associations.ts:2099–2107`. Confirm `counter-cache.ts:319–348` is actually dead (no imports into `base.ts`). Test isolation: `counter-cache.test.ts` leaks `Topic` into global `modelRegistry`; add `beforeEach` registry cleanup.

### Batch B70 — Relation CPK through/HABTM finish (~120 LOC, risk: medium)

Followup from #1817. `_resolveThroughJoin` and `_resolveHabtmJoin` not updated for composite-PK — likely still throw. `relation.ts:573–588` fallback path (unregistered model) diverges from registered-model path on composite-FK — unify or document. CPK placeholder tests at `batches.test.ts:1657–1709` are boilerplate-only and need real assertions (can't rename per CLAUDE.md). `batchOnUnloadedRelation` `remaining` limit cap and `inBatches({ load: true })` batch-order wiring both flagged unwired — add regression tests.

### Batch B92 — targetScope SQL fix + async cache invalidation (~180 LOC, risk: high)

Followup from #1819. `targetScope` currently generates broken SQL outside JOIN context (`SELECT "tts_targets".* … WHERE "tts_joins"."active" = TRUE`); dead in 2-step loaders but wiring breaks unless fixed first. Options: (1) strip table-qualifier off intermediate predicates before merging, or (2) gate `targetScope` to JOIN-based eager_load path only. Plus ~15 LOC unmerged Copilot fixes: `super["targetScope"]()` → `super.targetScope()` in `has-one-through-association.ts:32` + `has-many-through-association.ts:35`, try/catch around `chain[i]?.klass`, `Relation#unscope(...)` on intermediate scope before merge. Remaining B92 work: non-preload JOIN-based eager loading (~50 LOC), scoped `has_one_through` lambda scope (~80 LOC), `associationScope` cache invalidation (~30 LOC).

### Batch B73 — SQLite adapter cleanup (~50 LOC, risk: low) — bundles B126

Two adjacent `sqlite3-adapter.ts` followups.

- **B126 pragma_table_list helper + plan correction (~20 LOC, was B126).** Followup from #1807. Plan entry "checkVersion floor 3.37" was wrong — Rails source uses `< "3.8.0"`. `tables()`/`tableExists()` use `pragma_table_list` (requires 3.37+) but `checkVersion` only enforces 3.8.0 — same gap as Rails. Cosmetic: extract shared `pragma_table_list` helper for `tableExists` + `dataSourceExists` (`sqlite3-adapter.ts:1372–1412`).
- **B73 dead SQLite addTimestamps adapter override (~30 LOC, was B73).** Followup from #1833. `Migration#addTimestamps` calls `this.schema.addTimestamps` (base), not `adapter.addTimestamps` — SQLite3Adapter override at `sqlite3-adapter.ts:1084` is dead code from the migration path. Either wire migration through adapter.addTimestamps or delete the override.

### Batch B71 — CPK Arel tuple-IN for AssociationQueryValue (~150 LOC, risk: medium)

Followup from #1831. Per-column IN subqueries instead of tuple-IN for CPK+Relation is broader than Rails (false-positive matches). True tuple-IN via Arel node needed at `association-query-value.ts:48-66`, `predicate-builder.ts:173`, `relation-handler.ts:30-32`.

### Batch B137 — polymorphic-inverse CPK test + setBelongsTo collapse (~50 LOC, risk: low)

Followup from #1826. `inversedFrom` path for polymorphic + composite PK has no direct test (`associations/association.ts:418`). Long-term: `setBelongsTo` in `associations.ts` still duplicates logic from `BelongsToPolymorphicAssociation#replace`; collapse into single dispatch.

### Batch 153 — migration.test test-adapter gate + MockMigration port (~70 LOC, risk: low)

Followup from #1847. `test-adapter.ts:812-814` unconditionally rewrites to `CREATE TABLE IF NOT EXISTS`, blocking raise-on-duplicate tests — gate behind a flag (~30 LOC). `instance based migration up/down` tests currently call `Base.create`/`destroy` instead of `MockMigration` `went_up`/`went_down` lifecycle flags — port proper `MockMigration` (~40 LOC).

### Batch B20 — belongs_to FK + propagateErrors audit (~80 LOC, risk: medium)

Followup from #1852. ~10 LOC defer `reflection?.foreignKey` read in `_resolveBelongsToPrimaryKey` (currently evaluated when unused, may throw for composite-PK + query_constraints models). ~10 LOC fix `_resolveBelongsToForeignKey` gate for `Array.isArray(assoc.options.primaryKey)` length > 1. Architectural: `_autosaveBelongsTo` FK propagation mismatch vs Rails (needs `BelongsToAssociation#_updated` lifetime rework — defer to own PR). Audit `propagateErrors` usage — has_many/has_one/habtm call unconditionally; Rails uses `errors.add(reflection.name)` not child-error merge. `queryConstraintsList` falls back to composite-PK array — wider cleanup item.

### Batch B25 — Relation includes! / references! + CollectionProxy fast paths (~200 LOC, risk: medium)

Followup from #1849. ~5 LOC `LoaderQuery.hashKey()` add connection/adapter identity for multi-DB grouping isolation. ~80–120 LOC `Relation#includes!` / `Relation#references!` infra for Rails-faithful through_scope path. ~40–80 LOC route `CollectionProxy#exists` through `AssociationScope` for `_isThrough` so it emits SQL EXISTS instead of `loadTarget()` + filter (`collection-proxy.ts:1761`). `CollectionProxy#isEmpty` missing `@association_ids` fast-path + `reflection.has_active_cached_counter?` fast-path.

### Batch B17 — Error.fullMessage Rails-fidelity (~60 LOC, risk: low)

Followup from #1858. Three pre-existing gaps in `activemodel/src/error.ts`: (1) no `lookup_ancestors` iteration for STI format inheritance (~20 LOC); (2) extra fallback locale keys vs Rails (~20 LOC); (3) `[\d+]` strip unconditional — Rails only strips inside `i18n_customize_full_message` branch (~20 LOC). Bundle as one cleanup PR.

### Batch B34 — preloader through-assoc scope propagation root cause (~80 LOC, risk: medium)

Followup from #1867. `_alreadyLoadedThroughByOwner` is a symptom workaround; root cause is in `preloader/branch.ts:189-225` / `through-association.ts:171-198`. Investigate scope propagation through nested ThroughAssoc layers. Also single-through non-nested polymorphic+sourceType test variant (~50 LOC). 12 `it.skip` stubs in `nested-through-associations.test.ts` still unimplemented (~30 LOC each).

### Batch B16 — pt 3 customValidationContext + inverse-of lookup (~60 LOC, risk: medium)

Followup from #1876. ~30 LOC thread `customValidationContext` into `associatedRecordsToValidateOrSave` so bypass isn't duplicated across `validateCollectionAssociation` and has-one/belongs-to paths. ~20 LOC align inverse-of lookup in `validateHasOneAssociation` to `record.association(name)` instead of `_loadedAssociation` (may unblock cycle-break test). ~10 LOC add comment to `defineNonCyclicMethod` pinning per-record `_alreadyCalled` map as load-bearing.

### Batch B158 — CollectionProxy delegation + scope-lambda arity standardization (~90 LOC, risk: medium)

Followup from #1878. ~30–60 LOC delegate `CollectionProxy#clear` and `#destroyAll` to underlying `CollectionAssociation`; drop explicit `_invalidateAssociationIds` calls #1878 added. ~10 LOC `CollectionProxy#destroy` has same `_associationIds` staleness gap — invalidation missing after per-record destroy. ~20 LOC standardize scope-lambda arity to `(rel, owner) =>` everywhere; drop 0-vs-1+ branch in `invokeScopeLambda`.

### Batch B164 — Phase 5 belongs-to-associations.test large describe migration (~250 LOC × 5-8 PRs, risk: low)

Followup from #1873. File passes audit but fails `AR_NO_AUTO_SCHEMA=1` — large BelongsToAssociationsTest describe (line 81, ~146 tests, ~3660 LOC) needs `defineSchema` migration. Split into 5–8 cluster PRs at ~250 LOC each. Pattern guidance: use `freshAdapterWithSchema(schema)` per-describe (not file-global) so each describe brings its own models; stay under 500 LOC per PR.

### Batch B1898 — MySQL precision helper extraction (~20 LOC, risk: low)

Followup from #1898. Lift `extractMysqlTimePrecision` from `initializeTypeMap` local to a shared `mysql/schema-statements.ts` export for the `fetchTypeMetadata` (SHOW FULL FIELDS) path.

### Batch B1872 — actionpack CacheStore session options + Rails.cache (~25 LOC, risk: low, cross-package)

Followup from #1872. ~20 LOC expose `options`/`expiresIn` accessor on activesupport cache stores (`memory-store.ts`, `file-store.ts`, `null-store.ts`) to activate dormant `@cache.options[:expires_in]` default in actionpack `CacheStore` constructor. ~5 LOC default `options.cache` to `Rails.cache` and drop the throw, once `Rails.cache` is wired. Replace local `SessionId` class in actionpack `abstract-store.ts` with re-export from `@blazetrails/rack` when that port lands (preserve `privateId` memoization).

### Batch B1907 — SchemaAdapter cacheableQuery delegation + StatementCache fallback (~30 LOC, risk: low)

Followup from #1907. `SchemaAdapter` in `packages/activerecord/src/test-adapter.ts` is missing `cacheableQuery` delegation, causing `StatementCache.create` to silently produce broken SQL (`'[object Object]'`) when called with a `Substitute` — forces statement-cache round-trip tests to use raw `SQLite3Adapter` instead of shared test adapter. ~20 LOC fix; also audit the full `DatabaseAdapter` interface vs `SchemaAdapter` class for other missing delegations. `StatementCache.create` no-`cacheableQuery` fallback should throw or use a safe default rather than silently returning bad SQL.

### Batch B1908 — uniqueness-validation clusters B/C/D Phase 5 (~120 LOC, risk: low)

Followup from #1908. Clusters B/C/D of `uniqueness-validation.test.ts` remain on legacy `freshAdapter()` (60 failures under `AR_NO_AUTO_SCHEMA=1`). Cluster B ~30 LOC, Cluster C ~80 LOC (split C1/C2 if needed), Cluster D ~10 LOC (bundle with B or C). Once all clusters migrate, delete sync `freshAdapter` and rename `freshAdapterA` → `freshAdapter`.

### Batch B1929 — eager-loading AssociationNotFoundError + nested-hash test reshape (~40 LOC)

Followup from #1929. `preloader/branch.ts groupedRecords()` should raise `AssociationNotFoundError` + "Did you mean?" for top-level unknown association names (currently silently continues). Plus rework `eager.test.ts:966/:979` from flat-string `includes("nonExistent")` to Rails nested-hash form (`includes: { author: :non_existing_association }`) before the raise fix lands.

### Batch B31a — AnyClass remaining sites + DelegateCache audit (~40 LOC)

Followup from #1931 (B18 refactor). Replace remaining 4 `AnyClass` sites with `typeof Base`; audit `DelegateCache.initialize(Object)` against Rails `delegation.rb` for the Object-root key.

### Batch B1957 — HABTM join-table name parity + remaining associations sweep (~80 LOC)

Followup from #1957. Fix HABTM join-table name parity: `constructor-form-and-hmt-insert.test.ts` schema declares `b30_posts_b30_tags` but runtime reaches for `b30_posts_tags`; audit `has-and-belongs-to-many.ts` `joinTable` default against Rails `has_and_belongs_to_many.rb` (~30 LOC). Plus: migrate the remaining ~20 `associations/*.test.ts` files to `withTransactionalFixtures` — split into two PRs (mechanical single-`beforeEach` batch first, multi-describe files second).

### Batch B1968 — HABTM target-FK + remaining associations cluster (~280 LOC)

Followup from #1968. ~250 LOC migrate remaining ~28 `associations/*.test.ts` to `withTransactionalFixtures` — three sub-clusters: inline `freshAdapter()` callers (5 files: `inner-join-association`, `left-outer-join-association`, `has-many-through`, `source-type-validation`, `has-and-belongs-to-many-associations`); per-test `_associations` reset/assoc redeclaration callers (5 files: `nested-through-associations`, `nested-through-advanced`, `polymorphic-sti-through`, `has-one-through-associations`, `has-many-through-disable-joins-associations`); `eager.test.ts` standalone (5600 lines, its own PR). ~30 LOC audit `Reflection.associationForeignKey` (`reflection.ts:767`) to confirm through/HMT reflection path at line 1373 honors the override the same way `habtmTargetFk` does. ~30 LOC mirror `habtmTargetFk` for the owner side at `relation.ts:1599-1600` (currently uses `${_toUnderscore(modelClass.name)}_id` fallback; Rails uses `lhs_model.name.foreign_key`). Audit other association tests for the auto-add-missing-columns masking pattern that hid the FK mismatch.

### Batch B1956 — DatabaseAdapter transactionManager audit (~50 LOC)

Followup from #1956. Audit `DatabaseAdapter` implementations lacking `transactionManager`. Confirm `QueryCacheAdapter` is the only one; if not, add the missing impls so `withTransactionalFixtures(adapter)` works on any adapter without unwrap.

### Batch B1959 — encryption cluster B6.4 prerequisite (~150 LOC)

Followup from #1959/#1967. `encryption/test-helpers.ts` shared-adapter pattern shipped; remaining migrations: `encryption/encryptable-record.test.ts` (59 freshAdapter calls; 2 use `makeFreshModel`, those must stay per-test — rest migratable, ~150-200 LOC); `encryption/encryptable-record-api.test.ts` (19 calls); `encryption/uniqueness-validations.test.ts` (6 calls); `encryption/extended-deterministic-queries.test.ts`; `encryption/encryption-schemes.test.ts` (pilot reverted — 3 tests use `makeFreshModel`; partial migration possible if split into two describes). `makeFreshModel` does DDL inside `it()` → incompatible with `withTransactionalFixtures` on MariaDB. ~80-120 LOC restructure (option B): rework `makeFreshModel` to accept a pre-declared table name + split into "declare schema" + "make class" pair so the whole cluster can migrate.

### Batch B1993 — hash-config + DatabaseTasks parity (~75 LOC across slices)

Followup from #1993. ~20 LOC `DatabaseTasks.dumpSchema` honor per-config `schemaDump: "my_schema.rb"` override: when `schemaDump(format)` returns a non-null string, resolve it against `dbDir` instead of always using `schemaDumpPath(config)`. ~15 LOC `DatabaseConfig.inspect()` switch to Rails `adapter_class=ActiveRecord::ConnectionAdapters::AbstractAdapter` format (needs sync accessor or cached lookup). ~10 LOC `HashConfig.isPrimary()` drop the `name === "primary"` short-circuit; delegate entirely to `_primaryChecker`. ~30 LOC wire `ActiveRecord.schemaFormat` analogue so `schemaDump()` no longer needs explicit format arg.

### Batch B1995 — has-many main describe migration slices (~remaining)

Followup from #1995. Slicing the remaining `HasManyAssociationsTest` describe in `associations/has-many-associations.test.ts`:

- **B1966-main-b** — destroying section — **shipped #1997**.
- **B1966-main-c** — size/empty cluster — **shipped #2001**.
- **B1966-main-d** — association definition cluster — **shipped #2002**.
- **B1966-main-a** — counting/finding/deleting — **shipped #1995**.
- **B1966-main-standalone** — 7 bare `freshAdapter()` callsites — **shipped #2000**.
- **B1966-main-e (largest)** — association definition through end of main describe; hundreds of tests, multiple model shapes — needs sub-slicing. Audit class-declaration set first.
- After all slices land, **B1966-finale** drops the no-schema `freshAdapter()` helper + renames `freshAdapterWithSchema` → `freshAdapter` (~5 LOC tests-only).
- Audit tooling: `scripts/audit-define-schema.ts` gives a false pass when `defineSchema(` appears anywhere in the file (e.g. inside a `freshAdapterWithSchema` helper) even if most blocks don't call it. Tighten to per-block scoping or maintain a partial-migration allowlist.

### Batch B1986 — database-tasks test:compare un-blockers (~210 LOC across slices)

Followup from #1986. 16 tests in `tasks/database-tasks.test.ts` remain skipped on real infra gaps. Slices: ~30 LOC widen `DatabaseTasks.schemaDumpPath` to `string | null`, update ≥4 callers (`dumpSchema`, two `file ?? schemaDumpPath` sites, `initializeDatabase`), un-skip `setting schema dump to nil`. ~50 LOC SchemaCache scaffold (`dumpSchemaCache(connection, path)` + `clearSchemaCache(path)`) — unblocks 3 schema-cache tests. ~80 LOC `MigrationContext.runWithScope(scope)` + verbose-mode plumbing — unblocks 3 scope migration tests + `migrate status table`. ~40 LOC `Base.establish_connection(name)` stub-friendly seam — unblocks 2 `establishes connection for the given environments` + multi-db protected-env test. ~10 LOC delete orphan `isLocalDatabase` module-level export (now a one-line delegate to `DatabaseTasks._localDatabase`).

### Batch B1964 — insert_all test:compare un-skip remainder (~250 LOC across slices)

Followup from #1964. Remaining insert_all un-skips by sub-cluster: ~30 LOC `RecordNotUnique` re-raise in bang variants (~5 tests). ~50 LOC PG `RETURNING` extraction through execute path (~4 tests). ~80–120 LOC upsert/on-duplicate timestamp refresh (`updated_at`, `recordTimestamps` override, precision; ~15 tests). ~60–80 LOC schema-cache partial/expression-index extraction for `findUniqueIndexFor` (~7 tests). ~15 LOC readonly filtering in INSERT column list (insert-side, not just SET clause).

### Batch B1966 — has-many head describe migration (split by cluster)

Followup from #1966. Head `HasManyAssociationsTest` block (`packages/activerecord/src/associations/has-many-associations.test.ts` lines 262–8038, ~7700 LOC) needs `defineSchema` migration to drop the last `freshAdapter()` (no-schema variant) callers.

- **B1966-habtm** — `has-and-belongs-to-many-associations.test.ts` `createTestAdapter()` cleanup (~30 LOC). The original sharp-edge offender; new warning will fire on load.
- **B1966a — polymorphic cluster** (~150-250 LOC). Tests under polymorphic / `as:` describes.
- **B1966b — dependent cluster** (~150-250 LOC). `dependent: :destroy/:delete_all/:nullify/:restrict_with_exception` describes.
- **B1966c — counter-cache cluster** (~150-250 LOC). `counter_cache:` describes + `reset_counters` interactions.
- **B1966d — scoping cluster** (~150-250 LOC). `scope:`, `default_scope`, where/order chained-relation describes.
- **B1966e — building cluster** (~150-250 LOC). `build`, `create`, `<<`, `=`, `replace` describes.
- **B1966-finale** — drop `freshAdapter()` (no-schema variant) and rename `freshAdapterWithSchema` → `freshAdapter` once a-e all merge (~5 LOC, no-op tests-only).
- **B1966b followup (~20 LOC)** — strengthen the "restrict with error" + "restrict with error with locale" assertions: pre-existing `expect(found || true).toBeTruthy()` is tautological; should expect `destroy()` to reject (`DeleteRestrictionError`) and author still findable with errors populated.
- **B1966c followup (~250 LOC + ~80 LOC)** — only 4 of ~19 counter-cache tests migrated. Mid-cluster (lines 4398-4791, 13 tests using unique `Cc*` class names) needs ~26 table declarations OR refactor to share `authors`/`posts`. Stragglers (3 tests: `destroy all on desynced...` line 5177, `unloaded association` line 5665, `default scope` line 7454).

### Batch B2016 — associations.test helper cleanup (~80 LOC)

Followup from #2016. ~30 LOC hoist `setupATAdapter`/`setupPLAdapter`/`setupHMAdapter2`-style schema literals to named `*_SCHEMA: Schema` constants (HM applied per Copilot review #1; rest pending). ~50 LOC dead-entry sweep in `setupATAdapter` (auto-extraction script emitted both inflected names and `_tableName` form for sibling classes) once Phase 7 auto-schema deletion lands and the real required set is locked. Re-verify `as_cpk_children` PK shape against Rails `activerecord/test/schema/schema.rb`.

### Batch B2026 — relations.test inflector-dedup brittleness (~35 LOC)

Followup from #2026. Bottom mega-describe in `relations.test.ts:4292+` declares many local `class Post extends Base` shadows; inflector auto-suffixes them to `post2s`. Shared `beforeEach` + several inline `defineSchema` calls now declare both `posts` and `post2s` to cover both code paths — adding a third `class Post` becomes `post3s` silently. Either: reset inflector dedup between tests in test-harness, or have tests declare `static _tableName = "posts"` explicitly. ~5 LOC remove `defineSchema(StrictPost.adapter!, ...)` defensively added in #2026 (validation fails before DB reach). ~30 LOC extract `seedPostsLike(adp)` helper for the recurring 9-spot `defineSchema(adp, { posts: {...}, post2s: {...} })` pattern.

### Batch B2018 — lint-deps activesupport gaps (~600 LOC across 3 PRs)

Followup from #2018. `activerecord -> activesupport` sits at 33/59 (55.9%) after the lint-deps honesty fix. Real gaps:

- **Instrumentation PR (~200 LOC)**: `join-dependency:instantiate` + `query-cache:cacheSql` → `Notifications.instrument`; `migration:migrate`/`sayWithTime` → `AS::Benchmark`; `query-logs:tagContent` → `AS::ExecutionContext`. Verify `@blazetrails/activesupport` surface before sizing.
- **Encryption PR (~150-200 LOC)**: `encryption/message-pack-message-serializer:dump/load` → `AS::MessagePack`; `encryption/key-generator:deriveKeyFrom` → `AS::KeyGenerator` (PBKDF2). Risk: Rails-encrypted-blob compat — needs round-trip fixture.
- **Linter blind spot (~80 LOC)**: 14 `IsolatedExecutionState` violations follow the `let _storage = null; if (!_storage) _storage = getAsyncContext().create<T>()` pattern. Current taint pass only walks initializer-at-declaration; needs top-level reassignment walk. Closes connection-pool/explain-registry/suppressor/scoping/core/connection-handler/abstract-adapter clusters in one shot.
- **Architectural via `unported-dep-uses.ts`** (mechanism half-built in `lint-deps-unported` worktree, not yet a PR): `AS::Dependencies` (2 — `connection_pool/queue.rb:wait_poll`, `mysql2/database_statements.rb:perform_query`) and `AS::CodeGenerator` (2 — `attribute_methods.rb:alias_attribute`/`generate_alias_attributes`). Autoloader/class_eval — no JS equivalent.

### Phase 5 long-tail — uniform schema-seeding strategy decision

Followup from #1893. Phase 5-wide: decide and apply uniform schema-seeding strategy (transactional rollback vs. per-scenario scoped helper) across all migrated Phase 5 files to reduce DDL overhead and CI flake. Worth deciding before more clusters land to avoid mass rework.

---

## Phase 6 batches — hoist `defineSchema` from `beforeEach` to once-per-file

Spec lived in `tm-unification-plan.md` (completed, deleted). Replaces per-test `dropAllTables` with transactional BEGIN/ROLLBACK; promotes `beforeEach(defineSchema)` to module-level. Unblocked items can ship now; mechanical sweep gated on the infra switch.

### Batch B6.4 — Promote `beforeEach(defineSchema)` to module-level (cluster sweep, mostly shipped)

Pilot landed in #1938 (after #1933 revert + root-cause fix: MariaDB implicit-commits on ALTER TABLE inside BEGIN; fix seeds `_createdColumns` from CREATE TABLE body). Cluster sweeps:

- **B6.4a** — `associations/*.test.ts` cluster — shipped #1957.
- **B6.4b** — `adapters/**/*.test.ts` — shipped #1958 (readonly/secure-password/statement-cache slice).
- **B6.4c** — `relation/*.test.ts` + `validations/*.test.ts` — shipped #1959.
- **B6.4d1** — root inverse + HMT cluster — shipped #1960.
- **B6.4d2** — remaining root files (autosave, belongs-to, callbacks, eager, strict-loading, query-cache, instrumentation, transaction-\*) — in flight.
- **Remaining adapters/** files not in #1958 — open.
- **Remaining encryption/\* files** — open.

### Batch B6.5 — Wall-clock benchmark + cleanup (~30 LOC, risk: low, after B6.4)

After B6.4 lands, measure `pnpm vitest run packages/activerecord` wall-clock before/after. Document drop in PR description. Delete dead code: `resetTestAdapterState`, `dropAllTables` helper paths, any stale `_createdTables`/`_createdColumns` invalidation. Phase 7 (delete `SchemaAdapter` recovery) becomes the next step.

---

## Doc-hygiene + infra followups

- **Decision** — Root `Gemfile` / `Gemfile.lock`: globalid workstream or not? Currently untracked-and-ambiguous.
- **Follow-up PR** — Run `sync-stats` refresh and clear "pending" disclaimer on README Data Layer Parity test-percentage.
- **~5 LOC** — Triage `vendor/rails/activerecord/test/cases/mixin_test.rb` (4 tests: `test_update`, `test_create`, `test_many_updates`, `test_create_turned_off`). #1772 added 2 entries to `unported-files.ts` under the Ruby-module-semantics theme, but these tests actually exercise the `Mixin` AR model's timestamps + `lft_will_change!` — fixture-blocked (no `mixins` fixture / `lft` column in trails). Re-classify with the correct reason, or open a port slot if the timestamp tests are in-scope.
- **Sweep** — Audit `grep "PERMANENT:" scripts/` for tooling missing the `PERMANENT-SKIP:` form (canonical marker; see "Skip annotation format" above).

### Batch Audit-V1 — Validations root file (~285 LOC, risk: low)

Surfaced by 2026-05-19 audit. Port 19 missing tests from `validations/validations.test.ts` mirroring Rails' top-level `validations_test.rb`. Gaps: `validate`/`validate!`, `save_without_validation`, acceptance-without-DB edge cases, numericality mutation/raw/custom-getter, `validators` introspection. No known blockers. Bundle with adjacent validations files to hit 250-LOC target. The existing Validations batch (#1131) only covered `validations/*.rb` sub-files; `validations_test.rb` itself was missed.

### Batch Audit-M1 — MySQL adapter-prevent-writes (~200 LOC, risk: low)

Surfaced by 2026-05-19 audit. Port 11 missing tests for `adapter_prevent_writes_test.rb` into `adapters/abstract-mysql-adapter/adapter-prevent-writes.test.ts`. All scenarios (INSERT/UPDATE/DELETE/SELECT/SHOW/SET/DESCRIBE/DESC/KILL/USE/REPLACE) are basic SQL-string pattern matching — no complex impl gaps expected. Bundle with other small MySQL adapter items.

### Batch Audit-DB1 — DB-Config Resolver (~250 LOC, risk: medium)

Surfaced by 2026-05-19 audit. Dedicated slot for `database-configurations/resolver.test.ts`: 16 tests covering URL→hash resolution, environment lookup, primary/replica roles, multi-DB config. The Architectural note ("~4 db_config un-skips") materially understates the gap (18 missing across all db-config files, 16 in resolver alone). Promote from vague "Phases 2–4" to an explicit batch.

### Batch Audit-PG1 — PG serial sequences (~200 LOC, risk: low)

Surfaced by 2026-05-19 audit. Port 12 missing tests from `adapters/postgresql/serial.test.ts` covering sequence, bigserial, and serial column types. Can be bundled as a sub-item of Batch 53 or opened as a standalone ~200-LOC PG serial batch.

---

## Architectural (deferred; too big for single ~250-LOC slot)

- **`test:compare` `covered_on:` annotation** (from retired shared-adapter-test-suite-plan; ~80 LOC). Per-test annotation noting which adapter(s) a Rails test runs on, so the test:compare denominator reflects adapter-conditional Rails tests correctly. Independent of pool epic; slot in any time.
- **Connection-pool / per-thread query-cache architecture, Phases 2–4** (~120 LOC remaining). ~10 actionable test unskips (6 pool-attachment); other 4 are permanent (GVL/fork/thread skips). db_config resolver gap promoted to Batch Audit-DB1 (18 missing tests across 4 db-config files; resolver alone: 16).
- `_aliasTracker` real semantics on `JoinDependency#joinConstraints`.
- Multirange OID direct lookup via `LEFT JOIN pg_range` — blocked on PG12/13 compat decision.
- `encodeRangeLiteral` ↔ `RangeType.encodeLiteral` consolidation into `range.ts` helper.

---

## Infra-blocked (not actionable until prereq lands)

- `vi.stubEnv("TZ")` + Temporal test-infra gap.
- Task/Topic fixture models — multiple tests need real models wired to a DB.
- `_queryBySql` opts wiring — pending prepared-statement infrastructure.
- `insertAllBang` / `upsertAll` — separate features.
- HABTM cache invalidation — query-cache Gap 6 depends on HABTM impl.
- `resetColumnInformation` — query-cache Gap 4 depends.

---

## Permanent guardrails

### Dual-registry watchpoint

When both a `Base.<X>` static field AND a `<x>.ts` module-level `WeakMap`/`Map` exist for the same concern, treat it as a bug. The live API writes one; helpers read the other; silently. Audit:

```bash
grep -rn "new WeakMap<typeof Base\|new Map<.*Base" packages/activerecord/src
```

### Unported-files gate (Step 0 for auditors)

Before proposing implementation slots, every audit MUST consult `scripts/api-compare/unported-files.ts`. If any source in scope appears in `UNPORTED_FILES` (by `pattern` or `testFile`), propose **exclusion**, not implementation. The patch lives in the audit-prompt-template.

### Test:compare workflow

Test:compare un-skip work uses the Strategy + workflow section above + `$HOME/github/blazetrailsdev/test-compare-prompt-template.md`. Audits live as task files in `$HOME/.btwhooks/data/github/blazetrailsdev/trails/todo/` and submit via `/audit-report <slug>` — no PR.

### Spawned-agent constraints

The `prompt-agent` skill auto-appends a "do not delegate / do not recursively spawn sub-agents" footer to every prompt it dispatches. Workers do their own work; oversized tasks split via PR-body follow-ups.

### Future infra (deferred)

- ESLint rule for `_`-prefixed params on Rails-mirroring methods.
- `lint:deps` activesupport rule → blocking once missing migrations land.
- api:compare param-name set comparison.
- `deprecator` / `gemVersion` / `version` removed from main bundle barrel; only via `@blazetrails/activerecord/deprecator` subpath.

---

## Recent-merge followups (May 16–19 backlog)

Distilled from `~/.btwhooks/data/github/blazetrailsdev/trails/<PR#>/post-pr/*.md`. Findings files preserved.

- **insert-all conflict-target + IndexDefinition** (#1720): ~10 LOC un-skip `insert all with partial unique index` (insert-all.test.ts:344) and `:581` — IndexDefinition.where is wired. ~30 LOC sweep `insert-all.ts` to `ArgumentError` (8 plain-`Error` throws). ~50 LOC replace raw-`schemaCache` + manual-pool sites with `schemaCacheBound` (candidates: `abstract-adapter.ts:1662`). ~30 LOC eagerly prime `_databaseVersion` on PG connection so cold getter never throws.
- **Reflection Slot A+B** (#1722): ~5 LOC remove `joinScope` length-mismatch throw (Rails uses `Array#zip` which silently truncates). ~10 LOC add ThroughReflection assertion to reflection.test.ts:1104. ~30 LOC refresh 13 stale `BLOCKED:` annotations. ~50–80 LOC `_primaryKey: string | string[] | null` widening for `Edge`-fixture parity. `ensureOptionNotGivenAsClassBang` regex on `Function.prototype.toString` is fragile if target lowered to ES5.
- **MySQL batch 8** (#1723): **Architectural — `SchemaDumper.emitTable` bypasses adapter column-spec hooks.** Builds `colspec` inline at schema-dumper.ts ~L858, never calls `prepareColumnOptions`/`columnSpec`. Abstract `columnSpec` hook at `connection-adapters/abstract/schema-dumper.ts:33` is unreferenced — every adapter's `prepareColumnOptions` override is dead code w.r.t. live dumps. ~50 LOC re-route emitTable through `columnSpec`; PG/SQLite snapshots may shift. ~30 LOC fold `_handleWarningsOn` → `_handleWarnings(sql)` (needs AsyncLocalStorage). `migration.ts` has TWO `dropTable` methods (L601 DSL + L1680 MigrationContext) with drifting option signatures.
- **PG interval round-trip** (#1727): ~30 LOC audit `Hstore`/`Jsonb`/`Money`/`Inet`/`Cidr`/`Macaddr`/`Bit`/`BitVarying`/`Xml`/`Point`/`Uuid` for the same pg-types array-element-parser asymmetry. ~10 LOC unit test for OID 1187 override. `postgresql-adapter.ts` has two `getTypeParser` blocks with substantial overlap — extract shared `oid → (format) => parser` map.
- **HMT post-#1714 composite cleanup** (#1732): ~60 LOC polymorphic-through with composite owner PK validation (per `it.skip`). ~20 LOC audit `_throughOwnerCols`' `options.queryConstraints` FK branch (likely dead post-Reflection rewrite); delete or fixture. `has-one-through-association.ts` analogous error paths still plain `Error` — sweep to `ConfigurationError`.
- **migration older B/C/E** (#1733): ~10 LOC add Model-class branch to `Migration.properTableName` for Rails `respond_to?(:table_name)` early-return. ~80–120 LOC flesh out `Migration.copy` for engine `scope` on `MigrationProxy` — Rails emits `#{version}_#{name.underscore}.#{scope}.rb` with `on_skip`/`on_copy` callbacks.
- **connection-pool fidelity sweep B+C** (#1735): ~30 LOC align `withRoleAndShard`/`connectingTo`/`connectedToMany` to Rails `[self]` semantics; update `core.ts#matchesStack` + `AbstractAdapter#isPreventingWrites` to walk `klasses.include?(connection_class_for_self)` at read time. Closes the primary-abstract-without-`connectsTo` leak. ~10 LOC `core.ts#matchesStack` brittle `k.name === "Base"` (~L336) — switch to `_isActiveRecordBase` own-property marker.
- **MySQL batch 47 table-options** (#1736): ~80–150 LOC route `TableDefinition#toSql()` through `schemaCreation.accept(...)` (Arel visitor). Blocking step for re-introducing `createTableDefinition` override (reverted: abstract `toSql` only emits `AUTO_INCREMENT` when `col.type === "primary_key"` literally; `MysqlTableDefinition#newColumnDefinition` rewrites to `integer` with `options.autoIncrement = true` → broke MariaDB INSERT). ~5 LOC re-add override post-toSql work (impl in commit `13ed839c4`). PG happens to emit `SERIAL PRIMARY KEY` directly so bug doesn't surface there.
- **inverseOf wiring** (#1745): ~30 LOC port `has_many_inversing` config + plumb into `BelongsToReflection`/`HasManyReflection.canFindInverseOfAutomatically` — trails ignores Rails' flag and always wires when `automaticInverseOf` finds candidate. ~80–150 LOC collection-target dedup so `setHasMany`/`build`/`<<` on loaded collection don't double-push when inverse fires `replace_on_target` — unblocks 4 of 6 remaining `inverse-associations.test.ts` skips. ~10 LOC apply `_wireInverseAssociation` to setBelongsTo/setHasOne/setHasMany. **Rails test name quirk to preserve:** `test_unscope_does_not_set_inverse_when_incorrect` exercises `.or(...)`, `test_or_does_not_set_inverse_when_incorrect` exercises `.unscope(:where)` — swapped in `inverse_associations_test.rb:872-888`. Don't fix.
- **migration Slot F invertibility** (#1759): ~20 LOC extend `Mysql2Adapter#columns` SELECT to include `extra` and pass `autoIncrement` to `Column` ctor (consistent with `abstract-mysql-adapter.ts:1515`). ~60–100 LOC replace `RecorderTableProxy`'s enumerated methods with `Proxy`-based `method_missing` equivalent (Rails parity; mirrors bulk-path Proxy at `schema-statements.ts:666`). ~30 LOC audit internal callers of `SchemaStatements.addColumns`/`removeColumns` to new Rails-shape `(*names, type:, **options)`.
- **MySQL isClientNotConnected + tz seed** (#1760): ~30 LOC `Rails.error.report` wiring at `_flushWarnings` sites (mysql2-adapter.ts:1684, postgresql-adapter.ts:1165) once `ErrorReporter` singleton lands. `Mysql2Adapter#configureConnection` doesn't set `query_options[:as] = :array` — N/A in our pool model.
- **ColumnDefinition.sqlType in toSql** (#1761): ~80 LOC port `network_test.rb` as `adapters/postgresql/network.test.ts`. Blocked on `pgColumn` passing semantic types — `column.type` returns generic `"string"` instead of `:cidr`/`:inet`/`:macaddr`. ~30 LOC switch `pgColumn` to pass semantic strings (`"cidr"`, `"inet"`, `"hstore"`, `"macaddr"`, `"ltree"`, `"tsvector"`, `"xml"`, `"money"`, `"oid"`, range types). Keep explicit sqlType for `serial`/`bigserial`/`bit`/`bitVarying`. ~10 LOC DX type test audit (inet/cidr → IPAddr). Long-term: consolidate dual SQL-generation paths.
- **CollectionProxy#include?** (#1766): ~5 LOC trim `docs/activerecord-100-plan.md:186-187` — two non-Rails Batch 31 items (`readonly: true` HABTM removed from Rails `VALID_OPTIONS`; `validate: false` on push/create — Rails always passes `validate=true`). `_includeInMemoryThrough` force-loads through reader — `include?(new_record)` on untouched through-HABTM issues queries (Rails same).
- **polymorphic inverse-of autosave** (#1773): ~30 LOC implement `Base.polymorphicClassFor(name)` to remove registry fallback. ~50 LOC auto-detect `inverseOf` for polymorphic `hasOne` (Rails' `automatic_inverse_of`). ~80–150 LOC un-skip `inverse-associations.test.ts:1393`/`:1399`. ~20 LOC `BelongsToPolymorphicAssociation` overrides for `foreignKeyNames`/`associationPrimaryKeys` to absorb unresolved-klass workaround at belongs-to-association.ts:277.
- **MySQL ANSI quotes** (#1777): ~30–50 LOC `setSessionVariable(name, value)` on `AbstractMysqlAdapter`. ~20 LOC optional: rewrite `mysqlQuote` to keep `"…"` intact under ANSI_QUOTES. **Coverage gap**: `mysqlQuote` pre-rewrites `"foo"` → `` `foo` `` unconditionally; tests prove adapter functions under ANSI_QUOTES but not that builders emit ANSI-compliant output. Extractor restricted to `skipIf`/`runIf`; `it.each`/`describe.each` need separate handling.
- **ThroughReflection join keys** (#1779): Batch 29 remainder: ~30 LOC nested-through join+where Rails test. ~20 LOC source_type polymorphic preload test. ~10 LOC `_dataAvailable()`/`runnableLoaders()` deep-chain extra-pass. ~30 LOC `djMembersOrdered`/`djMembersDouble` wrong/unordered with `.where()`/`.reorder()`. ~80–120 LOC Option B for `CollectionProxy._buildThroughScope()` nested-through (collection-proxy.ts:2007) — init seed from `DisableJoinsAssociationScope`.
- **Migration.copy + properTableName** (#1791): Three minor parity items not blocking 100% — `proper_table_name`/`copy` instance vs static (matches existing TS shape); `MigrationContext.new(dir, NullSchemaMigration.new, NullInternalMetadata.new)` discovery-only contexts; magic-comment block preservation (N/A for .ts).
- **polymorphic-through composite owner PK** (#1792): Batch 118 remainder: ~20 LOC audit `_throughOwnerCols`' `options.queryConstraints` FK branch (likely dead post-Reflection rewrite at reflection.ts:505-510). ~30 LOC `has-one-through-association.ts` sweep — **no matching `throw new Error(...)` sites found there**; treat as no-op or expand scope to `ConfigurationError` for through-association.ts:92,106.
- **counter-cache resetCounters** (#1798): Batch 134 remainder: ~30 LOC composite-FK support for `hasMany` so `countHasMany` doesn't throw on Cpk::Order/Cpk::Book — unblocks `reset counters for cpk model`. ~15 LOC `resolveCounterColumn` FK tiebreaker for multi-`belongs_to` same parent — unblocks `reset the right counter if two have the same class_name`. ~30 LOC through-reflection branch walking `through_reflection`. ~15 LOC apply reflection scope (`select`, `where`) to COUNT. ~10 LOC modular/namespaced classname resolution.
- **preloader-grouping un-skip** (#1854): Batch 24 remainder: ~30 LOC + impl for `extending` association option in reflection plumbing (Rails' `belongs_to :x, -> { ... }, extending: [Mod]`); unblocks `preload groups queries with same sql at second level` (associations.test.ts:8255). ~150 LOC `preload can group multi level ping pong through` (needs similar_posts + favorite_authors through-of-through fixtures + automatic-scope-inversing hook). Overlaps Batch 28b fixtures.
- **autosave validateAssociations** (#1856): Batch 16 item 2 (~150 LOC) — collapse `validateAssociations` central sweep and per-reflection helpers into single `add_autosave_association_callbacks` dispatch with per-association `validate validation_method` callbacks. Today per-reflection helpers (autosave-association.ts:819-881) are unused dead code. **Deviation**: central sweep means callback ordering differs (Rails interleaves; trails always runs autosave last). ~10 LOC delete `contextOverride` on `isAssociationValid` once item 2 lands.
- **polymorphic belongs_to query_constraints** (#1862): ~10–20 LOC `deriveFkQueryConstraints` doesn't support array primary_key (reflection.ts:561-602) — `ownerPkStr = Array.isArray(ownerPk) ? undefined : ownerPk` then compares against `undefined`, guaranteed throw for composite-PK + `query_constraints`. Rails compares via `Array#==`. Workaround: keep single PK + `query_constraints` alone. Delete plan.md:71-79 Batch 21 — three items shipped pre-PR.
- **cross-cutting applyAssociationScope** (#1865): Batch 32 remainder: ~30 LOC `_associationIds` cache invalidation on `destroyAll`/`clear()`. ~20 LOC extract shared `fn.length === 0 ? fn.call(rel) : fn.call(rel, rel, owner)` arity/binding dispatch — duplicated at `association-scope.ts:583-589` and `associations.ts`. HABTM `habtmOptions.scope` duplicated capture (builder/has-and-belongs-to-many.ts:306-310, 322-325).
- **DidYouMean on HMT errors** (#1972): ~30 LOC swap `_hmtNotFound`'s dictionary from `_associations` to `_reflections` keys for byte-exact Rails parity. ~50 LOC replace Levenshtein with Jaro-Winkler. ~80 LOC introduce `detailedMessage` getter on `ActiveRecordError`. Three other "Through association X not found on Y" sites still raw `Error()` — collection-proxy.ts:341,1256,2080; associations.ts:1824. 40 `join_model_test.rb` skips still BLOCKED.
- **relation-scoping unscope un-skip** (#1983): 27 of 28 skipped tests remain. ~30 LOC STI find type-constraint (inheritance.ts/finder, append `type IN (descendant_names)` when `isStiSubclass()`). ~50 LOC select-narrowed attribute set — result materialization honor projected column list. ~20 LOC `query-methods.ts#orderBang` accept `Arel::Attribute`/`Arel::Nodes::Grouping` + `{node => :desc}` — unblocks 5 reverse-order tests. Larger/structural deferred: `scoping(all_queries: true)`, joins-with-associations, `includes()`, `reload()` with scoping, HasMany/HABTM scope-forwarding (7), query cache integration.
- **schema-dumper 3 tests** (#1989): 22 of 25 remaining skips blocked by features. PG-only (11): array limit/decimal defaults, interval, oid, extensions, float4, enum-with-comma, timestamptz, infinity defaults. MySQL-only (5): index length, binary/blob/text size, boolean-as-tinyint, fulltext `type:` vs `using:`. Rails 7 compat shims (5) — probably won't port. ~30 LOC `schema dump aliased types` cheapest (`TYPE_ALIASES = { blob: 'binary', numeric: 'decimal', ... }` in `abstract/schema-dumper.ts#schemaType()`). ~80 LOC MySQL fulltext `type:`. ~120 LOC PG interval. ~150 LOC PG extension dump. ~50 LOC Infinity/NaN default handling.
- **IsolatedExecutionState wiring (PR 1/5)** (#2034): ar→as lint:deps at 35/59 (59.3%). ~10 LOC add `rubyMethodToTs` mappings for `[]`→`get`, `[]=`→`set`, `key?`→`has` so IES bumps api:compare AS coverage (AS stayed flat at 504/2144 because of this mapping gap). PRs 2–5 pending. **Pre-existing deviation**: ScopeRegistry uses `WeakMap<class, any>` vs Rails string-keyed Hash on `model.name` — Rails ScopeRegistry survives class redefinition by name, trails doesn't (~80 LOC + call-site audit if it matters). **Suppressor** keeps a TS-only `scopeOverride` AsyncContext layer on top of IES because `suppressor.test.ts:198` asserts `Promise.all` isolation Rails doesn't guarantee.
- **AS around-callback composition** (#2045): closed two pre-existing AS::Callbacks bugs that blocked AbstractController rewire (surfaced via #2042). **Remaining followup**: ~30–80 LOC `proceedObserved` heuristic in `next()` thenable wrapper (callbacks.ts ~L893-928) misses awaited-chaining rescue patterns — `await next().then(fn)` / `.finally(fn)` / `.catch()` inside try/catch can rescue block rejection in user code, but wrapper's chain methods get no function-typed `onRejected` so `proceedObserved` stays false and `_runAroundAndAfter` re-throws via `pendingProceed`. Low priority — actionpack consumer uses canonical `await next()`. **Architectural divergence (out of scope)**: trails stores before/after/around as flat arrays and composes arounds at runtime; Rails `CallbackSequence` (`vendor/rails/activesupport/lib/active_support/callbacks.rb:518`) gives each around its own `@before`/`@after`. Rails skips afters when an around doesn't yield _only for afters attached to inner sequences_; trails skips ALL afters when any around halts. Matches Rails for around-then-after order, diverges for `[after, around]`.
- **Encryption KeyGenerator via AS** (#2047): ar→as lint:deps now 36/59 (61%). ~30 LOC `Notifications` wiring — join-dependency#instantiate, query-cache#cacheSql. ~30 LOC `Benchmark` wiring — migration#migrate, sayWithTime. ~15 LOC `ExecutionContext` wiring — query-logs#tagContent. ~100 LOC remaining IES — ~12 more AR call sites (abstract-adapter, connection-handler, connection-pool, core, explain-registry, scoping). Larger: `CodeGenerator` (2 in attribute-methods) + `MessagePack` (2) need new AS impls. **Pre-existing**: AR `Encryption::KeyGenerator#generateRandomKey`/`#deriveKeyFrom` return base64 strings; Rails returns raw bytes (`SecureRandom.random_bytes` / `OpenSSL::PKCS5.pbkdf2_hmac`). Multi-file change to flip — `key.ts`, `derived-secret-key-provider.ts` treat as base64. `Encryption::KeyGenerator#deriveKey(password, length, salt)` is TS-only helper with no Rails counterpart.
- **TM Phase 6 schema-cache invalidation** (#2064): closes Phase 6 prereq cluster. **Deviation**: Rails invalidates schema cache per-table inside DDL methods (`schema_cache.clear_data_source_cache!(table)` — schema_statements.rb:306, 542); trails clears entire `SchemaCache` once per test in `withTransactionalFixtures.afterEach`. Test-only; production rollback path untouched. Authorized over per-DDL invalidation. **Followups**: ~250 LOC each, one PR per file — bulk-migrate remaining PG adapter-cluster files with DDL inside `it()` bodies (`array`, `datatype`, `explain`, `foreign-table`, `json`, `range`, `schema`, `uuid`, `virtual-column`) per #2060's list, now unblocked. ~50 LOC `TestDatabaseAdapter._createdTables` snapshot/restore on rollback — global Set tracker updates on every DDL parse; DDL inside `it()` body adds entries that survive rollback, harmless today but breaks if a future migration mixes `defineSchema` in beforeAll + raw `createTable` in it() + re-runs `defineSchema`. ~30 LOC opt-in / opt-out flag `withTransactionalFixtures(getAdapter, { invalidateSchemaCache: false })` for DML-only suites (currently every teardown pays re-introspection cost).

## See also

- [`scripts/api-compare/unported-files.ts`](../scripts/api-compare/unported-files.ts) — canonical not-portable list.
- [`activerecord-type-audit.md`](activerecord-type-audit.md) — supersedes the `as any` legacy-cast cleanup sweep.

---

# Part 2 — Per-file test:compare backlog

> Merged from the former `activerecord-test-compare-100.md` (2026-06-01).
> Owns the per-file table; Part 1 above owns batches + strategy + BLOCKED vocab.

### Refresh

```bash
pnpm test:compare --cached --json --package activerecord
pnpm tsx scripts/test-compare/per-file-backlog.ts > /tmp/tc.md
## paste the headline + table body below, bump the "as of" date
```

The headline number is `totalMatched / totalRubyTests` from the
`convention-comparison.json` snapshot. "Pending" = `missing + skipped`
for each file; misplaced is informational (relocate-only fixes).

### Scope

Three categories of work close the delta. Each batch picks one file and
addresses whichever applies:

1. **Un-skip stubs** — files where matched-skipped > 0. Flip `it.skip` → `it`;
   port the test body if Rails has one we never wrote; resolve any infra gap
   the BLOCKED tag pins.
2. **Port missing Rails bodies** — files where missing > 0. Write the test
   in our TS file under the exact Rails name (CLAUDE.md test-name rule
   applies: never rename, never re-word).
3. **Implementation work to unblock** — when a BLOCKED tag points at real
   missing source-code behavior, port that first. Reference the
   `BLOCKED:*` taxonomy in `activerecord-100-plan.md` (BLOCKED vocabulary section).

Out of scope for this doc: name-drift reconcile (relocate / rename) — those
are mostly mechanical and live as misplaced counts, not pending work.

### How to ship one file

1. Pick a row (top of the table is highest impact).
2. Read the Rails source: `scripts/api-compare/.rails-source/activerecord/test/cases/<rubyFile>`.
3. Read our file: `packages/activerecord/src/<conventionTsFile>`.
4. Decide: un-skip vs port vs implement. Test names must match Rails verbatim.
5. Spawn an agent or open a PR directly. Target ~250 LOC; split via
   `<base>` / `<base>b` for big files (the cluster pattern from Phase 5).
6. Verify: `pnpm test:compare --cached --package activerecord` shows the
   row drop or close out.

### Per-file backlog (sorted by missing + skipped)

**7863/7872 (84.1%)** as of 2026-05-18. Skipped: 1244. Misplaced: 4. Wrong-describe: 8.

| Ruby file                                                              | TS file                                                                | Matched | Skipped | Missing | Misplaced | Pending |
| ---------------------------------------------------------------------- | ---------------------------------------------------------------------- | ------: | ------: | ------: | --------: | ------: |
| `associations/eager_test.rb`                                           | `associations/eager.test.ts`                                           |     197 |      70 |       0 |         0 |  **70** |
| `adapter_test.rb`                                                      | `adapter.test.ts`                                                      |      75 |      70 |       0 |         0 |  **70** |
| `insert_all_test.rb`                                                   | `insert-all.test.ts`                                                   |      72 |      42 |       1 |         0 |  **43** |
| `associations/join_model_test.rb`                                      | `associations/join-model.test.ts`                                      |     102 |      41 |       0 |         0 |  **41** |
| `database_configurations/hash_config_test.rb`                          | `database-configurations/hash-config.test.ts`                          |      34 |      34 |       0 |         0 |  **34** |
| `strict_loading_test.rb`                                               | `strict-loading.test.ts`                                               |      54 |      30 |       0 |         0 |  **30** |
| `associations/has_one_associations_test.rb`                            | `associations/has-one-associations.test.ts`                            |      93 |      28 |       0 |         0 |  **28** |
| `scoping/relation_scoping_test.rb`                                     | `scoping/relation-scoping.test.ts`                                     |      64 |      28 |       0 |         0 |  **28** |
| `tasks/database_tasks_test.rb`                                         | `tasks/database-tasks.test.ts`                                         |      78 |      26 |       0 |         0 |  **26** |
| `query_cache_test.rb`                                                  | `query-cache.test.ts`                                                  |      67 |      25 |       0 |         0 |  **25** |
| `schema_dumper_test.rb`                                                | `schema-dumper.test.ts`                                                |      67 |      25 |       0 |         0 |  **25** |
| `associations/inverse_associations_test.rb`                            | `associations/inverse-associations.test.ts`                            |      93 |      23 |       0 |         0 |  **23** |
| `associations/has_and_belongs_to_many_associations_test.rb`            | `associations/has-and-belongs-to-many-associations.test.ts`            |      91 |      23 |       0 |         0 |  **23** |
| `relation/where_test.rb`                                               | `relation/where.test.ts`                                               |      62 |      23 |       0 |         0 |  **23** |
| `view_test.rb`                                                         | `view.test.ts`                                                         |      21 |      21 |       0 |         0 |  **21** |
| `nested_attributes_test.rb`                                            | `nested-attributes.test.ts`                                            |     127 |      18 |       0 |         0 |  **18** |
| `associations/cascaded_eager_loading_test.rb`                          | `associations/cascaded-eager-loading.test.ts`                          |      27 |      18 |       0 |         0 |  **18** |
| `bind_parameter_test.rb`                                               | `bind-parameter.test.ts`                                               |      17 |      17 |       0 |         0 |  **17** |
| `comment_test.rb`                                                      | `comment.test.ts`                                                      |      17 |      17 |       0 |         0 |  **17** |
| `associations/has_one_through_associations_test.rb`                    | `associations/has-one-through-associations.test.ts`                    |      47 |      16 |       0 |         0 |  **16** |
| `database_configurations/resolver_test.rb`                             | `database-configurations/resolver.test.ts`                             |      16 |      16 |       0 |         0 |  **16** |
| `database_selector_test.rb`                                            | `database-selector.test.ts`                                            |      16 |      16 |       0 |         0 |  **16** |
| `forbidden_attributes_protection_test.rb`                              | `forbidden-attributes-protection.test.ts`                              |      16 |      16 |       0 |         0 |  **16** |
| `transaction_callbacks_test.rb`                                        | `transaction-callbacks.test.ts`                                        |      57 |      15 |       0 |         0 |  **15** |
| `autosave_association_test.rb`                                         | `autosave-association.test.ts`                                         |     177 |      13 |       0 |         0 |  **13** |
| `quoting_test.rb`                                                      | `quoting.test.ts`                                                      |      37 |      13 |       0 |         0 |  **13** |
| `defaults_test.rb`                                                     | `defaults.test.ts`                                                     |      25 |      13 |       0 |         0 |  **13** |
| `associations/nested_through_associations_test.rb`                     | `associations/nested-through-associations.test.ts`                     |      64 |      12 |       0 |         0 |  **12** |
| `relation/where_chain_test.rb`                                         | `relation/where-chain.test.ts`                                         |      54 |      12 |       0 |         0 |  **12** |
| `associations/callbacks_test.rb`                                       | `associations/callbacks.test.ts`                                       |      18 |      12 |       0 |         0 |  **12** |
| `adapters/postgresql/serial_test.rb`                                   | `adapters/postgresql/serial.test.ts`                                   |      12 |      12 |       0 |         0 |  **12** |
| `connection_adapters/connection_handler_test.rb`                       | `connection-adapters/connection-handler.test.ts`                       |      27 |      11 |       0 |         0 |  **11** |
| `aggregations_test.rb`                                                 | `aggregations.test.ts`                                                 |      25 |      11 |       0 |         0 |  **11** |
| `multiple_db_test.rb`                                                  | `multiple-db.test.ts`                                                  |      12 |      11 |       0 |         0 |  **11** |
| `reserved_word_test.rb`                                                | `reserved-word.test.ts`                                                |      12 |      11 |       0 |         0 |  **11** |
| `connection_management_test.rb`                                        | `connection-management.test.ts`                                        |      11 |      11 |       0 |         0 |  **11** |
| `associations_test.rb`                                                 | `associations.test.ts`                                                 |     129 |       9 |       1 |         0 |  **10** |
| `locking_test.rb`                                                      | `locking.test.ts`                                                      |      50 |      10 |       0 |         0 |  **10** |
| `connection_pool_test.rb`                                              | `connection-pool.test.ts`                                              |      39 |      10 |       0 |         0 |  **10** |
| `nested_attributes_with_callbacks_test.rb`                             | `nested-attributes-with-callbacks.test.ts`                             |      10 |      10 |       0 |         0 |  **10** |
| `adapters/postgresql/array_test.rb`                                    | `adapters/postgresql/array.test.ts`                                    |      42 |       8 |       0 |         0 |   **8** |
| `associations/eager_load_includes_full_sti_class_test.rb`              | `associations/eager-load-includes-full-sti-class.test.ts`              |       8 |       8 |       0 |         0 |   **8** |
| `base_prevent_writes_test.rb`                                          | `base-prevent-writes.test.ts`                                          |       8 |       8 |       0 |         0 |   **8** |
| `migration_test.rb`                                                    | `migration.test.ts`                                                    |      86 |       7 |       0 |         4 |   **7** |
| `relations_test.rb`                                                    | `relations.test.ts`                                                    |     281 |       7 |       0 |         0 |   **7** |
| `adapters/postgresql/hstore_test.rb`                                   | `adapters/postgresql/hstore.test.ts`                                   |      44 |       7 |       0 |         0 |   **7** |
| `connection_adapters/merge_and_resolve_default_url_config_test.rb`     | `connection-adapters/merge-and-resolve-default-url-config.test.ts`     |      40 |       7 |       0 |         0 |   **7** |
| `adapters/postgresql/timestamp_test.rb`                                | `adapters/postgresql/timestamp.test.ts`                                |      14 |       7 |       0 |         0 |   **7** |
| `readonly_test.rb`                                                     | `readonly.test.ts`                                                     |      14 |       7 |       0 |         0 |   **7** |
| `adapters/abstract_mysql_adapter/case_sensitivity_test.rb`             | `adapters/abstract-mysql-adapter/case-sensitivity.test.ts`             |       7 |       7 |       0 |         0 |   **7** |
| `connection_adapters/connection_swapping_nested_test.rb`               | `connection-adapters/connection-swapping-nested.test.ts`               |       7 |       7 |       0 |         0 |   **7** |
| `base_test.rb`                                                         | `base.test.ts`                                                         |     171 |       6 |       0 |         0 |   **6** |
| `adapters/abstract_mysql_adapter/bind_parameter_test.rb`               | `adapters/abstract-mysql-adapter/bind-parameter.test.ts`               |      10 |       6 |       0 |         0 |   **6** |
| `connection_handling_test.rb`                                          | `connection-handling.test.ts`                                          |      10 |       6 |       0 |         0 |   **6** |
| `adapters/abstract_mysql_adapter/mysql_boolean_test.rb`                | `adapters/abstract-mysql-adapter/mysql-boolean.test.ts`                |       6 |       6 |       0 |         0 |   **6** |
| `adapters/postgresql/transaction_test.rb`                              | `adapters/postgresql/transaction.test.ts`                              |       6 |       6 |       0 |         0 |   **6** |
| `associations/eager_singularization_test.rb`                           | `associations/eager-singularization.test.ts`                           |       6 |       6 |       0 |         0 |   **6** |
| `adapters/postgresql/postgresql_adapter_test.rb`                       | `adapters/postgresql/postgresql-adapter.test.ts`                       |      67 |       5 |       0 |         0 |   **5** |
| `counter_cache_test.rb`                                                | `counter-cache.test.ts`                                                |      55 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/enum_test.rb`                                     | `adapters/postgresql/enum.test.ts`                                     |      19 |       5 |       0 |         0 |   **5** |
| `adapters/abstract_mysql_adapter/adapter_prevent_writes_test.rb`       | `adapters/abstract-mysql-adapter/adapter-prevent-writes.test.ts`       |      12 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/referential_integrity_test.rb`                    | `adapters/postgresql/referential-integrity.test.ts`                    |       6 |       5 |       0 |         0 |   **5** |
| `adapters/abstract_mysql_adapter/optimizer_hints_test.rb`              | `adapters/abstract-mysql-adapter/optimizer-hints.test.ts`              |       5 |       5 |       0 |         0 |   **5** |
| `adapters/abstract_mysql_adapter/transaction_test.rb`                  | `adapters/abstract-mysql-adapter/transaction.test.ts`                  |       5 |       5 |       0 |         0 |   **5** |
| `adapters/abstract_mysql_adapter/unsigned_type_test.rb`                | `adapters/abstract-mysql-adapter/unsigned-type.test.ts`                |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/collation_test.rb`                                | `adapters/postgresql/collation.test.ts`                                |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/create_unlogged_tables_test.rb`                   | `adapters/postgresql/create-unlogged-tables.test.ts`                   |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/deferred_constraints_test.rb`                     | `adapters/postgresql/deferred-constraints.test.ts`                     |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/numbers_test.rb`                                  | `adapters/postgresql/numbers.test.ts`                                  |       5 |       5 |       0 |         0 |   **5** |
| `adapters/postgresql/optimizer_hints_test.rb`                          | `adapters/postgresql/optimizer-hints.test.ts`                          |       5 |       5 |       0 |         0 |   **5** |
| `associations/has_one_through_disable_joins_associations_test.rb`      | `associations/has-one-through-disable-joins-associations.test.ts`      |       5 |       5 |       0 |         0 |   **5** |
| `invertible_migration_test.rb`                                         | `invertible-migration.test.ts`                                         |      28 |       4 |       0 |         0 |   **4** |
| `sanitize_test.rb`                                                     | `sanitize.test.ts`                                                     |      22 |       4 |       0 |         0 |   **4** |
| `instrumentation_test.rb`                                              | `instrumentation.test.ts`                                              |      18 |       4 |       0 |         0 |   **4** |
| `adapters/postgresql/quoting_test.rb`                                  | `adapters/postgresql/quoting.test.ts`                                  |      16 |       4 |       0 |         0 |   **4** |
| `associations/extension_test.rb`                                       | `associations/extension.test.ts`                                       |      12 |       4 |       0 |         0 |   **4** |
| `touch_later_test.rb`                                                  | `touch-later.test.ts`                                                  |      11 |       4 |       0 |         0 |   **4** |
| `relation/field_ordered_values_test.rb`                                | `relation/field-ordered-values.test.ts`                                |      10 |       4 |       0 |         0 |   **4** |
| `adapters/abstract_mysql_adapter/mysql_explain_test.rb`                | `adapters/abstract-mysql-adapter/mysql-explain.test.ts`                |       5 |       4 |       0 |         0 |   **4** |
| `adapters/postgresql/date_test.rb`                                     | `adapters/postgresql/date.test.ts`                                     |       5 |       4 |       0 |         0 |   **4** |
| `adapters/abstract_mysql_adapter/auto_increment_test.rb`               | `adapters/abstract-mysql-adapter/auto-increment.test.ts`               |       4 |       4 |       0 |         0 |   **4** |
| `adapters/postgresql/rename_table_test.rb`                             | `adapters/postgresql/rename-table.test.ts`                             |       4 |       4 |       0 |         0 |   **4** |
| `adapters/postgresql/transaction_nested_test.rb`                       | `adapters/postgresql/transaction-nested.test.ts`                       |       4 |       4 |       0 |         0 |   **4** |
| `associations/nested_error_test.rb`                                    | `associations/nested-error.test.ts`                                    |       4 |       4 |       0 |         0 |   **4** |
| `connection_adapters/adapter_leasing_test.rb`                          | `connection-adapters/adapter-leasing.test.ts`                          |       4 |       4 |       0 |         0 |   **4** |
| `connection_adapters/registration_test.rb`                             | `connection-adapters/registration.test.ts`                             |       4 |       4 |       0 |         0 |   **4** |
| `connection_adapters/standalone_connection_test.rb`                    | `connection-adapters/standalone-connection.test.ts`                    |       4 |       4 |       0 |         0 |   **4** |
| `database_configurations/url_config_test.rb`                           | `database-configurations/url-config.test.ts`                           |       4 |       4 |       0 |         0 |   **4** |
| `hot_compatibility_test.rb`                                            | `hot-compatibility.test.ts`                                            |       4 |       4 |       0 |         0 |   **4** |
| `numeric_data_test.rb`                                                 | `numeric-data.test.ts`                                                 |       4 |       4 |       0 |         0 |   **4** |
| `validations/i18n_validation_test.rb`                                  | `validations/i18n-validation.test.ts`                                  |       4 |       4 |       0 |         0 |   **4** |
| `calculations_test.rb`                                                 | `calculations.test.ts`                                                 |     233 |       3 |       0 |         0 |   **3** |
| `batches_test.rb`                                                      | `batches.test.ts`                                                      |     107 |       3 |       0 |         0 |   **3** |
| `reflection_test.rb`                                                   | `reflection.test.ts`                                                   |      63 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/uuid_test.rb`                                     | `adapters/postgresql/uuid.test.ts`                                     |      29 |       3 |       0 |         0 |   **3** |
| `connection_adapters/connection_handlers_multi_db_test.rb`             | `connection-adapters/connection-handlers-multi-db.test.ts`             |      20 |       2 |       1 |         0 |   **3** |
| `associations/left_outer_join_association_test.rb`                     | `associations/left-outer-join-association.test.ts`                     |      19 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/bytea_test.rb`                                    | `adapters/postgresql/bytea.test.ts`                                    |      14 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/money_test.rb`                                    | `adapters/postgresql/money.test.ts`                                    |      12 |       3 |       0 |         0 |   **3** |
| `statement_cache_test.rb`                                              | `statement-cache.test.ts`                                              |      11 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/xml_test.rb`                                      | `adapters/postgresql/xml.test.ts`                                      |       5 |       3 |       0 |         0 |   **3** |
| `adapters/abstract_mysql_adapter/mysql_enum_test.rb`                   | `adapters/abstract-mysql-adapter/mysql-enum.test.ts`                   |       4 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/composite_test.rb`                                | `adapters/postgresql/composite.test.ts`                                |       4 |       3 |       0 |         0 |   **3** |
| `habtm_destroy_order_test.rb`                                          | `habtm-destroy-order.test.ts`                                          |       4 |       3 |       0 |         0 |   **3** |
| `adapters/abstract_mysql_adapter/nested_deadlock_test.rb`              | `adapters/abstract-mysql-adapter/nested-deadlock.test.ts`              |       3 |       3 |       0 |         0 |   **3** |
| `adapters/abstract_mysql_adapter/set_test.rb`                          | `adapters/abstract-mysql-adapter/set.test.ts`                          |       3 |       3 |       0 |         0 |   **3** |
| `adapters/abstract_mysql_adapter/sp_test.rb`                           | `adapters/abstract-mysql-adapter/sp.test.ts`                           |       3 |       3 |       0 |         0 |   **3** |
| `adapters/postgresql/type_lookup_test.rb`                              | `adapters/postgresql/type-lookup.test.ts`                              |       3 |       3 |       0 |         0 |   **3** |
| `column_definition_test.rb`                                            | `column-definition.test.ts`                                            |       3 |       3 |       0 |         0 |   **3** |
| `connection_adapters/connection_handlers_multi_pool_config_test.rb`    | `connection-adapters/connection-handlers-multi-pool-config.test.ts`    |       3 |       3 |       0 |         0 |   **3** |
| `pooled_connections_test.rb`                                           | `pooled-connections.test.ts`                                           |       3 |       3 |       0 |         0 |   **3** |
| `unconnected_test.rb`                                                  | `unconnected.test.ts`                                                  |       3 |       3 |       0 |         0 |   **3** |
| `associations/has_many_through_associations_test.rb`                   | `associations/has-many-through-associations.test.ts`                   |     164 |       1 |       1 |         0 |   **2** |
| `attribute_methods_test.rb`                                            | `attribute-methods.test.ts`                                            |     133 |       2 |       0 |         0 |   **2** |
| `inheritance_test.rb`                                                  | `inheritance.test.ts`                                                  |      73 |       2 |       0 |         0 |   **2** |
| `attributes_test.rb`                                                   | `attributes.test.ts`                                                   |      38 |       2 |       0 |         0 |   **2** |
| `unsafe_raw_sql_test.rb`                                               | `unsafe-raw-sql.test.ts`                                               |      37 |       2 |       0 |         0 |   **2** |
| `associations/inner_join_association_test.rb`                          | `associations/inner-join-association.test.ts`                          |      31 |       2 |       0 |         0 |   **2** |
| `connection_adapters/schema_cache_test.rb`                             | `connection-adapters/schema-cache.test.ts`                             |      27 |       2 |       0 |         0 |   **2** |
| `relation/select_test.rb`                                              | `relation/select.test.ts`                                              |      26 |       2 |       0 |         0 |   **2** |
| `query_logs_test.rb`                                                   | `query-logs.test.ts`                                                   |      25 |       2 |       0 |         0 |   **2** |
| `log_subscriber_test.rb`                                               | `log-subscriber.test.ts`                                               |      21 |       2 |       0 |         0 |   **2** |
| `transaction_instrumentation_test.rb`                                  | `transaction-instrumentation.test.ts`                                  |      21 |       2 |       0 |         0 |   **2** |
| `relation/with_test.rb`                                                | `relation/with.test.ts`                                                |      16 |       2 |       0 |         0 |   **2** |
| `primary_class_test.rb`                                                | `primary-class.test.ts`                                                |       7 |       2 |       0 |         0 |   **2** |
| `adapters/postgresql/explain_test.rb`                                  | `adapters/postgresql/explain.test.ts`                                  |       5 |       2 |       0 |         0 |   **2** |
| `adapters/abstract_mysql_adapter/virtual_column_test.rb`               | `adapters/abstract-mysql-adapter/virtual-column.test.ts`               |       4 |       2 |       0 |         0 |   **2** |
| `database_statements_test.rb`                                          | `database-statements.test.ts`                                          |       3 |       2 |       0 |         0 |   **2** |
| `adapters/postgresql/domain_test.rb`                                   | `adapters/postgresql/domain.test.ts`                                   |       2 |       2 |       0 |         0 |   **2** |
| `associations/eager_load_nested_include_test.rb`                       | `associations/eager-load-nested-include.test.ts`                       |       2 |       2 |       0 |         0 |   **2** |
| `attribute_methods/read_test.rb`                                       | `attribute-methods/read.test.ts`                                       |       2 |       2 |       0 |         0 |   **2** |
| `statement_invalid_test.rb`                                            | `statement-invalid.test.ts`                                            |       2 |       2 |       0 |         0 |   **2** |
| `associations/has_many_associations_test.rb`                           | `associations/has-many-associations.test.ts`                           |     312 |       1 |       0 |         0 |   **1** |
| `finder_test.rb`                                                       | `finder.test.ts`                                                       |     261 |       1 |       0 |         0 |   **1** |
| `associations/belongs_to_associations_test.rb`                         | `associations/belongs-to-associations.test.ts`                         |     154 |       1 |       0 |         0 |   **1** |
| `transactions_test.rb`                                                 | `transactions.test.ts`                                                 |      98 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/schema_test.rb`                                   | `adapters/postgresql/schema.test.ts`                                   |      71 |       1 |       0 |         0 |   **1** |
| `encryption/encryptable_record_test.rb`                                | `encryption/encryptable-record.test.ts`                                |      51 |       1 |       0 |         0 |   **1** |
| `timestamp_test.rb`                                                    | `timestamp.test.ts`                                                    |      40 |       1 |       0 |         0 |   **1** |
| `adapters/abstract_mysql_adapter/connection_test.rb`                   | `adapters/abstract-mysql-adapter/connection.test.ts`                   |      26 |       0 |       1 |         0 |   **1** |
| `relation/update_all_test.rb`                                          | `relation/update-all.test.ts`                                          |      26 |       1 |       0 |         0 |   **1** |
| `adapters/mysql2/mysql2_adapter_test.rb`                               | `adapters/mysql2/mysql2-adapter.test.ts`                               |      23 |       1 |       0 |         0 |   **1** |
| `adapter_prevent_writes_test.rb`                                       | `adapter-prevent-writes.test.ts`                                       |      15 |       1 |       0 |         0 |   **1** |
| `delegated_type_test.rb`                                               | `delegated-type.test.ts`                                               |      13 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/foreign_table_test.rb`                            | `adapters/postgresql/foreign-table.test.ts`                            |      10 |       1 |       0 |         0 |   **1** |
| `validations/association_validation_test.rb`                           | `validations/association-validation.test.ts`                           |      10 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/infinity_test.rb`                                 | `adapters/postgresql/infinity.test.ts`                                 |       9 |       1 |       0 |         0 |   **1** |
| `finder_respond_to_test.rb`                                            | `finder-respond-to.test.ts`                                            |       9 |       1 |       0 |         0 |   **1** |
| `secure_token_test.rb`                                                 | `secure-token.test.ts`                                                 |       9 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/virtual_column_test.rb`                           | `adapters/postgresql/virtual-column.test.ts`                           |       7 |       1 |       0 |         0 |   **1** |
| `associations/required_test.rb`                                        | `associations/required.test.ts`                                        |       7 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/invertible_migration_test.rb`                     | `adapters/postgresql/invertible-migration.test.ts`                     |       6 |       1 |       0 |         0 |   **1** |
| `relation/predicate_builder_test.rb`                                   | `relation/predicate-builder.test.ts`                                   |       6 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/statement_pool_test.rb`                           | `adapters/postgresql/statement-pool.test.ts`                           |       3 |       1 |       0 |         0 |   **1** |
| `associations/bidirectional_destroy_dependencies_test.rb`              | `associations/bidirectional-destroy-dependencies.test.ts`              |       3 |       1 |       0 |         0 |   **1** |
| `date_test.rb`                                                         | `date.test.ts`                                                         |       3 |       1 |       0 |         0 |   **1** |
| `adapters/sqlite3/explain_test.rb`                                     | `adapters/sqlite3/explain.test.ts`                                     |       2 |       1 |       0 |         0 |   **1** |
| `active_record_test.rb`                                                | `active-record.test.ts`                                                |       1 |       1 |       0 |         0 |   **1** |
| `adapters/abstract_mysql_adapter/count_deleted_rows_with_lock_test.rb` | `adapters/abstract-mysql-adapter/count-deleted-rows-with-lock.test.ts` |       1 |       1 |       0 |         0 |   **1** |
| `adapters/abstract_mysql_adapter/sql_types_test.rb`                    | `adapters/abstract-mysql-adapter/sql-types.test.ts`                    |       1 |       1 |       0 |         0 |   **1** |
| `adapters/mysql2/check_constraint_quoting_test.rb`                     | `adapters/mysql2/check-constraint-quoting.test.ts`                     |       1 |       1 |       0 |         0 |   **1** |
| `adapters/postgresql/case_insensitive_test.rb`                         | `adapters/postgresql/case-insensitive.test.ts`                         |       1 |       1 |       0 |         0 |   **1** |
| `adapters/sqlite3/statement_pool_test.rb`                              | `adapters/sqlite3/statement-pool.test.ts`                              |       1 |       1 |       0 |         0 |   **1** |
| `column_alias_test.rb`                                                 | `column-alias.test.ts`                                                 |       1 |       1 |       0 |         0 |   **1** |
| `disconnected_test.rb`                                                 | `disconnected.test.ts`                                                 |       1 |       1 |       0 |         0 |   **1** |
| `invalid_connection_test.rb`                                           | `invalid-connection.test.ts`                                           |       1 |       1 |       0 |         0 |   **1** |
| `persistence/reload_association_cache_test.rb`                         | `persistence/reload-association-cache.test.ts`                         |       1 |       1 |       0 |         0 |   **1** |
| `prepared_statement_status_test.rb`                                    | `prepared-statement-status.test.ts`                                    |       1 |       1 |       0 |         0 |   **1** |
| `table_metadata_test.rb`                                               | `table-metadata.test.ts`                                               |       1 |       1 |       0 |         0 |   **1** |
| `type_caster/connection_test.rb`                                       | `type-caster/connection.test.ts`                                       |       1 |       1 |       0 |         0 |   **1** |
| `types_test.rb`                                                        | `types.test.ts`                                                        |       1 |       1 |       0 |         0 |   **1** |

171 files with pending work; 149 files at 100% (no skipped, no missing).

### Recent-merge followups (Phase 5 / defineSchema migration backlog)

Distilled from `~/.btwhooks/data/github/blazetrailsdev/trails/<PR#>/post-pr/*.md`. Findings files preserved.

- **Phase 5 root cluster B** (#1734): ~150 LOC `calculations.test.ts` (7596 LOC, 101 sites). ~200 LOC `persistence.test.ts` (4789 LOC, 141 sites). Schema maps will be large (Account, Company, Firm, Topic, Reply, Post). Inline `const adp = createTestAdapter()` in `beforeEach` exists outside `freshAdapter()` — separate grep pass after sed.
- **Phase 5 root cluster C** (#1737): ~250 LOC `enum.test.ts` (~77 sites). ~250 LOC `attribute-methods.test.ts` (~79 sites). ~150 LOC `attributes.test.ts` (~58 sites). ~80 LOC `attribute-methods/` subtree. Other root files: inheritance, multiparameter-attributes, nested-attributes, readonly, reflection, sanitize, secure-password, shard-keys, signed-id, statement-cache, strict-loading, time-precision, time-travel, transaction-_, query-cache, querying, relations, primary-class, instrumentation, instantiate-schema-types, filter-attributes, encryption-hooks, cache-key, batches, autosave, autosave-association, date-time_, counter-cache, annotate. **Patterns**: `as const` on TEST_SCHEMA with wrapped `{ columns, primaryKey }` breaks structural assignment — cast `: Schema` and drop `as const`. When sync factory becomes async, every caller's `it("...", () => {})` using `await` must flip to `async () => {`. `vi.stubEnv("AR_NO_AUTO_SCHEMA", "1")` hacks droppable.
- **batch 82 BLOCKED triage** (#1740): ~30 LOC port 3 hstore store_accessor tests (storeAccessor implemented at store.ts:329 + base.ts:1535). Before un-skipping "changes with store accessors", verify per-accessor dirty aliases (`<accessor>_changed?`, `_was`, `_change`) wired on storeAccessor module (~10 LOC if not). ~20 LOC per-attribute `<attr>_before_type_cast` alias generation in attribute-methods pipeline. `scripts/api-compare/unported-files.ts:480` has pre-existing `className` type error.
- **insert-all triage** (#1741): ~10 LOC extend `insert-all.ts#verifyAttributes` to reject unknown keys (throw `UnknownAttributeError`) — unblocks `insert all raises on unknown attribute` (L738) + 2 related. ~6 LOC `insertAllBang`/`upsertAllBang` class-level wrappers in `querying.ts`. ~250 LOC sharpen 60 `BLOCKED:` annotations into 3-line BLOCKED/ROOT-CAUSE/SCOPE. Clusters: timestamps (15, no implicit/explicit handling in `mapKeyWithValue`), RETURNING (4 pg), readonly (3, no `_readonlyAttributes` filter), schema/index (7). 63 `it.skip` mostly empty placeholders.
- **transactions slot D** (#1742): 2 deferred. `restore previously new record after double save` (transactions.test.ts ~L1167): `withTransactionReturningStatus` captures closure-local snapshot per call; two saves register their own `tx.afterRollback`; second clobbers first. Open Q: between save#1/save#2 in same outer user tx is `@_previously_new_record` actually mutated in Rails? Fix: use `_restoreTransactionRecordState` gated by level, OR only register `afterRollback` when `wasOutermostState`. Auto-declare `primaryKey = "movieid"` — `setPrimaryKeyAttr` is one-liner with no attribute registration; need lazy fix (declare only if no later `attribute()` or schema-load fires) to not clobber schema-driven type.
- **SQLite strict + dataSourceExists** (#1743): Reconcile floor — adapter allows ≥3.8.0 but `dataSourceExists()`/`tableExists`/`tables`/`views` require 3.37+. Raise to 3.37 (drop sqlite_master fallback, −20 LOC) or keep 3.8 + add fallbacks (+50 LOC). Rails resolves at 3.37+. `strict` honored only by node-sqlite (`enableDoubleQuotedStringLiterals`); better-sqlite3/expo-sqlite no-op. ~30 LOC node-sqlite `strict` test. ~20 LOC adapter→driver `strict` forwarding test.
- **TM phase 5 PG cluster A** (#1753): 3 failing `array.test.ts` tests (default, default strings, change column with array) pre-existing — root cause: `addColumn(..., { array: true, default: [4,4,2] })` blows up in `quoteDefaultExpression → quote` with `TypeError: can't quote Array`. ~30 LOC fix PG `quoteDefaultExpression` (postgresql/quoting.ts:193) and/or `addColumn` plumbing to serialize JS array through `OID::Array.serialize` before quoting. ~250 LOC next cluster: explain/hstore/infinity/interval/json/range/uuid/virtual-column PG test files. ~20 LOC extend `PrimitiveColumnSpec` with PG-only optional types (`citext`, `hstore`, `uuid`, `interval`, `oid`) + `array?` option. **Audit-script papercut** (scripts/audit-define-schema.ts:55-67): strips strings BEFORE line comments — apostrophe in `//` comment can consume content across lines.
- **TM phase 5 cache-key + autosave** (#1756): ~5 LOC `annotate.test.ts` — already green under `AR_NO_AUTO_SCHEMA=1` (toSql() only), flagged due to no `defineSchema()`. Either add no-op or refine audit script to exclude files with zero DB-touching ops (same false positive for `attribute-methods/*.test.ts`). ~250–350 LOC `batches.test.ts` (90 failing). ~250–350 LOC `counter-cache.test.ts` (85 failing).
- **calculations describes 3-7** (#1803): ~150 LOC 6 remaining describes (~L2750–7050) — tables: products, orders, topics + inline items/nullables/empties. ~30 LOC `bigint aggregates (big_integer columns)` (~L7378) — needs `big_integer` in defineSchema map. ~5 LOC `lookupCastTypeFromJoinDependencies` (L7489, no DB). ~200 LOC `persistence.test.ts` second half. **Bug-shape pattern**: inner `const adapter = freshAdapter()` shadows in describes 5-6 prevent `AR_NO_AUTO_SCHEMA=1` — watch for same in persistence.test.ts.
- **AutomaticInverseFindingTests** (#1806): Bundle 5 sibling describes in `inverse-associations.test.ts` (~80 LOC PR): InversePolymorphicBelongsToTests (~L1250), InverseCachedPathTests (~L1407), InverseAssociationTests (~L1485), inverse_of (~L1594), InverseHasOneTests (~L1659).
- **persistence.test.ts cluster A slice** (#1822): ~150 LOC continuation — large describe at ~L1144 (>1200 LOC, ends ~L2356). 121b clusters at ~L2358, 2453, 2662, 2682, 2724, 2744, 2777 (~200 LOC). 121c clusters at ~L3393–4729 (~200 LOC). ~10 LOC describe ~L978 audit — uses `defineSchema` but many no-op `expect(true).toBe(true)` placeholders.
- **autosave-association cluster A** (#1887): 1/26 describes migrated; ~163 tests still on auto-schema. Clusters: B TestDefaultAutosaveAssociationOnAHasMany (L494-837); C TestDefaultAutosaveAssociationOnAHasOne (L838-1309, may split); D TestAutosaveAssociationOnAHasOne (L1310-1633); E TestDefaultAutosaveAssociationOnABelongsTo (L1634-1857); F-Z 21 more (L1858-4637). Likely-must-split: TestAutosaveAssociationsInGeneral (L2296-2921); unnamed "should update children when autosave is true and parent is new but child is not" (L3824-4306).
- **has-many-associations cluster A** (#1891): 3 head describes (7 tests). File ~8450 LOC, ~610 inline `class … extends Base` — no `tableName =` overrides. Clusters by `// --` comments: Counting/Building/Creating; Finding/Replacing; Deleting/Counter-cache; STI/Polymorphic; Through/Dependent; Async; trailing HasManyAssociationsTestPrimaryKeys (~L8040) + AsyncHasManyAssociationsTest. Same-named tables across clusters have different shapes — schema per-describe (use `freshAdapterWithSchema(schema)` helper, not full-file `TEST_SCHEMA`).
- **relations.test.ts cluster A** (#1895): 5 of ~20 RelationTest describes (file ~6987 LOC). ~40 LOC L2148+ (Order + User variants). ~60 LOC items/users `_tableName`-pinned (L2713-3578). ~30 LOC references/eager-loading (L3578, 3738, 3805). ~30 LOC second top-level RelationTest at L4074 (Post: title/body/status/views/created_at). ~30 LOC final describes (L4232+).
- **associations.test.ts cluster A** (#1897): 5 of 38 describes (file ~9998 LOC). ~50 LOC DependentAssociations (L855-1113). ~20 LOC StrictLoading (L1114-1200). ~30 LOC AssociationDefinitions + AssociationReflection (L1201-1438). ~30 LOC HABTM (L1439-1539). ~40 LOC CounterCache + TouchBelongsToParents (L1540-1725). ~60 LOC Rails-guided (L1726-1976). 250+ LOC each: AssociationsTest mega-block (L1977+), BelongsToAssociationsTest (L4876), HasManyAssociationsTest (L4130), AssociationProxyTest, PreloaderTest. Trailing through L9998: OverridingAssociationsTest, GeneratedMethodsTest, WithAnnotationsTest, CollectionProxyDelegation, eagerLoadBang.
- **transaction-{isolation,callbacks,instrumentation}** (#1913): 3 `TM path:` cases in transaction-instrumentation.test.ts use dedicated per-test adapter (`freshIsolatedAdapter()`) — `Topic.afterCommit` stopped firing on shared adapter due to commit-side TM state pollution. ~20 LOC extend `resetTestAdapterState()` to reset `transactionManager` (or replace `_sharedAdapter`); then 3 tests + TransactionIsolationUnsupportedTest could share. ~5 LOC lazy-init outer `beforeEach` sharedAdapter.
- **encryptable-record-message-pack-serialized** (#1917): ~30 LOC collapse `encrypted_book_with_binary_message_pack_serializeds` (and likely `_first_binaries`, `_second_binaries`, `encrypted_book_with_binaries`) into shared `encrypted_books` by adding `logo` column. Audit Rails fixture schema (`encryptable_record_message_pack_serialized_test.rb:37-41`).
- **associations.test.ts cluster B** (#1919): 3 more describes (skipped 2 no-DB). Remaining: ~30 LOC CounterCache + TouchBelongsToParents (L1575-1760); ~30 LOC Rails-guided (L1761-2011); ~250 LOC each: AssociationsTest mega-block (L2012-3639), BelongsToAssociationsTest (L4876-6028), HasManyAssociationsTest (L6029-7220), PreloaderTest (L7593-9442); ~150 LOC AssociationProxyTest (L7221-7592); ~150 LOC trailing (~L10033). Mega-blocks define dozens of inline classes per `it()` — schema union per block. Don't migrate AssociationDefinitions/AssociationReflection (no persistence).
- **useTransactionalTests opt-out (B6.2)** (#1921): B6.3 (~60 LOC) wire `getUseTransactionalTests(adapter)` into global `beforeEach` in `test-setup-ar.ts`. B6.4 sweep (~5 LOC × ~50 files) — add `defineSchema(adapter, schema, { useTransactionalTests: false })` to candidates. ~5 LOC export from public test-helpers barrel. Per-adapter WeakMap storage vs Rails per-test-class.
- **defineSchema idempotent (B6 prep)** (#1922): ~30 LOC cascade-drop on parent-table signature change (reverse-topo order). Phase 6 hoist: `beforeEach(defineSchema)` → `beforeAll`; swap `resetTestAdapterState` for `BEGIN`/`ROLLBACK`.
- **transaction-instrumentation isolation** (#1923): Sidestepped MariaDB failure by per-test adapter; underlying TM bug live. Root cause: `_withinNewTransactionBody` (abstract/transaction.ts:1162-1178) — when catch path calls `this.rollbackTransaction()` and it throws (spied), TM stack frame never popped → next caller opens SAVEPOINT against transaction that never materialized (MariaDB symptom). Same on commit catch (L1183-1191). ~30 LOC wrap both `rollbackTransaction()` in `try { ... } finally { pop if still top, force incomplete }`. ~5 LOC audit other test files spying on `tm.rollbackTransaction`/`commitDbTransaction` with shared adapter.
- **setupAdapterSuite helper** (#1971): Helper ships unused. ~30 LOC × ~8 PG candidates: `foreign-table`, `citext`, `infinity`, `interval`, `datatype`, `json`, `virtual-column`, `explain`. Group as 2-3 PRs of 3 files. ~50 LOC `define-schema-pg-types.test.ts`. ~80 LOC MySQL `mysql-explain.test.ts` + `schema.test.ts` (MariaDB DDL auto-commit caveat). Skip migration / mark opt-out: `sqlite3-adapter.test.ts` (644 LOC); `adapters/postgresql/{schema,uuid,range,array,hstore,bytea}.test.ts` (3500+ LOC mid-body schema mutation). ~30 LOC refactor `encryption/uniqueness-validations.test.ts` + `extended-deterministic-queries.test.ts` to use helper.
- **HABTM reuse adapter (B1966)** (#1976): ~80–120 LOC promote HABTM file to `withTransactionalFixtures` — mirror #1977. Tables: rich_person2s, treasure2s, treasures_rich_people2, cj_developers, cj_projects, custom_joins, same_devs/projs/joins, multi_owners, tag_as/bs, multi_owners_tag_as/bs, parent_owners, child_owners, parent_owners_p_tags, child_owners_c_tags + developers/projects/developer_projects.
- **polymorphic has-many describes (B1966a)** (#1977): Only 5 polymorphic/`as:` tests extracted from head describe (L262-8038). ~7600 lines still on per-test `freshAdapter()`. Two sibling describes with same name now — `test:compare` happy but readability sharp edge. ~250 LOC per batch. ~50 LOC opportunistic hoist `class Author/Post` from 4+ test redeclarations to module scope. File ~2.6× Rails size (8567 vs 3285) because each `it()` redeclares its own class block. **Document in test-compare workflow**: describe-name mismatch flags previously-passing tests as wrong-describe.
- **has-many building cluster (B1966e)** (#1982): Remaining sections in `has-many-associations.test.ts` head describe (~L263): Counting (3), Finding (7), Deleting (4), Destroying (7), Dependence (1), Get/Set IDs (3), Included in collection (2), Clearing (2), Counter cache (4), Has many on new record (1), Calling size/empty (many), Association definition, Scoped queries. Could move into same building-cluster describe without changing test bodies; per-cluster split cleaner (~150–250 LOC each).
- **uniqueness-validation float scope** (#2025): ~10 LOC if `defineSchema`'s `"float"` widens to `DOUBLE`/`DOUBLE PRECISION` on MySQL, revert test value `9.5` → `9.99`. `COLUMN_TYPE_MAP_MYSQL.float` currently `"float"` (single-precision MariaDB FLOAT).

---

### Appendix A: TS-ahead files (de-dup candidates)

Files with more active TS `it()`s than Rails has tests. `test:compare` does not flag these. Most are intentional supplemental coverage; some may overlap with sibling files. Surfaced by 2026-05-19 audit.

| File                                           |  TS | Rails | Ahead |
| ---------------------------------------------- | --: | ----: | ----: |
| adapters/postgresql/postgresql-adapter.test.ts | 148 |    67 |   +81 |
| relation/where.test.ts                         | 123 |    62 |   +61 |
| scoping/default-scoping.test.ts                | 151 |    96 |   +55 |
| adapters/postgresql/range.test.ts              |  93 |    46 |   +47 |
| validations/uniqueness-validation.test.ts      | 100 |    55 |   +45 |
| scoping/named-scoping.test.ts                  | 111 |    73 |   +38 |
| associations/has-many-associations.test.ts     | 309 |   272 |   +37 |
| relation/annotations.test.ts                   |  37 |   _2_ | _+35_ |
| tasks/database-tasks.test.ts                   | 107 |    78 |   +29 |
| adapters/postgresql/geometric.test.ts          |  54 |    29 |   +25 |

70 additional TS-ahead files are within ±25.

> _Italic row = known stem-name mismatch; `relation/annotations.test.ts` real counterpart is `cases/annotate_test.rb`. Re-audit before acting._

### Appendix B: No-Rails-counterpart files

TS files that have no single Rails test file equivalent — `test:compare` excludes them by design.

**TS-only infra:** `adapters/sqlite3-adapter`, `connection-adapters/abstract/{connection-pool/queue,database-statements,database-limits,savepoints,schema-dumper}`, `connection-adapters/{pool-config,pool-manager}`, `connection-adapters/sqlite3/quoting`, `relation/{query-attribute,thenable}`, `tasks/{mysql,postgresql,sqlite}-database-tasks`.

**Possibly mis-identified:** `associations/habtm` (2 tests; likely duplicate of `habtm-associations`), `database-configurations/connection-url-resolver` (12 tests; TS-specific URL resolver).

### Appendix C: BLOCKED-by-feature summary

Cluster-level view of the 24 BLOCKED files surfaced by the 2026-05-19 audit (closing requires implementation LOC, not test LOC):

| Cluster                 | BLOCKED files | Feature needed                                                     |
| ----------------------- | ------------: | ------------------------------------------------------------------ |
| associations            |             6 | Polymorphic through join model, STI inverse dispatch               |
| connection-adapters     |             4 | Nested connection swapping, role/shard context                     |
| encryption              |             3 | Key rotation edge cases, deterministic context                     |
| relation                |             3 | load_async (permanent/Ruby-only), missing/associated query methods |
| coders                  |             1 | YAML column coder                                                  |
| database-configurations |             1 | URL resolver edge cases                                            |
| tasks                   |             1 | Rake infrastructure                                                |
| persistence             |             1 | Transaction-aware persistence edge                                 |
| type-caster             |             1 | Type-caster edge case                                              |

### Appendix D: Audit reproducibility + limitations

The 2026-05-19 audit covered the 228 `packages/activerecord/src/**/*.test.ts` files with at least one commit dated before 2026-04-15 (`git log --before=2026-04-15 --name-only`).

**Limitations of the audit (not of `test:compare`):**

- **Assertion-quality not analyzed.** For matching-name tests, assertion bodies were not compared line-for-line. A test with the same name but weaker assertions is invisible. `test:compare` has the same blind spot.
- **Stem-name matching is fuzzy.** Rails counterparts located by `foo.test.ts → foo_test.rb`. Known mismatch: `relation/annotations.test.ts` (real counterpart `cases/annotate_test.rb`).
- **Counts use `grep -cE '^\s*it\('` (TS) and `grep -cE '^\s*(def test_|test ")'` (Rails)** — minitest declarations only. Authoritative numbers live in `pnpm test:compare --cached --json`.
