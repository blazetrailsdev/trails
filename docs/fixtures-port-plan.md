# Fixtures port plan

Tracks the port of Rails `activerecord/test/fixtures/*.yml` to TS so that
ported AR tests can call `useFixtures([...])` instead of inlining
`defineSchema()` / row inserts in `beforeAll`. **All 122 fixtures
translated** (PRs 0–6b + 0.5a–g + 0.75 + 4-late merged 2026-05-20…21).
`pnpm fixtures:compare` reports **match=94 diff=8 missing=0
erb-unsupported=20** under soft mode. PR 7's strict-fail flip is blocked
on the 8 DIFF + 20 ERB-UNSUPPORTED + the test-body port; see "Loose ends"
below.

## Loose ends before PR 7 can ship

PR 7 flips `fixtures:compare` MISSING/DIFF to hard-fail and removes the
four fixtures-related entries from `scripts/api-compare/unported-files.ts`.
**Strict-mode blockers** (must close or move to an explicit allow-list
before PR 7b can ship): the compare-script DIFF enhancements, the
ERB-UNSUPPORTED handling, and the PR 7a test-body port. The remaining
subsections — loader gaps and schema-side residuals — are _informational
follow-ups_ recorded here so PR 8 (PoC conversion) doesn't pick a
non-loadable fixture and so future schema-column policy changes have a
sized list ready; neither blocks strict mode under current behavior.
Cross-referenced to merged PRs; the source finding files this
section was distilled from are available in each PR's GitHub review
thread and (for local runs of btwhooks) under
`~/.btwhooks/data/github/blazetrailsdev/trails/<PR#>/post-pr/`.

### Compare-script enhancements blocking strict mode (~150 LOC total)

The 8 remaining DIFFs are all `scripts/fixtures-compare/compare.ts`
gaps, not fixture-data bugs. Per #2228 post-merge findings:

1. **~40 LOC — enum-symbol comparator.** `books` / `other_books` use
   Rails enum symbols (`:published`, `:english`) in YAML; TS stores
   the mapped integer. Needs a per-column enum resolver (model metadata
   lookup or configurable map) in `canonicalizeRailsRow` /
   `compareValue`.
2. **~30 LOC — HABTM key handling.**
   `dead_parrots.deadbird.treasures: [ruby, sapphire]` and
   `live_parrots.dusty.treasures` are HABTM list-form.
   `canonicalizeRailsRow` keeps the key when `columns === null` (STI
   subclasses report
   `schema:not-ported`); either look up the STI parent's schema or
   drop array-valued association keys.
3. **~30 LOC — custom `foreign_key:` override map.** `sponsors`:
   `belongs_to :sponsor_club, class_name: "Club", foreign_key: "club_id"`,
   so YAML `sponsor_club: moustache_club` maps to column `club_id`.
   `canonicalizeRailsRow` only handles default `<assoc> → <assoc>_id`.
4. **~50 LOC — datetime + YAML-coder serialization tolerance.**
   `topics` / `other_topics` `written_on` / `bonus_time` diff because
   Rails Time-with-tz format vs TS string; `content` is YAML-serialized.
   Needs serialization-aware normalization in `compareValue`.
5. **deps** — `developers_projects` DIFF is a numeric FK pointing into
   `developers.yml` which is ERB-UNSUPPORTED. Resolves once item (8)
   below lands or via an id-index fallback for ERB-skipped tables.

### ERB-UNSUPPORTED files (20 — all 0 rows compared)

These are skipped entirely under soft mode; strict mode needs each
either parseable by the compare script or covered by an explicit
allow-list. From #2208, #2214, #2227 findings:

