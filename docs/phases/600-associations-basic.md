# Phase 600: Associations — belongs_to, has_one

**Goal**: Solidify the two simplest association types.

## Current state

- Associations: 35/1440 (2%)
- `belongs_to` and `has_one` exist but lack most edge cases

## belongs_to (target: 80+ of 154 tests)

### Already working

- Basic `belongsTo` declaration
- Loading parent from DB
- Foreign key inference

### Missing / incomplete

- `optional: true` / `optional: false` (presence validation)
- `polymorphic: true`
- `touch: true` — touch parent on save
- `counter_cache: true`
- Custom `foreign_key:`, `primary_key:`, `class_name:`
- `inverse_of:` for bidirectional caching
- `autosave: true`
- `dependent: :destroy` / `:delete`
- Building / creating through association (`build_parent`, `create_parent`)
- `reload_parent` to force reload
- Assigning by ID (`record.parent_id = x`)

## has_one (target: 50+ of 93 tests)

### Already working

- Basic `hasOne` declaration
- Loading child from DB

### Missing / incomplete

- `dependent: :destroy` / `:delete` / `:nullify`
- `build_child` / `create_child`
- `through:` (has_one through)
- `source:` for through associations
- `inverse_of:`
- `autosave: true`
- Assignment (replacing existing child)
- `strict_loading:`

### Key files

- `packages/activerecord/src/associations.ts`
- `packages/activerecord/src/reflection.ts`
- Ruby reference: `associations/belongs_to_associations_test.rb`,
  `associations/has_one_associations_test.rb`
