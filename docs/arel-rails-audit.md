# Arel Rails Alignment Audit — Rails v8.0.2 vs. Trails `@blazetrails/arel`

Generated: 2026-05-01. Rails source: `.rails-source/activerecord/lib/arel/`. TS source: `packages/arel/src/`.

---

## Summary Table

| Rails file                       | TS file                                                           | Status        |
| -------------------------------- | ----------------------------------------------------------------- | ------------- |
| `alias_predication.rb`           | `alias-predication.ts`                                            | ✅ aligned    |
| `attributes/attribute.rb`        | `attributes/attribute.ts`                                         | ⚠️ deviations |
| `collectors/bind.rb`             | `collectors/bind.ts`                                              | ✅ aligned    |
| `collectors/composite.rb`        | `collectors/composite.ts`                                         | ⚠️ deviations |
| `collectors/plain_string.rb`     | `collectors/plain-string.ts`                                      | ✅ aligned    |
| `collectors/sql_string.rb`       | `collectors/sql-string.ts`                                        | ✅ aligned    |
| `collectors/substitute_binds.rb` | `collectors/substitute-binds.ts` + `substitute-bind-collector.ts` | ⚠️ deviations |
| `crud.rb`                        | `crud.ts`                                                         | ✅ aligned    |
| `delete_manager.rb`              | `delete-manager.ts` (via `select-manager.ts`)                     | ✅ aligned    |
| `errors.rb`                      | `errors.ts`                                                       | ⚠️ deviations |
| `expressions.rb`                 | `expressions.ts`                                                  | ✅ aligned    |
| `factory_methods.rb`             | `factory-methods.ts`                                              | ✅ aligned    |
| `filter_predications.rb`         | `filter-predications.ts`                                          | ✅ aligned    |
| `insert_manager.rb`              | `insert-manager.ts` (via `select-manager.ts`)                     | ✅ aligned    |
| `math.rb`                        | `math.ts`                                                         | ✅ aligned    |
| `nodes/ascending.rb`             | `nodes/ascending.ts`                                              | ✅ aligned    |
| `nodes/binary.rb`                | `nodes/binary.ts`                                                 | ⚠️ deviations |
| `nodes/bind_param.rb`            | `nodes/bind-param.ts`                                             | ⚠️ deviations |
| `nodes/bound_sql_literal.rb`     | `nodes/bound-sql-literal.ts`                                      | ⚠️ deviations |
| `nodes/case.rb`                  | `nodes/case.ts`                                                   | ✅ aligned    |
| `nodes/casted.rb`                | `nodes/casted.ts`                                                 | ⚠️ deviations |
| `nodes/comment.rb`               | `nodes/comment.ts`                                                | ✅ aligned    |
| `nodes/count.rb`                 | `nodes/count.ts`                                                  | ✅ aligned    |
| `nodes/cte.rb`                   | `nodes/cte.ts`                                                    | ⚠️ deviations |
| `nodes/delete_statement.rb`      | `nodes/delete-statement.ts`                                       | ✅ aligned    |
| `nodes/descending.rb`            | `nodes/descending.ts`                                             | ✅ aligned    |
| `nodes/equality.rb`              | `nodes/equality.ts`                                               | ✅ aligned    |
| `nodes/extract.rb`               | `nodes/extract.ts`                                                | ⚠️ deviations |
| `nodes/false.rb`                 | `nodes/false.ts`                                                  | ✅ aligned    |
| `nodes/filter.rb`                | `nodes/filter.ts`                                                 | ✅ aligned    |
| `nodes/fragments.rb`             | `nodes/fragments.ts`                                              | ✅ aligned    |
| `nodes/full_outer_join.rb`       | `nodes/full-outer-join.ts`                                        | ✅ aligned    |
| `nodes/function.rb`              | `nodes/function.ts`                                               | ⚠️ deviations |
| `nodes/grouping.rb`              | `nodes/grouping.ts`                                               | ✅ aligned    |
| `nodes/homogeneous_in.rb`        | `nodes/homogeneous-in.ts`                                         | ⚠️ deviations |
| `nodes/infix_operation.rb`       | `nodes/infix-operation.ts`                                        | ✅ aligned    |
| `nodes/inner_join.rb`            | `nodes/inner-join.ts`                                             | ✅ aligned    |
| `nodes/in.rb`                    | `nodes/in.ts`                                                     | ✅ aligned    |
| `nodes/insert_statement.rb`      | `nodes/insert-statement.ts`                                       | ✅ aligned    |
| `nodes/join_source.rb`           | `nodes/join-source.ts`                                            | ✅ aligned    |
| `nodes/leading_join.rb`          | `nodes/leading-join.ts`                                           | ✅ aligned    |
| `nodes/matches.rb`               | `nodes/matches.ts`                                                | ✅ aligned    |
| `nodes/named_function.rb`        | `nodes/named-function.ts`                                         | ⚠️ deviations |
| `nodes/nary.rb`                  | `nodes/nary.ts`                                                   | ✅ aligned    |
| `nodes/node.rb`                  | `nodes/node.ts`                                                   | ⚠️ deviations |
| `nodes/node_expression.rb`       | _(inlined into NodeExpression base)_                              | ⚠️ deviations |
| `nodes/ordering.rb`              | `nodes/ordering.ts`                                               | ✅ aligned    |
| `nodes/outer_join.rb`            | `nodes/outer-join.ts`                                             | ✅ aligned    |
| `nodes/over.rb`                  | `nodes/over.ts`                                                   | ✅ aligned    |
| `nodes/regexp.rb`                | `nodes/regexp.ts`                                                 | ✅ aligned    |
| `nodes/right_outer_join.rb`      | `nodes/right-outer-join.ts`                                       | ✅ aligned    |
| `nodes/select_core.rb`           | `nodes/select-core.ts`                                            | ⚠️ deviations |
| `nodes/select_statement.rb`      | `nodes/select-statement.ts`                                       | ✅ aligned    |
| `nodes/sql_literal.rb`           | `nodes/sql-literal.ts`                                            | ⚠️ deviations |
| `nodes/string_join.rb`           | `nodes/string-join.ts`                                            | ✅ aligned    |
| `nodes/table_alias.rb`           | `nodes/table-alias.ts`                                            | ⚠️ deviations |
| `nodes/terminal.rb`              | `nodes/terminal.ts`                                               | ✅ aligned    |
| `nodes/true.rb`                  | `nodes/true.ts`                                                   | ✅ aligned    |
| `nodes/unary.rb`                 | `nodes/unary.ts`                                                  | ✅ aligned    |
| `nodes/unary_operation.rb`       | `nodes/unary-operation.ts`                                        | ✅ aligned    |
| `nodes/unqualified_column.rb`    | `nodes/unqualified-column.ts`                                     | ✅ aligned    |
| `nodes/update_statement.rb`      | `nodes/update-statement.ts`                                       | ✅ aligned    |
| `nodes/values_list.rb`           | `nodes/values-list.ts`                                            | ⚠️ deviations |
| `nodes/window.rb`                | `nodes/window.ts`                                                 | ✅ aligned    |
| `nodes/with.rb`                  | `nodes/with.ts`                                                   | ⚠️ deviations |
| `order_predications.rb`          | `order-predications.ts`                                           | ✅ aligned    |
| `predications.rb`                | `predications.ts`                                                 | ⚠️ deviations |
| `select_manager.rb`              | `select-manager.ts`                                               | ⚠️ deviations |
| `table.rb`                       | `table.ts` (in `select-manager.ts`)                               | ⚠️ deviations |
| `tree_manager.rb`                | `tree-manager.ts`                                                 | ⚠️ deviations |
| `update_manager.rb`              | `update-manager.ts` (in `select-manager.ts`)                      | ✅ aligned    |
| `visitors/dot.rb`                | `visitors/dot.ts`                                                 | ⚠️ deviations |
| `visitors/mysql.rb`              | `visitors/mysql.ts`                                               | ✅ aligned    |
| `visitors/postgresql.rb`         | `visitors/postgresql.ts`                                          | ✅ aligned    |
| `visitors/sqlite.rb`             | `visitors/sqlite.ts`                                              | ✅ aligned    |
| `visitors/to_sql.rb`             | `visitors/to-sql.ts`                                              | ⚠️ deviations |
| `visitors/visitor.rb`            | `visitors/visitor.ts`                                             | ✅ aligned    |
| `window_predications.rb`         | `window-predications.ts`                                          | ✅ aligned    |

