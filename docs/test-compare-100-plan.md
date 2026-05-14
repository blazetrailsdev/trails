# activerecord test:compare → 100% — Strategy + Workflow

**Snapshot 2026-05-11:** api:compare is closed at 100% (4969/4969 methods). Remaining work is test:compare un-skips — getting Rails-mirrored test bodies to run and pass.

**This doc is the strategy + vocabulary reference.** Active work — in-flight PRs, post-merge followups, story count — lives in [`activerecord-100-plan.md`](activerecord-100-plan.md). Per-cluster slot detail (slot descriptions, LOC sizing, audit attribution, overlap notes) lives in [`activerecord-100-clusters.md`](activerecord-100-clusters.md). Read this doc when you're starting fresh and need to understand _how_ we work; read the plan when you want to see _what's open today_; read the clusters when you're picking _which slot to spawn_.

**PR sizing target: ~250 LOC** (range 220–280 within the 300-LOC hard ceiling from CLAUDE.md). No small PRs (review-cycle overhead per PR is fixed; 50-LOC PRs aren't worth it). No huge PRs (anything ≥300 needs to split). Bundle small adjacent gaps into ~250-LOC slots; split anything that overflows along a natural seam.

Use the **test:compare prompt template** (`$HOME/github/blazetrailsdev/test-compare-prompt-template.md`) when spawning un-skip agents. The agent prompt templates live in the parent-of-repo directory by convention (alongside `audit-prompt-template.md`); they're consumed by the local `prompt-agent` skill and intentionally not checked into the repo. If you don't have that local checkout layout, you can read either template from any contributor with one and copy it to the same path.

---

## Strategy

**Audit first, work second, integrated last.**

For each `BLOCKED:` category, the plan has two phases:

1. **Audit (read-only research; no PR).** Read Rails feature source + test file end-to-end; identify obvious impl gaps without writing un-skip code. Capture findings via the `/audit-report` skill — the deliverable is a markdown report, not a GitHub PR. The parent session triages the inventory into sized slots.
2. **Work PRs.** Triage from the audit produces a list of specific gaps. Each gap becomes a sized slot. Tests un-skip naturally as gaps close.

**Within categories, isolated → integrated:**

- Tier 1 (do first): isolated behaviors with bounded code surface — `type`, `i18n`, `validation`, `query-cache`, `load-async`, `serialization`, `encryption`.
- Tier 2: adapter-level — `adapter-pg`, `adapter-mysql`, `adapter-sqlite`, `schema`, `connection-pool`.
- Tier 3: mid-layer features — `transactions`, `migration`.
- Tier 4 (do last): highly-integrated — `relation`, `STI`, `associations`. These touch everything; closing them earlier means re-opening them every time a Tier 1–3 fix lands.

**Permanent / out-of-scope:** `rake`, `GVL`, Marshal/YAML serialization, fixture loader, dbconsole live in `scripts/api-compare/unported-files.ts`. See "Tests that don't translate" below for the canonical record.

---

## Workflow per category

### Audit (read-only research, no GitHub PR)

**Goal:** read the Rails feature + test surface end-to-end, identify obvious impl gaps in our codebase, file specific work slots.

**Hard rule:** no source/test code changes, no PR. Deliverable is a single `/audit-report <slug> <markdown>` invocation. See `$HOME/github/blazetrailsdev/audit-prompt-template.md` for the dispatch template.

**Audit body structure:** Coverage (what was read) → Gap inventory (each gap typed `missing` / `partial-impl` / `signature-drift` / `test-helper-gap` / `fixture-gap` / `annotation-drift`, with file+symbol, Rails reference, estimated LOC, tests it would unblock) → Suggested work-PR slots (each ~220–280 LOC).

**Step 0 — unported-files gate.** Before proposing any implementation slot, check `scripts/api-compare/unported-files.ts`. If any Rails source in scope is in `UNPORTED_FILES` (by `pattern` or `testFile`), propose **exclusion**, not implementation. This rule exists because audit-load-async proposed a 4-slot ~640-LOC plan for `FutureResult` / `Promise` / `AsynchronousQueriesTracker` — all three unported. Reconciliation cost was real.

### Work PRs (after audit)

**Goal:** un-skip tests for a specific gap (or cluster of related gaps) identified in the audit.

Use the **standard test:compare prompt template** at `$HOME/github/blazetrailsdev/test-compare-prompt-template.md`. Substitute `<TARGET FILE>`, `<RAILS REFERENCE>`, `<BUCKET>`, `<EXPECTED COUNT>`.

The template enforces:

- 1:1 Rails-port for test names + variables + function calls.
- Acceptable language deviations vs. Trails gaps.
- `BLOCKED:` / `ROOT-CAUSE:` / `SCOPE:` annotation format.
- "Workarounds = bugs" rule.
- Per-test loop: pass / surgical fix (≤20 LOC) / sharpen-and-skip.
- `/post-merge-findings` reporting after merge for anything out-of-scope.
- `defineSchema` + `AR_NO_AUTO_SCHEMA` test-helper conventions (see `docs/explicit-test-schema-plan.md` for the migration plan).

### Per-test loop

For each `it.skip(...)` (or `xit(...)`, `test.skip(...)`, `describe.skip(...)`):

1. Attempt to un-skip and run.
2. **Pass** → un-skip, commit.
3. **Failing with surgical fix (≤20 LOC, in-scope)** → fix, un-skip, commit.
4. **Failing with deep gap** → leave skipped; upgrade the annotation to the format below.

---

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

Categories: `marshal`, `yaml`, `psych`, `gvl`, `fork`, `rake`, `pty`, `dbconsole`, `message-pack`, `future_result`.

---

## Controlled vocabulary

| Category                   | Meaning                                                                                                                                                                                                                                                               |
| -------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BLOCKED: STI`             | Single-table inheritance routing                                                                                                                                                                                                                                      |
| `BLOCKED: associations`    | Specific association feature (specify which: habtm / inverse / through / ...)                                                                                                                                                                                         |
| `BLOCKED: encryption`      | Encryption subsystem gap                                                                                                                                                                                                                                              |
| `BLOCKED: schema`          | Schema introspection / dumper / definition gap                                                                                                                                                                                                                        |
| `BLOCKED: transactions`    | Transaction / savepoint / isolation gap                                                                                                                                                                                                                               |
| `BLOCKED: query-cache`     | Query cache behavior                                                                                                                                                                                                                                                  |
| `BLOCKED: load-async`      | Async query / future result — likely permanent → `unported-files.ts`                                                                                                                                                                                                  |
| `BLOCKED: GVL`             | Ruby thread / GVL — likely permanent → `unported-files.ts`                                                                                                                                                                                                            |
| `BLOCKED: serialization`   | Ruby Marshal / YAML round-trip — likely permanent → `unported-files.ts`                                                                                                                                                                                               |
| `BLOCKED: rake`            | Rake / dbconsole shell-out — likely permanent → `unported-files.ts`                                                                                                                                                                                                   |
| `BLOCKED: fixture`         | Test needs a fixture set ported to TS. **Stays BLOCKED (not PERMANENT-SKIP).** TS-native fixture infrastructure shipped via `defineFixtures` / `useFixtures` (PRs #1470, #1471, #1480, #1481, #1484, #1487, #1489); per-cluster fixture data folds into cluster work. |
| `BLOCKED: migration`       | Migration runner feature                                                                                                                                                                                                                                              |
| `BLOCKED: connection-pool` | Connection pool / handler / pool config gap                                                                                                                                                                                                                           |
| `BLOCKED: relation`        | Relation API gap (specify which: where / scope / batches / ...)                                                                                                                                                                                                       |
| `BLOCKED: i18n`            | I18n message / translation gap                                                                                                                                                                                                                                        |
| `BLOCKED: validation`      | Validator behavior gap (specify which: uniqueness / length / numericality / ...)                                                                                                                                                                                      |
| `BLOCKED: type`            | Type cast / serialize / deserialize gap (specify which Type)                                                                                                                                                                                                          |
| `BLOCKED: adapter-pg`      | PostgreSQL-specific adapter gap                                                                                                                                                                                                                                       |
| `BLOCKED: adapter-mysql`   | MySQL-specific adapter gap                                                                                                                                                                                                                                            |
| `BLOCKED: adapter-sqlite`  | SQLite-specific adapter gap                                                                                                                                                                                                                                           |
| `BLOCKED: range`           | pg/range type behavior                                                                                                                                                                                                                                                |
| `BLOCKED: unknown`         | Could not categorize from context; needs human triage                                                                                                                                                                                                                 |

Adding a new category: pick a kebab-case slug, document in this table.

### Cross-file consolidation pass

```bash
grep -rn "BLOCKED:" packages/activerecord/src --include='*.test.ts' \
  | sed 's/.*BLOCKED: //' | cut -d' ' -f1 | sort | uniq -c | sort -rn
```

Output ranks subsystems by blocked-test count. Biggest groups become focused subsystem-fix PRs. Live picture: re-run any time.

### Why this is better than per-test issues

- Agents don't file 50 issues for 50 tests blocked by 5 root causes.
- Annotation lives next to the failing test; no issue-tracker round-trip needed.
- The grep is rerunnable; priorities update as state shifts.

---

## Tracking & cadence

- Run `pnpm test:compare --package activerecord` after each merge.
- Open all PRs as draft; run `/link <PR#>` after opening.
- Per CLAUDE.md: do NOT rename Rails-derived test names.
- After each work PR merges, run `/post-merge-findings` with anything out-of-scope (loose ends, deviations from Rails, sized followup work). Skip the skill if the PR was purely mechanical with no findings.

---

## Tests that don't translate to TypeScript / Node

Permanently not-portable tests are excluded via `UNPORTED_FILES` in `scripts/api-compare/unported-files.ts` (whole-file entries with `testFile`, or per-test exclusions via `tests: [...]` for mixed files; optional `className?` for shared-name test classes). This drops them from both the Ruby denominator and the skipped backlog.

**Foundational exclusion PRs:**

- **#1304** added whole-file exclusions — 8097 → 7970 Ruby tests (−127), 2211 → 2085 skipped (−126).
- **#1305** added per-test exclusion infra — 7970 → 7930 Ruby tests (−40), 2085 → 2048 skipped (−37).
- **#1391** Class 1 normalization — ~152 BLOCKED → PERMANENT-SKIP across 14 fully-excluded test files.
- **#1392** added `className?` filter for per-test exclusions; -12 from load_async denominator.
- **#1396** added `testFile` to source-only exclusions; orphan BLOCKED cleanup.
- **#1397** Class 2 normalization — 37 per-test BLOCKED → PERMANENT-SKIP in mixed-status files.
- **#1400** renamed `excluded-files.ts` → `unported-files.ts`; fully excluded `load_async_test.rb`.

### Canonical not-portable list

**YAML / Marshal / Ruby object serialization ✓ excluded:**

- `yaml_serialization_test.rb`, `binary_test.rb`, `marshal_serialization_test.rb`, `coders/yaml_column_test.rb`, `message_pack_test.rb` — full-file exclusions.
- `serialized_attribute_test.rb` — 19 YAML/class-serializer cases (per-test).
- `base_test.rb` — 7 Marshal cases (per-test).

**Ruby concurrency / thread / GVL ✓ excluded:**

- `transaction_isolation_test.rb`, `schema_loading_test.rb`, `reload_models_test.rb` — full-file.
- `connection_pool_test.rb` — 11 GVL thread cases (per-test).
- `base_test.rb` — 2 GVL thread-handler cases (per-test).
- `load_async_test.rb` — full-file (#1400); `Concurrent::ThreadPoolExecutor` cases also covered by `className` filter for `LoadAsyncMulti/MixedThreadPoolExecutorTest` (#1392).

**Process / Signal / fork:**

- `reaper_test.rb` — 1 fork case (per-test).

**Rake / dbconsole shell-out ✓ excluded:**

- `adapters/postgresql/postgresql_rake_test.rb` (37), `adapters/mysql2/mysql2_rake_test.rb` (26), `adapters/sqlite3/sqlite_rake_test.rb` (17) — full-file.
- `adapters/{postgresql,mysql2,sqlite3}/dbconsole_test.rb` (16) — full-file.

**Fixtures ✓ excluded:**

- `fixtures_test.rb` (111), `fixture_set/file_test.rb` (14), `test_fixtures_test.rb` (4) — full-file.

**Ruby exception classes / object model / encoding / symbols:**

- `NameError#missing_name?`, `Module#prepend` ordering, `singleton_class` semantics — flagged as `BLOCKED: GVL` or moved to unported on next sweep.
- `binary_test.rb` `Encoding::ASCII_8BIT` vs `Encoding::UTF_8` (excluded with the file).
- `bytea_test.rb` cases on Ruby `String#encoding` — case-by-case.
- Cases distinguishing `Symbol` from `String` — case-by-case.

---

## See also

- [`activerecord-100-plan.md`](activerecord-100-plan.md) — live work tracker: in-flight PRs, post-merge fidelity followups, story count, guardrails.
- [`activerecord-100-clusters.md`](activerecord-100-clusters.md) — per-cluster slot detail: slot descriptions, LOC sizing, audit attribution, overlap notes.
- [`docs/explicit-test-schema-plan.md`](explicit-test-schema-plan.md) — `defineSchema` + `AR_NO_AUTO_SCHEMA` migration plan for test infrastructure.
- [`scripts/api-compare/unported-files.ts`](../scripts/api-compare/unported-files.ts) — canonical not-portable list with reasons.
- `$HOME/github/blazetrailsdev/test-compare-prompt-template.md` — agent prompt template for un-skip work.
- `$HOME/github/blazetrailsdev/audit-prompt-template.md` — agent prompt template for read-only audits.
