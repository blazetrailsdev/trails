# QueryAttribute extends Attribute

## Problem

`QueryAttribute` should extend `ActiveModel::Attribute` (matching Rails' `ActiveRecord::Relation::QueryAttribute < ActiveModel::Attribute`) but currently doesn't. This forces duck-typing throughout the codebase — `BindMap`, `PartialQuery.sqlFor`, `buildCasted`, `extractNodeValue`, and `visitBindParam` all have separate checks for "objects that look like QueryAttribute" instead of using `instanceof Attribute`.

## Why it breaks (1600 test failures)

When `QueryAttribute extends Attribute` was attempted, 1600+ tests failed across associations, base operations, finders, and more. The failures fall into several categories:

### 1. `buildCasted` over-matching

`Attribute.buildCasted(value)` wraps bind-like objects in `BindParam`. The duck-type check uses `"valueForDatabase" in value && "name" in value`. When `QueryAttribute` extends `Attribute`, `valueForDatabase` becomes a **getter** (from the `Attribute` base class) instead of a method. The `"in"` operator detects getters, but `typeof getter === "function"` returns false. This inconsistency causes the check to either miss QueryAttributes (with `typeof` check) or over-match other objects (with `"in"` check).

### 2. `Casted(QueryAttribute, arelAttr)` double-wrapping

When `buildCasted` doesn't wrap QueryAttribute in BindParam, it falls through to `new Casted(queryAttribute, arelAttr)`. Then `Casted.valueForDatabase()` calls `arelAttr.typeCastForDatabase(queryAttribute)` — trying to type-cast a QueryAttribute object as a primitive value. This produces garbage values or errors.

### 3. `Attribute.equals()` constructor comparison

`Attribute.equals()` compares `this.constructor === other.constructor`. QueryAttribute instances from WHERE clause extraction (via `scopeForCreate`/`whereValuesHash`) are compared against `FromDatabase`/`FromUser` attribute instances in the model's attribute set. Different constructors → never equal → breaks dirty tracking and comparison.

### 4. `Attribute.valueForDatabase` getter vs method

The base `Attribute` class defines `valueForDatabase` as a getter. The standalone `QueryAttribute` defines it as a method. Code that checks `typeof obj.valueForDatabase === "function"` works for the standalone version but fails when inheriting the getter. All duck-type checks need updating.

### 5. `extractNodeValue` returns Attribute instead of primitive

`WhereClause.extractNodeValue` for `BindParam` nodes does `val.value` to unwrap. When `val` is a `QueryAttribute extends Attribute`, `val.value` correctly returns the cast value. But other paths that extract values from the WHERE clause may return the full `Attribute` object instead of the primitive — the consuming code (like `scopeForCreate`) expects primitives.

## Investigation needed

### Phase 1: Understand the failure categories

Run the failing tests and categorize:

- How many fail because of `buildCasted` over/under-matching?
- How many fail because of `Casted` double-wrapping?
- How many fail because of `equals()` constructor mismatch?
- How many fail because `valueForDatabase` is a getter not method?
- How many fail because `extractNodeValue` returns wrong type?

### Phase 2: Fix `Attribute.buildCasted`

The guard needs to reliably detect QueryAttribute without importing from activemodel (arel → activemodel dependency is forbidden). Options:

- Add a brand/symbol: `Symbol.for("activemodel.attribute")` on the Attribute prototype — arel checks for the symbol
- Check the prototype chain for a specific method signature
- Accept the arel → activemodel dependency (may be reasonable since Rails' Arel does know about ActiveModel::Attribute)

### Phase 3: Fix `Casted.valueForDatabase`

When `Casted` wraps a QueryAttribute, `valueForDatabase()` should delegate to the QueryAttribute's own `valueForDatabase` instead of trying to type-cast it through the Arel attribute's caster.

### Phase 4: Add visitor-level Attribute dispatch

Match Rails' `visit_ActiveModel_Attribute` — add a visitor method that handles Attribute instances directly, extracting `valueForDatabase` and adding as a bind. This removes the need for pre-wrapping in `BindParam` via `buildCasted`.

### Phase 5: Fix value extraction

Ensure `extractNodeValue`, `scopeForCreate`, and `whereValuesHash` always return primitives, not Attribute objects.

## Approach recommendation

The cleanest approach is Phase 4 — add explicit visitor dispatch for Attribute-like objects. This matches Rails most closely and avoids the `buildCasted` duck-typing problem entirely. The visitor dispatch in `visit(node)` should check if a value is an Attribute (via brand/symbol) and route to a dedicated `visitModelAttribute` handler that calls `addBind(attr)` in extract mode or `quote(attr.valueForDatabase)` in inline mode.

This sidesteps the `Casted` wrapping problem entirely — QueryAttribute never gets wrapped in `Casted`, it goes through its own visitor path.

## Files to change

- `packages/activemodel/src/attribute.ts` — add brand symbol on prototype
- `packages/arel/src/visitors/to-sql.ts` — add visitModelAttribute dispatch
- `packages/arel/src/visitors/postgresql.ts` — same for PG visitor
- `packages/arel/src/attributes/attribute.ts` — buildCasted checks brand, wraps in BindParam
- `packages/activerecord/src/relation/query-attribute.ts` — extend Attribute, inherit brand
- `packages/activerecord/src/statement-cache.ts` — remove duck-typing in BindMap/PartialQuery
- `packages/activerecord/src/relation/where-clause.ts` — update extractNodeValue
