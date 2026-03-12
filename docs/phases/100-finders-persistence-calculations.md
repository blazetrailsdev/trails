# Phase 100: Finders, Persistence, Calculations

**Goal**: Solidify the core read/write path. These areas are already 30-37%
covered, so this phase focuses on closing gaps in existing implementations.

## Finders (138/377 → target 300+)

### Already working

- `find(id)`, `findBy(conditions)`, `first`, `last`, `take`
- `exists?`, `sole`, `findSoleBy`
- `findEach`, `findInBatches`, `inBatches`

### Missing / incomplete

- `find` with array of IDs returning ordered results
- `find` raising `RecordNotFound` with `model`, `primary_key`, `id` details
- `first(n)` / `last(n)` returning arrays
- `take(n)` returning array
- `findBy!` raising on miss
- `forty_two`, `third`, `second_to_last` etc. (positional finders)
- `find_or_create_by` / `find_or_initialize_by` edge cases
- Finder methods respecting default scopes
- `in_batches` with `finish:`, `error_on_ignore:`, `order:` options

### Key files

- `packages/activerecord/src/base.ts` — static finder methods
- `packages/activerecord/src/relation.ts` — Relation finder methods
- Ruby reference: `finder_test.rb`, `batches_test.rb`

## Persistence (67/202 → target 160+)

### Already working

- `save`, `create`, `update`, `destroy`, `delete`
- `update_column`, `update_columns`
- `touch`, `toggle`, `increment`, `decrement`

### Missing / incomplete

- `save!` / `create!` / `update!` raising on validation failure
- `destroy!` raising `RecordNotDestroyed`
- `becomes` / `becomes!` for STI
- `update_attribute` (skips validation)
- Readonly records (`readonly!`, `readonly?`)
- Persistence callbacks integration (before/after save, create, update, destroy)
- `new_record?` / `persisted?` / `previously_new_record?` / `previously_persisted?` lifecycle tracking
- Duplicate detection with `dup`

### Key files

- `packages/activerecord/src/base.ts`
- Ruby reference: `persistence_test.rb`, `timestamp_test.rb`

## Calculations (71/233 → target 180+)

### Already working

- `count`, `sum`, `average`, `minimum`, `maximum`
- `pluck`, `pick`, `ids`
- Group-by calculations

### Missing / incomplete

- `count` with `distinct: true`
- `count` with column name (counts non-null)
- `sum` with block
- Calculations with `having`
- Calculations with `joins`
- Calculations with `group` returning ordered hash
- `pluck` with multiple columns
- `pick` with multiple columns
- Calculations on relations with `from`
- `annotate` on calculation queries

### Key files

- `packages/activerecord/src/relation.ts` — calculation methods
- Ruby reference: `calculations_test.rb`
