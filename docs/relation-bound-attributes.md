# Relation boundAttributes + Substitute → BindParam Pipeline

## Problem

`StatementCache.create` works today with manual `BindMap` construction, but the full Rails flow — `where({name: params.bind()})` producing `BindParam(Substitute)` nodes in the Arel tree — isn't wired. This means `StatementCache.create` can't build a cached statement from a relation-building callback the way Rails does.

## Current State

- `StatementCache.create(connection, (params) => Model.where({name: params.bind()}))` — the `params.bind()` returns a `Substitute` instance
- `Substitute` reaches `PredicateBuilder` → `BasicObjectHandler` → `Attribute.eq(substitute)` → `buildCasted(substitute)` → `Casted(substitute, attr)`
- The `Casted` node treats Substitute as a regular value — `visitCasted` calls `valueForDatabase()` which delegates to the attribute caster and may type-cast/serialize/coerce the Substitute
- `BindMap` needs to find Substitute positions in the compiled binds array, but once a Substitute is wrapped in `Casted`, type casting can change the emitted bind value and the original Substitute identity is no longer reliably preserved
- `Relation` doesn't track `boundAttributes` — Rails' Relation collects bound attributes during WHERE clause construction so BindMap can index Substitute positions

## What Rails Does

1. `params.bind()` returns `StatementCache::Substitute`
2. `where({name: substitute})` → PredicateBuilder registers a handler for Substitute
3. The handler wraps the value as a `Relation::QueryAttribute` with the Substitute as its value
4. The QueryAttribute is stored in `relation.bound_attributes`
5. When `cacheableQuery` compiles the Arel tree, the bound_attributes array contains QueryAttribute objects with Substitute values
6. `BindMap` scans bound_attributes for Substitute-valued entries and records their positions
7. On `execute(values)`, `BindMap.bind(values)` calls `QueryAttribute#with_cast_value(value)` to replace Substitutes with real values

## Implementation Plan

### PR 1: PredicateBuilder Substitute Handler

**Files:**

- `packages/activerecord/src/relation/predicate-builder.ts`
  - Add a handler registration for `Substitute` class
  - When a Substitute value is encountered in `build()`, wrap in `BindParam(Substitute)` instead of routing through `BasicObjectHandler` → `Casted`
  - This produces `Equality(attr, BindParam(Substitute))` in the Arel tree

- `packages/arel/src/attributes/attribute.ts`
  - `buildCasted` already passes through `Node` instances — `BindParam` extends `Node`, so if the PredicateBuilder creates a `BindParam` before calling `eq()`, it'll pass through correctly

**Tests:** `Model.where({name: new Substitute()})` → verify Arel tree contains `BindParam(Substitute)`, not `Casted(Substitute, attr)`

### PR 2: Relation boundAttributes Tracking

**Files:**

- `packages/activerecord/src/relation.ts`
  - Add `_boundAttributes: unknown[]` array
  - During `where()` clause construction, collect `QueryAttribute` instances (or raw bind objects) into `_boundAttributes`
  - Expose via `get boundAttributes(): unknown[]`

- `packages/activerecord/src/relation/query-attribute.ts`
  - Already exists with `valueForDatabase()` and memoized casting
  - Verify `withCastValue(value)` works for BindMap rebinding

**Tests:** `Model.where({name: "foo"})` → `relation.boundAttributes` contains a QueryAttribute with value "foo"

### PR 3: Wire StatementCache.create Through Relation

**Files:**

- `packages/activerecord/src/statement-cache.ts`
  - `create()` calls `callable(new Params())` which returns a relation
  - Extract `relation.boundAttributes` for `BindMap` construction instead of relying on `cacheableQuery` binds
  - `BindMap` scans boundAttributes for Substitute-valued QueryAttributes
  - Update `BindMap` to recognize `QueryAttribute` (not just `Attribute` from activemodel) and call `QueryAttribute.withCastValue()` for rebinding

- `packages/activerecord/src/connection-adapters/abstract/database-statements.ts`
  - `cacheableQuery()` keeps its current signature — it compiles the Arel tree and returns `[queryBuilder, executionBinds]`
  - It does NOT return `relation.boundAttributes` — that's read directly by `StatementCache.create` from the relation object, which has access to both the relation and the connection

**Tests:** Full round-trip: `StatementCache.create(conn, (p) => Book.where({name: p.bind()}))` → `cache.execute(["Rails Guide"], conn)` → returns correct records

## Dependencies

- PR 1 depends on nothing (can start now)
- PR 2 depends on PR 1 (Substitute must produce BindParam for boundAttributes to be meaningful)
- PR 3 depends on PR 2

## Verification

After all 3 PRs:

- `StatementCache.create(connection, (params) => Model.where({name: params.bind()}))` works
- The Arel tree has `BindParam(Substitute)` nodes, not `Casted(Substitute)`
- `relation.boundAttributes` tracks QueryAttribute objects
- `BindMap` finds Substitute positions and rebinds with real values on execute
- Existing tests continue to pass
