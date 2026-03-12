# Phase 800: Associations — Eager Loading, Autosave, Nested Attributes

**Goal**: Implement the complex association features that make Rails productive
for real apps.

## Eager Loading (target: 80+ of 197 tests)

### Missing / incomplete

- `includes` — decides between preload and eager_load
- `preload` — separate queries per association
- `eager_load` — single LEFT OUTER JOIN query
- Nested eager loading (`includes(posts: :comments)`)
- Eager loading with conditions
- Eager loading polymorphic associations
- `strict_loading` mode (raise on lazy load)
- N+1 detection

### Key files

- Ruby reference: `associations/eager_test.rb`,
  `associations/cascaded_eager_loading_test.rb`

## Autosave (target: 80+ of 177 tests)

### Missing / incomplete

- `autosave: true` — save associated records when parent saves
- Marking nested records for destruction (`_destroy: true`)
- Validation propagation from children to parent
- `changed_for_autosave?`
- Autosave on `has_one`, `has_many`, `belongs_to`
- Rejecting blank nested records

### Key files

- Ruby reference: `autosave_association_test.rb`

## Nested Attributes (target: 60+ of 127 tests)

### Missing / incomplete

- `accepts_nested_attributes_for` declaration
- Creating nested records through parent
- Updating nested records
- Destroying nested records with `_destroy: true`
- `allow_destroy: true` option
- `reject_if:` proc/symbol for filtering
- `limit:` on number of nested records
- `update_only: true`
- Validation of nested records

### Key files

- `packages/activerecord/src/nested-attributes.ts`
- Ruby reference: `nested_attributes_test.rb`

## Inverse Associations (target: 30+ of 93 tests)

### Missing / incomplete

- Automatic inverse detection
- `inverse_of:` explicit declaration
- Bidirectional caching (parent ↔ child)
- Inverse with polymorphic associations
- Inverse with through associations

### Key files

- Ruby reference: `associations/inverse_associations_test.rb`
