# ActiveRecord Relation: Road to 100%

Current: **253/253 methods matched** across relation files (100%).
All 21 relation files at 100%.

## The problem: methods live in the wrong file

Many methods exist in our `relation.ts` but api:compare can't find them
because Rails defines them in separate module files (`query_methods.rb`,
`finder_methods.rb`, etc.) that get `include`d into Relation. The compare
tool matches by file — so `where` in `relation.ts` doesn't count toward
`relation/query_methods.rb`.

## The fix: move the logic, use the mixin pattern

**The logic must live in the file that api:compare expects.** Re-exports
and delegation wrappers are not allowed — the actual implementation must
be in the correct file.

We have an established pattern for this (see CLAUDE.md "Module Mixins"):
`this`-typed functions defined in the module file, assigned directly on
the class. This is how `activemodel` handles `include`/`extend`:

```ts
// relation/query-methods.ts
export function where(this: QueryMethodsHost, conditions: Record<string, unknown>): Relation {
  const rel = this.clone();
  rel._whereClause = rel._whereClause.merge(new WhereClause(conditions));
  return rel;
}

export function whereBang(this: QueryMethodsHost, conditions: Record<string, unknown>): this {
  this._whereClause = this._whereClause.merge(new WhereClause(conditions));
  return this;
}
```

```ts
// relation.ts
import { where, whereBang } from "./relation/query-methods.js";

export class Relation<T> {
  where = where;
  whereBang = whereBang;
  // ...
}
```

This means **extracting** the implementations out of `relation.ts` into
their correct module files, not adding wrappers or re-exports.

## File-by-file plan

### relation/query-methods.ts — 45/83 (54%) — 38 missing

The biggest gap. Rails' `query_methods.rb` defines the query interface as
module methods. Our `query-methods.ts` only has constant arrays
(`MULTI_VALUE_METHODS`, `SINGLE_VALUE_METHODS`). The actual methods
(`where`, `order`, `select`, `limit`, `group`, etc.) live on `Relation` in
`relation.ts`.

**Missing methods fall into three categories:**

1. **Bang variants (mutate in place):** `includesBang`, `eagerLoadBang`,
   `preloadBang`, `referencesBang`, `withBang`, `withRecursiveBang`,
   `reselectBang`, `groupBang`, `regroupBang`, `orderBang`, `reorderBang`,
   `unscope!`, `joinsBang`, `leftOuterJoinsBang`, `havingBang`,
   `limitBang`, `offsetBang`, `lockBang`, `noneBang`, `fromBang`,
   `annotatesBang`, `optimizerHintsBang`
   — In Rails, each query method `foo` has a `foo!` variant that mutates
   `self` instead of cloning. Our Relation creates a clone for every call.
   Adding bang variants means adding a `_mutate` path.

2. **Methods that exist on Relation but aren't in this file:**
   `or`, `structurallyCompatible`, `whereSqlForColumns`
   — Need to be exported from `query-methods.ts` for api:compare.

3. **Methods not yet implemented:**
   `with_recursive`, `regroup`, `optimizer_hints`, `in_order_of`,
   `excluding`/`without`
   — Need actual implementation.

**Approach:** Extract the existing query method implementations out of
`relation.ts` into `this`-typed functions in `query-methods.ts`. Add
bang variants that mutate `this` instead of cloning. Assign them on
Relation via the mixin pattern. Implement missing query methods
(`withRecursive`, `regroup`, `inOrderOf`, `excluding`/`without`,
`optimizerHints`).

### relation.rb — 48/66 (73%) — 18 missing

| Method                | Complexity | Notes                                       |
| --------------------- | ---------- | ------------------------------------------- |
| `predicateBuilder`    | Low        | Expose existing `_predicateBuilder`         |
| `skipPreloadingValue` | Low        | Accessor for existing value                 |
| `bindAttribute`       | Low        | Delegate to predicate builder               |
| `cacheKey`            | Medium     | Compute from table name + query hash        |
| `computeCacheKey`     | Medium     | Internal for `cacheKey`                     |
| `cacheVersion`        | Medium     | Max `updated_at` from results               |
| `computeCacheVersion` | Medium     | Internal for `cacheVersion`                 |
| `cacheKeyWithVersion` | Low        | `"#{cacheKey}-#{cacheVersion}"`             |
| `scoping`             | Medium     | Push relation onto thread-local scope stack |
| `isScheduled`         | Low        | Accessor                                    |
| + 8 more              |            | (truncated by compare tool)                 |

### relation/where-clause.ts — 5/9 (56%) — 4 missing

| Method              | Complexity | Notes                                |
| ------------------- | ---------- | ------------------------------------ |
| `or`                | Medium     | Combine two where clauses with OR    |
| `ast`               | Medium     | Convert to Arel AST node             |
| `isContradiction`   | Low        | Check if clause is always false      |
| `extractAttributes` | Medium     | Pull attribute names from predicates |

