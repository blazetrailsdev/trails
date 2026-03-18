# ActiveRecord: Road to 100% Test Coverage

Current state: **52.2%** (4,374 OK / 8,385 Ruby tests). Additionally: 3,767 skipped stubs, 52 in wrong describe blocks, 244 with no TS equivalent.

## How coverage is measured

`npm run convention:compare` matches our test names against the Rails test suite. `OK` = matched, in correct describe, not skipped. `Skip` = matched but `it.skip`. `Desc` = matched but in wrong describe block. `Miss` = Ruby test with no TS equivalent.

## Two workstreams

The remaining 4,011 tests split into two parallel tracks that rarely touch the same files. The PRs below cover the largest files (20+ skipped); ~1,700 additional skipped tests are spread across many smaller files not listed here.

---

### Workstream A: Associations & Querying (~690 skipped in listed files)

Covers association features, eager loading, scoping, where clauses, and finders.

#### PR A1: Through associations (~152 skipped)

| File                                               | Skipped |
| -------------------------------------------------- | ------- |
| associations/has-many-through-associations.test.ts | 98      |
| associations/nested-through-associations.test.ts   | 54      |

Implement has-many-through join logic, nested through chains, and through-source reflection.

#### PR A2: Eager loading (~76 skipped)

| File                       | Skipped | Notes        |
| -------------------------- | ------- | ------------ |
| associations/eager.test.ts | 76      | 20 unmatched |

Continue `includes`/`preload`/`eagerLoad` work started in #114. Preloader, batch loading, nested eager loading.

#### PR A3: General associations & autosave (~140 skipped)

| File                         | Skipped |
| ---------------------------- | ------- |
| associations.test.ts         | 72      |
| autosave-association.test.ts | 68      |

General association edge cases, autosave with nested attributes, validation propagation, `markForDestruction`.

#### PR A4: HABTM & join models (~91 skipped)

| File                                                      | Skipped |
| --------------------------------------------------------- | ------- |
| associations/has-and-belongs-to-many-associations.test.ts | 48      |
| associations/join-model.test.ts                           | 43      |

Join table management, bidirectional syncing, through-join-model queries.

#### PR A5: Has-one & has-one-through (~60 skipped)

| File                                              | Skipped |
| ------------------------------------------------- | ------- |
| associations/has-one-associations.test.ts         | 31      |
| associations/has-one-through-associations.test.ts | 29      |

Continue has-one work from #107/#109. Through associations for has-one, replacement, autosave.

#### PR A6: Scoping & finders (~53 skipped)

| File                             | Skipped | Notes            |
| -------------------------------- | ------- | ---------------- |
| scoping/relation-scoping.test.ts | 53      | 1 wrong describe |

Default scopes, `unscoped`, nested scoping, scoped create, annotation scoping.

#### PR A7: Where clause & inverse (~71 skipped)

| File                                      | Skipped |
| ----------------------------------------- | ------- |
| relation/where.test.ts                    | 36      |
| associations/inverse-associations.test.ts | 35      |

`where.not`, OR/AND chaining, polymorphic where, inverse association edge cases.

#### PR A8: Remaining association files (~28 skipped)

| File                                                             | Skipped | Notes              |
| ---------------------------------------------------------------- | ------- | ------------------ |
| associations/has-many-through-disable-joins-associations.test.ts | 28      |                    |
| nested-attributes.test.ts                                        | 0       | 18 wrong describes |

Disable-joins mode, fix 18 wrong describes in nested-attributes.

---

### Workstream B: Core ORM & Infrastructure (~1,370 skipped in listed files)

Covers base class features, adapters, fixtures, schema, encryption, and connections.

#### PR B1: Base class features (~69 skipped)

| File         | Skipped |
| ------------ | ------- |
| base.test.ts | 69      |

Attribute API, type casting, inheritance, abstract classes, configuration.

#### PR B2: PostgreSQL types — range, hstore, array (~131 skipped)

| File                               | Skipped | Notes             |
| ---------------------------------- | ------- | ----------------- |
| adapters/postgresql/range.test.ts  | 46      |                   |
| adapters/postgresql/hstore.test.ts | 44      | 3 wrong describes |
| adapters/postgresql/array.test.ts  | 41      |                   |

PG-specific type casting, serialization, querying. Requires `PG_TEST_URL`.

#### PR B3: PostgreSQL adapter & schema (~127 skipped)

| File                                           | Skipped |
| ---------------------------------------------- | ------- |
| adapters/postgresql/postgresql-adapter.test.ts | 51      |
| adapters/postgresql/schema.test.ts             | 39      |
| adapters/postgresql/postgresql-rake.test.ts    | 37      |

Adapter features, schema introspection, rake task equivalents.

#### PR B4: Fixtures (~149 skipped)

| File             | Skipped |
| ---------------- | ------- |
| fixtures.test.ts | 149     |

Fixture loading, caching, transactional fixtures, YAML parsing.

#### PR B5: Query cache & logging (~87 skipped)

| File                | Skipped |
| ------------------- | ------- |
| query-cache.test.ts | 62      |
| query-logs.test.ts  | 25      |

Query caching layer, invalidation, notification hooks, query log tags.

#### PR B6: Schema & migrations (~230 skipped)

| File                         | Skipped |
| ---------------------------- | ------- |
| tasks/database-tasks.test.ts | 78      |
| schema-dumper.test.ts        | 67      |
| migration.test.ts            | 50      |
| migrator.test.ts             | 35      |

DDL generation, schema dumper, migrator, database tasks.

#### PR B7: Encryption (~51 skipped)

| File                                  | Skipped |
| ------------------------------------- | ------- |
| encryption/encryptable-record.test.ts | 51      |

Encrypted attributes, key management, querying encrypted columns.

#### PR B8: Connections & adapters (~141 skipped)

| File                                                             | Skipped |
| ---------------------------------------------------------------- | ------- |
| connection-pool.test.ts                                          | 50      |
| adapters/trilogy/trilogy-adapter.test.ts                         | 51      |
| connection-adapters/merge-and-resolve-default-url-config.test.ts | 40      |

Connection pooling, MySQL adapter, DB config resolution.

#### PR B9: Reflection, insert-all, locking (~107 skipped)

| File               | Skipped |
| ------------------ | ------- |
| insert-all.test.ts | 42      |
| reflection.test.ts | 40      |
| locking.test.ts    | 25      |

Continue insert-all/upsert work from #90, reflection API, optimistic/pessimistic locking.

#### PR B10: Remaining core files (~278 skipped)

| File                                        | Skipped |
| ------------------------------------------- | ------- |
| unsafe-raw-sql.test.ts                      | 37      |
| multiparameter-attributes.test.ts           | 37      |
| strict-loading.test.ts                      | 34      |
| database-configurations/hash-config.test.ts | 34      |
| integration.test.ts                         | 33      |
| counter-cache.test.ts                       | 31      |
| collection-cache-key.test.ts                | 30      |
| transaction-instrumentation.test.ts         | 21      |
| log-subscriber.test.ts                      | 21      |

Grab bag of smaller core ORM features. Can be split further if needed.

---

### Wrong describes (52 remaining)

Can be picked up alongside whichever PR touches the relevant file:

- nested-attributes.test.ts (18) — PR A8
- PostgreSQL adapter files (26 across ~12 files) — PRs B2/B3
- scoping/relation-scoping.test.ts (1) — PR A6
- associations/nested-error.test.ts (3) — PR A3

---

## Tracking

```bash
npm run convention:compare -- --package activerecord
```

Target: `activerecord — 8385/8385 tests (100%)`