6. **Closed by #2247.** `stripErb` now reverses
   `<%= ActiveRecord::FixtureSet.identify(:label) %>` and the literal-
   array form of
   `<%= ActiveRecord::FixtureSet.composite_identify(:label, [:a, :b])[:key] %>`
   to the
   `fixtureId()`-equivalent integer (`CRC32 % MAX_ID` and
   `(crc32(label) << index) % MAX_ID` respectively, mirroring
   `fixtures.rb#identify` / `#composite_identify`). All 12
   identify-using fixtures (`pirates`, `mateys`, `parrots_pirates`,
   `peoples_treasures`, `memberships`, the `sharded_*` cluster, the
   `cpk_order_*` pair, `cpk_reviews`) now compare.
7. **Closed by #2247.** Loop expander handles
   `<% (lo..hi).each do |v| %>` and `<% N.times do |v| %>` (with
   `<%= expr %>` / `#{expr}` body interpolation via a constrained
   integer-arithmetic evaluator, 200-row cap). Residual opaque
   `<%= ... %>` (`2.weeks.ago.to_fs(:db)`, `binary(...)`,
   `Cpk::Order.primary_key` lookups) collapses to a sentinel and the
   per-attr diff increments `attrsSkipped` instead of dropping the
   file. Clears developers, edges, vertices, categories_ordered, plus
   per-attr skips on binaries, pirates, memberships, cpk_order_agreements.
8. **PR 7b allow-list (3 ERB-UNSUPPORTED stragglers remain after #2247):**
   - `mixins.yml` — second ERB block is a Ruby array-of-arrays each
     (`<% [[4001,0,1,20], ...].each do |s| %>`). TS already encodes
     the rows; would need an array-literal-iteration grammar in
     `stripErb` or an explicit allow-list entry.
   - `paragraphs.yml` — 1001-row loop, above the expander cap.
   - `citations.yml` — 65536-row loop. Expanding would parse-stall the
     script; cap stays in place.

   **DIFF follow-ups surfaced by #2247** (newly comparable, real port
   gaps unrelated to ERB):
   - `developers.yml` `david.shared_computers` column not declared in
     `TEST_SCHEMA`/`developers.ts`.
   - `binaries.yml` `flowers.data` (the `!binary` blob row) missing
     from `binaries.ts`.

### Schema-side residuals (informational column, not a hard-fail blocker)

`pnpm fixtures:compare` reports a `schema:…` token per file independent
of the MATCH/DIFF status. Today: **`schema — ported=87/102
extras-flagged=0 (skipped 20)`**. 15 fixtures still report
`schema:not-ported` — most are STI subclasses sharing a parent table
(`dead_parrots`, `live_parrots`, `other_*`, `bad_posts`,
`encrypted_book_that_ignores_cases`) or a singular/plural mismatch
(`aircrafts.yml` vs `:aircraft`). These are comparator lookup
quirks, not real schema gaps, and current behavior doesn't hard-fail
on the schema column. If PR 7b promotes `schema:not-ported` to
hard-fail, address with:

