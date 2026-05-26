# lint:deps — Arel + ActiveModel dep-parity plan

## Phase 1 — Linter improvements ✅ DONE

Three fixes:

1. **Tainted-symbol ref recording** — `methodUsesDepImport` now records
   the identifier name when a tainted symbol is detected, so
   cross-reference can match Ruby method-name refs against TS wrappers.
2. **Ruby method-name ref filtering** — `arel_table`, `arel_column`,
   `resolve_arel_attribute` filtered from `normalizeRubyRef` (these are
   Ruby method calls on model/relation, not type references).
3. **Ruby mixin ref filtering** — `Predications`, `Expressions` filtered
   (structural mixins applied at arel build time; AR code calls the mixed-in
   methods but never references the module by name).

Result: arel 27 → 17 ref mismatches, AM 10 → 11 (one new: `FALSE_VALUES`
surfaced by tainted-symbol recording).

---

Baseline after Phase 1 (2026-05-25):

- **AR → Arel**: 92/92 compliant (100%), 17 ref mismatches, 3 unmatched
- **AR → ActiveModel**: 19/19 compliant (100%), 11 ref mismatches, 1 unmatched

---

## Phase 2 — Arel ref gaps (17 mismatches)

### Slot 2-A: HomogeneousIn in array-handler

Rails' `ArrayHandler#call` constructs `Arel::Nodes::HomogeneousIn` for
multi-value `where` clauses. Our TS version uses `In` / `NotIn` instead.
Wire `HomogeneousIn` — it exists in `@blazetrails/arel`.

**Files:** `packages/activerecord/src/relation/predicate-builder/array-handler.ts`

### Slot 2-B: Bin in caseSensitiveComparison

`AbstractMysqlAdapter#case_sensitive_comparison` wraps the attribute in
`Arel::Nodes::Bin` for case-insensitive collations. Our TS has a TODO
comment but doesn't use it. Wire `Bin` (exists in arel `nodes/unary.ts`).

**Files:** `packages/activerecord/src/connection-adapters/abstract-mysql-adapter.ts`

### Slot 2-C: OuterJoin in join-association joinConstraints

Rails' `JoinAssociation#join_constraints` uses `Arel::Nodes::OuterJoin`.
Our TS references `Nodes.OuterJoin` in some paths but the linter flags a
missing ref — verify which code path is missing the usage.

**Files:** `packages/activerecord/src/associations/join-dependency/join-association.ts`

### Slot 2-D: SqlLiteral gaps (join-dependency + relation + where-clause)

`SqlLiteral` missing in:

- `joinConstraints` (join-dependency.ts)
- `_substituteValues` (relation.ts)
- `invertPredicate` (where-clause.ts)
- `preprocessOrderArgs` (query-methods.ts)

**Files:** 4 files across relation/associations

### Slot 2-E: query-methods Arel node gaps (bundle)

- `buildJoinBuckets` — missing `Join`, `InnerJoin`
- `buildWithValueFromHash` — missing `TableAlias`
- `buildWithJoinNode` — missing `Table`
- `reverseSqlOrder` — missing `Attribute`, `Ordering`, `NodeExpression`
- `preprocessOrderArgs` — missing `Node`, `Attribute`
- `buildNamedBoundSqlLiteral` / `buildBoundSqlLiteral` — missing `BindError`

**Files:** `packages/activerecord/src/relation/query-methods.ts`

### Slot 2-F: internal-metadata / schema-migration Count + BindParam

Both `count` methods use `NamedFunction`+`star` but not `Count` node.
Rails uses `Arel::Nodes::Count`. Also `selectEntry` missing `BindParam`.

**Files:** `packages/activerecord/src/internal-metadata.ts`,
`packages/activerecord/src/schema-migration.ts`

### Slot 2-G: relation \_substituteValues — Grouping

Missing `Arel::Nodes::Grouping` in `_substituteValues`.

**Files:** `packages/activerecord/src/relation.ts`

### Slot 2-H: where-clause invertPredicate — Not

Missing `Arel::Nodes::Not` in `invertPredicate`.

**Files:** `packages/activerecord/src/relation/where-clause.ts`

### Slot 2-I: postgresql-adapter arelVisitor — PostgreSQL

Missing `Arel::Visitors::PostgreSQL` reference. Verify if this is a
visitor-class instantiation gap or just a naming issue.

**Files:** `packages/activerecord/src/connection-adapters/postgresql-adapter.ts`

---

## Phase 3 — ActiveModel ref gaps (11 mismatches)

### Slot 3-A: attributes.ts — Attribute + UserProvidedDefault

`_defaultAttributes` and `defineDefaultAttribute` should reference
`ActiveModel::Attribute` and `UserProvidedDefault` from
`@blazetrails/activemodel`. Both exist in the AM package.

**Files:** `packages/activerecord/src/attributes.ts`

### Slot 3-B: quoting.ts — Attribute in typeCastedBinds

Rails' `typeCastedBinds` iterates `ActiveModel::Attribute` objects.
Verify our TS version uses the AM `Attribute` type.

**Files:** `packages/activerecord/src/connection-adapters/abstract/quoting.ts`

### Slot 3-C: enum.ts — Type, model-schema.ts — Builder

`_enum` references `ActiveModel::Type`; `attributesBuilder` references
`ActiveModel::AttributeSet::Builder`. Wire the imports.

**Files:** `packages/activerecord/src/enum.ts`,
`packages/activerecord/src/model-schema.ts`

### Slot 3-D: suppress / triage non-existent AM types

`AttrNames` and `YAMLEncoder` don't exist in our AM package. These are
Ruby-specific (AttrNames is a C-extension optimization, YAMLEncoder is
Psych-specific). Add `// lint-deps-ignore: activemodel` or filter in
`normalizeRubyRef`.

**Files:** `packages/activerecord/src/attribute-methods/read.ts`,
`packages/activerecord/src/attribute-methods/write.ts`,
`packages/activerecord/src/model-schema.ts`

### Slot 3-E: encryption + serialized — Data type

`textToDatabaseType` and `encoded` reference `ActiveModel::Type::Data`
(the `Data` class). Verify if this is a real type or Ruby-specific.

**Files:** `packages/activerecord/src/encryption/encrypted-attribute-type.ts`,
`packages/activerecord/src/type/serialized.ts`

### Slot 3-F: query.ts — FALSE_VALUES

`queryCastAttribute` references `ActiveModel::Type::Boolean::FALSE_VALUES`.
Verify if our Boolean type exports this constant.

**Files:** `packages/activerecord/src/attribute-methods/query.ts`

---

## Phase 4 — Unmatched methods

### Slot 4-A: JoinDependency#make_constraints

`associations/join_dependency.rb` — implement `makeConstraints`. Uses Arel
joins/constraints. May overlap with join-dependency-arel-plan.md.

**Files:** `packages/activerecord/src/associations/join-dependency.ts`

### Slot 4-B: Calculations#calculate

`relation/calculations.rb` — implement `calculate`. The main dispatch
method for `count`/`sum`/`average`/etc. Uses Arel aggregate nodes.

**Files:** `packages/activerecord/src/relation/calculations.ts`

### Slot 4-C: QueryMethods#in_order_of

`relation/query_methods.rb` — implement `inOrderOf`. Uses Arel `Case`
node to order by a specific value list.

**Files:** `packages/activerecord/src/relation/query-methods.ts`

---

## Sequencing

Phases 2–3 need per-slot triage to determine which are real behavior gaps
vs acceptable idiom differences. Phase 4 slots are standalone implementations.

Bundle by file adjacency toward the 300 LOC PR ceiling.
