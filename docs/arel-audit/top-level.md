# Top-level files

Source: `activerecord-8.0.2/lib/arel/*.rb` vs `packages/arel/src/*.ts`.

## alias_predication.rb → alias-predication.ts — **OK**

- Single method `as(other)`. Both wrap in `As` with a retryable `SqlLiteral`.
- TS widens the return type to `Node` (vs `As`) because Function/Table/SelectManager override `as` with self-mutating behavior. Documented in JSDoc.

## crud.rb → crud.ts — **DRIFT (intentional)**

- Rails `Crud` is a **module** mixed into `SelectManager`; methods reference `self.source/limit/offset/orders/constraints` from the host.
- TS exposes `Crud` as a bare interface only — the real `compileInsert/compileUpdate/compileDelete` live as instance methods on `SelectManager` (`select-manager.ts:511,522,532,559`). No mixin wiring.
- **GAP (cosmetic):** `api:compare` will not match `compile_insert`/`create_insert`/`compile_update`/`compile_delete` against `crud.rb` because they live in `select-manager.ts`. Either (a) re-home them as mixin methods in `crud.ts` to match Rails, or (b) add a `crud.rb` skip entry.

## delete_manager.rb → delete-manager.ts — **OK**

- Constructor takes optional table. Methods: `from`, `group`, `having`. All present.
- StatementMethods mixed in via `include(DeleteManager, StatementMethods)` (matches Rails' `include TreeManager::StatementMethods`).
- DRIFT: Rails `group(columns)` accepts `Symbol` and stringifies via `column.to_s`. TS only accepts `string | Node` (no symbol coercion). Minor — TS callers don't have ruby symbols, but `relation.ts` may pass them; verify.

## errors.rb → errors.ts — **EXTRA**

- Rails defines `ArelError`, `EmptyJoinError`, `BindError`. All present.
- TS additionally defines `UnsupportedVisitError`, `NotImplementedError`. Documented in `errors.ts` — `UnsupportedVisitError` replaces Rails' bare `TypeError("Cannot visit #{class}")` in the visitor dispatch.
- BindError uses `JSON.stringify(sql)` instead of Ruby `#inspect`. Recently fixed (#1110).

## expressions.rb → expressions.ts — **OK**

- All six methods present (`count`, `sum`, `maximum`, `minimum`, `average`, `extract`). Same wrapping (each takes `[self]`).

## factory_methods.rb → factory-methods.ts — **OK**

- All present: `createTrue`, `createFalse`, `createTableAlias`, `createJoin`, `createStringJoin`, `createAnd`, `createOn`, `grouping`, `lower`, `coalesce`, `cast`.
- `createStringJoin` accepts string-or-Node (Rails accepts only `to`, leaving the wrap responsibility to caller). Minor extra ergonomics — fine.

## filter_predications.rb → filter-predications.ts — **OK**

## insert_manager.rb → insert-manager.ts — **OK with one DRIFT**

- All present: `into`, `columns`, `values=`, `select`, `insert`, `createValues`, `createValuesList`.
- DRIFT: Rails `insert(fields)` uses `String === fields → SqlLiteral`. TS does the same; matches.
- DRIFT: TS `select(selectManager)` stores the manager itself (with `.ast` duck-type) rather than unwrapping. Documented in JSDoc — visitor handles both shapes.

## math.rb → math.ts — **DRIFT (naming)**

- Rails uses operator method names: `*`, `+`, `-`, `/`, `&`, `|`, `^`, `<<`, `>>`, `~@`. TS can't define those, so it uses `multiply`, `add`, `subtract`, `divide`, `bitwiseAnd`, `bitwiseOr`, `bitwiseXor`, `bitwiseShiftLeft`, `bitwiseShiftRight`, `bitwiseNot`. Necessary deviation.
- Wrapping behavior matches: `+`, `-`, bitwise binary all wrap in `Grouping`; `*`, `/` do not.
- **GAP:** `api:compare` cannot match these — needs entries in the rename/skip table for Math.

## order_predications.rb → order-predications.ts — **OK**

- `asc`, `desc` both present.

## predications.rb → predications.ts + predications-range.ts — **OK with EXTRAS**

- All public methods present: eq, notEq, gt/gteq/lt/lteq, isDistinctFrom/isNotDistinctFrom, between/notBetween, in/notIn, matches/doesNotMatch, matchesRegexp/doesNotMatchRegexp, all `*Any/*All` variants, `when`, `concat`, `contains`, `overlaps`, `quotedArray`.
- Private methods present: `groupingAny`, `groupingAll`, `isInfinity` (Rails `infinity?`), `isUnboundable` (Rails `unboundable?`), `isOpenEnded` (Rails `open_ended?`).
- Range parsing is split into `predications-range.ts` (RangeHost + parseRange + betweenFromRange/notBetweenFromRange). Rails inlines this in `between`/`not_between`. **EXTRA file** — necessary because TS lacks Ruby Range; matches Rails decision tree exactly.
- EXTRA methods: `isNull`, `isNotNull` — present in TS, not in Rails Predications. Likely from earlier work; consider whether they belong elsewhere or stay as TS-only ergonomics.
- DRIFT: `quotedNode` is a host-required method (PredicationHost), not a private method on the module. Rails has it private inside Predications.

## select_manager.rb → select-manager.ts — **OK with EXTRAS**

- Public methods all present: `from`, `project`, `projections`/`projections=`, `constraints`, `source`, `where`, `order`/`orders`, `take`/`limit=`, `skip`/`offset=`, `limit`/`offset`, `group`, `having`, `join`, `outerJoin`, `lock`, `locked`, `with`, `union`/`unionAll`, `intersect`, `except`/`minus`, `exists`, `as`, `joinSources`, `froms`, `on`, `optimizerHints`, `distinct`, `distinctOn`, `whereSql`, `lateral`, `comment`, `compileInsert`, `createInsert`, `compileUpdate`, `compileDelete`, `window`, `createJoin`.
- Private `collapse` present.
- EXTRA: `rightOuterJoin`, `fullOuterJoin`, `crossJoin`, `withRecursive`, `appendStringJoin`, `prependJoinNodes`, `appendJoinNode`, `joinSourceCount`. These are TS conveniences — Rails forces callers to construct join nodes directly. Worth flagging in api:compare so they don't show as "extra" noise.
- DRIFT: Rails `with(*subqueries)` accepts `Symbol → const_get("With#{cap}")` (e.g. `:recursive`). TS splits into separate `with` and `withRecursive` methods. Functionally complete but surface differs.
- DRIFT: Rails `lock(locking)` defaults to `Arel.sql("FOR UPDATE")` and accepts `true → FOR UPDATE`. TS skips the `true` case.
- DRIFT: Rails `exists` is a method; TS makes it a method too. Same.
- GAP: `STRING_OR_SYMBOL_CLASS` constant — TS handles strings and symbols inline in `order` but not in `project` (TS only accepts string|Node, not symbol). Verify if symbols are needed.

## table.rb → table.ts — **OK with EXTRAS**

- All present: `name`, `tableAlias`, `alias`, `from`, `join`, `outerJoin`, `group`, `order`, `where`, `project`, `take`, `skip`, `having`, `[]`/`get`, `hash`, `eql`/`==`, `typeCastForDatabase`, `typeForAttribute`, `ableToTypeCast` → `isAbleToTypeCast`, `engine`.
- EXTRA: `attr` (alias for `get`), `star`, `as`, `createJoin`. `as` is via FactoryMethods/AliasPredication mixin in Rails; TS implements directly to return TableAlias.
- DRIFT: TS makes Table extend Node — Rails' `Arel::Table` does **not** subclass Node. Needed in TS so `accept` works; documented at line 22.
- DRIFT: TS uses `_attributeAliases` (camelCased private) on `klass` instead of Rails `attribute_aliases`.
- DRIFT: `isAbleToTypeCast` (TS) vs `able_to_type_cast?` (Rails). Method-rename map.

## tree_manager.rb → tree-manager.ts — **OK**

- `ast` reader, `toDot`, `toSql`, `initialize_copy` (TS does not implement clone — verify).
- `StatementMethods` inner module: take, offset, order, key=/key, wheres=, where. All present in TS as a separate exported class.
- DRIFT: TS exports `StatementMethods` as a class with `this`-typed methods; Rails defines as inner module. Ruby's inner-module path `Arel::TreeManager::StatementMethods` vs TS sibling export — flagged by api:compare under tree_manager.rb's nested module path.
- GAP: `to_dot` uses `Visitors::Dot.new.accept`. TS does likewise. Match.
- GAP: `initialize_copy` (deep-clone hook) not implemented in TS. Rails clones `@ast`. Tests may not need this; keep on radar.

## update_manager.rb → update-manager.ts — **OK**

- Methods: `table`, `set`, `group`, `having` + StatementMethods (declared and mixed in).
- DRIFT: Rails `set(values)` accepts `String, Nodes::BoundSqlLiteral`. TS handles both plus `SqlLiteral`. Matches semantics.
- DRIFT: Rails `group` accepts `Symbol → to_s`. TS does not.

## window_predications.rb → window-predications.ts — **OK**

- `over(expr=null)`. TS additionally accepts string (wraps as SqlLiteral). Documented in JSDoc.