---

## Per-File Findings

### `visitors/to_sql.rb` → `visitors/to-sql.ts`

#### Behavioral

**B1 — `visit_Arel_Nodes_Fragments`: space-separated vs. no-separator output**

- Rails (line 864): `inject_join o.values, collector, " "` — fragments are joined with a single space between them.
- TS (`to-sql.ts:1093`): iterates and visits each part with no separator: `for (const part of node.values) this.visit(part)`.
- Impact: any query using `Fragments` (e.g. `BoundSqlLiteral` `+` chains) will produce missing spaces between the joined parts.

**B2 — `visit_Arel_Nodes_Intersect` / `visit_Arel_Nodes_Except`: different wrapping algorithm**

- Rails (lines 216–224): uses `infix_value` (simple left-op-right, no recursion) wrapped in a hard `collector << "( "` / `<< " )"`. Result for chained: `( ( a INTERSECT b ) INTERSECT c )`.
- TS (`to-sql.ts:1131,1135`): uses `infixValueWithParen` (recursive, flattens same-class children). Result for chained: `( a INTERSECT b INTERSECT c )`.
- For single-level usage the output is identical. For nested `Intersect(Intersect(a,b),c)` the SQL differs. Since Rails never nests Intersect (SelectManager builds a flat tree), this is low risk in practice but is a fidelity gap.

**B3 — `visit_Arel_Nodes_SelectStatement`: comment handled inline, not via `visit_Arel_Nodes_SelectOptions`**

- Rails delegates limit/offset/lock emission to `visit_Arel_Nodes_SelectOptions` (line 138) and does NOT emit comment there — comment is on `SelectCore` only.
- TS `visitArelNodesSelectStatement` (line 283) additionally calls `this.maybeVisit(node.comment ?? null)` after lock. Rails `SelectStatement` has no `comment` attribute — that lives on `SelectCore`. The TS `SelectStatement` node does not expose a `comment` field, so this `maybeVisit` always short-circuits, making it harmless but non-Rails.

