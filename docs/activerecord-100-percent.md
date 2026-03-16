# ActiveRecord: Road to 100% Test Coverage

Current state: **75.7%** (6,347 matched / 8,385 total Ruby tests). 197/342 files matched, 0 misplaced, 382 wrong describes, 2,151 skipped.

## How coverage is measured

`npm run convention:compare` extracts test names from both Rails Ruby source and our TypeScript tests, then matches them by normalized name and describe-block ancestry. File mapping is convention-based: `finder_test.rb` maps to `finder.test.ts` (snake_case to kebab-case).

Columns in the output: `OK` (matched + passing), `Skip` (matched but `it.skip`), `Desc` (wrong describe block), `Move` (misplaced — wrong file), `Miss` (no TS equivalent at all), `Tot` (total matched).

## The gap: 2,038 tests

To reach 100%, we need to close a gap of 2,038 tests (8,385 - 6,347). These break down into:

- **2,151 skipped tests** — `it.skip()` stubs that matched Ruby names but aren't implemented
- **382 wrong describes** — tests in the right file but wrong describe block
- **145 missing files** — 342 Ruby files, only 197 have TS equivalents (the missing files account for the rest of the gap)

## Work areas (parallelizable)

The work naturally splits into independent areas. Each can be tackled in its own worktree without conflicts.

---

### Area 1: Wrong describes (382 tests)

**Goal:** Fix describe block names so convention:compare matches them correctly.
**Effort:** Low — purely structural, no new feature code needed.
**Files with most wrong describes:**

| File                                           | Wrong | Notes                                                        |
| ---------------------------------------------- | ----- | ------------------------------------------------------------ |
| adapters/postgresql/schema.test.ts             | 71    | Multiple Ruby classes (SchemaTest, SchemaWithDotsTest, etc.) |
| migration.test.ts                              | 34    | BulkAlterTableMigrationsTest, CopyMigrationsTest, etc.       |
| adapters/postgresql/geometric.test.ts          | 24    | PostgreSQLPointTest, PostgreSQLGeometricTypesTest, etc.      |
| transaction-callbacks.test.ts                  | 21    | 8+ distinct Ruby test classes                                |
| nested-attributes.test.ts                      | 18    | TestNestedAttributesInGeneral, etc.                          |
| associations.test.ts                           | 17    | OverridingAssociationsTest, GeneratedMethodsTest, etc.       |
| adapters/postgresql/quoting.test.ts            | 16    | Nested under PostgreSQLAdapter                               |
| autosave-association.test.ts                   | 15    | Tests are top-level in Ruby, nested in TS                    |
| adapters/postgresql/uuid.test.ts               | 15    | Multiple UUID test classes                                   |
| adapters/postgresql/postgresql-adapter.test.ts | 13    | Nested sub-classes                                           |
| transactions.test.ts                           | 12    | Several remaining multi-class tests                          |
| adapters/postgresql/timestamp.test.ts          | 12    | Multiple timestamp test classes                              |

Plus ~50 files with 1-10 wrong describes each.

**How to fix:** Check the Ruby describe path in convention:compare output, then rename or restructure the TS describe blocks to match. Some need sub-describes added; others need top-level renames.

---

### Area 2: Unskip core ORM tests (762 skipped across top files)

**Goal:** Implement missing features and unskip tests in existing high-coverage files.
**Effort:** Medium — requires implementing actual ORM behavior.
**Best targets (highest skip counts in existing files):**

| File                                           | Passing | Skipped | Total | What's needed                    |
| ---------------------------------------------- | ------- | ------- | ----- | -------------------------------- |
| associations/has-many-through.test.ts          | 67      | 98      | 165   | Through association features     |
| associations/eager.test.ts                     | 93      | 84      | 177   | Eager loading (includes/preload) |
| autosave-association.test.ts                   | 100     | 76      | 176   | Autosave edge cases              |
| base.test.ts                                   | 112     | 74      | 186   | Core Base class features         |
| associations.test.ts                           | 58      | 72      | 130   | Association edge cases           |
| adapters/postgresql/postgresql-adapter.test.ts | 7       | 60      | 67    | PostgreSQL adapter features      |
| associations/nested-through.test.ts            | 10      | 54      | 64    | Nested through associations      |
| migration.test.ts                              | 40      | 50      | 90    | Migration features               |
| associations/has-and-belongs-to-many.test.ts   | 44      | 48      | 92    | HABTM features                   |
| adapters/postgresql/hstore.test.ts             | 1       | 44      | 45    | HStore type support              |
| insert-all.test.ts                             | 29      | 42      | 71    | Bulk insert features             |
| reflection.test.ts                             | 24      | 43      | 67    | Reflection API                   |
| adapters/postgresql/array.test.ts              | 1       | 41      | 42    | Array type support               |
| associations/inverse.test.ts                   | 52      | 40      | 92    | Inverse association features     |
| strict-loading.test.ts                         | 17      | 37      | 54    | Strict loading modes             |
| relation/where.test.ts                         | 26      | 36      | 62    | Where clause features            |
| counter-cache.test.ts                          | 20      | 35      | 55    | Counter cache                    |
| associations/has-one.test.ts                   | 60      | 33      | 93    | Has-one association features     |
| locking.test.ts                                | 17      | 33      | 50    | Optimistic/pessimistic locking   |
| relation/where-chain.test.ts                   | 23      | 31      | 54    | where.not/missing/associated     |
| associations/has-one-through.test.ts           | 18      | 29      | 47    | Has-one-through features         |

