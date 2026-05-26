# Phase G + D-1 combined candidates (2026-05-26)

Subset of the 65 D-1-pending files where Phase G adoption (drop bypass +
adopt `useFixtures`) could land in a single PR rather than standalone D-1
surgery followed by a separate Phase G conversion.

**Methodology:** For each of the 65 files with `this.adapter = adapter`
bypass, we checked: (1) do inline classes have canonical equivalents in
`test-helpers/models/`? (2) do inline schemas match canonical table
definitions in `test-schema.ts`? (3) does the file do actual DB creates
that would benefit from fixture replacement? (4) can test-specific
traits be handled via the subclass-wrapping pattern from PR #2391?

**Result: 0 YES, 3 PARTIAL, 62 NO.** This matches the ~8% empirical
yield from PR #2391 (2/25 ≈ 8%), projected to ~5/65 ≈ 8%.

## Why so few?

Every bypass file follows the same "bespoke per-describe models" pattern:

1. **Schema incompatibility** — inline `defineSchema()` creates minimal
   tables (e.g. `posts: { title: "string" }`) that don't match canonical
   schema (canonical `posts` has `NOT NULL` on `body`, counter caches,
   `author_id`, `type`, etc.). Inserting via canonical model would fail
   on missing NOT NULL columns or trigger unwanted associations.

2. **Per-describe model redefinition** — most files define the same class
   name (Post, Topic, User) multiple times with different attribute sets
   per describe block. Canonical models have a single fixed shape.
   Examples: `relation/or.test.ts` (Post × 7 variants), `relation/merging.test.ts`
   (Post × 6 variants), `instrumentation.test.ts` (Book × 15 variants).

3. **No DB operations** — several files only do `new Model()` (in-memory)
   or `.toSql()` (SQL generation). No fixture adoption benefit. Examples:
   `annotate.test.ts`, `time-travel.test.ts`, `dirty.test.ts`,
   `filter-attributes.test.ts`, `sanitize.test.ts`.

4. **Intentional isolation** — `transaction-instrumentation.test.ts`
   deliberately creates its own SQLite adapter per test to avoid shared
   TransactionManager state. Phase G is fundamentally incompatible.

5. **Bespoke test-local models** — large files like `associations.test.ts`
   (407 sites, 10725 LOC), `has-many-associations.test.ts` (443 sites),
   `persistence.test.ts` (214 sites) define hundreds of one-off models
   with unique association graphs. No canonical equivalent exists.

## Tier PARTIAL — convertible via subclass wrap (3 files)

These files have at least one describe block where the inline model's
column needs are a subset of canonical schema, AND the test does DB
creates. Conversion requires the subclass-wrapping pattern + fixture
data that exercises the specific columns used. Each would yield only
a partial conversion (some describes convert, others stay bespoke).

| File                           | LOC | Sites | Convertible describes             | Canonical model | Column subset   | Blocker for full conversion                                                                          |
| ------------------------------ | --- | ----- | --------------------------------- | --------------- | --------------- | ---------------------------------------------------------------------------------------------------- |
| `collection-cache-key.test.ts` | 324 | 1     | ~50% (creates with name + salary) | Developer       | name ✓ salary ✓ | `updated_at` needed but canonical has `legacy_updated_at`; only ~50% of creates could adopt fixtures |
| `relation/annotations.test.ts` | 325 | 1     | ~30% (creates with title)         | Post            | title ✓         | body NOT NULL on canonical; only annotate+create describes benefit                                   |
| `relation/update-all.test.ts`  | 313 | 3     | ~20% (creates with title)         | Post            | title ✓         | body NOT NULL; most describes use bespoke columns (author, views)                                    |

**Cost-benefit for PARTIAL files:** Each would save ~1-3 bypass sites out
of 1-3 total, converting maybe 30-50% of the file's describes. The
remaining describes still need bespoke inline models. Net savings vs
standalone D-1: marginal. Recommendation: **do standalone D-1 surgery
for all 65 files**, then revisit Phase G adoption file-by-file when the
fixture inventory (Phase A) identifies which files' Rails counterparts
actually use `fixtures :foo`.

## Tier YES — fully convertible

None. No file among the 65 has ALL inline classes with canonical-compatible
schemas AND DB operations fully replaceable by fixture data.

## Tier NO — bespoke, D-1 surgery only (62 files)

Not enumerated individually. Every remaining file hits at least one of:

- Bespoke per-describe schemas incompatible with canonical tables
- Hundreds of one-off inline model classes with no canonical counterpart
- No DB operations (pure in-memory or SQL-generation tests)
- Intentional adapter isolation incompatible with shared fixtures
- > 2000 LOC with >30 bypass sites (bespoke surgery more appropriate)

## Recommendation

**Skip the Phase G + D-1 combined approach.** The empirical yield is too
low to justify the more complex combined conversion pattern. Instead:

1. **D-1 sweep (standalone):** Remove `this.adapter = adapter` bypass
   from all 65 files via the standard D-1 codemod approach. This is
   mechanical and can proceed in bulk batches.

2. **Phase G adoption (after D-1):** Once D-1 is complete and the Phase A
   inventory identifies files whose Rails counterparts use fixtures, run
   the full fixture adoption conversion. At that point, the convertible
   pool may be larger because canonical schema and loader gaps will have
   narrowed.

The 3 PARTIAL candidates above are noted for reference but don't justify
the overhead of a combined approach — the per-file savings are 1-3 bypass
sites each.
