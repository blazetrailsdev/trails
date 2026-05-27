# Relation gap plan

275 skipped tests across 30 files. Organized into PR-sized work items
(~150–300 LOC each), ordered by unlock potential.

---

## Summary by cluster

| Cluster                                                   | Tests | Root cause                                                                                          |
| --------------------------------------------------------- | ----- | --------------------------------------------------------------------------------------------------- |
| WHERE with associations/polymorphic/CPK                   | 31    | `PredicateBuilder` handles basic case; edge cases missing (nested, CPK nil, cross-table, Arel star) |
| load_async / FutureResult                                 | 28    | Ruby-thread-only; PERMANENT-SKIP                                                                    |
| Scoping — Arel nodes in `order()` / `reverseOrder`        | 20    | `orderBang` pre-renders Arel nodes to raw strings; `reverseOrder` can't flip them                   |
| Scoping — query cache + select narrowing                  | 8     | 6 need query cache (→ P12), 2 need select narrowing (→ R3b)                                         |
| Query cache                                               | 27    | Blocked on connection-pool (per-thread cache architecture)                                          |
| Hash-form select                                          | 23    | `arelColumnAliasesFromHash` handles basics; edge cases: raw-SQL keys, nil, reserved aliases         |
| WhereChain `.associated`/`.missing` with enums            | 12    | Bypasses predicate builder; enum cast never applied                                                 |
| lock / FOR UPDATE                                         | 7     | Lock clause not propagated to Arel SQL manager                                                      |
| Standalone relation (joins, eager, race, fixture)         | 8     | Parameterized joins (2), eager_load toSql (3 → assoc A5), race/fixture/Ruby (3)                     |
| Calculations with associations                            | 12    | Fixture-dependent + grouped association join                                                        |
| `inOrderOf`                                               | 4     | Implemented in `relation.ts:959`; edge cases: expressions, associations, `filter: false`            |
| Misc (batches, update-all, delegation, predicate-builder) | ~6    | Scattered single-test gaps                                                                          |

---

## Track 1: WHERE — association key expansion (unlocks ~31 tests)

### PR R1: `PredicateBuilder` association-key edge cases

**Problem:** `PredicateBuilder#buildFromHash` already handles the core
association-key expansion path (`predicate-builder.ts:63–192`) including
`isAssociatedWith`/`associatedTable`, polymorphic (via `PolymorphicArrayValue`),
through, and non-polymorphic associations (via `AssociationQueryValue`).
Basic `where(author: record)` works. The 31 skipped tests cover specific
sub-cases that the existing expansion doesn't handle:

- Cross-table joins: `where` with table name and target table already joined
- Non-PK FK: `belongs_to` where with non-primary-key foreign key
- Default scope propagation: `where` on association with `default_scope`
- Strong parameters: `where` with `ActionController::Parameters`
- Arel star: `where` with `Arel.star`
- CPK nil: `where` with nil composite primary key association
- Nested belongs_to: `belongs_to` nested where (2+ levels deep)
- Polymorphic edge cases: nested, decorated, STI, array, collection (12 tests)
- Type casting: `rational`/`duration` for string columns
- Through association: `where` with through-association key

**Files:**

- `relation/predicate-builder.ts:63–192` — extend existing `buildFromHashAssociation`
  for nested, cross-table, non-PK FK, and Arel star cases
- `relation/predicate-builder/association-query-value.ts` — CPK nil handling,
  strong params coercion

**Rails ref:** `relation/predicate_builder.rb:34–58`,
`relation/predicate_builder/association_query_value.rb`,
`relation/predicate_builder/polymorphic_array_value.rb`

**Est:** ~150 LOC

**Unlocks:** 31 tests in `where.test.ts`

---

## Track 2: Hash-form select (unlocks ~23 tests)

### PR R2: `select()` hash argument edge cases

**Problem:** `processSelectArgs` (query-methods.ts:1858) routes hash args
to `arelColumnAliasesFromHash` (line 1873), which already handles nested
object `{ table: { col: alias } }`, array `{ table: [col, col] }`, and
string/symbol alias cases. The 23 skipped tests cover edge cases the
existing handler doesn't cover:

- Expression-to-alias: `{ "UPPER(title)": "title" }` where the key is
  raw SQL, not a table name
- `select(nil)` should clear the select list but `String(nil)` produces
  the literal column name "null"
- Reserved-word aliases: `{ expr: :from, title: :group }`
- Non-existent field errors: `{ foo: :post_title }` should raise

**Files:**

- `relation/query-methods.ts:1873–1900` — `arelColumnAliasesFromHash` — extend
  for raw-SQL keys and reserved-word aliases
- `relation/query-methods.ts:1858` — `processSelectArgs` — add nil guard

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

### PR R5: Extend `Relation#inOrderOf` for expressions, associations, `filter: false`

**Problem:** `inOrderOf` is already implemented inline in
`relation.ts:959–1001` with active tests for basic usage (empty values,
enums, string columns, composition). The 4 skipped tests cover edge cases:

- Expression form: `inOrderOf(Arel.sql("..."), values)`
- Association joins: `inOrderOf` on a column from a joined association
- `filter: false` option: return all records, just reorder (don't filter)

**Files:**

- `relation.ts:959–1001` — extend existing `inOrderOf` for expression
  input and `filter: false` option

**Rails ref:** `relation/query_methods.rb` `in_order_of`

**Est:** ~40 LOC

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

## Recommended priority

Ordered by: (1) no unsatisfied dependencies, (2) tests unlocked per LOC,
(3) downstream unlock potential.

### Tier 1 — high leverage, no dependencies (start here)

All three are independent and can run in parallel.

| PR  | Tests | Est LOC | Why first                                                         |
| --- | ----- | ------- | ----------------------------------------------------------------- |
| R1  | 31    | ~150    | Highest unlock; gates R4; `where(author: record)` is table-stakes |
| R3  | 28    | ~80     | Best tests-per-LOC ratio; Arel order is core query API            |
| R2  | 23    | ~80     | Hash select is a commonly-hit DX gap                              |

### Tier 2 — moderate leverage or gated

| PR  | Tests | Est LOC | Depends on | Why                                         |
| --- | ----- | ------- | ---------- | ------------------------------------------- |
| R4  | 12    | ~60     | R1         | WhereChain enum — completes the WHERE track |
| R6a | 7     | ~40     | —          | Lock is a user-visible query API gap        |
| R5  | 4     | ~80     | —          | `inOrderOf` — standalone, clean scope       |

### Tier 3 — small or low urgency

| PR  | Tests | Est LOC | Depends on | Why                                           |
| --- | ----- | ------- | ---------- | --------------------------------------------- |
| R6c | 2     | ~40     | —          | Parameterized join strings                    |
| R6b | 1     | ~30     | —          | Having hash form — bundle with R6c if desired |
| R3b | 2     | ~60     | R3         | Select narrowing — niche, low urgency         |

### Recommended parallel lanes

- **Lane A:** R1 → R4 (WHERE association expansion → WhereChain enum)
- **Lane B:** R3 → R3b (Arel order → select narrowing)
- **Lane C:** R2 + R2b (hash select — standalone)
- **Lane D:** R6a + R6b + R6c (bundle all three small standalone PRs into one)

**Coverage:** 275 tests total.

- **Actionable here:** ~110 tests across 9 PRs (R1–R6c)
- **Cross-blocked:** ~47 tests (connection-pool P12, associations A5, Phase G fixtures)
- **Permanently skipped:** ~36 tests (load_async, GVL/fork, SimpleDelegator)