**Sub-areas for parallel work:**

- **Associations** (inverse, eager, through, autosave, has-one, HABTM, counter-cache, strict-loading) — 535 skipped tests
- **Core ORM** (base, persistence, relation/where, relation/where-chain, locking, reflection) — 227+ skipped tests
- **PostgreSQL adapter** (postgresql-adapter, hstore, array, schema, uuid, geometric) — 300+ skipped tests
- **Migration & bulk ops** (migration, insert-all) — 92 skipped tests

---

### Area 3: Missing files (145 files, ~2,038 tests)

**Goal:** Create new test files for Ruby test files that have no TS equivalent.
**Effort:** High — requires both stub creation and feature implementation.
**Highest-value missing files:**

| Ruby file                    | Missing tests | Notes                   |
| ---------------------------- | ------------- | ----------------------- |
| fixtures_test.rb             | 149           | Test fixtures system    |
| tasks/database-tasks.test.ts | 78            | Rake task equivalents   |
| query-cache.test.ts          | 62            | Query caching           |
| connection-pool.test.ts      | 50            | Connection pooling      |
| adapters/trilogy/\*          | 80            | Trilogy adapter (skip?) |
| connection-adapters/\*       | 160+          | Connection management   |
| encryption/\*                | 50+           | Encrypted attributes    |
| database-configurations/\*   | 65+           | DB config resolution    |
| collection-cache-key.test.ts | 30            | Cache key generation    |
| relation/with.test.ts        | 16            | WITH (CTE) support      |
| bind-parameter.test.ts       | 17            | Bind parameter handling |

Many of these are infrastructure-heavy (connection pooling, task runners, multi-DB) and may not be relevant for the TypeScript port. Consider permanently skipping Ruby-only concepts.

**Likely candidates to permanently skip:**

- `fixtures_test.rb` — Rails test fixtures system (we use different patterns)
- `tasks/*` — Rake tasks
- `adapters/trilogy/*` — Trilogy adapter (MySQL variant)
- `connection_pool_test.rb` — Connection pooling (different model in TS)
- `encryption/*` — Depends on Rails encryption infrastructure

**Good candidates to implement:**

- `relation/with.test.ts` — CTE support (16 tests)
- `bind-parameter.test.ts` — Bind params (17 tests)
- `date-time.test.ts`, `date.test.ts` — Date handling (13 tests)
- `type/*.test.ts` — Type system (40+ tests)
- `instrumentation.test.ts` — Query instrumentation (18 tests)

---

### Area 4: PostgreSQL adapter tests (300+ tests)

**Goal:** Implement PostgreSQL-specific features and fix wrong describes.
**Effort:** Medium-high — requires running against real PostgreSQL.
**Prerequisite:** `PG_TEST_URL` environment variable.

| File                       |  OK | Skip | Wrong | Miss | Notes                            |
| -------------------------- | --: | ---: | ----: | ---: | -------------------------------- |
| schema.test.ts             |   0 |   71 |    71 |    0 | All skipped, all wrong describe  |
| postgresql-adapter.test.ts |   7 |   60 |    13 |    0 | Most skipped                     |
| range.test.ts              |   0 |   46 |     0 |    0 | Range type support               |
| hstore.test.ts             |   1 |   44 |     3 |    0 | HStore type                      |
| array.test.ts              |   1 |   41 |     0 |    0 | Array type                       |
| geometric.test.ts          |   5 |    0 |    24 |    0 | Geometric types, wrong describes |
| uuid.test.ts               |   0 |    0 |    15 |    0 | UUID, wrong describes            |
| timestamp.test.ts          |   0 |    0 |    12 |    0 | Timestamps, wrong describes      |
| quoting.test.ts            |   0 |    0 |    16 |    0 | Quoting, wrong describes         |
| serial.test.ts             |   0 |    0 |     6 |    0 | Serial columns, wrong describes  |

This area is fully independent — it only touches `adapters/postgresql/` files.

---

## Tracking progress

```bash
npm run convention:compare -- --package activerecord
```

Target: `activerecord — 8385/8385 tests (100%)`

## Quick wins checklist

- [ ] Fix remaining 382 wrong describes (Area 1)
- [ ] Unskip tests in files already at 90%+ (low-hanging fruit)
- [ ] Add sub-describes in PostgreSQL adapter files (Area 4 wrong describes)
- [ ] Implement CTE/WITH support (16 tests, Area 3)
- [ ] Implement type system tests (40+ tests, Area 3)
