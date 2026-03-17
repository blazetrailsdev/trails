# ActiveRecord: Road to 100% Test Coverage

Current state: **50.6%** (4,242 implemented / 8,385 total Ruby tests). 340/342 files mapped, 0 misplaced, 79 wrong describes, 3,899 skipped.

## How coverage is measured

`npm run convention:compare` extracts test names from both Rails Ruby source and our TypeScript tests, then matches them by normalized name and describe-block ancestry. File mapping is convention-based: `finder_test.rb` maps to `finder.test.ts` (snake_case to kebab-case).

The percentage reflects **implemented** (non-skipped) tests only. Skipped stubs (`it.skip`) are tracked separately.

Columns in the output: `OK` (implemented, non-skipped), `Skip` (matched but `it.skip`), `Desc` (wrong describe block), `Move` (misplaced — wrong file), `Miss` (no TS equivalent at all), `Tot` (total Ruby tests in file).

## The gap: 4,143 tests

To reach 100%, we need to implement 4,143 more tests (8,385 - 4,242). These break down into:

- **3,899 skipped tests** — `it.skip()` stubs that need real implementations
- **244 unmatched tests** — Ruby tests with no TS equivalent (across existing and 2 missing files)

## Completed work

### Wrong describes: 382 → 79 (done: PRs #66–#70, #77–#81)

All PostgreSQL, MySQL, core ORM, association, and transaction wrong describes have been fixed. The remaining 79 are spread across smaller files.

### Missing files: 145 → 2 (done: PR #89)

Generated `it.skip` stubs for 143 missing files. Only 2 Ruby files lack a TS equivalent.

### Fixture-dependent tests (done: PRs #60, #71)

Converted fixture-dependent tests in has-many-through, where-chain, transaction-callbacks, strict-loading, and autosave-association to be self-contained.

### Counter cache (done: PR #76)

Implemented counter cache callbacks. Unskipped counter-cache.test.ts tests.

### Inverse associations (done: PR #87)

Implemented automatic inverse detection, inverse validation, stale state tracking.

### Insert all / upsert (done: PR #90)

Implemented timestamps tracking, RETURNING clause, adapter-specific SQL generation.

### Store / dirty tracking (done: PR #72)

Unskipped store and dirty tracking edge case tests.

### Batch unskips (done: PRs #82–#86, #88)

Various batches of test unskips across core ORM, callbacks, and associations.

---

## Remaining work areas (parallelizable)

### Area 1: Wrong describes (79 remaining)

Most of the original 382 wrong describes have been fixed. The remaining 79 are spread across various files — check `convention:compare` output for the current list.

---

### Area 2: Unskip tests (3,910 skipped)

Grouped by the feature/capability that blocks them.

#### Sub-area 2A: Association features

| PR    | Area                                         | Status          |
| ----- | -------------------------------------------- | --------------- |
| 2A.1  | Fixture-dependent association tests          | Done (#60, #71) |
| 2A.2  | Eager loading — includes/preload (~84 tests) | Open            |
| 2A.3  | Counter cache (~35 tests)                    | Done (#76)      |
| 2A.4  | Inverse associations (~40 tests)             | Done (#87)      |
| 2A.5  | Has-one features (~33 tests)                 | Open            |
| 2A.6  | Has-one-through features (~29 tests)         | Open            |
| 2A.7  | HABTM features (~48 tests)                   | Open            |
| 2A.8  | Nested through associations (~54 tests)      | Open            |
| 2A.9  | Strict loading modes (~37 tests)             | Open            |
| 2A.10 | Autosave edge cases (~40 tests)              | Open            |

#### Sub-area 2B: Core ORM features

| PR    | Area                                     | Status     |
| ----- | ---------------------------------------- | ---------- |
| 2B.1  | Base class features (~74 tests)          | Open       |
| 2B.2  | Locking (~33 tests)                      | Open       |
| 2B.3  | Where clause features (~36 tests)        | Open       |
| 2B.4  | Where chain (~31 tests)                  | Open       |
| 2B.5  | Reflection API (~43 tests)               | Open       |
| 2B.6  | Serialized attributes (~19 tests)        | Open       |
| 2B.7  | Transaction callbacks (~22 tests)        | Open       |
| 2B.8  | Insert all / upsert (~42 tests)          | Done (#90) |
| 2B.9  | Nested attributes edge cases (~19 tests) | Open       |
| 2B.10 | Migration features (~50 tests)           | Open       |

#### Sub-area 2C: Smaller files

| PR   | File(s)                           | Skipped | Status     |
| ---- | --------------------------------- | ------- | ---------- |
| 2C.1 | store.test.ts                     | 7       | Done (#72) |
| 2C.2 | dirty.test.ts                     | 5       | Done (#72) |
| 2C.3 | scoping/named-scoping.test.ts     | 6       | Open       |
| 2C.4 | token-for.test.ts                 | 2       | Open       |
| 2C.5 | associations/join-model.test.ts   | 54      | Open       |
| 2C.6 | view.test.ts                      | 5       | Open       |
| 2C.7 | associations/has-many (remaining) | 5       | Open       |

---

### Area 3: Missing files — mostly done

Only 2 files remain unmapped. The bulk of missing file stubs were generated in PR #89.

---

### Area 4: PostgreSQL adapter features (300+ skipped)

All files in `adapters/postgresql/`. Requires `PG_TEST_URL`.

| PR  | Area                    | Tests | Status |
| --- | ----------------------- | ----- | ------ |
| 4.1 | PostgreSQL schema tests | ~71   | Open   |
| 4.2 | PostgreSQL adapter core | ~60   | Open   |
| 4.3 | Range type support      | ~46   | Open   |
| 4.4 | HStore type support     | ~44   | Open   |
| 4.5 | Array type support      | ~41   | Open   |
| 4.6 | Geometric types         | ~29   | Open   |
| 4.7 | Smaller PG type files   | ~50   | Open   |

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

---

## Follow-up PRs (callback chain)

These were identified during PR #102 (async callback chain) and deferred:

1. **Async-aware `runBefore`/`runAfter`** — `CallbackFn` allows `Promise<void | boolean>` but `runBefore()`/`runAfter()` don't await promise-returning callbacks. An async before callback that resolves to `false` won't halt the chain. Fix: add `runBeforeAsync()`/`runAfterAsync()` variants and use them from `runAsync()`.

2. **Split `AroundCallbackFn` type for sync vs async** — `AroundCallbackFn` now allows returning a `Promise`, but the synchronous `run()` doesn't await it. This means async around callbacks silently run out-of-order when used with `run()`. Fix: keep `AroundCallbackFn` sync-only for `run()`, introduce `AsyncAroundCallbackFn` for `runAsync()`.