9. **~15 LOC — STI parent-table lookup + fixture-file → table alias
   map** in `scripts/fixtures-compare/compare.ts` so STI children
   pick up the parent's column list and `aircrafts.yml` validates
   against `TEST_SCHEMA.aircraft`. (#2213.) Otherwise skip and keep
   the schema column informational.

### Test-body port (PR 7a — ceiling waiver section, ~1.9k LOC of Ruby)

Per #2227 findings, the test bodies named in the existing PR 7 entry
break out cleanly as `7a`:

- `vendor/rails/activerecord/test/cases/fixtures_test.rb` — 1847 LOC,
  153 tests.
- `vendor/rails/activerecord/test/cases/test_fixtures_test.rb` — 74 LOC.
- `vendor/rails/activerecord/test/cases/encryption/encrypted_fixtures_test.rb`
  — 22 LOC.

Once these land (with the 4 entries still in
`scripts/api-compare/unported-files.ts`), the
**~30 LOC PR 7b** flips compare to hard-fail + removes those exclusions.

### Loader gaps required by ported-but-not-yet-loadable fixtures

These don't block compare strictness, but they block tests from actually
calling `useFixtures([...])` against the ported data. Recorded here so
PR 8 (PoC conversion) doesn't accidentally pick a fixture that can't
load:

- **~20 LOC — `resolveDeclaredPk` string-PK support** in
  `packages/activerecord/src/test-helpers/define-fixtures.ts`. Blocks
  `subscribers.ts` (Rails `Subscriber.primary_key = "nick"`) and
  `string-key-objects.ts`. From #2205 + #2214 findings.
- **~30–50 LOC — `defineFixtures` NOT NULL `created_at`/`updated_at`
  auto-stamp.** Unblocks `people.ts` (Rails schema has
  `t.timestamps null: false`; YAML omits both — Rails' loader stamps
  them). From #2209.
- **~40 LOC — enum-aware insert.** `parrots.breed: "australian"` and
  `memberships.type: "CurrentMembership"` are model enums; loader
  needs to route through the attribute layer (or a small enum-lookup
  helper) before insert. From #2208, #2209.
- **~80–150 LOC — `defineFixtures` belongs_to-reflection → FK-column
  resolver.** Lets future fixture `.ts` stay byte-closer to YAML
  (write `club: foo` instead of `club_id: ref("clubs", "foo")`).
  From #2209.
- **~20 LOC — `fixtures:compare` id-index keyed by the schema's
  declared PK column, not hard-coded `id`.** Clears soft-fail noise
  for non-`id`-PK tables (owners/pets/toys/keyboards). From #2209.
- **~50 LOC — `ref()` accepts a key-path**
  (`ref("cpk_orders", "label", "id")`) so composite-FK fixtures can
  address a specific PK component. Required before strict mode for
  the CPK cluster. From #2212.
- **~5 LOC — `defineFixtures` registry rollback widening.** Commit
  `adapterIds.set(tableName, tableIds)` after the row-building loop,
  or widen the existing try/catch. Pre-existing #2125 finding,
  unchanged.

### Plan / doc clean-ups (small)

- **~1–2 lines, Translation Rules.** Add: "when a fixture uses Rails
  `_fixture: model_class:`, `ref()` arguments use the destination
  model's `tableName`, not the fixture-file name." (#2205 finding #3,
  bit `other-topics` and `other-comments`.)
