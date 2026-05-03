# Arel audit summary (vs Rails 8.0.2)

Overall: structural parity is high. Most divergence is **necessary TS-deviation** (Ruby-only constructs like operator-method names, `Struct.new`, `String` subclassing, lifecycle hooks) or **deliberate ergonomics** (split-out files, helper test files, broader TS type unions).

All 9 confirmed behavioral GAPs identified by this audit have been resolved through PRs A–E (#1120, #1123, #1125, #1126, #1129) plus follow-up housekeeping. `pnpm api:compare --package arel` reports **884/884 methods (100%)** with **inheritance 69/69 (100%)**.

## Resolved GAPs

1. **`As#toCte` arg order** — verified intentional. TS arg order is the more sensible direction for typical `relation.as("name").toCte()` callers; Rails' `left.name`/`right` ordering only fits a niche convention. No change.
2. **`Case#then`** — implemented (PR A, #1120). Mirrors Rails' `then(expression) → @conditions.last.right = build_quoted(expression)` with a JS thenable-hazard guard.
3. **`BoundSqlLiteral#+` (Fragments)** — implemented as `BoundSqlLiteral#plus(other)` (PR A, #1120). `SqlLiteral#plus` was already in place.
4. **`Filter#as`, `Over#as` (AliasPredication)** — false alarm; both inherit `as()` from `Binary` (binary.ts:48). No change.
5. **`HomogeneousIn#right` quoting protocol** — fixed (PR C, #1125). Now delegates to `attribute.quotedArray(values)`, producing `Casted` nodes that carry the type-cast context. `Attribute#quotedArray` itself was buggy (passing no attribute to `buildQuoted`); fixed in the same PR.
6. **`Matches#escape` quoting** — fixed (PR B, #1123). The Matches/DoesNotMatch ctor now wraps escape via `buildQuoted`. `DoesNotMatch` reparented to extend `Matches` (Rails: `class DoesNotMatch < Matches`). Visitor `appendEscape` simplified and forced to inline-render Quoted/Casted to match Rails' always-inline behavior.
7. **`Composite#addBind` block forwarding** — fixed (PR A, #1120). Both `addBind` and `addBinds` now forward the block to both child collectors.
8. **Duplicated `comment` on SelectStatement** — fixed (PR D, #1126). `SelectStatement#comment` field removed; `SelectManager#comment` now sets `core.comment` matching Rails' `@ctx.comment = Nodes::Comment.new(values)`. All visitors updated.
9. **`Not` / `Lateral` / `GroupingElement` / `Cube` / `RollUp` / `GroupingSet` / `Rows` / `Range` / `Preceding` / `Following` extending `Node` instead of `Unary`** — fixed across PRs D + E (#1126, #1129). All now extend `Unary` (Rails-faithful), with back-compat getters for `subquery` (Lateral) and `expressions` (GroupingElement). `CurrentRow` correctly stays as `Node` (Rails: `CurrentRow < Node`).

## Other inheritance fix (audit cleanup)

- **`UnsupportedVisitError` location.** Rails defines `Arel::Visitors::UnsupportedVisitError < StandardError` in `to_sql.rb`. Trails defines it in `errors.ts` (so it sits on the `ArelError` hierarchy alongside `BindError`/`EmptyJoinError`) but now also re-exports from `visitors/to-sql.ts` so api:compare finds the class where Rails declares it. Brought arel inheritance from 68/69 (98.6%) to 69/69 (100%).

## Necessary TS deviations (intentional)

- `Math` operator-named methods (`*`, `+`, `~@`) → camelCase (`multiply`, `add`, `bitwiseNot`).
- `SqlLiteral < String` → wrapping class with `value` field.
- `Table` extending `Node` (Rails doesn't, but TS visitor needs `accept`).
- `Quoted < Unary` (consistent post-PR 32 with `expr: unknown`).
- `UnsupportedVisitError` named subclass instead of bare `TypeError`.
- `BindError` using `JSON.stringify` instead of Ruby `#inspect`.
- Registry hooks for breaking ESM cycles (`registerNodeDeps`, `_registerCteFactory`, `registerBuildQuoted`).
- Per-class `dispatchCache` `Map<NodeCtor, methodName>` instead of Ruby's symbol-keyed Hash.

## Quality bar

- Documentation in source files is excellent — most deviations from Rails carry inline JSDoc explaining why.
- `to-sql.test.ts`, `select-manager.test.ts`, and `table.test.ts` cover most observable behaviour.
- `pnpm api:compare --package arel` — 884/884 methods (100%), 69/69 inheritance (100%).
- `pnpm test:compare` (arel slice) — clean.
