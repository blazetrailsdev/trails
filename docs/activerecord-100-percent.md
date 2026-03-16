# ActiveRecord: Road to 100% Test Coverage

Current state: **75.7%** (6,347 matched / 8,385 total Ruby tests). 197/342 files matched, 0 misplaced, 84 wrong describes, 2,136 skipped.

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

#### PR 1.1: PostgreSQL adapter wrong describes (194 tests)

Fix describe blocks across all `adapters/postgresql/` files. Most need sub-describes added inside `describeIfPg()` blocks to match Ruby's nested test class structure.

| File                           | Wrong    | Fix needed                                                                                |
| ------------------------------ | -------- | ----------------------------------------------------------------------------------------- |
| schema.test.ts                 | 71       | Split into SchemaTest, SchemaWithDotsTest, SchemaForeignKeyTest, etc.                     |
| geometric.test.ts              | 24       | Split into PostgreSQLPointTest, PostgreSQLGeometricTypesTest, PostgreSQLGeometricLineTest |
| quoting.test.ts                | 16       | Add sub-describes under PostgreSQLAdapter                                                 |
| uuid.test.ts                   | 15       | Split into PostgreSQLUUIDGenerationTest, PostgreSQLUUIDTestInverseOf, etc.                |
| postgresql-adapter.test.ts     | 13       | Add PostgreSQLAdapterTest sub-describe                                                    |
| timestamp.test.ts              | 12       | Split into PostgreSQLTimestampFixtureTest, PostgreSQLTimestampMigrationTest, etc.         |
| bind-parameter.test.ts         | 6        | Add BindParameterTest sub-describe                                                        |
| foreign-table.test.ts          | 8        | Add ForeignTableTest sub-describe                                                         |
| change-schema.test.ts          | 8        | Add Migration sub-describe                                                                |
| prevent-writes.test.ts         | 7        | Fix describe name                                                                         |
| serial.test.ts                 | 6        | Split into CollidedSequenceNameTest, LongerSequenceNameDetectionTest, etc.                |
| utils.test.ts                  | 6        | Add PostgreSQLNameTest sub-describe                                                       |
| schema-authorization.test.ts   | 6        | Add SchemaAuthorizationTest sub-describe                                                  |
| collation.test.ts              | 5        | Fix describe name                                                                         |
| create-unlogged-tables.test.ts | 5        | Fix describe name                                                                         |
| numbers.test.ts                | 5        | Fix describe name                                                                         |
| optimizer-hints.test.ts        | 4        | Fix describe name                                                                         |
| + 10 more files                | 1-3 each | Simple renames                                                                            |

#### PR 1.2: Transaction and callback wrong describes (33 tests)

| File                             | Wrong | Fix needed                                                                                      |
| -------------------------------- | ----- | ----------------------------------------------------------------------------------------------- |
| transaction-callbacks.test.ts    | 21    | Split into TransactionCallbacksTest, CallbackOrderTest, SetCallbackTest, etc. (8+ Ruby classes) |
| transactions.test.ts (remaining) | 12    | Fix remaining multi-class describes                                                             |

#### PR 1.3: Core ORM wrong describes (48 tests)

| File                             | Wrong    | Fix needed                                                                                     |
| -------------------------------- | -------- | ---------------------------------------------------------------------------------------------- |
| migration.test.ts                | 34       | Split into BulkAlterTableMigrationsTest, CopyMigrationsTest, ExplicitlyNamedIndexMigrationTest |
| persistence.test.ts              | 8        | Fix QueryConstraintsTest describe                                                              |
| scoping/relation-scoping.test.ts | 8        | Fix HasManyScopingTest sub-describe                                                            |
| + small files                    | 1-2 each | timestamp, locking, base, relations, delegation, default-scoping                               |

#### PR 1.4: Association and nested-attributes wrong describes (56 tests)

| File                              | Wrong | Fix needed                                                                     |
| --------------------------------- | ----- | ------------------------------------------------------------------------------ |
| nested-attributes.test.ts         | 18    | Fix TestNestedAttributesInGeneral, move transaction tests to correct describes |
| associations.test.ts              | 17    | Fix OverridingAssociationsTest, GeneratedMethodsTest, WithAnnotationsTest      |
| autosave-association.test.ts      | 15    | Flatten nested tests to match Ruby's top-level structure                       |
| has-many-associations.test.ts     | 3     | Move tests to HasManyAssociationsTestPrimaryKeys, AsyncHasManyAssociationsTest |
| associations/nested-error.test.ts | 3     | Fix describe names                                                             |

#### PR 1.5: MySQL adapter wrong describes (13 tests)