- Note in this doc that `pnpm fixtures:compare` requires
  `@blazetrails/activesupport` + `@blazetrails/globalid` to be built
  locally (`pnpm -r --filter '!website' build`); CI builds deps first
  but a cold local run reports spurious `TS-IMPORT-ERR`. (#2227.)

### Out of scope (recorded so they don't drift back in)

- `aircrafts.yml` `schema:not-ported` because Rails table is
  `:aircraft` (singular) — comparator-side alias map, ~10 LOC,
  optional polish. (#2213.)
- `_fixture.ignore` anchor-row support so `other_books` can promote
  from "rows: 2/2 with anchors expanded" to anchor-aware MATCH —
  cosmetic. (#2205.)
- Local-only TS-IMPORT-ERR before a build — diagnostic message only.

## Why

1. **Provide the test-data substrate for porting Rails tests.** Every
   fixture-driven Rails test file we want to port resolves rows like
   `authors(:david)` or `posts(:welcome)`. Without TS counterparts those
   tests can't be ported at all. The loader (`defineFixtures()`,
   `useFixtures()`, `ref()`, `FixtureSet`) is already implemented;
   `test_fixtures.rb` and the Rails fixture test files stay excluded from
   `unported-files.ts` until the data lands here. (Removing those
   exclusions is also gated on a Vitest harness equivalent of Minitest's
   `setup_fixtures` hook — `use-fixtures.ts` already supplies that piece.)
2. **Kill the inline-DDL hazard.** Phase 6 keeps tripping on
   `defineSchema()` calls inside `it()` bodies under PG/MySQL (see
   the inline-DDL hazard documented in agent memory). A canonical schema + named
   fixtures matches Rails' "load once in `setup_fixtures`" model and
   removes the surface where this can happen.
3. **Mechanical parity.** With Rails ids mirrored verbatim (see Decision
   1), row IDs match Rails byte-for-byte. Ported tests that assert
   specific IDs (or count joined rows) become drop-in.

## Current state

- **All 122 Rails fixtures translated** under
  `packages/activerecord/src/test-helpers/fixtures/`. Latest
  `pnpm fixtures:compare`: match=94, diff=8, missing=0,
  erb-unsupported=20. The 8 DIFFs and 20 ERB-UNSUPPORTED are
  compare-script gaps (not fixture-data drift) — see "Loose ends
  before PR 7 can ship" at the top of this doc.
- Loader (`defineFixtures()`, `useFixtures()`, `fixtureId()`, `ref()`,
  `fixture-set.ts`) is in place. `useFixtures([...])` returns typed
  accessors of the form `result.authors("david")` — that's the
  callsite shape ported tests will use; no new `fixtureRow()` helper
  is needed. A handful of ported fixtures are not yet loadable at
  runtime (string-PK, enum-bridge, NOT-NULL timestamp auto-stamp);
  see "Loose ends → Loader gaps."
- The gap table below remains as the rollout-time cluster map; cluster
  rollout PRs are all closed (see Rollout section).

## Gap, by cluster

Rough grouping (ordered by likely test-file demand). When a fixture
plausibly fits multiple clusters it appears in only one — first listing
wins.

1. **Core associations long-tail** — `categories`, `categorizations`,
   `categories_posts`, `categories_ordered`, `taggings`, `tags`,
   `essays`, `readers`, `author_favorites`, `bad_posts`, `other_posts`,
   `other_comments`, `other_topics`, `other_books`, `subscribers`,
   `subscriptions`, `references`.
2. **Pirates / ships universe** (HABTM + STI test bed) — `pirates`,
   `ships`, `parrots`, `parrots_pirates`, `dead_parrots`, `live_parrots`,
   `treasures`, `peoples_treasures`, `doubloons`, `mateys`,
   `friendships`.
3. **People / clubs / memberships** — `people`, `members`,
   `member_details`, `member_types`, `memberships`, `clubs`, `sponsors`,
   `organizations`, `interests`, `jobs`, `tasks`.
4. **Pets / animals** — `dogs`, `other_dogs`, `dog_lovers`, `pets`,
   `toys`, `owners`, `humans`, `faces`.
5. **STI / inheritance test bed** — `vegetables`, `mixins`, `chefs`,
   `cake_designers`, `drink_designers`, `paragraphs`, `content`,
   `content_positions`, `collections`, `colleges`, `courses`, `entrants`,
   `customers`, `products`, `variants`, `clothing_items`, `items`.
6. **Composite PK (CPK) cluster** — `cpk_authors`, `cpk_books`,
   `cpk_orders`, `cpk_order_agreements`, `cpk_order_tags`, `cpk_reviews`,
   `cpk_tags`.
7. **Sharded cluster** — `sharded_blogs`, `sharded_blog_posts`,
   `sharded_blog_posts_tags`, `sharded_comments`, `sharded_tags`.
8. **UUID / type / edge** — `uuid_parents`, `uuid_children`, `binaries`,
   `aircrafts`, `bulbs`, `cars`, `computers`, `minivans`, `speedometers`,
   `dashboards`, `movies`, `traffic_lights`, `virtual_columns`,
   `mixed_case_monkeys`, `legacy_things`, `minimalistics`, `funny_jokes`,
   `randomly_named_a9`, `1_need_quoting`, `string_key_objects`,
   `warehouse-things`, `nodes`, `trees`, `edges`, `vertices`,
   `citations`, `ratings`, `price_estimates`.
9. **Encryption** — `encrypted_books`,
   `encrypted_book_that_ignores_cases`.
10. **Misc** — `strict_zines`, `zines`, `fk_object_to_point_to`,
    `fk_test_has_fk`, `fk_test_has_pk`.

## Translation rules

Each `*.yml` becomes one TS file under `fixtures/`, exporting
`<name>FixtureData` as `{ rowName: { col: value, ... } }`. Conventions:

- **File name**: kebab-case (`developers-projects.ts` for
  `developers_projects.yml`).
- **Always carry the Rails `id`.** Every row keeps `id: N` from the
  Rails YAML verbatim (per Decision 1). The `ref()` resolver reads the
  target row's declared `id` rather than computing CRC32. `fixtureId()`
  is reserved for ad-hoc test-only fixtures that don't mirror a Rails
  YAML.
- **Foreign keys** → `ref("other_table", "row_name")`. Rails' string-form
  references (`owner_id: foo`) resolve through the target's declared
  `id`. Rails' numeric-form references (`owner_id: 1`) translate to
  `ref(...)` against whichever row in the target fixture carries that
  `id`.
- **Row labels** preserved as-is (e.g. Rails' `david` → TS `david`).
  Cross-fixture refs must match byte-for-byte.
- **Comments**: keep the header `// activerecord/test/fixtures/<name>.yml`
  on line 1; per-row comments only when non-obvious (per
  [CLAUDE.md](../CLAUDE.md)).
- **ERB-rendered fixtures** become small inline TS conditionals using the
  new `adapterName(adapter)` helper (see Decision 3).

## Verification — `pnpm fixtures:compare`

A new script under `scripts/fixtures-compare/` that diffs each Rails YAML
against its TS counterpart and reports drift, modeled on `api:compare` /
`test:compare`.

### Behavior

For every `vendor/rails/activerecord/test/fixtures/<name>.yml`:

1. **Locate TS counterpart**: kebab-case name under
   `packages/activerecord/src/test-helpers/fixtures/<kebab-name>.ts`. If
   missing, report `MISSING`.
2. **Parse YAML** with a minimal AR-fixture-aware reader (no Psych: the
   `yaml` lib + a small ERB renderer with stub bindings for
   `ActiveRecord::Base.connection.adapter_name` — see Decision 3). AR
   fixtures use ERB only for adapter-conditional scalar values; no
   control flow is evaluated.
3. **Load TS** via dynamic `import()` of the source file to get
   `<name>FixtureData`.
4. **Per-row diff.** Row keys must match exactly. Attribute keys per row
   must match (mismatch buckets: `extra-in-ts`, `missing-in-ts`,
   `value-differs`). Value-equality rules:
   - Scalars: deep-equal.
   - `id` MUST be present on both sides and equal (per Decision 1).
     Mismatch / absence → `id-divergence`.
   - Rails string-form FK (`parent_id: foo`) equals TS
     `ref("table", "foo")` when the target row's declared `id` matches
     what Rails resolves `foo` to.
   - Rails numeric FK (`parent_id: 1`) reverse-resolves: the comparer
     indexes the target fixture by `id`, finds the row whose
     `id === 1`, and checks the TS side uses `ref("table", <that_row>)`.
     If multiple rows share an id (shouldn't happen), flag as
     `ambiguous-fk`.
5. **Output**: per-file summary like api:compare:

   ```
   authors.yml                authors.ts         rows: 3/3   attrs: 9/9   100% ✓
   author_favorites.yml       (missing)                       —          MISSING
   chefs.yml                  chefs.ts           rows: 5/5   attrs: 7/8   88%  (extra-in-ts: 1)
   ```

6. **Exit code**: soft (warnings only) until PR 7 flips strictness (per
   Decision 4). `MISSING`, `value-differs`, `id-divergence`, and
   `ambiguous-fk` all surface in output but don't fail CI during the
   port.

### Scope of the script

- Reads files only; no DB.
- Lives under `scripts/fixtures-compare/`. Wire as `pnpm fixtures:compare`
  in the root `package.json`, mirroring `api:compare`.
- Has a `--package activerecord` flag for future generalization but only
  AR is in scope now.

## Rollout

PR-sized batches targeting ~250 LOC each. Small clusters bundle
together; the two over-ceiling clusters (C1, C8) split into `a`/`b`
sibling PRs from `main`. Cluster sizes (Rails YAML LOC; TS ≈ 1.5×) drive
bundling: C1 ≈ 510, C2 ≈ 155, C3 ≈ 250, C4 ≈ 110, C5 ≈ 260, C6 ≈ 140,
C7 ≈ 160, C8 ≈ 510, C9 ≈ 12, C10 ≈ 20. Per
the PR-sizing rules in [CLAUDE.md](../CLAUDE.md) (300-LOC ceiling, no
tiny PRs, bundle adjacent same-cluster slots toward the ceiling).

The two exceptions to the 300-LOC ceiling are called out explicitly
below: the schema port (split into ~6–8 sibling PRs, each under
ceiling) and PR 7 (granted ceiling waiver — see entry).

1. **PR 0 closed (#2122)** — `scripts/fixtures-compare/` + CI wiring.
   Schema-diff pass landed as **#2135**. Subsequent compare-script
   fidelity work landed as **#2220** (metadata strip, assoc shorthand,
   `$LABEL`, list-form, array deep-equal, merge keys); remaining
   compare gaps are listed under "Loose ends" above.
2. **PR 0.5a–g closed (#2124 #2128 #2130 #2131 #2133 #2134 #2140)** —
   `vendor/rails/activerecord/test/schema/schema.rb` ported into
   `packages/activerecord/src/test-helpers/test-schema.ts` across 7
   sibling PRs; #2140 wired the schema into `setup-adapter-suite.ts`.
   Final schema-port count came in under the planned 8 slots.
3. **PR 0.75 closed (#2125)** — id backfill on the 12 originals;
   `ref()` resolver reads declared `id`; `adapterName(adapter)` helper
   landed in the same PR. One follow-up (registry rollback widening,
   ~5 LOC) is in "Loose ends → Loader gaps" above.
4. **PR 1a closed (#2143)** — cluster 1 first half. Surfaced the
   `_fixture` metadata-row noise and the `set_fixture_class` ref()
   tableName trap — both addressed in #2220 / "Loose ends → Plan
   clean-ups."
5. **PR 1b closed (#2205)** — cluster 1 second half. `subscribers.ts`
   shipped but is non-loadable until string-PK loader support lands
   (see Loose ends).
6. **PR 2 closed (#2208)** — pirates/ships + encryption + fk\_\*. Most
   ERB-UNSUPPORTED gaps remaining today live in this cluster.
7. **PR 3 closed (#2209)** — cluster 3 (people/clubs). The C4 tail
   (`pets`, `toys`, `owners`, `humans`, `faces`) was deferred over
   ceiling; shipped separately as **PR 4-late closed (#2227)** out of
   the original `<base>` / `<base>b` plan.
8. **PR 4 closed (#2210)** — cluster 5 (STI), 17 fixtures.
9. **PR 5 closed (#2212)** — CPK + sharded + C4 spillover
   (`dogs`, `other_dogs`, `dog_lovers`).
10. **PR 6a closed (#2213)** — cluster 8 first half.
11. **PR 6b closed (#2214)** — cluster 8 second half.
12. **DIFF reconcile closed (#2228)** — 3 fixture-side corrections
    (`authors.owned_essay_id`, `randomly_named_a9` int vs string,
    `comments.recursive_association_comment.company`). DIFF count
    11 → 8; the residual 8 are compare-script gaps and now live in
    "Loose ends."
13. **PR 7 — split into 7a + 7b** (sub-split path chosen per the
    original ceiling-waiver entry; see "Loose ends" above for the full
    blocker list):
    - **PR 7a (~1.9k LOC, ceiling waiver retained)** — port
      `fixtures_test.rb` (1847 LOC / 153 tests),
      `test_fixtures_test.rb` (74 LOC), and
      `encryption/encrypted_fixtures_test.rb` (22 LOC). Exclusions in
      `scripts/api-compare/unported-files.ts` stay in place until 7b.
    - **PR 7b (~30 LOC, gated)** — flip `fixtures:compare` MISSING/DIFF
      to hard-fail; remove `fixtures.rb` / `fixture_set/` /
      `test_fixtures.rb` / `encryption/encrypted_fixtures.rb` from
      `scripts/api-compare/unported-files.ts`. Gated on (a) the 8
      remaining DIFFs flipping to MATCH or moving to an explicit
      allow-list, (b) the 20 ERB-UNSUPPORTED clearing or being
      allow-listed, and (c) 7a landed.

14. **PR 8 — proof-of-concept conversion.** Pick one existing AR test
    file that currently inlines `defineSchema()` and whose data needs
    are met by the translated fixtures (candidates:
    `relations.test.ts`, `serialization.test.ts`,
    `finder-respond-to.test.ts`, or one of the association-cluster
    tests under `associations/`). Rewrite it to:
    - drop the inline `defineSchema()` call (canonical schema from PR
      0.5 is already loaded by `setup-adapter-suite`),
    - call `useFixtures({ authors: [Author, authorFixtureData], ... })`
      at the top with the fixtures it needs,
    - replace ad-hoc `Model.create({...})` setup with the typed
      accessors `result.authors("david")` returned by `useFixtures()`.

    This PR is the proof that the capability works end-to-end, captures
    the migration pattern, and gives the follow-up bulk-migration plan a
    worked example to reference. Out of scope: migrating any other test
    files — that's a separate plan doc.

## Decisions

1. **Always mirror Rails ids.** Every TS fixture row carries the explicit
   `id: N` from the Rails YAML. CRC32-default via `fixtureId()` is dropped
   for ported fixtures — Rails parity wins, since literal-id assertions
   in ported tests must work without modification. The `fixtureId()`
   helper stays in place for ad-hoc test-only fixtures that aren't
   mirroring a Rails YAML.

   Consequence for `ref()`: the resolver must read the target fixture's
   declared `id` (not compute CRC32) when the target row carries one.
   The compare script enforces id parity by comparing TS `id` ↔ Rails
   `id` directly.

2. **Schema port lands as PR 0.5 (split into sibling PRs).**
   `vendor/rails/activerecord/test/schema/schema.rb` is 1462 LOC; the TS
   port is ~2200 LOC, well past the 300-LOC ceiling. Splits as
   `0.5a` … `0.5g` (came in at 7 slots; original estimate was 6–8), sibling branches from `main` with
   non-overlapping table groups, merged in any order. The final
   split-suffix PR wires `test-schema.ts` into
   `setup-adapter-suite.ts`. Every fixture PR after that assumes the
   schema is loaded; no per-cluster mini-schemas.

3. **ERB → `adapterName` helper.** Add `adapterName(adapter)` to
   `define-fixtures.ts` so TS fixtures can write
   `{ data: adapterName(adapter) === "postgres" ? a : b }`. The compare
   script renders Rails ERB with stub bindings — i.e.
   `ActiveRecord::Base.connection.adapter_name` returns one of:

   ```
   "PostgreSQL"
   "Mysql2"
   "SQLite"
   ```

   and the comparer diffs per-adapter. Land the helper alongside the
   first ERB-using fixture (PR 0.75 if any of the 12 backfill files need
   it; otherwise the PR that introduces the first ERB fixture).

4. **CI strictness: soft until PR 7, then hard-fail.** `MISSING` is a
   warning through the entire port; `value-differs`, `id-divergence`,
   and `ambiguous-fk` are warnings too (we surface them in compare
   output but don't fail CI) until PR 7 flips the script to hard-fail
   alongside removing the four exclusions from
   `scripts/api-compare/unported-files.ts`.
