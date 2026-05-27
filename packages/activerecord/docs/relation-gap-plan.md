# Relation gap plan

275 skipped tests across 30 files. Organized into PR-sized work items
(~150–300 LOC each), ordered by unlock potential.

---

## Summary by cluster

| Cluster                                                   | Tests | Root cause                                                                        |
| --------------------------------------------------------- | ----- | --------------------------------------------------------------------------------- |
| WHERE with associations/polymorphic/CPK                   | 31    | `PredicateBuilder#buildFromHash` doesn't expand association keys                  |
| load_async / FutureResult                                 | 28    | Ruby-thread-only; PERMANENT-SKIP                                                  |
| Scoping — Arel nodes in `order()` / `reverseOrder`        | 20    | `orderBang` pre-renders Arel nodes to raw strings; `reverseOrder` can't flip them |
| Scoping — query cache + select narrowing                  | 8     | 6 need query cache (→ P12), 2 need select narrowing (→ R3b)                       |
| Query cache                                               | 27    | Blocked on connection-pool (per-thread cache architecture)                        |
| Hash-form select                                          | 23    | `arelColumnsFromHash` doesn't handle `{ expr => alias }`                          |
| WhereChain `.associated`/`.missing` with enums            | 12    | Bypasses predicate builder; enum cast never applied                               |
| lock / FOR UPDATE                                         | 7     | Lock clause not propagated to Arel SQL manager                                    |
| Standalone relation (joins, eager, race, fixture)         | 8     | Parameterized joins (2), eager_load toSql (3 → assoc A5), race/fixture/Ruby (3)   |
| Calculations with associations                            | 12    | Fixture-dependent + grouped association join                                      |
| `inOrderOf`                                               | 4     | `field-ordered-values.ts` not implemented                                         |
| Misc (batches, update-all, delegation, predicate-builder) | ~6    | Scattered single-test gaps                                                        |

---

## Track 1: WHERE — association key expansion (unlocks ~31 tests)

### PR R1: `PredicateBuilder` association-key expansion

**Problem:** `PredicateBuilder#buildFromHash` handles only plain column→value
pairs. When Rails sees `where(author: record)` or
`where(comments: relation)`, it walks the reflection chain, resolves the FK
(and type column for polymorphic), and builds the predicate. Our builder has
no such path — the `relation/where-clause.ts` file has no `whereClauseFor`
equivalent, and `query-methods.ts:~1991` has a comment acknowledging the gap.

**Files:**

- `relation/predicate-builder.ts` — add `expandAssociationKey` branch in `buildFromHash`
- `relation/where-clause.ts` — may need `whereClauseFor` or the expansion can live in predicate-builder

**Rails ref:** `relation/predicate_builder.rb:34–58` (`build_from_hash` association detection),
`relation/predicate_builder/association_query_value.rb` (builds FK/type predicates)

**Est:** ~150 LOC

**Unlocks:** 31 tests in `where.test.ts` (association where, polymorphic where, CPK where)

---

## Track 2: Hash-form select (unlocks ~23 tests)

### PR R2: `select()` hash argument — expression-to-alias mapping

**Problem:** `arelColumnsFromHash` (query-methods.ts:1827–1842) handles
`{ table: [col, col] }` form but throws `TypeError` for
`{ "UPPER(title)": "title" }` (expression → alias). Rails builds an
`Arel::Nodes::As` node wrapping a `SqlLiteral` with a quoted alias.

**Files:**

- `relation/query-methods.ts:1827–1842` — `arelColumnsFromHash`
- `relation/query-methods.ts:1858` — `processSelectArgs` dispatch

**Rails ref:** `relation/query_methods.rb` `arel_columns` hash branch

**Est:** ~80 LOC

**Unlocks:** 23 tests in `select.test.ts`

---

### PR R2b: `select(nil)` clears the select list

**Problem:** `select(nil)` is treated as `select("null")` — `String(nil)`
produces the literal column name "null" instead of clearing the select list.

**Files:**

- `relation/query-methods.ts` — `select` / `processSelectArgs` nil guard

**Est:** ~10 LOC (bundle with R2)

---

## Track 3: Arel nodes in `order()` + `reverseOrder` (unlocks ~28 tests)

### PR R3: Preserve Arel node identity in `orderBang`; flip in `reverseOrder`

**Problem:** `orderBang` (query-methods.ts:354–420) accepts
`Nodes.Node` but immediately renders to `{ raw: string }` via `.toSql()`.
This loses the node's type identity — `reverseOrderBang` (line 1054–1088)
only knows how to flip string clauses and `[col, dir]` tuples, not
`Ascending`/`Descending` nodes. Rails calls `.reverse` on Arel ordering
nodes directly.

**Files:**

- `relation/query-methods.ts:382–388` — `orderBang` Arel node branch
- `relation/query-methods.ts:1054–1088` — `reverseOrderBang`

**Rails ref:** `relation/query_methods.rb` `reverse_sql_order` handles
`Arel::Nodes::Ordering` subclasses

**Est:** ~80 LOC

**Unlocks:** ~20 tests in `relation-scoping.test.ts` (Arel order + reverse),
~5 in `relations.test.ts` (reorder)

---

### PR R3b: Scoping — select narrowing + `hasAttribute` from projected columns

