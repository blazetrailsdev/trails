# Audit: bind-inlining vs Rails — `compile` / `to_sql` / where-clause

RFC 0022 (relation-arel-ast-convergence), story
`audit-bind-inlining-rails-fidelity`. Audit only — no production code.

## Summary

trails inlines bind values in **five** places, four of them with mechanisms
that have **no Rails/Arel counterpart**. The single root cause is one
visitor-level divergence: trails' `visitArelNodesCasted` routes `Casted`
through `collector.addBind` (rendering `?` + a bind), whereas Arel v8.0.2
inlines `Casted` **directly in the visitor** (`collector << quote(...)`) and
defers only `BindParam`. Because trails' base `compile` emits `?` for a
`Casted`, every caller that needs executable/inspectable SQL bolts on a
post-hoc inliner — a regex (`compileInlined`), a bespoke quoter
(`WhereClause#toSql`), and (on the unmerged PR #3300 branch) a hybrid
`InlineBinds` collector. Fix the visitor and a plain `SQLString` reproduces
Rails exactly; the four downstream inliners collapse.

Verified against **Rails v8.0.2 @ `vendor/rails`**. Every Findings claim in the
story body was checked against source and confirmed; one scope correction
below.

## Coverage

- **Rails source read:**
  - `vendor/rails/activerecord/lib/arel/visitors/to_sql.rb` (`compile` :17;
    `visit_Arel_Nodes_Casted` :87–88; `alias visit_Arel_Nodes_Quoted` :90;
    `visit_Arel_Nodes_BindParam` :760–761; `HomogeneousIn` add_binds :352)
  - `vendor/rails/activerecord/lib/active_record/relation.rb#to_sql` (:1210–1219)
  - `vendor/rails/.../connection_adapters/abstract/database_statements.rb#to_sql`
    / `to_sql_and_binds` (:12–58)
  - `vendor/rails/.../connection_adapters/abstract_adapter.rb#collector` (:1176)
  - `vendor/rails/activerecord/lib/active_record/relation/where_clause.rb`
    (full — no `to_sql`)
- **TS source read:**
  - `packages/arel/src/visitors/to-sql.ts` (`compile` :81–98;
    `visitArelNodesCasted` :243; `visitQuoted` :1875;
    `visitArelNodesHomogeneousIn` :725)
  - `packages/activerecord/src/connection-adapters/abstract/database-statements.ts`
    (`compileInlined` :161, `toSql` :179)
  - `packages/activerecord/src/relation/where-clause.ts` (`toSql` :105)
  - `packages/arel/src/collectors/` (`sql-string.ts`, `substitute-binds.ts`,
    `composite.ts`, `bind.ts`)

## Scope correction to the story Context

The Context lists `Collectors.InlineBinds`
(`packages/arel/src/collectors/inline-binds.ts`), `Relation#_lastSelectNode`,
`Relation#_compileArelNode`, `_inlineBindQuoter`, and `inspectQuoter`. **None of
these exist on `main`** — they are constructs of the **unmerged PR #3300**
branch. On `main` the inline surface is:

1. `to-sql.ts#visitArelNodesCasted` (:243) — `addBind`, the root divergence.
2. `database-statements.ts#compileInlined` (:161) — `sql.replace(/\?|\$\d+/g)`.
3. `where-clause.ts#toSql` (:105) — `compileWithBinds` + inline
   `substituteBoundValues` quoter (the on-main equivalent of the
   `inspectQuoter` the story names).

The audit's conclusions are unchanged; the verdict on PR #3300 stands (do not
merge — relocate its intent into the visitor).

## Gap inventory

### Gap 1: `visit_Arel_Nodes_Casted` uses the wrong collector op (root cause)

- **Type:** signature-drift (visitor-level)
- **Rails source:** `arel/visitors/to_sql.rb:87–88` —
  `collector << quote(o.value_for_database).to_s`. `BindParam` alone defers
  (`:760–761`, `collector.add_bind`).
- **TS counterpart:** `packages/arel/src/visitors/to-sql.ts:243`
  `visitArelNodesCasted` → `collector.addBind(value, …)`. The inline comment
  claiming `add_bind` parity is **factually wrong for v8.0.2**.
- **Behavior gap:** trails `compile(Casted(5))` → `?` + bind; Rails → `5`
  (inlined, no bind). `visitQuoted` (:1875) already inlines correctly via
  `collector.append(this.quote(value))` — `Casted` should mirror it.
- **Classification:** **divergent-relocate** — relocate inlining from the
  caller-side inliners into the visitor.
- **Estimated LOC:** ~10 (visitor body + comment) + snapshot churn.
- **Exec-safety:** `where(id: 5)` builds `attr.eq(QueryAttribute)` via
  predicate_builder (a real bind), **not** a `Casted`. `Casted` appears only
  for genuine inline literals (raw Arel `table[:x].eq(5)`), which Rails inlines
  into executable SQL. Watch exec-path snapshots where a raw-Arel `Casted`
  previously emitted `?` + bind.

### Gap 2: `compileInlined` regex inliner has no Rails counterpart

- **Type:** missing (wrong-layer impl)
- **Rails source:** `database_statements.rb:12–58` — `to_sql` compiles through
  `collector()` (`abstract_adapter.rb:1176`: `SubstituteBinds` when
  `!prepared_statements`, else `Composite(SQLString, Bind)`). No regex anywhere.
- **TS counterpart:** `database-statements.ts:161` — `sql.replace(/\?|\$\d+/g, …)`
  with a host-`quote` fallback.