**B4 — `visit_Arel_Nodes_HomogeneousIn`: `collector.preparable = false` missing in TS**

- Rails (line 337): `collector.preparable = false` before visiting.
- TS (`to-sql.ts:706`): does not set `preparable = false`. This means queries using `HomogeneousIn` could be incorrectly marked as preparable.

**B5 — `visit_Arel_Nodes_OptimizerHints`: leading space included in node visitor vs. via `collect_optimizer_hints`**

- Rails (line 170): `visit_Arel_Nodes_OptimizerHints` emits `"/*+ #{hints} */"` with no leading space. `collect_optimizer_hints` calls `maybe_visit` which adds the leading space.
- TS (`to-sql.ts:1269`): `visitArelNodesOptimizerHints` emits ` /*+ ... */` with a leading space baked in. `collectOptimizerHints` does NOT call `maybeVisit`.
- Net output is identical for the normal path (SELECT … SELECT hints). However, if `visitArelNodesOptimizerHints` is ever called directly (e.g. from a subclass overriding `collectOptimizerHints`), the leading-space behavior diverges.

**B6 — `visit_Arel_Nodes_Assignment`: Rails type-checks RHS, TS does not**

- Rails (lines 631–639): branches on `Arel::Nodes::Node | Arel::Attributes::Attribute | ActiveModel::Attribute` to decide `visit` vs `quote(o.right)`. Otherwise falls back to `quote`.
- TS (`to-sql.ts:736`): always calls `visitNodeOrValue` for both sides, which already handles the Node vs. primitive split. Functionally equivalent because `visitNodeOrValue` routes primitives through `quote`. No practical difference.

#### Cosmetic

**C1 — `visit_Arel_Nodes_SelectCore`: `source.empty?` check logic**

- Rails (line 157): `if o.source && !o.source.empty?` — calls `JoinSource#empty?`.
- TS (line 339): `if (node.source.left)` — checks only `left` directly. Skips the Rails `empty?` contract (`!left && right.empty?`). Same semantic for normal use (right without left is always an error), but subtly different for contrived nodes.

---

### `nodes/function.rb` → `nodes/function.ts`

#### Behavioral

**B1 — `Exists` is NOT a `Function` subclass in TS**

- Rails (function.rb:47): `const_set("Exists", Class.new(Function))` — `Exists` extends `Function` and has `expressions` (array), `alias`, `distinct`.
- TS (`nodes/function.ts:30`): `Exists` extends bare `Node` with `expressions: Node` (single, not array) and `alias: Node | null`. No `distinct`.
- Impact: `instanceof Function` checks on `Exists` will return false in TS. The visitor (`visitArelNodesExists`) hard-codes single-expression logic; if Exists ever needs to aggregate over multiple expressions it won't work.

**B2 — `Function.alias` setter wraps in SqlLiteral in Rails; TS uses Node directly**

- Rails (function.rb:25): `self.alias = SqlLiteral.new(aliaz)` — always a SqlLiteral.
- TS: `alias` is typed `Node | null` and the constructor passes it directly. No SqlLiteral wrapping. When `as(aliaz)` is called in Rails it also wraps; TS `Function` does not override `as` and the base `AliasPredication` sets the `alias` slot directly.

#### Cosmetic

**C1 — `distinct` default**

- Rails sets `@distinct = false` explicitly; TS constructor default parameter is `false`. Equivalent.

---

### `nodes/extract.rb` → `nodes/extract.ts`

#### Structural

**S1 — `expr` storage differs**

- Rails: `Extract < Unary` — stores `expr` as the first Unary slot. Constructor: `initialize(expr, field)` where `expr` is `[self]` (an array wrapping the node) when called from `Expressions#extract`.
- TS: `Extract` extends `Unary` but constructor is `(expr: Node | Node[], field: string)`. The `expr` may be an array or a single Node.
- Rails `Dot` visitor (dot.rb:109) visits edge `"expressions"` and `"alias"` — treating it like a Function. TS Dot visitor visits `"expr"` and `"field"` — matching the actual TS shape.
- Rails `ToSql#visit_Arel_Nodes_Extract` (to_sql.rb:401): `o.expressions` is the array wrapping the expression; `visit(o.expr, collector)` visits the array/single. TS `visitArelNodesExtract` branches on `Array.isArray(node.expr)` to handle both shapes.
- For normal use the SQL output is identical, but the internal shape (`expr` vs `expressions`) will cause `eql?` mismatches if you compare a Rails-shaped node to a TS one.

---

### `nodes/cte.rb` → `nodes/cte.ts`

#### Behavioral

**B1 — `materialized` type differs**

- Rails: `materialized:` keyword arg is a tristate (`nil` / `true` / `false`). The visitor (to_sql.rb:736) branches on `true` / `false`.
- TS: `materialized` is `"materialized" | "not_materialized" | undefined`. The TS visitor checks for the string values. The values are semantically equivalent but the types are incompatible with any cross-boundary code.

**B2 — `Cte.toCte()` delegates to self vs. constructing**