**Problem:** 2 tests (`scoped find select`, `scope select concatenates`)
need `hasAttribute()` to reflect the projected column set from a select
scope, not just the full schema declaration.

**Files:**

- `relation/scoping.ts` or `attribute-methods.ts` — attribute visibility
  after select narrowing

**Rails ref:** Rails' `ActiveRecord::Result` materializes only selected
columns; `has_attribute?` reads from the result set.

**Est:** ~60 LOC

**Unlocks:** 2 tests + potential for others relying on projected-attribute detection

---

## Track 4: WhereChain `.associated`/`.missing` with enums (unlocks ~12 tests)

### PR R4: Route `.associated`/`.missing` through predicate builder

**Problem:** `WhereChain#associated` (query-methods.ts:415–445) manually
adds a join and pushes an `IS NOT NULL` predicate, bypassing the predicate
builder entirely. When the association FK is an enum column, the integer
mapping is never applied. Rails passes the association name as a hash key
to the full `where(assoc => conditions)` path which triggers enum casting.

**Files:**

- `relation/query-methods.ts:415–445` — `WhereChain#associated`
- `relation/query-methods.ts:447–480` — `WhereChain#missing`

**Rails ref:** `query_methods/where_chain.rb:88–104` (`associated`),
`query_methods/where_chain.rb:50–86` (`missing`)

**Depends on:** PR R1 (association-key expansion must exist first for the
routing to work)

**Est:** ~60 LOC

---

## Track 5: `inOrderOf` / field-ordered values (unlocks ~4 tests)

### PR R5: Implement `Relation#inOrderOf`

**Problem:** `relation/field-ordered-values.ts` exists but the method is
not wired or the implementation doesn't handle expressions and association
joins.

**Files:**

- `relation/field-ordered-values.ts` — full implementation
- `relation/query-methods.ts` — wire `inOrderOf` into the relation chain

**Rails ref:** `relation/query_methods.rb` `in_order_of`

**Est:** ~80 LOC

---

## Track 6: Standalone relation gaps (unlocks ~20 actionable tests)

### PR R6a: `lock()` / `lock("FOR SHARE")` in toSql

**Problem:** `lock()` not emitting `FOR UPDATE` / custom lock clause in SQL.
7 tests across `relations.test.ts` cover: `lock()` default FOR UPDATE,
custom lock clause, `toSql` output, and `locked` preventing arel build.

**Files:**

- `relation/query-methods.ts` or `relation.ts` — lock value propagation to Arel

**Est:** ~40 LOC (7 tests)

---

### PR R6b: `having()` hash form

**Problem:** `having({ count: 5 })` doesn't expand to `HAVING "count" = 5`.

**Files:**

- `relation/query-methods.ts` — `having` method hash-argument handling

**Est:** ~30 LOC (1 test)

---

### PR R6c: Parameterized join strings

**Problem:** `joins("INNER JOIN ... WHERE x = ?", value)` — interpolated
bind parameters in join string not implemented.

**Files:**

- `relation/query-methods.ts` — `joins` string-with-binds branch

**Est:** ~40 LOC (2 tests)

---

## Permanently skipped / cross-blocked (not actionable here)

| Cluster                               | Tests | Reason                                     |
| ------------------------------------- | ----- | ------------------------------------------ |
| load_async / FutureResult             | 28    | Ruby thread pool; no JS equivalent         |
| Query cache (per-thread architecture) | 14    | Blocked on connection-pool track (see P12) |
| Query cache (GVL/fork)                | 6     | Ruby-only                                  |
| SimpleDelegator where                 | 2     | Ruby-only; no JS equivalent                |
| eager_load toSql + STI + non-preload  | 3     | Blocked on associations track (see A5)     |
| findOrCreateBy race condition         | 1     | Concurrency edge case; low priority        |
| Calculations with associations        | 12    | Fixture-dependent + Phase G                |
| Alternate PK where                    | 1     | Fixture-dependent                          |

---

## Dependency graph

```
R1 ──→ R4 (WhereChain needs association-key expansion)

R2 + R2b (standalone)

R3 ──→ R3b (select narrowing is tangential but same scoping area)

R5, R6a, R6b, R6c (all standalone)
```

## Priority order

| #   | PR  | Tests unlocked                 | Depends on |
| --- | --- | ------------------------------ | ---------- |
| 1   | R1  | 31 (where + associations)      | —          |
| 2   | R3  | 28 (Arel order + reverse)      | —          |
| 3   | R2  | 23 (hash select)               | —          |
| 4   | R4  | 12 (associated/missing + enum) | R1         |
| 5   | R6a | 7 (lock / FOR UPDATE)          | —          |
| 6   | R5  | 4 (inOrderOf)                  | —          |
| 7   | R6c | 2 (parameterized joins)        | —          |
| 8   | R6b | 1 (having hash)                | —          |
| 9   | R3b | 2 (select narrowing)           | R3         |

**Coverage:** 275 tests total.

- **Actionable here:** ~110 tests across 9 PRs (R1–R6c)
- **Cross-blocked:** ~47 tests (connection-pool P12, associations A5, Phase G fixtures)
- **Permanently skipped:** ~36 tests (load_async, GVL/fork, SimpleDelegator)
- **Absorbed into other PRs:** ~82 tests (reorder/reverseOrder → R3, lock → R6a,
  scoping Arel → R3, relations.test.ts select → R2)
