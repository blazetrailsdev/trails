# cacheableQuery + PartialQueryCollector Compilation

## Problem

`cacheableQuery()` currently calls `toSqlAndBinds(arel)` which returns `[sql, binds, preparable, allowRetry]` (a 4-tuple, though callers typically destructure only the first two), then wraps the SQL string in a `PartialQuery([sql])`. This means the PartialQuery has no Substitute slots — it's just a single-element array containing the full SQL. The bind values exist in the binds array but aren't correlated with positions in the SQL template.

In Rails, the unprepared (non-prepared-statement) path compiles the Arel tree with a `PartialQueryCollector` that produces interleaved SQL fragments and Substitute placeholders. This allows `PartialQuery.sqlFor(binds, connection)` to splice quoted bind values into the exact positions where `?` placeholders would go.

## Current State

```
cacheableQuery(klass, arel):
  [sql, binds] = toSqlAndBinds(arel)    // binds is always [] because toSqlAndBinds
                                         // is called without `this` binding, so it
                                         // can't see arelVisitor and falls back to
                                         // node.toSql() which inlines all values
  return [klass.partialQuery([sql]), binds]  // PartialQuery(["SELECT ... WHERE name = 'foo'"])
```

Two problems: (1) `toSqlAndBinds` is called without `this` so it never extracts binds, and (2) even if it did, the PartialQuery receives the full SQL as one string with no Substitute slots. On `sqlFor(binds, connection)`, it has nothing to substitute.

This epic needs to fix both: bind `this` in `cacheableQuery` so the adapter's visitor is used, AND compile through `PartialQueryCollector` so Substitute slots are produced.

## What Rails Does

```ruby
def cacheable_query(klass, arel)
  if prepared_statements
    sql, binds = visitor.compile(arel.ast, collector)
    query = klass.query(sql)
  else
    collector = klass.partial_query_collector
    parts, binds = visitor.compile(arel.ast, collector)
    query = klass.partial_query(parts)
  end
  [query, binds]
end
```

Rails' unprepared path:

1. Creates a `PartialQueryCollector`
2. Compiles the Arel AST using this collector
3. The visitor's `visitBindParam`/`visitCasted` calls `collector.addBind(value)` which pushes a `Substitute` into the parts array and the value into the binds array
4. The result is `[parts_with_substitutes, bind_values]`
5. `PartialQuery(parts)` has Substitute slots at the exact positions where values should be interpolated
6. `PartialQuery.sqlFor(binds, connection)` quotes each bind value and splices it into the corresponding Substitute position

## Implementation Plan

### PR 1: Visitor Compilation with External Collector

**Files:**

- `packages/arel/src/visitors/to-sql.ts`
  - `compileWithCollector(node, collector)` — accept an external collector parameter instead of always creating a new `SQLString`
- `packages/activerecord/src/statement-cache.ts`
  - `PartialQueryCollector` lives here, not under `packages/arel`
  - Update `PartialQueryCollector.addBind` to accept the optional `block` argument (`addBind(value, block?)`) so it satisfies the same collector interface Arel visitors expect. Add `addBinds(..., block?)` too.
  - Update visitor behavior: when compiling with a `PartialQueryCollector`, `visitBindParam`/`visitCasted` must route values through `collector.addBind(...)` instead of appending quoted values directly. The current `_extractBinds` flag controls this — when an external collector is passed, set `_extractBinds = true` so bind values flow through `addBind`.
  - This is partially done — `compileWithCollector` exists but always creates a new `SQLString`, and the visitor inlines quoted values when `_extractBinds` is false.

- `packages/arel/src/visitors/postgresql.ts`
  - Same for `PostgreSQLWithBinds` — accept external collector, preserve numbered-bind behavior by honoring the optional `block` argument

**Tests:** Compile an AST with an interface-compatible `PartialQueryCollector`, verify parts array has interleaved strings + Substitutes, binds array has values, and PG numbered-bind visitors still work.

### PR 2: Wire cacheableQuery Through PartialQueryCollector

**Files:**

- `packages/activerecord/src/connection-adapters/abstract/database-statements.ts`
  - `cacheableQuery()`: when `preparedStatements` is false, create a `PartialQueryCollector`, compile the Arel AST through it, and return `PartialQuery(parts)` + binds
  - When `preparedStatements` is true, compile with `compileWithBinds` and return `Query(sql)` + binds (current behavior)
  - This requires the visitor to accept an external collector — depends on PR 1

- `packages/activerecord/src/statement-cache.ts`
  - `PartialQuery.sqlFor(binds, connection)` already handles Substitute slots correctly
  - Verify it works end-to-end with the collector-produced parts array

**Tests:** `cacheableQuery(StatementCache, arel)` with `preparedStatements = false` → returns `PartialQuery` with Substitute slots. `sqlFor([value], connection)` produces SQL with the value quoted and spliced in.

### PR 3: Integration Tests + Cleanup

**Files:**

- `packages/activerecord/src/statement-cache.test.ts`
  - End-to-end test: create a `StatementCache` with `preparedStatements = false`, execute with different values, verify interpolated SQL is correct
  - Test with `preparedStatements = true` — verify `Query` path with parameterized SQL

- Remove the local `quoteValue` fallback in `PartialQuery.sqlFor` if adapter quoting is now always available through the connection parameter

**Tests:** Round-trip with both prepared and unprepared paths on SQLite.

## Dependencies

- PR 1 is standalone (Arel-level change)
- PR 2 depends on PR 1
- PR 3 depends on PR 2
- This epic is independent of the boundAttributes epic but they complement each other — together they complete the StatementCache flow

## Verification

After all 3 PRs:

- `cacheableQuery` with `preparedStatements = false` produces a `PartialQuery` with real Substitute slots
- `PartialQuery.sqlFor(binds, connection)` correctly interpolates quoted values
- `cacheableQuery` with `preparedStatements = true` produces a `Query` with parameterized SQL
- `StatementCache.create → execute` works end-to-end on both paths
- No regression in existing tests