- Rails `Binary#As#to_cte` (binary.rb:37): `Arel::Nodes::Cte.new(left.name, right)`.
- TS `Cte#toCte()`: returns `this`.
- Identical semantics for `Cte` nodes (returns self), but the Rails implementation on `As` creates a new `Cte` from the As pair.

---

### `nodes/with.rb` → `nodes/with.ts`

#### Structural

**S1 — `With` extends `Unary` in Rails but stores children as `expr`**

- Rails: `With < Unary`; `alias children expr`. The single slot is the array.
- TS (`with.ts:8`): `With` extends `Unary` but stores `children: Node[]` as a separate property (calling `super(null)`). The `expr` slot (from `Unary`) is always null.
- Impact: `eql?` (hash-based equality via `Unary`) would behave differently. The TS `With` does not delegate `eql?` through `expr`, so two `With` instances with the same children but constructed independently would not be `eql?` via the `Unary` path.

---

### `nodes/values_list.rb` → `nodes/values-list.ts`

#### Structural

**S1 — `ValuesList` stores `rows` as separate property vs. `expr` alias**

- Rails: `ValuesList < Unary; alias :rows :expr`. The rows array _is_ `expr`.
- TS: calls `super(null)` and stores `rows: unknown[][]` separately. `expr` is always null.
- Same practical concern as `With` above regarding `Unary#eql?`.

---

### `nodes/binary.rb` → `nodes/binary.ts`

#### Behavioral

**B1 — `As#to_cte` uses a registry indirection in TS**

- Rails (binary.rb:37): `Cte.new(left.name, right)` — direct construction.
- TS (`binary.ts:83`): calls a registered factory (`_registerCteFactory`) because of circular import constraints. The semantics are identical at runtime; the registry must be populated before `to_cte()` is called (done by the index module). Direct deep-imports that skip `index.ts` will throw.

**B2 — `NotEqual.invert()` uses a registry in TS for the same circular-import reason**

- Rails (binary.rb:97): `Equality.new(left, right)` — direct.
- TS (`binary.ts:105`): registry-mediated. Same caveat as above.

**B3 — `FetchAttribute` mixin: Rails uses `include` on individual classes; TS uses a standalone function**

- Rails: `Between`, `GreaterThan`, `GreaterThanOrEqual`, `LessThan`, `LessThanOrEqual`, `IsDistinctFrom`, `IsNotDistinctFrom`, `NotEqual`, `NotIn`, `Equality` (equality.rb), `In` (in.rb) all `include FetchAttribute`.
- TS: `fetchAttributeFromBinary` is a standalone function; classes that need it call it directly. The surface is equivalent.

**B4 — `Join` classes defined via `const_set` in Rails vs. explicit class declarations in TS**

- Rails (binary.rb:118–124): `%w{Assignment Join Union UnionAll Intersect Except}.each { |name| const_set name, Class.new(Binary) }`. All are plain Binary subclasses.
- TS: `Join` is abstract; `Union`, `UnionAll`, `Intersect`, `Except` are concrete with typed constructors enforcing `left: Node, right: Node`. `Assignment` is a plain subclass. No behavioral difference for normal use.

---

### `nodes/bind_param.rb` → `nodes/bind-param.ts`

#### Behavioral

**B1 — `value_before_type_cast` missing in TS**

- Rails (bind_param.rb:26): delegates to `value.value_before_type_cast` if the value responds to it, else returns `value`.
- TS (`bind-param.ts`): no `valueBeforeTypeCast` method. Needed if ActiveRecord's attribute inspection infrastructure reads `value_before_type_cast` on bind params.

**B2 — `infinite?` missing in TS**

- Rails (bind_param.rb:34): `value.respond_to?(:infinite?) && value.infinite?`.
- TS: not present. Used during range predication edge-case handling.

**B3 — `unboundable?` missing in TS**

- Rails (bind_param.rb:38): `value.respond_to?(:unboundable?) && value.unboundable?`.
- TS: not present. Used by `visit_Arel_Nodes_GreaterThan` etc. to short-circuit to `1=0` / `1=1`.

---

### `nodes/bound_sql_literal.rb` → `nodes/bound-sql-literal.ts`

#### Behavioral

**B1 — Validation of `named_binds` is stricter in Rails**

- Rails (bound_sql_literal.rb:20–34): validates that every `:token` appearing in the SQL string has a corresponding key in `named_binds`; raises `BindError` listing all missing keys at construction time.
- TS (`bound-sql-literal.ts`): validation is deferred to visitor time (raises per missing key during iteration). Construction does not pre-validate.

**B2 — `+` operator: Rails allows any `arel_node?`, TS expects a `Node` instance**

- Rails (bound_sql_literal.rb:50): `raise ArgumentError unless Arel.arel_node?(other)`.
- TS: typed as `Node`; no runtime `arel_node?` duck-type check.

---

### `nodes/casted.rb` → `nodes/casted.ts`

#### Behavioral

**B1 — `Quoted` inherits from `Unary` in Rails; extends plain `Node` in TS**

