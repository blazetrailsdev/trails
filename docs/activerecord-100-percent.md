# ActiveRecord: Road to 100%

Current: **45.6% API** (1,294 / 2,835 methods). **All relation files at 100%.**

```bash
pnpm run api:compare -- --package activerecord
pnpm run api:compare -- --package activerecord --missing  # show missing methods per file
```

## How to work on this

Each area below is independent. Pick an area, work in a worktree, submit a PR.

**Before starting**: read the Rails source for the feature you're implementing.

**Measuring progress**: `api:compare` matches individual public methods against
Rails source. Methods must live in the file api:compare expects (matching the
Rails module structure).

---

## Infrastructure concerns

These affect multiple files and need dedicated work before more methods can
be properly wired up.

### Wire module methods onto Base

Methods in `persistence.ts`, `core.ts`, `model-schema.ts`, `scoping.ts` are
exported as standalone functions but not yet mixed onto `Base` as static/instance
methods. `api:compare` finds them in the correct files, but they're not callable
at runtime (e.g., `User.build()`, `User.currentRole()`).

**Fix:** Use the `include()` pattern from `@blazetrails/activesupport` to mix
class methods onto `Base`, similar to how `Relation` includes its modules.

### AsyncLocalStorage for connected_to_stack

`core.ts` stores `connectedToStack` in a process-global array. Rails uses
`ActiveSupport::IsolatedExecutionState` (per-fiber/thread). In Node.js, this
leaks state between concurrent async requests.

**Fix:** Use `AsyncLocalStorage` (see `encryption/context.ts` for an existing
pattern in this repo).

### PredicateBuilder in core.ts

`core.ts#predicateBuilder` returns a `{ table }` stub because importing
`PredicateBuilder` directly creates a circular dependency.
Rails: `PredicateBuilder.new(TableMetadata.new(self, arel_table))`.

**Fix:** Register `PredicateBuilder` class at module load time (when
`relation.ts` loads) so `core.ts` can access it without circular imports.

### TypeCaster::Map

`core.ts#typeCaster` creates a new object per call with minimal type casting.
Rails returns `TypeCaster::Map.new(self)` which delegates to the full type system.

**Fix:** Implement `TypeCaster::Map` and memoize per class.

### Reflection foreignKey + CPK

`foreignKey` derivation does not yet handle composite primary keys or
`queryConstraints`. Associations with CPK will report incorrect foreign
keys in reflection.

---

## Completed (100%)

### Relation files (21/21)

All relation files at 100%: `relation.rb`, `query_methods.rb`,
`finder_methods.rb`, `calculations.rb`, `spawn_methods.rb`,
`where_clause.rb`, `predicate_builder.rb` (+ all sub-handlers),
`delegation.rb`, `merger.rb`, `from_clause.rb`, `batch_enumerator.rb`,
`query_attribute.rb`.

### Base module files (4/4 recently completed)

`persistence.rb` (100%), `core.rb` (100%), `model_schema.rb` (100%),
`scoping.rb` (100%).

---

## Remaining module files (~80 methods across 21 files)

| File                                       | Matched | Missing | Total | %   |
| ------------------------------------------ | ------- | ------- | ----- | --- |
| attribute_methods.rb                       | 6       | 15      | 21    | 29% |
| attribute_methods/primary_key.rb           | 6       | 9       | 15    | 40% |
| normalization.rb                           | 1       | 9       | 10    | 10% |
| attribute_methods/composite_primary_key.rb | 1       | 6       | 7     | 14% |
| enum.rb                                    | 2       | 6       | 8     | 25% |
| sanitization.rb                            | 2       | 5       | 7     | 29% |
| timestamp.rb                               | 0       | 5       | 5     | 0%  |
| store.rb                                   | 7       | 4       | 11    | 64% |
| inheritance.rb                             | 8       | 4       | 12    | 67% |
| autosave_association.rb                    | 5       | 4       | 9     | 56% |
| scoping/default.rb                         | 4       | 2       | 6     | 67% |
| scoping/named.rb                           | 2       | 3       | 5     | 40% |
| locking/optimistic.rb                      | 5       | 3       | 8     | 63% |
| counter_cache.rb                           | 4       | 2       | 6     | 67% |
| no_touching.rb                             | 4       | 2       | 6     | 67% |
| attribute_methods/before_type_cast.rb      | 2       | 2       | 4     | 50% |
| integration.rb                             | 4       | 1       | 5     | 80% |
| signed_id.rb                               | 4       | 1       | 5     | 80% |
| secure_token.rb                            | 1       | 1       | 2     | 50% |
| attribute_methods/dirty.rb                 | 12      | 1       | 13    | 92% |
| attribute_methods/time_zone_conversion.rb  | 2       | 1       | 3     | 67% |

## Bigger gaps (not in scope yet)

| Area                | Missing | Notes                                                  |
| ------------------- | ------- | ------------------------------------------------------ |
| Connection adapters | ~400    | Abstract adapter, schema statements, pool, transaction |
| Associations        | ~120    | belongs_to, collection, builder, preloader             |
| Migration           | ~50     | Command recorder, schema migration                     |
