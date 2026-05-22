# Fixtures port plan

> **Status (2026-05-22):** ~92% complete. All 122 Rails fixtures
> translated (PRs 0–6b + 0.5a–h + 0.75 + 4-late, merged 2026-05-20…21).
> Schema port shipped (#2124/#2128/#2130/#2131/#2133/#2134/#2140).
> ERB `identify`/`composite_identify` + loop expander shipped (#2247).
> Fixture-side DIFF reconcile #2228. Loader
> (`defineFixtures`/`useFixtures`/`ref`/`fixtureId`) live.
> Compare-script hardening shipped in **this PR**: enum-symbol
> comparator, HABTM implicit-id index, FK override scaffold,
> datetime/YAML/time-of-day tolerance, and the
> mixins/paragraphs/citations ERB allow-list.
> `pnpm fixtures:compare` reports match=109 diff=10 missing=0
> erb-unsupported=0 erb-allowed=3 (soft mode).
>
> **Remaining (blocks PR 7 strict-fail flip):**
>
> - 10 DIFFs to reconcile fixture-side (follow-up PR): `books.yml`
>   (populate `ENUM_MAPS["books"]` for status/last_read/language/etc.),
>   `topics.yml` / `other_topics.yml` (extra `type` column on STI rows
>   the TS side carries but Rails YAML omits), `binaries.yml`
>   (`flowers.data` blob), `cpk_order_tags.yml` + `cpk_reviews.yml`
>   (CPK FK + extra `number`), `dead_parrots.yml` / `live_parrots.yml`
>   (HABTM `treasures`), `developers.yml` (`shared_computers` HABTM),
>   `sponsors.yml` (extra `club_id`), `peoples_treasures.yml`
>   (TS row's `michael` label doesn't match the row CRC32 the Rails YAML
>   resolves `rich_person_id` to — fixture-side label or id reconcile).
> - **PR 7a** — ~1.9k LOC waiver port of `fixtures_test.rb` (1847 LOC),
>   `test_fixtures_test.rb`, `encryption/encrypted_fixtures_test.rb`.
> - **PR 7b** — ~30 LOC strict-fail flip + remove 4 exclusions from
>   `unported-files.ts`.
> - **PR 8** — proof-of-concept conversion of one test file to
>   `useFixtures(...)`.
>
> **Loader gaps (don't block strict, do block PR 8 candidate selection):**
> `resolveDeclaredPk` string-PK support (~20), `defineFixtures` NOT NULL
> timestamp auto-stamp (~30–50), enum-aware insert (~40),
> belongs_to-reflection → FK-column resolver (~80–150), `id`-index by
> declared PK (~20), `ref()` key-path for composite FK (~50), registry
> rollback widening (~5).

Port Rails `activerecord/test/fixtures/*.yml` files to TS so that ported
AR tests can call `useFixtures([...])` instead of inlining `defineSchema()`
/ row inserts in `beforeAll`. See the status block above for current
counts; the sections below capture the original motivation and design.

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

See the status block at the top of the doc. All 122 fixtures translated;
loader (`defineFixtures()`, `useFixtures()`, `fixtureId()`, `ref()`,
`fixture-set.ts`) live. `useFixtures([...])` returns typed accessors of
the form `result.authors("david")`.

The cluster sections below are historical scoping notes from the
original port plan — kept for reference, not as live work-tracking.

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

## Rollout (historical)

> Historical narrative of the port rollout — preserved for PR archaeology.
> Live status is at the top of the doc; PRs 0–6b and 0.5a–h have all
> merged. The "in flight" / no-status markers below were accurate at
> authoring time and are not refreshed.

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

1. **PR 0 closed (#2122)** — fixtures-compare script + CI wiring.
2. **PR 0.5a–h closed** (#2124 A, #2128 C, #2130 D-G, #2131 N-R, #2133 H-M, #2134 S-W, #2140 wire-up; final h-tier sibling).
3. **PR 0.75 closed (#2125)** — id backfill + ref() resolver + adapterName helper.
4. **PR 1a closed (#2143)** — Cluster 1 first half (categories/categorizations/categories_posts/categories_ordered/taggings/tags/essays/readers).
5. **PR 1b closed (#2205)** — Cluster 1 second half (author_favorites, bad_posts, other_posts, other_comments, other_topics, other_books, subscribers, subscriptions, references).
6. **PR 2** — Cluster 2 (pirates/ships) + Cluster 9 (encryption) +
   Cluster 10 (misc fk\_\*). Three small clusters bundled. (~190 LOC)
7. **PR 3** — Cluster 3 (people/clubs) + the C4 tail (`pets`, `toys`,
   `owners`, `humans`, `faces`). Leaves `dogs` / `other_dogs` /
   `dog_lovers` for PR 5 to stay under ceiling. (~280 LOC)
8. **PR 4** — Cluster 5 (STI). (~260 LOC standalone)
9. **PR 5** — Cluster 6 (CPK) + Cluster 7 (sharded) + C4 spillover
   (`dogs`, `other_dogs`, `dog_lovers`). (~300 LOC)
10. **PR 6a** — Cluster 8 first half: `uuid_parents`, `uuid_children`,
    `binaries`, `aircrafts`, `bulbs`, `cars`, `computers`, `minivans`,
    `speedometers`, `dashboards`, `movies`, `traffic_lights`,
    `virtual_columns`. (~250 LOC)
11. **PR 6b** — Cluster 8 second half: `mixed_case_monkeys`,
    `legacy_things`, `minimalistics`, `funny_jokes`, `randomly_named_a9`,
    `1_need_quoting`, `string_key_objects`, `warehouse-things`, `nodes`,
    `trees`, `edges`, `vertices`, `citations`, `ratings`,
    `price_estimates`. (~250 LOC)
12. **PR 7 (300-LOC ceiling waived)** — Three coupled changes that must
    land together so CI parity holds:
    - flip `fixtures:compare` to hard-fail;
    - remove `fixtures.rb` / `fixture_set/` / `test_fixtures.rb` /
      `encryption/encrypted_fixtures.rb` from
      `scripts/api-compare/unported-files.ts`;
    - port the corresponding Rails test files
      (`fixtures_test.rb` is 1847 LOC of Ruby tests;
      `test_fixtures_test.rb` 74 LOC; plus the
      `encryption/encrypted_fixtures_test.rb` body).

    Splitting these breaks the `test:compare` counter mid-flight — once
    the exclusions are removed but the tests aren't ported, CI shows a
    regression. Ceiling waiver is explicit per user direction. Sub-split
    only if a clean way emerges (e.g. translating `fixtures_test.rb` in
    a `7a` that lands the file but leaves the exclusion in place, then
    `7b` removes the exclusion + flips compare).

13. **PR 8 — proof-of-concept conversion.** Pick one existing AR test
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
   `0.5a` … `0.5h` (rough), sibling branches from `main` with
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
