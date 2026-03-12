# Phase 200: Relations, Core, Attributes

**Goal**: Fill out the query builder and base model infrastructure. These are
the highest-volume test areas and underpin everything else.

## Relations (168/604 → target 450+)

### Already working

- `where`, `order`, `limit`, `offset`, `select`, `distinct`
- `joins`, `leftJoins`, `group`, `having`
- `or`, `and`, `not`, `merge`
- `reorder`, `reverseOrder`, `rewhere`
- `pluck`, `count`, `exists?`
- Set operations (`union`, `intersect`, `except`)

### Missing / incomplete

- `where` with ranges, arrays, nil, subqueries — edge cases
- `where.not` with complex conditions
- `where.missing` / `where.associated`
- `includes` / `preload` / `eager_load` (query generation side)
- `references`
- `extending` with modules
- `structurally_compatible?` checks
- `in_order_of`
- `excluding` / `without`
- `annotate` (SQL comments)
- `optimizer_hints`
- Relation `inspect` and `to_a` caching
- `reload` clearing cached results
- `readonly` / `strict_loading` on relations

### Key files

- `packages/activerecord/src/relation.ts`
- Ruby reference: `relations_test.rb`, `relation/*.rb`

## Core / Base (158/1295 → target 500+)

This is a catch-all for many test files. Focus areas:

### Table name inference

- Pluralization, namespacing, `table_name_prefix`, `table_name_suffix`
- `self.table_name =` override

### Column / attribute introspection

- `column_names`, `columns_hash`, `attribute_names`
- `attribute_types`, `type_for_attribute`
- `has_attribute?`, `attribute_present?`

### Serialization

- `serializable_hash` with `:only`, `:except`, `:methods`, `:include`
- `as_json` / `to_json`

### Error classes

- `RecordNotFound` with model, primary_key, id
- `RecordInvalid`, `RecordNotSaved`, `RecordNotDestroyed`
- `SoleRecordExceeded`, `ReadOnlyRecord`

### Dirty tracking (ActiveRecord layer)

- `changed?`, `changes`, `previous_changes`
- `saved_changes`, `saved_change_to_attribute?`
- `will_save_change_to_attribute?`
- Integration with `reload`

### Key files

- `packages/activerecord/src/base.ts`
- Ruby reference: `base_test.rb`, `dirty_test.rb`, `attribute_methods_test.rb`,
  `serialization_test.rb`, `json_serialization_test.rb`

## Attributes (12/372 → target 150+)

### Missing / incomplete

- Custom attribute types (`attribute :field, :type`)
- Type casting and coercion
- `attribute_before_type_cast`
- Attribute aliases (`alias_attribute`)
- Attribute decorators / normalizations
- `composed_of` value objects

### Key files

- `packages/activerecord/src/base.ts`
- Ruby reference: `attribute_test.rb`, `attribute_methods_test.rb`,
  `attribute_registration_test.rb`
