# Arel Alignment — Follow-up PR Plan

Slices the deviations in `docs/arel-rails-audit.md` into a small number of focused PRs.
Source references use Rails v8.0.2 paths under `scripts/api-compare/.rails-source/activerecord/lib/arel/` (abbreviated `arel/`). TS paths under `packages/arel/src/`.

Conventions: ≤300 LOC per PR, Conventional Commits, draft + `/link <pr#>`, tests next to source. NEVER rename existing test names.

Priority: blockers (wrong SQL) → ergonomics → structural cleanup.

---

## PR 27 — Visitor blockers (wrong SQL)

**Scope:** the three SQL-correctness bugs, bundled because they all live in `to-sql.ts` and each is small.

1. **Fragments space joiner.** `visitArelNodesFragments` interleaves `" "` between visited parts. Rails `arel/visitors/to_sql.rb:864` uses `inject_join o.values, collector, " "`. Currently emits `"ab"` instead of `"a b"`.
2. **`collector.preparable = false` for IN/HomogeneousIn.** Set in `visitArelNodesHomogeneousIn` (Rails `to_sql.rb:337`), `visitArelNodesIn` array branch (`:592`), `visitArelNodesNotIn` array branch (`:609`). Add `preparable` field to `Composite` collector first if missing (Rails `arel/collectors/composite.rb:6`).
3. **Intersect/Except wrapping.** Switch from recursive `infixValueWithParen` to Rails' simple `infixValue` + hard outer parens (Rails `to_sql.rb:216-224`). Add regression test for nested `Intersect(Intersect(a,b),c)`.

**Files:** `packages/arel/src/visitors/to-sql.ts`, `packages/arel/src/collectors/composite.ts`, tests next to each.

**LOC budget:** ~200.

---

## PR 28 — Range short-circuit (BindParam helpers + visitor wiring)

**Scope:** add `valueBeforeTypeCast` / `isInfinite` / `isUnboundable` to `BindParam`, then wire them into the range visitors so infinite/unboundable bound values collapse to `1=1` / `1=0`.

**Files:**

- `packages/arel/src/nodes/bind-param.ts` — three duck-type predicates per Rails `arel/nodes/bind_param.rb:26,34,38`.
- `packages/arel/src/visitors/to-sql.ts` — `visitArelNodesGreaterThan`, `LessThan`, `GreaterThanOrEqual`, `LessThanOrEqual`, `Between`, `NotBetween`. Match Rails branches (search `unboundable?` / `infinite?` in `to_sql.rb`).
- Tests next to source.

**LOC budget:** ~200.

---

## PR 29 — Node base + buildQuoted: polymorphic safety

**Scope:** prevent crashes from polymorphic dispatch on the Node hierarchy.

1. **Node defaults.** Add `isEquality(): boolean { return false; }` and `fetchAttribute(_cb): void { /* no-op */ }` on `Node` base (Rails `arel/nodes/node.rb:147-149`). Remove now-redundant overrides on `Binary`/`Nary`/`HomogeneousIn` unless they specialize. Confirm `Equality`/`In` override `isEquality()` to `true`.
2. **buildQuoted recognizes ActiveModel::Attribute.** Duck-type check (`typeof other?.valueForDatabase === "function" && "name" in other`) before wrapping (Rails `arel/nodes/casted.rb:55`). No hard import from activemodel.

**Files:** `packages/arel/src/nodes/node.ts`, `packages/arel/src/nodes/casted.ts`, related test files, `nodes.test.ts` for a polymorphic smoke test.

**LOC budget:** ~150.

---

## PR 30 — SelectManager + SqlLiteral ergonomics

**Scope:** Rails-shaped conveniences. All trivially small individually, bundled by file proximity.

1. **`order(...)` accepts `string | symbol`** → wrap in `SqlLiteral` (Rails `arel/select_manager.rb:221`).
2. **`where(expr)` accepts `TreeManager`** → unwrap to `expr.ast` (`select_manager.rb:181`).
3. **`froms()` filters null** (`select_manager.rb:69`).
4. **`taken` alias for `limit`** (`select_manager.rb:23`).
5. **`minus` alias for `except`** (`select_manager.rb:164`).
6. **`SqlLiteral#plus(other)`** returns `Fragments` (Rails `arel/nodes/sql_literal.rb:28`); register via the index pattern used by `BoundSqlLiteral`.
7. **`SelectCore.froms` getter/setter alias** (`arel/nodes/select_core.rb:46`).
8. **`Predications#in` recognizes SelectManager** via duck-type (`arel/predications.rb:58`).
9. **`Attribute#lower()`** delegates to `relation.lower(this)` (`arel/attributes/attribute.rb:16`).