- Rails (casted.rb:39): `class Quoted < Arel::Nodes::Unary`.
- TS (`casted.ts:93`): `class Quoted extends Node`.
- Impact: in Rails, `Quoted` inherits `eql?` from `Unary` (compares `expr`); in TS, `Quoted` uses `Node#eql?` (compares by constructor). The `Unary#eql?` logic is: `self.class == other.class && self.expr == other.expr`, which is semantically what TS `Quoted` implements manually via its own `eql?` check. Structurally different inheritance, behaviorally close.
- `Quoted` in Rails inherits `Unary`'s `hash` (based on `expr`). TS `Quoted` overrides `eql?` correctly but may not implement `hash` at all (JS has no first-class `hash`).

**B2 — `build_quoted` does not recognize `ActiveModel::Attribute` in TS**

- Rails (casted.rb:55): `case other when ... ActiveModel::Attribute => other` — passes through unchanged.
- TS (`casted.ts:26`): passes through `Node` instances; `ActiveModel::Attribute` from `@blazetrails/activemodel` is handled in `Attribute#quotedNode` but not in the standalone `buildQuoted`. Code paths that call `buildQuoted` directly (e.g. in `FactoryMethods`, `Predications`) will wrap an `ActiveModel::Attribute` instance in `Quoted` instead of passing it through, which changes visitor behavior (renders as a quoted literal vs. a bind param).

---

### `nodes/homogeneous_in.rb` → `nodes/homogeneous-in.ts`

#### Behavioral

**B1 — `casted_values` / `proc_for_binds` are stubs in TS**

- Rails (homogeneous_in.rb:53–65): `casted_values` type-casts values using the attribute's type caster; `proc_for_binds` creates ActiveModel attributes.
- TS (`homogeneous-in.ts:40`): `get castedValues` returns `this.values` unchanged. `get procForBinds` returns identity function. These are used by `visit_Arel_Nodes_HomogeneousIn` (Rails) to add binds via `collector.add_binds`; since TS's visitor inlines the values without casting, these are currently not wired into the visitor.

**B2 — `right` getter calls `attribute.quoted_array(values)` in Rails; TS uses direct `buildQuoted`**

- Rails (homogeneous_in.rb:47): `attribute.quoted_array(values)` — calls the column-aware `quoted_array` method.
- TS: builds an array of `Quoted` nodes via `buildQuoted`. No column-type-aware casting.

---

### `nodes/named_function.rb` → `nodes/named-function.ts`

#### Structural

**S1 — Constructor parameter order differs from Rails `Function`**

- Rails `Function#initialize(expr, aliaz = nil)` → `NamedFunction#initialize(name, expr, aliaz = nil)`.
- TS `NamedFunction(name, expressions, aliasName?, distinct = false)`: adds a `distinct` parameter not present in Rails. The `distinct` property is inherited from `Function` in Rails (set explicitly); TS moves it into the constructor for ergonomics. Behaviorally equivalent.

---

### `nodes/node.rb` → `nodes/node.ts`

#### Behavioral

**B1 — `to_sql(engine)` requires engine in Rails; TS `toSql()` uses a registry**

- Rails (node.rb:141): `def to_sql(engine = Table.engine)` — requires a connection/visitor.
- TS (`node.ts`): `toSql()` uses the registered visitor from `setToSqlVisitor`. Different call shape; functionally equivalent when the registry is populated.

**B2 — `equality?` method missing in TS `Node` base**

- Rails (node.rb:149): `def equality?; false; end` — default implementation on every Node.
- TS: `equality?` / `isEquality()` is only on `Equality` and `In`. The base `Node` does not have `isEquality(): boolean = false`. Any code iterating nodes and calling `equality?` would throw on non-equality nodes.

**B3 — `fetch_attribute` default implementation missing on base Node**

- Rails (node.rb:147): `def fetch_attribute(&); end` — empty no-op on every node.
- TS: only present on specific nodes (`Binary`, `Nary`, `HomogeneousIn`). The base `Node` class does not have a no-op `fetchAttribute`. Code that polymorphically calls `fetchAttribute` on any node will throw on nodes that don't define it.

---

### `nodes/node_expression.rb` → TS

#### Structural

**S1 — `NodeExpression` mixin set differs between Rails and TS**

- Rails (node_expression.rb): `NodeExpression` includes `Expressions`, `Predications`, `AliasPredication`, `OrderPredications`, `Math`.
- TS: `NodeExpression` is a class (in `nodes/unary.ts` or similar) that is extended; the mixins are applied via `include()` from activesupport in the top-level `index.ts`. The composition happens at startup rather than via inheritance. Structurally different but functionally equivalent when `index.ts` is imported.

---

### `nodes/select_core.rb` → `nodes/select-core.ts`

#### Behavioral

**B1 — `froms` / `froms=` aliases missing in TS**

- Rails (select_core.rb:46): `alias :froms= :from=` and `alias :froms :from`. Both names work.
- TS (`nodes/select-core.ts`): only `get from` / `set from`. No `froms` or `froms=`. Code that accesses `core.froms` (e.g. `build_subselect` in to_sql.rb:948: `core.froms = o.relation`) must use `from` in TS.
- The TS `buildSubselect` (to-sql.ts:499) already uses `core.source = new JoinSource(o.relation)` rather than `core.froms =`. The TS `Dot` visitor's `visit_Arel_Nodes_SelectCore` visits edge `"source"` rather than `"froms"`. All current callers in TS use the correct form; but external consumers coming from Rails idioms that write `core.froms = x` will silently fail (no setter named `froms`).

