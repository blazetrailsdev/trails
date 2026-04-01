# Arel: Road to 100%

Current state: **77.9%** API (268 / 344 methods). **99.4%** tests. All 62 files exist.

```bash
pnpm run api:compare -- --package arel
pnpm run api:compare -- --package arel --missing
```

---

## 26 fully matched files

select-manager, delete-manager, insert-manager, update-manager, visitors/to-sql, nodes (ascending, descending, comment, count, extract, fragments, infix-operation, matches, named-function, regexp, select-statement, unary, unary-operation), and more.

## 76 missing methods by category

**Node base methods (7)** — `nodes/node.ts` is at 0%. Missing `not`, `or`, `and`, `invert`, `toSql`, `fetchAttribute`, `isEquality`. These are on the Ruby `Node` base class but may live elsewhere in our TS hierarchy.

**Collector internals (12)** — `addBinds`, `preparable`, `retryable`, `constructor` across bind, composite, sql-string, substitute-binds, plain-string. These are visitor/collector plumbing methods.

**fetchAttribute (5)** — missing on grouping, nary, homogeneous-in, sql-literal, node. Ruby uses this for attribute extraction from AST nodes.

**invert / isEquality (7)** — missing on equality, in, binary, node. These are predicate node methods for query negation.

**Type casting (7)** — `typeCastForDatabase`, `typeForAttribute`, `isAbleToTypeCast` on table-alias, table, attributes/attribute. Ruby's type casting duck-typing interface.

**Tree manager (4)** — `toSql`, `take`, `offset`, `order` missing from tree-manager.ts. These are convenience methods that delegate to the AST.

**Window/ordering (5)** — `framing`, `rows`, `range` on window; `nullsFirst`, `nullsLast` on ordering.

**Other (29)** — scattered 1-2 per file across 20 files. Run `--missing` for the full list.

## Known gaps

- `predications.ts` is at 98% (40/41) — one method short of full coverage.
- `homogeneous-in.ts` at 55% — has internal fields (`left`, `right`, `castedValues`, `procForBinds`) that are public in Ruby but may be intentionally private in TS.