**Files:** `select-manager.ts`, `nodes/select-core.ts`, `nodes/sql-literal.ts`, `predications.ts`, `attributes/attribute.ts`, tests next to each.

**LOC budget:** ~280. If it overshoots, split off items 6–9 into PR 30b.

---

## PR 31 — Cte tristate + BoundSqlLiteral early validation + BindError formatting

**Scope:** small node/error-shape fixes.

1. **`Cte.materialized`** widens to also accept `true | false | null` (Rails tristate). Visitor branches on normalized value. (Rails `arel/nodes/cte.rb`, `to_sql.rb:736`.)
2. **`BoundSqlLiteral` validates at construction.** Diff `:token` placeholders against `namedBinds` keys, raise `BindError` listing all missing keys (Rails `arel/nodes/bound_sql_literal.rb:20-34`).
3. **`BindError` message** uses `JSON.stringify(sql)` (closest TS analog to Ruby `.inspect`) per Rails `arel/errors.rb:14`.

**LOC budget:** ~150.

---

## PR 32 — Structural cleanup (Quoted/With/ValuesList/Exists/Function.alias)

**Scope:** higher-risk inheritance / slot-storage realignment. Single PR because the changes are interleaved through the node hierarchy and visitor dispatch.

1. **`Quoted extends Unary`** (Rails `casted.rb:39`). Constructor `super(value)`. Drop manual `eql?` override; rely on `Unary#eql`. Audit callers that read `quoted.value` — may need `get value() { return this.expr; }` shim.
2. **`With` / `ValuesList` use `Unary#expr` slot.** Call `super(children)` / `super(rows)`; expose `get children()` / `get rows()` returning `this.expr`. (Rails `arel/nodes/with.rb`, `arel/nodes/values_list.rb`.)
3. **`Exists extends Function`** (Rails `arel/nodes/function.rb:47`). Adds `expressions: Node[]`, `distinct: boolean`. Update `visitArelNodesExists` for array `expressions`.
4. **`Function.alias=` wraps strings in `SqlLiteral`** (Rails `arel/nodes/function.rb:25`).
5. **`Table` equality + `attribute_aliases` lookup.** `eql()` / `hashKey()`; in `Table#[]` resolve `klass?.attributeAliases?.[name] ?? name` (Rails `arel/table.rb:65,70`).
6. **Rename `Rollup` → `RollUp`** (Rails casing). Note in PR body as the single mechanical-rename exception.
7. **Dot visitor `Extract` edges** → `"expressions"` + `"alias"` (Rails `arel/visitors/dot.rb:109`).

**Files:** `nodes/casted.ts`, `nodes/with.ts`, `nodes/values-list.ts`, `nodes/function.ts`, `select-manager.ts` (Table), `visitors/dot.ts`, `visitors/to-sql.ts`, plus tests.

**LOC budget:** ~280. If it overshoots, split items 5–7 into PR 32b.

---

## Deferred / Skipped

- **`SqlLiteral extends String`** — JS strings aren't usefully subclassable.
- **`Table.engine` global** — superseded by visitor registry.
- **`encode_with` (YAML)** — N/A in TS.
- **`union(:all, other)` / `with(:recursive, ...)` polymorphic dispatch** — coverage already exists via separate `unionAll` / `withRecursive`. Add only if a Rails port needs the exact symbol form.
- **`initialize_copy` on SelectManager** — TS clone semantics differ.
- **TS-specific extras** (`PostgreSQLWithBinds`, `Top`, `CrossJoin`, `SelectOptions`, `SubstituteBindCollector`, `Attribute` math/string helpers) — keep.

---

## Sequencing

**27 → 28 → 29** correctness first.
**30, 31** ergonomics, can land in either order.
**32** structural cleanup last (most likely to need a follow-up).
