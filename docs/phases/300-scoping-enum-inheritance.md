# Phase 300: Scoping, Enum, Inheritance, Store, Validations

**Goal**: Implement medium-complexity features that add significant Rails API
surface area.

## Scoping (28/233 → target 150+)

### Needed

- `default_scope` — applied automatically to all queries
- `unscoped` — removes default scope
- Named scopes (`scope :active, -> { where(active: true) }`)
- Scope chaining and composition
- `all` as a scope
- Scope with arguments (lambdas)
- Scoping blocks (`Model.where(...).scoping { ... }`)

### Key files

- Ruby reference: `scoping/default_scoping_test.rb`, `scoping/named_test.rb`,
  `scoping/relation_scoping_test.rb`

## Enum (10/97 → target 70+)

### Already working

- Basic enum definition
- Predicate methods (`status_active?`)
- Scope generation (`Model.active`)

### Missing / incomplete

- `enum` with `prefix:` / `suffix:` options
- `enum` with `_default:` option
- `enum` with custom values mapping
- `not_*` scopes
- Bang methods (`active!`)
- Enum validation (invalid values)
- `enum` with `_scopes: false` to skip scope generation

### Key files

- `packages/activerecord/src/enum.ts`
- Ruby reference: `enum_test.rb`

## Single Table Inheritance (8/73 → target 50+)

### Already working

- Basic STI with `type` column

### Missing / incomplete

- Custom inheritance column
- `find` returning correct subclass
- STI with scopes
- `becomes` / `becomes!`
- Abstract base classes
- `base_class` / `base_class?`

### Key files

- `packages/activerecord/src/sti.ts`
- Ruby reference: `inheritance_test.rb`

## Store (5/50 → target 35+)

### Already working

- Basic `store` accessors on JSON columns

### Missing / incomplete

- `store` with custom coder
- `store_accessor` with type casting
- Nested store accessors
- `stored_attributes` introspection
- Dirty tracking on store attributes

### Key files

- `packages/activerecord/src/store.ts`
- Ruby reference: `store_test.rb`

## Validations (2/97 → target 60+)

### Missing / incomplete

- `validates_uniqueness_of` (with adapter support)
- `validates_presence_of` / `validates_absence_of`
- `validates_associated`
- `validates_length_of`, `validates_numericality_of`
- Conditional validations (`:if`, `:unless`, `:on`)
- Custom validators
- Validation contexts (`:create`, `:update`)
- `valid?` / `invalid?` / `validate!`

### Key files

- Ruby reference: `validations/*.rb`