- **Behavior gap:** pure TS-ism; works only because Gap 1 leaves a `?` to
  substitute. Once `Casted` inlines in the visitor and `BindParam` goes through
  a `SubstituteBinds` collector, the regex is dead.
- **Classification:** **divergent-remove** (after Gap 1 + a collector path).
- **Estimated LOC:** ~25 removed; route `toSql` through a `SubstituteBinds`
  collector instead.

### Gap 3: `WhereClause#toSql` does not exist in Rails

- **Type:** missing (extra TS surface) + bespoke quoter
- **Rails source:** `relation/where_clause.rb` — methods are `+ - | merge except
  or to_h ast == …`; **no `to_sql`**. Inlined where-SQL is produced only via
  `Relation#to_sql` → `conn.to_sql(arel)`.
- **TS counterpart:** `where-clause.ts:105` `toSql()` — recompiles the AST and
  inline-substitutes binds with a bespoke string quoter.
- **Behavior gap:** entire method + quoter is a trails-ism for human-readable
  inspect output. Callers should route through the relation/connection
  collector path.
- **Classification:** **divergent-remove** (migrate callers).
- **Estimated LOC:** ~20 removed + caller migration.

### Gap 4: `Relation#toSql` should re-derive `arel` under `unprepared_statement`

- **Type:** signature-drift
- **Rails source:** `relation.rb:1217–1218` —
  `conn.unprepared_statement { conn.to_sql(arel) }`. No cached node, no bespoke
  quoter; `unprepared_statement` flips `prepared_statements` off so `collector()`
  returns `SubstituteBinds`, inlining every bind.
- **TS counterpart:** PR #3300's `_lastSelectNode` recompile bookkeeping
  (not on `main`).
- **Classification:** **divergent-relocate** → adopt the
  `unprepared_statement { conn.toSql(arel) }` shape.
- **Estimated LOC:** ~15.

### Gap 5: embedded-SQL fragments (`_compileArelNode`: JOIN ON / order)

- **Type:** needs-threading
- **Rails source:** Rails does **not** inline embedded fragments separately; it
  threads their binds through the **outer** collector during the single
  `visitor.compile(arel.ast, collector)` pass (`database_statements.rb:34/43/58`).
- **TS counterpart:** PR #3300's `_compileArelNode` (not on `main`) inlines such
  fragments independently.
- **Classification:** **needs-threading** — overlaps RFC 0017
  (arel-collector-threading). Do **not** inline; thread through the outer
  collector.
- **Estimated LOC:** deferred to RFC 0017; this story only flags it.

### Non-gap (confirmed faithful, leave alone)

- `HomogeneousIn` → `to_sql.ts:725` already mirrors `add_binds`
  (`to_sql.rb:352`): `casted_values` parameterize and the collector decides
  (`SQLString`→`?`, `SubstituteBinds`→inline). Correct.
- `visitQuoted` (`to-sql.ts:1875`) already inlines like `visit_Arel_Nodes_Quoted`.

## Answers to the 5 story questions

1. **`Casted` op?** `<<` (direct quote), `to_sql.rb:88`. trails' `addBind` is a
   genuine divergence → relocate inlining into the visitor.
2. **Bare `compile` collector?** `SQLString` (`to_sql.rb:17` default arg). So
   `compile(table[:x].eq(5))` → `"\"x\" = 5"` (Casted inlined, no bind);
   a `BindParam` would render `?`.
3. **`WhereClause#to_sql`?** Does not exist in Rails. trails' method + quoter is
   a trails-ism; inlined where-SQL comes from `Relation#to_sql`.
4. **`Relation#to_sql`?** `conn.unprepared_statement { conn.to_sql(arel) }`
   (`relation.rb:1217`); `conn.to_sql` → `to_sql_and_binds` → `collector()` →
   `SubstituteBinds` when `!prepared_statements`. No regex, no cached node.
5. **Embedded fragments?** Threaded through the outer collector in one compile
   pass — not inlined separately. → needs-threading (RFC 0017).

## Verdict on PR #3300

`InlineBinds` is the **wrong-layer** fix. The Rails-faithful change is to inline
`Casted` in the visitor (mirroring `visitQuoted`), after which a plain
`SQLString` reproduces Rails and the hybrid collector is unnecessary.
**Recommend NOT merging PR #3300**; fold its intent into
`compile-casted-inline-in-visitor` plus the connection / relation / where-clause
stories.

## Corrected dependency ordering for follow-up stories

The single root cause (Gap 1) gates everything. Revised order:

1. **`compile-casted-inline-in-visitor`** (Gap 1) — **must land first.** Inline
   `Casted` via `<<`/`append` in the visitor; delete the `addBind` route. After
   this, base `compile` matches Rails and `InlineBinds` is moot.
2. **`connection-tosql-via-collector`** (Gap 2) — route `connection.toSql`
   through a `SubstituteBinds` collector; delete `compileInlined`'s regex.
   Depends on (1).
3. **`relation-tosql-unprepared-statement`** (Gap 4) — adopt
   `unprepared_statement { conn.toSql(arel) }`; drop `_lastSelectNode`. Depends
   on (2) for the connection path.
4. **`whereclause-tosql-drop-inspectquoter`** (Gap 3) — remove
   `WhereClause#toSql` + bespoke quoter, migrate callers to the
   relation/connection path. Depends on (3).
5. **`compile-arel-node-bind-threading`** (Gap 5) — thread embedded-fragment
   binds through the outer collector. Coordinate with RFC 0017; can proceed in
   parallel after (1) but lands last to avoid snapshot churn collisions.

The ordering in the story bodies is **unchanged**; this audit confirms it and
pins (1) as the hard prerequisite for (2)–(4).