---

### `nodes/sql_literal.rb` → `nodes/sql-literal.ts`

#### Structural

**S1 — `SqlLiteral` extends `String` in Rails; extends `Node` in TS**

- Rails (sql_literal.rb:4): `class SqlLiteral < String` — it IS a String, so it can be used anywhere a string is expected.
- TS (`sql-literal.ts`): extends `Node`, with a `value: string` property and a `toString()` method.
- Impact: in Rails, `SqlLiteral` passes `===` / `is_a?(String)` checks. In TS, `typeof instance === "string"` is false. Code paths that test `String === o` (e.g. `SelectManager#from`, `SelectManager#order`) handle `SqlLiteral` separately.

**S2 — `encode_with` (YAML serialization) missing in TS**

- Rails (sql_literal.rb:22): `def encode_with(coder)`. Not applicable in TS; intentional omission.

**S3 — `+` operator missing on SqlLiteral in TS**

- Rails (sql_literal.rb:28): `def +(other)` creates a `Fragments` node.
- TS `SqlLiteral`: no `+` operator. The `BoundSqlLiteral#+` and `Fragments#+` equivalents exist, but `SqlLiteral` itself lacks it.

---

### `nodes/table_alias.rb` → `nodes/table-alias.ts`

#### Behavioral

**B1 — `TableAlias#[]` with `Table` relation in Rails passes `self` as second arg to `relation[]`**

- Rails (table_alias.rb:12): `relation.is_a?(Table) ? relation[name, self] : Attribute.new(self, name)`. Passes `self` (the alias) as the table for the attribute.
- TS (`table-alias.ts:30`): `new Attribute(this, columnName)` — always uses `this` (the alias). Same semantics.

**B2 — `to_cte` in TS matches Rails**

- Rails (table_alias.rb:24): `Cte.new(name, relation)`.
- TS: same.

---

### `attributes/attribute.rb` → `attributes/attribute.ts`

#### Behavioral

**B1 — `lower` method missing in TS `Attribute` (Rails-defined)**

- Rails (attribute.rb:16): `def lower; relation.lower self; end` — delegates to `relation.lower`.
- TS: no `lower` method on `Attribute`. `FactoryMethods#lower` creates `NamedFunction("LOWER", ...)` but is not available on `Attribute` directly via the Rails delegation pattern.

**B2 — `type_caster` returns `relation.type_for_attribute(name)` in both Rails and TS**

- Rails: via `Struct` member access. TS: explicit getter. Equivalent.

**B3 — `able_to_type_cast?` delegates to `relation.able_to_type_cast?` in Rails; TS calls `relation.isAbleToTypeCast()`**

- Different method name casing (snake_case vs camelCase). Intentional TS adaptation.

**B4 — TS `Attribute` has many convenience methods not in Rails' `Attribute`**

- `lower()`, `upper()`, `length()`, `trim()`, `ltrim()`, `rtrim()`, `substring()`, `replace()`, `abs()`, `round()`, `ceil()`, `floor()`, `isNull()`, `isNotNull()`, etc. are Trails extensions. Not Rails-API deviations but worth noting.

---

### `predications.rb` → `predications.ts`

#### Behavioral

**B1 — `SelectManager` is not recognized in `in` / `not_in` dispatch in TS `Predications`**

- Rails (predications.rb:58): `when Arel::SelectManager => Arel::Nodes::In.new(self, other.ast)`.
- TS `Predications.in`: does not have a SelectManager duck-type branch. The `Attribute#in()` method has a separate duck-type check for `{ ast: Node }`.

**B2 — `eq_all` passes `quoted_array(others)` in Rails; TS passes raw others**

- Rails (predications.rb:22): `grouping_all :eq, quoted_array(others)` — pre-quotes.
- TS: `Predications.eqAll` calls `groupingAll(:eq, others)` which calls `eq()` on each, and `eq` calls `quotedNode`. Functionally equivalent since `eq` always quotes.

**B3 — `grouping_any` uses `Nodes::Or.new([memo, node])` in Rails**

- Rails: `Nodes::Or.new([memo, node])` — always a 2-element Or.
- TS (`predications.ts:1195`): `new Or([left, right])` — same shape.

---

### `select_manager.rb` → `select-manager.ts`

#### Behavioral

**B1 — `SelectManager#order` does NOT auto-convert String/Symbol to SqlLiteral in TS**

- Rails (select_manager.rb:221): `STRING_OR_SYMBOL_CLASS.include?(x.class) ? Nodes::SqlLiteral.new(x.to_s) : x`.
- TS (`select-manager.ts:126`): `order(...exprs: Node[])` — typed as Node-only. No string conversion. Callers must wrap strings manually.

**B2 — `SelectManager#where` does NOT accept TreeManager in TS**

- Rails (select_manager.rb:181): `if Arel::TreeManager === expr; expr = expr.ast; end`.
- TS: `where(condition: Node)` — typed as Node only.

