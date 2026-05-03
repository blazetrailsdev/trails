# visitors/ — file-by-file audit

Source: `activerecord-8.0.2/lib/arel/visitors/*.rb` vs `packages/arel/src/visitors/*.ts`.

## visitor.rb → visitor.ts — **OK with DRIFT**

- Rails uses string-named methods `visit_Arel_Nodes_X` resolved by `klass.name.gsub("::","_")` and ancestor walk.
- TS uses camelCased methods `visitArelNodesX` and an explicit per-class `Map<NodeCtor, methodName>` cache populated at module load via `dispatchCache`. Same algorithm, JS-friendly key.
- Rails raises `TypeError("Cannot visit #{class}")`; TS throws `UnsupportedVisitError` (subclass of `ArelError`). Documented in `errors.ts`.
- Match: `accept(object, collector)` → `visit`, prototype-chain ancestor walk with cache memoization.

## to_sql.rb → to-sql.ts — **OK with EXTRAS**

- Rails has 93 `visit_Arel_Nodes_*` handlers; TS has all of them as `visitArelNodes*` plus several extras. After casing-normalized diff:
  - **Missing in TS:** none. (`visit_ActiveModel_Attribute`, `visit_Arel_Attributes_Attribute` exist in TS as `visitActiveModelAttribute`, `visitArelAttributesAttribute`.)
  - **EXTRAS in TS:** `visitArelNodesCube`, `visitArelNodesRollUp`, `visitArelNodesGroupingElement`, `visitArelNodesGroupingSet`, `visitArelNodesLateral`, `visitArelNodesConcat`, `visitCrossJoin`, `visitQuoted`, `visitTop`, plus helpers `visitBinaryOp`, `visitBindValue`, `visitNodeOrValue`. **DRIFT**: Cube/RollUp/GroupingSet/GroupingElement/Lateral live in `postgresql.rb` in Rails (Postgres-only), and `Concat` lives in `mysql.rb`. Trails surfaces a generic implementation in `to-sql.ts` so non-Postgres dialects don't error; this is a Trails ergonomics choice.
  - **EXTRA helpers**: `visitNodeOrValue` is the central dispatch primitive Trails uses to handle raw primitives (numbers/strings/booleans) flowing through `Binary#right` etc., where Rails relies on visiting raw Ruby objects via separate `visit_Integer`, `visit_String`, etc. methods.
- Coverage check: every Rails handler has a TS analog. Behavior matches per node (verified via `to-sql.test.ts` fixtures).
- DRIFT (deliberate): `injectJoin`, `groupingParentheses`, `infixValue`, `quote`, `quoteColumnName`, `quoteTableName`, `prepareUpdateStatement`, `prepareDeleteStatement`, `buildSubselect`, `hasGroupByAndHaving`, `hasJoinSources`, `hasLimitOrOffsetOrOrders` — all present, mirroring Rails private helpers.
- Quoter abstraction: TS introduces `default-quoter.ts` that wraps adapter quoting policy; Rails reaches through `connection.quote` directly. Trails-side because we don't carry a `connection` through ToSql at construction.

## sqlite.rb → sqlite.ts — **OK**

- Rails (4 method overrides + 1 helper): `visit_Arel_Nodes_Lock` (no-op), `visit_Arel_Nodes_SelectStatement` (force `LIMIT -1` when offset without limit), `visit_Arel_Nodes_True`/`False` (`1`/`0`), `visit_Arel_Nodes_IsNotDistinctFrom`/`IsDistinctFrom` (`IS`/`IS NOT`), `infix_value_with_paren` (suppress parens around UNION operands).
- TS has every override. ✓
- EXTRA: TS overrides `quote` to coerce booleans → `1`/`0`. Reasonable parity with Rails behavior (Rails handles this via type-cast rather than visitor override; both correct).

## postgresql.rb → postgresql.ts — **OK**

- Rails (8 overrides + 1 helper + 1 const): Matches/DoesNotMatch (LIKE/ILIKE + ESCAPE), Regexp/NotRegexp (`~` / `~*`, `!~` / `!~*`), DistinctOn, GroupingElement, Cube, RollUp, GroupingSet, Lateral, IsNotDistinctFrom/IsDistinctFrom, `BIND_BLOCK`, `bind_block`, `grouping_array_or_grouping_element`.
- All Postgres-specific handlers present in `postgresql.ts` (verified via `postgres.test.ts`).
- ✅ `BIND_BLOCK = $1, $2, ...` — covered. `postgresql.ts` implements numbered bind rendering (`PostgreSQLWithBinds` emits `$1`, `$2`, …) matching Rails' `BIND_BLOCK = proc { |i| "$#{i}" }`.

## mysql.rb → mysql.ts — **OK**

- Rails (10 overrides + 3 private helpers): Bin (`CAST AS BINARY`), UnqualifiedColumn (passthrough), SelectStatement (LIMIT 18446...615 when offset without limit), SelectCore (`||= "DUAL"`), Concat (`CONCAT(a, b)`), IsNotDistinctFrom/IsDistinctFrom (`<=>`/`NOT <=>`), Regexp/NotRegexp (`REGEXP`/`NOT REGEXP`), NullsFirst/NullsLast (emulated), Cte (`name AS (relation)`), `prepare_update_statement` / `prepare_delete_statement`, `build_subselect` (Distinct + AS "\_\_active_record_temp").
- TS has all of these (verified in earlier PRs around the quoting refactor).
- Recent fix (#1098): MySQL identifier quoting uses `mysqlDefaultQuoter` (backticks). Resolved.

## dot.rb → dot.ts — **OK with EXTRAS**

- Rails defines `Visitor < Arel::Visitors::Visitor` with `Node` / `Edge` structs and `visit_*` for every AST node, producing GraphViz dot output via PlainString collector.
- TS mirrors all node types and adds richer escaping (TS has explicit interfaces for Node/Edge plus type guards, so the file is roughly 2x Rails).
- `dot.test.ts` pins behavior via parity tests.

## index.ts — TS-only barrel — **EXTRA (cosmetic)**

## default-quoter.ts — **EXTRA**

- Trails-only abstraction over `connection.quote(value)` so ToSql can quote without holding a connection. Rails passes `connection` through `with_connection { |c| c.visitor.accept(...) }`. Trails takes the dependency at visitor construction time.

## dispatch-contamination.test.ts — **EXTRA test**

- Pins that subclass dispatch caches don't leak handlers between visitors (regression test for the per-class WeakMap cache design).