| File                                          | Wrong | Fix needed                                                    |
| --------------------------------------------- | ----- | ------------------------------------------------------------- |
| abstract-mysql-adapter/bind-parameter.test.ts | 10    | Add BindParameterTest sub-describe under AbstractMySQLAdapter |
| abstract-mysql-adapter/table-options.test.ts  | 2     | Fix DefaultEngineOptionTest describe                          |
| mysql2/check-constraint-quoting.test.ts       | 1     | Fix describe                                                  |

---

### Area 2: Unskip tests (2,151 skipped)

Grouped by the feature/capability that blocks them, so each PR implements one capability and unskips all tests that depend on it.

#### Sub-area 2A: Association features (535 skipped)

##### PR 2A.1: Fixture-dependent association tests (~60 tests)

Convert tests in `has-many-through`, `where-chain`, `transaction-callbacks`, `strict-loading`, and `autosave-association` that say "fixture-dependent" to be self-contained using local model definitions. No new features needed.

##### PR 2A.2: Eager loading — includes/preload (~84 tests)

Implement `includes()` and `preload()` on Relation to batch-load associations. Unskips most of `eager.test.ts` and several tests in `nested-through-associations.test.ts`.

##### PR 2A.3: Counter cache (~35 tests)

Implement counter cache callbacks (increment/decrement on association changes). Unskips `counter-cache.test.ts` (35 skipped) plus counter-related tests in `has-many-through`.

##### PR 2A.4: Inverse association improvements (~40 tests)

Implement automatic inverse detection, inverse validation, stale state tracking. Unskips most of `inverse-associations.test.ts`.

##### PR 2A.5: Has-one association features (~33 tests)

Implement touch propagation, validation failure + replace logic. Unskips remaining `has-one-associations.test.ts` tests.

##### PR 2A.6: Has-one-through features (~29 tests)

Implement through record auto-creation/auto-build. Unskips `has-one-through-associations.test.ts`.

##### PR 2A.7: HABTM features (~48 tests)

Implement where-scoped build, validate: false, unscope support. Unskips remaining `has-and-belongs-to-many-associations.test.ts` tests.

##### PR 2A.8: Nested through associations (~54 tests)

Implement nested through + preload, STI on through. Unskips `nested-through-associations.test.ts`.

##### PR 2A.9: Strict loading modes (~37 tests)

Implement strict loading options and lazy-load tracking. Unskips `strict-loading.test.ts`.

##### PR 2A.10: Autosave edge cases (~40 tests, after fixture-dependent)

Implement remaining autosave features: reflectOnAllAssociations, CPK support. Unskips remaining `autosave-association.test.ts` (after PR 2A.1 handles fixture-dependent ones).

#### Sub-area 2B: Core ORM features (300+ skipped)

##### PR 2B.1: Base class features (~74 tests)

Implement type casting from select, injection protection, scoped find. Many of these are empty stubs that need the test body written. Unskips `base.test.ts`.

##### PR 2B.2: Locking — pessimistic + optimistic edge cases (~33 tests)

Implement pessimistic locking (FOR UPDATE), custom lock columns, destroy lock_version checking. Unskips `locking.test.ts`.

##### PR 2B.3: Where clause features (~36 tests)

Implement polymorphic association where, join fixtures, has_many :through where. Unskips `relation/where.test.ts`.

##### PR 2B.4: Where chain — where.not/missing/associated (~31 tests)

Most are fixture-dependent (27). Convert to self-contained, then implement scoped association support. Unskips `relation/where-chain.test.ts`.

##### PR 2B.5: Reflection API (~43 tests)

Implement through-chain reflection, query constraints reflection, module/namespace support. Unskips `reflection.test.ts`.

##### PR 2B.6: Serialized attributes (~19 tests)

Implement serialized where support, class-based serialization, blob support, type constraints. Unskips `serialized-attribute.test.ts`.

##### PR 2B.7: Transaction callbacks (~22 tests)

Fix destroy trigger for transaction callbacks. Convert fixture-dependent tests (16) to self-contained. Unskips `transaction-callbacks.test.ts`.

##### PR 2B.8: Insert all / upsert improvements (~42 tests)

Implement timestamps tracking, RETURNING clause, adapter-specific SQL generation. Unskips `insert-all.test.ts`.

##### PR 2B.9: Nested attributes edge cases (~19 tests)

Implement CPK support in nested attributes, dirty tracking integration. Unskips remaining `nested-attributes.test.ts`.

##### PR 2B.10: Migration features (~50 tests)

Implement migration runner, DDL operations, version tracking. Unskips `migration.test.ts`. (Large effort — may want to split further.)

#### Sub-area 2C: Smaller files (100+ skipped across many files)

These can each be a small PR:

| PR   | File(s)                           | Skipped | What's needed             |
| ---- | --------------------------------- | ------- | ------------------------- |
| 2C.1 | store.test.ts                     | 7       | Store edge cases          |
| 2C.2 | dirty.test.ts                     | 5       | Dirty tracking edge cases |
| 2C.3 | scoping/named-scoping.test.ts     | 6       | Named scope features      |
| 2C.4 | token-for.test.ts                 | 2       | Token generation          |
| 2C.5 | associations/join-model.test.ts   | 54      | Join model features       |
| 2C.6 | view.test.ts                      | 5       | Database view support     |
| 2C.7 | associations/has-many (remaining) | 5       | Edge cases                |

---

### Area 3: Missing files (145 files, ~2,038 tests)

#### PR 3.1: Permanently skip Ruby-only files (~400 tests)

Create stub files with `it.skip` for Ruby-only concepts, clearly marking them as not applicable:

- `fixtures_test.rb` (149 tests) — Rails test fixtures
- `tasks/database-tasks.test.ts` (78 tests) — Rake tasks
- `adapters/trilogy/*` (80 tests) — Trilogy adapter
- Various connection pool / multi-DB tests (~100 tests) — Different model in TS

#### PR 3.2: Type system tests (~40 tests)

Implement `type/*.test.ts` files: TypeMap, AdapterSpecificRegistry, integer/string/datetime/time types.

| File                                   | Tests |
| -------------------------------------- | ----- |
| type/type-map.test.ts                  | 18    |
| type/adapter-specific-registry.test.ts | 11    |
| type/integer.test.ts                   | 2     |
| type/date-time.test.ts                 | 2     |
| type/time.test.ts                      | 2     |
| type/string.test.ts                    | 1     |
| type/unsigned-integer.test.ts          | 1     |
| types.test.ts                          | 1     |

#### PR 3.3: Relation features — CTE and load_async (~44 tests)

| File                        | Tests |
| --------------------------- | ----- |
| relation/with.test.ts       | 16    |
| relation/load-async.test.ts | 28    |

#### PR 3.4: Query instrumentation and caching (~80 tests)

| File                    | Tests |
| ----------------------- | ----- |
| query-cache.test.ts     | 62    |
| instrumentation.test.ts | 18    |

#### PR 3.5: Date and time handling (~31 tests)

| File                        | Tests |
| --------------------------- | ----- |
| date-time-precision.test.ts | 18    |
| date-time.test.ts           | 10    |
| date.test.ts                | 3     |

#### PR 3.6: Bind parameters and SQL safety (~54 tests)

| File                   | Tests |
| ---------------------- | ----- |
| bind-parameter.test.ts | 17    |
| unsafe-raw-sql.test.ts | 37    |

#### PR 3.7: Encryption (~50 tests)

Implement encrypted attribute support across `encryption/*.test.ts` files.

#### PR 3.8: Connection adapter infrastructure (~160 tests)

Lower priority. Implement connection handler, schema cache, type lookup, standalone connections.

#### PR 3.9: Remaining stubs (~200+ tests across many small files)

Create `it.skip` stubs for all remaining unmatched tests to get file coverage to 342/342.

---

### Area 4: PostgreSQL adapter features (300+ skipped)

All files in `adapters/postgresql/`. Requires `PG_TEST_URL`.

#### PR 4.1: PostgreSQL schema tests (~71 tests)

Implement schema introspection: tables, views, columns, indexes, foreign keys. Largest single PG file.

#### PR 4.2: PostgreSQL adapter core (~60 tests)

Implement adapter features: connection handling, statement execution, prepared statements.

#### PR 4.3: Range type support (~46 tests)

Implement PostgreSQL range types (int4range, tsrange, etc.).

#### PR 4.4: HStore type support (~44 tests)

Implement HStore column type: read, write, query, migration.

#### PR 4.5: Array type support (~41 tests)

Implement PostgreSQL array columns: read, write, query, migration.

#### PR 4.6: Geometric types (~5 tests to unskip, 24 wrong describes)

Fix wrong describes for PostgreSQLPointTest, PostgreSQLGeometricTypesTest, PostgreSQLGeometricLineTest. May overlap with PR 1.1.

#### PR 4.7: Smaller PG type files (~50 tests total)

Quoting, UUID, timestamp, serial, numbers, cidr, json, xml — small targeted PRs.

---

## Tracking progress

```bash
npm run convention:compare -- --package activerecord
```

Target: `activerecord — 8385/8385 tests (100%)`

## Suggested parallel tracks

Three people could work simultaneously on:

1. **Track A: Wrong describes + structural** — Areas 1 and 3.1 (permanently skip Ruby-only). Pure file restructuring, no feature code.
2. **Track B: Association features** — Area 2A. Implements association capabilities and unskips tests.
3. **Track C: Core ORM + PostgreSQL** — Areas 2B and 4. Implements ORM features and PG adapter.

Each track touches different files and can merge independently.
