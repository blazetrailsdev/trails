# ActiveRecord: Road to 100% Test Coverage

Current state: **52.0%** (4,358 implemented / 8,385 total Ruby tests). 340/342 files mapped, 0 misplaced, 79 wrong describes, 3,783 skipped.

## How coverage is measured

`npm run convention:compare` extracts test names from both Rails Ruby source and our TypeScript tests, then matches them by normalized name and describe-block ancestry. File mapping is convention-based: `finder_test.rb` maps to `finder.test.ts` (snake_case to kebab-case).

The percentage reflects **implemented** (non-skipped) tests only. Skipped stubs (`it.skip`) are tracked separately.

Columns in the output: `OK` (implemented, non-skipped), `Skip` (matched but `it.skip`), `Desc` (wrong describe block), `Move` (misplaced — wrong file), `Miss` (no TS equivalent at all), `Tot` (total Ruby tests in file).

## The gap: 4,027 tests

To reach 100%, we need to implement 4,027 more tests (8,385 - 4,358). These break down into:

- **3,783 skipped tests** — `it.skip()` stubs that need real implementations
- **244 unmatched tests** — Ruby tests with no TS equivalent (across existing and 2 missing files)

## Completed work

### Wrong describes: 382 → 79 (done: PRs #66–#70, #77–#81)

All PostgreSQL, MySQL, core ORM, association, and transaction wrong describes have been fixed. The remaining 79 are spread across smaller files.

### Missing files: 145 → 2 (done: PR #89)

Generated `it.skip` stubs for 143 missing files. Only 2 Ruby files lack a TS equivalent.

### Fixture-dependent tests (done: PRs #60, #71)

Converted fixture-dependent tests in has-many-through, where-chain, transaction-callbacks, strict-loading, and autosave-association to be self-contained.

### Counter cache (done: PR #76)

Fixed `resetCounters` (was broken — treated `_associations` as Map instead of array). Added `resolveCounterColumn` helper for custom counter cache columns, `countHasMany` for efficient counting. Unskipped 9 counter-cache tests.

### Inverse associations (done: PR #87)

Added `InverseOfAssociationNotFoundError` with Levenshtein-based "Did you mean?" suggestions. Validation runs at association load time. Unskipped 5 inverse association tests.

### Readonly checks (done: PR #93)

Added readonly guards to `touch()` and `updateColumns()`. Unskipped 2 tests.

### Async callback chain (done: PRs #102, #110, #112)

Major refactor: `CallbackChain` is now async-first. `run()`/`runBefore()`/`runAfter()` are async and properly await promise-returning callbacks. Sync variants (`runSync`/`runBeforeSync`/`runAfterSync`) exist for constructors and validation.

- `destroy()` respects `beforeDestroy` halt, returns `false`, `destroyBang()` throws `RecordNotDestroyed`
- `afterCreate`/`afterUpdate`/`afterDestroy` fire after DB operation completes
- Around callbacks support async `proceed()`, block execution tracking
- ~24 tests unskipped as a side effect

### Insert all / upsert (done: PR #90)

Implemented timestamps tracking, RETURNING clause, adapter-specific SQL generation.

### Store / dirty tracking (done: PR #72)

Unskipped store and dirty tracking edge case tests.

### Batch unskips (done: PRs #82–#86, #88, #108)

Various batches of test unskips across core ORM, callbacks, and associations.

---

## Remaining work areas (parallelizable)

### Area 1: Wrong describes (79 remaining)

Most of the original 382 wrong describes have been fixed. The remaining 79 are spread across various files — check `convention:compare` output for the current list.

---

### Area 2: Unskip tests (3,783 skipped)

Grouped by the feature/capability that blocks them.

#### Sub-area 2A: Association features

| PR    | Area                                         | Status          |
| ----- | -------------------------------------------- | --------------- |
| 2A.1  | Fixture-dependent association tests          | Done (#60, #71) |
| 2A.2  | Eager loading — includes/preload (~84 tests) | Open            |
| 2A.3  | Counter cache (~35 tests)                    | Done (#76)      |
| 2A.4  | Inverse associations (~40 tests)             | Done (#87)      |
| 2A.5  | Has-one features (~33 tests)                 | Partial (#107)  |
| 2A.6  | Has-one-through features (~29 tests)         | Open            |
| 2A.7  | HABTM features (~48 tests)                   | Open            |
| 2A.8  | Nested through associations (~54 tests)      | Open            |
| 2A.9  | Strict loading modes (~37 tests)             | Partial (#107)  |
| 2A.10 | Autosave edge cases (~40 tests)              | Open            |

#### Sub-area 2B: Core ORM features

| PR    | Area                                     | Status         |
| ----- | ---------------------------------------- | -------------- |
| 2B.1  | Base class features (~74 tests)          | Partial (#101) |
| 2B.2  | Locking (~33 tests)                      | Partial (#101) |
| 2B.3  | Where clause features (~36 tests)        | Open           |
| 2B.4  | Where chain (~31 tests)                  | Open           |
| 2B.5  | Reflection API (~43 tests)               | Partial (#101) |
| 2B.6  | Serialized attributes (~19 tests)        | Partial (#101) |
| 2B.7  | Transaction callbacks (~22 tests)        | Partial (#101) |
| 2B.8  | Insert all / upsert (~42 tests)          | Done (#90)     |
| 2B.9  | Nested attributes edge cases (~19 tests) | Open           |
| 2B.10 | Migration features (~50 tests)           | Open           |

#### Sub-area 2C: Smaller files

| PR   | File(s)                           | Skipped | Status         |
| ---- | --------------------------------- | ------- | -------------- |
| 2C.1 | store.test.ts                     | 7       | Done (#72)     |
| 2C.2 | dirty.test.ts                     | 5       | Done (#72)     |
| 2C.3 | scoping/named-scoping.test.ts     | 6       | Partial (#105) |
| 2C.4 | token-for.test.ts                 | 2       | Done (#71)     |
| 2C.5 | associations/join-model.test.ts   | 54      | Done (#106)    |
| 2C.6 | view.test.ts                      | 5       | Open           |
| 2C.7 | associations/has-many (remaining) | 5       | Partial (#105) |

---

### Area 3: Missing files — mostly done

Only 2 files remain unmapped. The bulk of missing file stubs were generated in PR #89.

---

### Area 4: PostgreSQL adapter features (300+ skipped)

All files in `adapters/postgresql/`. Requires `PG_TEST_URL`.

| PR  | Area                    | Tests | Status      |
| --- | ----------------------- | ----- | ----------- |
| 4.1 | PostgreSQL schema tests | ~71   | Done (#99)  |
| 4.2 | PostgreSQL adapter core | ~60   | Done (#103) |
| 4.3 | Range type support      | ~46   | Open        |
| 4.4 | HStore type support     | ~44   | Open        |
| 4.5 | Array type support      | ~41   | Open        |
| 4.6 | Geometric types         | ~29   | Open        |
| 4.7 | Smaller PG type files   | ~50   | Open        |

---

## Tracking progress

```bash
npm run convention:compare -- --package activerecord
```

Target: `activerecord — 8385/8385 tests (100%)`

## Suggested parallel tracks

Three people could work simultaneously on:

1. **Track A: Wrong describes + structural** — Fix remaining 79 wrong describes. Pure file restructuring, no feature code.
2. **Track B: Association features** — Area 2A. Implements association capabilities and unskips tests.
3. **Track C: Core ORM + PostgreSQL** — Areas 2B and 4. Implements ORM features and PG adapter.

Each track touches different files and can merge independently.