**B3 — `SelectManager#froms` includes null in TS; Rails filters nulls**

- Rails (select_manager.rb:69): `@ast.cores.filter_map { |x| x.from }` — excludes nil.
- TS (`select-manager.ts:352`): `return [this.core.source.left]` — may return `[null]`.

**B4 — `SelectManager#union(operation_symbol, other)` overload missing in TS**

- Rails (select_manager.rb:198): `union(operation, other = nil)` — when `other` is provided, `operation` is a symbol (`:all`) that selects `UnionAll` class.
- TS: two separate methods `union(other)` and `unionAll(other)`. No polymorphic symbol dispatch. Not a behavioral regression (coverage is equivalent) but API surface differs.

**B5 — `SelectManager#with` symbol dispatch missing in TS**

- Rails (select_manager.rb:223): `with(*subqueries)` where first arg being `:recursive` selects `WithRecursive`.
- TS: separate `with()` and `withRecursive()` methods. Same coverage, different API.

**B6 — `SelectManager#initialize_copy` not present in TS**

- Rails (select_manager.rb:14): `initialize_copy` clones `@ast` and resets `@ctx`. TS uses structural cloning differently (no equivalent hook needed for TS semantics).

**B7 — `SelectManager#taken` alias missing in TS**

- Rails (select_manager.rb:23): `alias :taken :limit`.
- TS: no `taken` getter/alias.

**B8 — `SelectManager#minus` alias missing in TS**

- Rails (select_manager.rb:164): `alias :minus :except`.
- TS: no `minus` method alias.

---

### `table.rb` → `table.ts` (inside `select-manager.ts`)

#### Behavioral

**B1 — `Table.engine` class-level variable missing in TS**

- Rails (table.rb:11): `@engine = nil; class << self; attr_accessor :engine; end`.
- TS: no `engine` class property. `toSql()` uses the registered visitor registry instead of engine. `TreeManager#toSql(engine)` in Rails passes engine explicitly.

**B2 — `Table#[]` does not consult `klass.attribute_aliases` in TS**

- Rails (table.rb:65): `name = @klass.attribute_aliases[name] || name if @klass`.
- TS: no equivalent alias resolution. Passed-through attribute names are used as-is.

**B3 — `Table#hash` and `Table#eql?`/`==` missing in TS**

- Rails (table.rb:70): defines `hash` (based on `@name`) and `eql?` (compares class, name, table_alias).
- TS: no explicit `eql?` or `hash`. JS equality is reference-based by default.

**B4 — `Table#type_cast_for_database` / `type_for_attribute` / `able_to_type_cast?`**

- Rails: delegates to private `@type_caster`.
- TS: delegates to `this.typeCaster` via duck-type calls. Same semantics with camelCase naming.

**B5 — `Table#outer_join` missing in TS**

- Rails (table.rb:43): `def outer_join(relation); join(relation, Nodes::OuterJoin); end`.
- TS `Table` (`select-manager.ts`): `outerJoin` method delegates through `this.from().outerJoin(...)`. Covered, camelCase.

---

### `tree_manager.rb` → `tree-manager.ts`

#### Behavioral

**B1 — `TreeManager#to_sql(engine)` requires engine/connection in Rails; TS takes none**

- Rails (tree_manager.rb:30): `to_sql(engine = Table.engine)` — uses engine's connection visitor.
- TS (`tree-manager.ts:74`): `toSql()` uses registered visitor. Engine parameter dropped.

**B2 — `StatementMethods#order` REPLACES orders in Rails; TS also replaces**

- Both correct: `@ast.orders = expr` (Rails line in tree_manager.rb StatementMethods) vs TS `this.ast.orders = expr`. Aligned.

**B3 — `StatementMethods#take` wraps in `Nodes::Limit.new(Nodes.build_quoted(limit))`**

- Rails: wraps in `Limit(build_quoted(limit))`.
- TS: `new Limit(buildQuoted(limit))`. Equivalent.

---

### `collectors/composite.rb` → `collectors/composite.ts`

#### Behavioral

**B1 — `preparable` attribute behavior differs**

- Rails (composite.rb:6): `attr_accessor :preparable` — single value, defaults to nil.
- TS: `preparable = false` — always false.

**B2 — `retryable=` setter: Rails updates both children AND caches in `@retryable`**

- Rails: stores `@retryable` and also sets `left.retryable = right.retryable = retryable`.
- TS: setter propagates to children but no local cache. The getter inspects children. Functionally equivalent but misses the case where a child doesn't have a `retryable` setter (throws vs. silently passes in Rails).

---

### `collectors/substitute_binds.rb` → `collectors/substitute-binds.ts` and `substitute-bind-collector.ts`

#### Structural

**S1 — Two TS implementations for one Rails class**

- Rails has a single `SubstituteBinds`. TS has both `SubstituteBinds` (in `substitute-binds.ts`, mirrors Rails shape) and `SubstituteBindCollector` (in `substitute-bind-collector.ts`, Trails-specific wrapper). The extra `SubstituteBindCollector` is an intentional Trails addition; it is not a Rails class.

---

### `errors.rb` → `errors.ts`

#### Behavioral