### relation/predicate-builder.ts — 3/8 (38%) — 5 missing

| Method                 | Complexity | Notes                                    |
| ---------------------- | ---------- | ---------------------------------------- |
| `registerHandler`      | Low        | Add custom type handler                  |
| `buildBindAttribute`   | Medium     | Create bind param for value              |
| `resolveArelAttribute` | Low        | Table + column → Arel attribute          |
| `with`                 | Low        | Return builder with context              |
| `references`           | Low        | Extract table references from predicates |

### relation/delegation.ts — 1/9 (11%) — 8 missing

Rails' delegation module auto-generates methods on Relation that delegate
to `klass` (the model class). Most missing methods are class-level
meta-programming (`generateMethod`, `delegatedClasses`,
`initializeRelationDelegateCache`, etc.).

**Approach:** Implement the delegation registry. Low-priority since these
are internal plumbing methods, not user-facing API.

### relation/batches/batch-enumerator.ts — 5/11 (45%) — 6 missing

| Method             | Complexity | Notes                                               |
| ------------------ | ---------- | --------------------------------------------------- |
| `start` / `finish` | Low        | Accessor for range bounds                           |
| `relation`         | Low        | Accessor                                            |
| `batchSize`        | Low        | Accessor                                            |
| `touchAll`         | Medium     | Batch touch_all across records                      |
| `each`             | Low        | Iterator (may already exist as `[Symbol.iterator]`) |

### Other small files (1-2 missing each)

| File                      | Missing | Method                             | Notes                   |
| ------------------------- | ------- | ---------------------------------- | ----------------------- |
| `finder-methods.ts`       | 1       | `raiseRecordNotFoundExceptionBang` | Error builder           |
| `from-clause.ts`          | 1       | `name`                             | Accessor                |
| `merger.ts`               | 1       | `values`                           | Accessor                |
| `spawn-methods.ts`        | 1       | `mergeBang`                        | In-place merge          |
| `array-handler.ts`        | 1       | `or`                               | OR predicate for arrays |
| `basic-object-handler.ts` | 1       | `constructor`                      | Initialize handler      |
| `range-handler.ts`        | 1       | `constructor`                      | Initialize handler      |

## PR plan

Two PRs. PR 1 is the heavy lift — it touches `relation.ts` and
`query-methods.ts` extensively. PR 2 covers everything else and can be
developed in parallel since it touches separate files.

### PR 1: Extract query methods into query-methods.ts (~38 methods)

The single highest-impact change. Extract the existing query method
implementations out of `relation.ts` into `this`-typed functions in
`query-methods.ts`, following the mixin pattern. Then assign them back
on Relation.

1. Extract each existing query method (`where`, `order`, `select`,
   `limit`, `group`, `having`, `joins`, `leftOuterJoins`, `distinct`,
   `from`, `lock`, `reorder`, `reselect`, `none`, `unscope`, `readonly`,
   `extending`, `annotate`, `with`, `includes`, `eagerLoad`, `preload`,
   `references`, `offset`) into `this`-typed functions
2. Add bang variants that mutate `this` instead of cloning
3. Implement missing methods: `withRecursive`, `regroup`, `inOrderOf`,
   `excluding`/`without`, `optimizerHints`

Expected gain: query-methods.ts from 54% to ~95%+.

**Touches:** `relation/query-methods.ts` (major), `relation.ts` (extract out).

### PR 2: Everything else (~52 methods) — parallelizable with PR 1

All remaining relation files. These don't touch `query-methods.ts` or
the query method portions of `relation.ts`, so this can be developed
on a separate worktree at the same time as PR 1.

**relation.rb** (~18 methods): `cacheKey`/`cacheVersion`/`cacheKeyWithVersion`,
`scoping`, `predicateBuilder` accessor, `bindAttribute`, remaining accessors.

**where-clause.ts** (4 methods): `or`, `ast`, `isContradiction`,
`extractAttributes`.

**predicate-builder.ts** (5 methods): `registerHandler`, `buildBindAttribute`,
`resolveArelAttribute`, `with`, `references`.

**delegation.ts** (8 methods): Delegation registry plumbing — `generateMethod`,
`delegatedClasses`, `initializeRelationDelegateCache`, etc.

**batch-enumerator.ts** (6 methods): `start`/`finish`/`relation`/`batchSize`
accessors, `touchAll`, `each`.

**Small files** (7 methods, 1-2 each): `finder-methods.ts`, `from-clause.ts`,
`merger.ts`, `spawn-methods.ts`, `array-handler.ts`, `basic-object-handler.ts`,
`range-handler.ts`.

**Touches:** Many files, but none that PR 1 modifies (except `relation.ts`
for non-query-method additions like `cacheKey` — coordinate merge order).

## Total

90 methods across 2 PRs would bring relation files from 163/253 (64%) to
~253/253 (100%).
