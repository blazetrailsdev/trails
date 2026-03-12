# Phase 700: Associations — has_many, has_many :through

**Goal**: Implement the most common association types used in Rails apps.

## has_many (target: 150+ of 312 tests)

### Already working

- Basic `hasMany` declaration
- Loading children from DB
- Foreign key inference

### Missing / incomplete

- `CollectionProxy` methods: `<<`, `push`, `delete`, `destroy`, `clear`
- `build` / `create` / `create!` on collection
- `size` / `length` / `count` / `empty?` / `any?` / `many?`
- `first` / `last` / `second` etc. on collection
- `where` / `order` / `limit` scoping on collection
- `pluck` / `ids` on collection
- `include?` membership check
- `find` on collection (scoped to association)
- `dependent: :destroy` / `:delete_all` / `:nullify` / `:restrict_with_error`
- `counter_cache` integration
- `inverse_of:` for bidirectional caching
- `autosave: true`
- `before_add` / `after_add` / `before_remove` / `after_remove` callbacks
- `extend` with modules
- Scope blocks on association definition
- `strict_loading:`

## has_many :through (target: 50+ of 165 tests)

### Missing / incomplete

- Basic `has_many :through` with join model
- Building through the association
- Destroying through records
- `source:` and `source_type:` for polymorphic through
- Nested through associations (has_many through a has_many through)
- Scoping and conditions on through associations
- `distinct` on through associations
- Counter cache through

## has_and_belongs_to_many (target: 30+ of 92 tests)

### Missing / incomplete

- Join table without model
- `<<` / `delete` / `clear` on collection
- Finding through HABTM
- Custom join table name

### Key files

- `packages/activerecord/src/associations.ts`
- Ruby reference: `associations/has_many_associations_test.rb`,
  `associations/has_many_through_associations_test.rb`,
  `associations/has_and_belongs_to_many_associations_test.rb`