**B1 — `BindError#initialize` message format differs**

- Rails (errors.rb:14): `super("#{message} in: #{sql.inspect}")` — uses Ruby's `.inspect` (adds surrounding quotes and escapes internals).
- TS (`errors.ts`): equivalent string interpolation without `.inspect` semantics.

---

### `visitors/dot.rb` → `visitors/dot.ts`

#### Behavioral

**B1 — `visit_Arel_Nodes_Extract`: visits `expressions` + `alias` in Rails; visits `expr` + `field` in TS**

- Rails (dot.rb:109): `visit_edge o, "expressions"; visit_edge o, "alias"`.
- TS (`dot.ts:178`): `visitEdge(o, "expr"); visitEdge(o, "field")`.
- TS `Extract` has no `expressions` array or `alias`; Rails `Extract` (being Unary) stores the expression array in `expr` but accesses it via inherited Unary logic as `expressions` through a Function-like accessor. The dot graphs produced are structurally different.

**B2 — `visit_Arel_Nodes_With` / `WithRecursive` uses `visit__children` in both Rails and TS — aligned**

- Rails: `alias :visit_Arel_Nodes_With :visit__children` (visits each child by index).
- TS: dispatches `With` to `visitChildren`. Aligned.

**B3 — `visit_Arel_Nodes_Or` is aliased to `visit__children` in Rails; TS dispatches `Or` to `visitChildren`**

- Rails (dot.rb): `alias :visit_Arel_Nodes_And :visit__children; alias :visit_Arel_Nodes_Or :visit__children`.
- TS: `reg(Nodes.And, "visitChildren"); reg(Nodes.Or, "visitChildren")`. Equivalent.

---

## Cross-Cutting Findings

### TS-Specific Extensions (Intentional Divergences)

The following are Trails additions that have no Rails counterpart. They are listed here so they are not mistaken for missing alignment work:

- `SelectManager#{rightOuterJoin,fullOuterJoin,crossJoin}` — not in Rails `SelectManager` but wired to node types Rails has.
- `SelectManager#union(other)` / `unionAll(other)` — Rails uses polymorphic `union(op_or_other, other?)`.
- `SelectManager#with()` / `withRecursive()` — Rails uses `with(:recursive, ...)` symbol dispatch.
- `Attribute` extra string/math/aggregate helpers — Rails provides these only via `Expressions`/`Math` mixins; TS duplicates them directly on `Attribute` for ergonomics.
- `PostgreSQLWithBinds` visitor — not in Rails; provides `$N` numbered placeholder support.
- `SubstituteBindCollector` — not in Rails; Trails-specific.
- `SelectOptions` node — TS has a standalone `SelectOptions` node for the Oracle-enhanced adapter path; Rails does not define this as a node type.
- `Top` node — present in TS dispatch table (for SQL Server adapters); not in Rails arel (handled in `activerecord` adapters).
- `CrossJoin` node — TS has an explicit class; Rails has no `CrossJoin` in arel (used in `activerecord` adapter layer).
- `Nodes.Rollup` vs. `Nodes.RollUp` — Rails uses `RollUp`; TS uses `Rollup` in the class name but the visitor method is `visitArelNodesRollUp`. Minor casing inconsistency.

### Missing `eql?` / `==` Semantics

TS has no native `eql?` / `hash` contract. The following Rails nodes define `hash` + `eql?` but TS has no equivalent structural equality:

- `Distinct`, `CurrentRow` (terminal/singleton) — Rails: `self.class.hash`. TS: reference equality.
- `Table` — Rails: `@name.hash`. TS: reference equality.
- `SelectStatement`, `SelectCore`, `InsertStatement`, `UpdateStatement`, `DeleteStatement` — Rails: field-based `eql?`.

This is a known JS/TS limitation and broadly intentional. However it means any code that deduplicates nodes by value (e.g. `@seen[o.object_id]` in Dot, which TS replaces with a `WeakSet`) will behave differently.

### `collector.preparable = false` Gaps

Rails sets `collector.preparable = false` for statements that cannot be prepared:

- `visit_Arel_Nodes_DeleteStatement` (line 23) ✅ TS sets `retryable = false` (different flag, different concern).
- `visit_Arel_Nodes_UpdateStatement` (line 41) ✅ same.
- `visit_Arel_Nodes_InsertStatement` (line 54) ✅ same.
- `visit_Arel_Nodes_HomogeneousIn` (line 337) — ❌ **TS missing `preparable = false`** (finding B4 under `visitors/to_sql.rb`).
- `visit_Arel_Nodes_In` (line 592) — ❌ **TS missing `preparable = false`** on the array branch.
- `visit_Arel_Nodes_NotIn` (line 609) — ❌ **TS missing `preparable = false`** on the array branch.
- `visit_Arel_Nodes_NamedFunction` (line 387) ✅ TS sets `retryable = false`.

Note: Trails' `preparable` maps to preparedness for DB-level prepared statements; `retryable` is a Trails-specific concept (retry after connection loss). They are orthogonal. Rails sets `preparable = false` to indicate the query has inlined values (cannot be a prepared statement). Trails does not fully implement `preparable` tracking, so these gaps may be intentional for now.
