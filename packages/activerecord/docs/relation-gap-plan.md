# Relation gap plan

275 skipped tests across 30 files. Organized into PR-sized work items
(~150–300 LOC each), ordered by unlock potential.

---

## Summary by cluster

This table is the original pre-cleanup landscape. Clusters whose PRs have
since shipped are marked ✓ — their residual edge cases (if any) are tracked
in **Post-merge follow-ups** below, not as open tracks. Only unmarked rows
remain open here.

| Cluster                                                   | Tests | Status / root cause                                                                                     |
| --------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------- |
| WHERE with associations/polymorphic/CPK                   | 31    | ✓ R1 #2566 shipped (core path); residual nested/polymorphic/CPK edge cases — see follow-ups             |
| load_async / FutureResult                                 | 28    | Ruby-thread-only; PERMANENT-SKIP                                                                        |
| Scoping — Arel nodes in `order()` / `reverseOrder`        | 20    | ✓ R3 #2551 shipped; residual reverseOrder `{raw}` double-flip — see follow-ups                          |
| Scoping — query cache + select narrowing                  | 8     | 6 need query cache (→ P12), 2 need select narrowing (→ R3b)                                             |
| Query cache                                               | 27    | Blocked on connection-pool (per-thread cache architecture)                                              |
| Hash-form select                                          | 23    | ✓ R2 #2562 shipped (incl. `select(nil)`); residual raw-SQL keys/table-alias edge cases — see follow-ups |
| WhereChain `.associated`/`.missing` with enums            | 12    | R4 shipped scoped-join enum cast (6 unskipped); 5 `missing with enum*` blocked on join table-aliasing   |
| lock / FOR UPDATE                                         | 7     | ✓ R6a #2564 shipped; `lockValue` reader still missing — see follow-ups                                  |
| Standalone relation (joins, eager, race, fixture)         | 8     | Parameterized joins (2 — R6c deferred), eager_load toSql (3 → assoc A5), race/fixture/Ruby (3)          |
| Calculations with associations                            | 12    | Fixture-dependent + grouped association join                                                            |
| `inOrderOf`                                               | 4     | ✓ R5 #2569 shipped; raw-SQL guard / type-cast follow-ups — see follow-ups                               |
| Misc (batches, update-all, delegation, predicate-builder) | ~6    | Scattered single-test gaps                                                                              |

---

## Track 3: Arel nodes in `order()` + `reverseOrder` (unlocks ~28 tests)

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

### PR R4: enum casting on `.associated`/`.missing` (scoped joins) — partially shipped

**Refined diagnosis:** the original "bypasses predicate builder" framing was
slightly off. `where.associated`/`where.missing` always condition on a NULL
(`Array(association_primary_key).index_with(nil)`), so the _condition value_
never needs enum casting. The enum integer mapping that the Rails tests
exercise comes from the association's macro-time **scope** (e.g.
`has_one :reading_listing, -> { reading }, foreign_key: :last_read`): Rails'
`joins(:assoc)` folds that scope into the JOIN ON, and the scope's
`where(last_read: :reading)` casts `:reading → 2`. Our `_resolveAssociationJoin`
(the builder behind `joins(assoc)` and `where.associated`/`missing`) dropped
the scope entirely, so `last_read = 2` never reached the SQL.

**Shipped:** `Relation#_appendAssociationScope` now folds the reflection
`scope:` lambda into the belongsTo / hasOne / hasMany JOIN ON, mirroring
`JoinDependency` (join-dependency.ts:272–282). This unskips the 5
`associated with enum*` tests + `missing with composite primary key`.

**Still blocked (follow-up):** the 5 `missing with enum*` tests join
`reading_listing` (inner) AND left-join `unread_listing` — two has_one
associations on the SAME target table (Book) differentiated only by enum
scope. Rails aliases the second join; `_addAssocJoin` throws on the
same-table collision because join table-aliasing isn't implemented. These
remain `it.skip` with that root-cause note; they need the join-aliasing
feature, not a predicate-builder change.

**Files:** `relation.ts` (`_appendAssociationScope` + 2 call sites in
`_resolveAssociationJoin`).

**Rails ref:** `query_methods/where_chain.rb:88–104` (`associated`),
`query_methods/where_chain.rb:50–86` (`missing`); `author.rb:175–176`.

**Depends on:** PR R1 ✓ (association-key expansion, shipped #2566)

---

## Track 6: Standalone relation gaps (unlocks ~20 actionable tests)

### PR R6c: Parameterized join strings

**Problem:** `joins("INNER JOIN ... WHERE x = ?", value)` — interpolated
bind parameters in join string not implemented.

**Files:**

- `relation/query-methods.ts` — `joins` string-with-binds branch

**Note:** deliberately NOT shipped with the R6 bundle (#2564). Rails
`joins(*args)` wraps string joins in `Arel.sql` with no bind interpolation,
so `joins("... WHERE x = ?", value)` is not Rails-faithful. Needs a design
decision before any implementation (see post-merge follow-ups from #2564).

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

R1, R2, R2b, R3, R5, R6a, R6b shipped (#2566, #2562, #2551, #2569, #2564).
Remaining:

```
R4 (WhereChain enum — R1 association-key expansion shipped #2566)

R3b (select narrowing — same scoping area as shipped R3)

R6c (parameterized join strings — deferred, needs design decision)
```

## Recommended priority

Ordered by: (1) no unsatisfied dependencies, (2) tests unlocked per LOC,
(3) downstream unlock potential.

### Tier 2 — moderate leverage or gated

| PR  | Tests | Est LOC | Depends on | Why                                         |
| --- | ----- | ------- | ---------- | ------------------------------------------- |
| R4  | 12    | ~60     | R1 ✓       | WhereChain enum — completes the WHERE track |

### Tier 3 — small or low urgency

| PR  | Tests | Est LOC | Depends on | Why                                                  |
| --- | ----- | ------- | ---------- | ---------------------------------------------------- |
| R6c | 2     | ~40     | —          | Parameterized join strings — deferred, design needed |
| R3b | 2     | ~60     | R3 ✓       | Select narrowing — niche, low urgency                |

### Recommended parallel lanes

- **Lane A:** R4 (WhereChain enum — R1 association expansion shipped)
- **Lane B:** R3b (select narrowing — R3 shipped)

**Coverage:** 275 tests total.

- **Remaining actionable here:** ~16 tests across 3 PRs (R4, R3b, R6c).
  The shipped R1/R2/R2b/R3/R5/R6a/R6b work (~94 tests) is no longer counted.
- **Cross-blocked:** ~47 tests (connection-pool P12, associations A5, Phase G fixtures)
- **Permanently skipped:** ~36 tests (load_async, GVL/fork, SimpleDelegator)

---

## Post-merge follow-ups

Items surfaced after the shipped batch (R1 #2566, R2 #2562, R3 #2551,
R5 #2569, R6a+R6b #2564).

**From #2551 (R3 Arel order identity / reverseOrder):**

- [ ] ~10-20 LOC: fix pre-existing double-flip bug in `reverseOrderBang`'s
      `{raw}` clause branch (`query-methods.ts ~line 1119`). Chained `.replace`
      flips ASC→DESC then back. Also doesn't split comma-separated terms. Best
      fix: refactor to delegate to existing `reverseSqlOrder` helper
      (`query-methods.ts:1432`) which is fully implemented but dead code.
      Eliminates duplicate logic + divergent error message ("Relation has a
      non-reversible order" vs Rails' "Order ... cannot be reversed
      automatically").
- The 3 `reorder replaces existing order` tests have no verbatim Rails
  counterpart (Rails names this behavior `test_finding_with_reorder` /
  `test_reorder_deduplication` in `relations_test.rb`). Pre-existing in our
  suite. Don't rename in place — instead verify each maps to a real Rails
  test and, where it does, align body + name to that counterpart so
  test:compare matches; otherwise document the genuine test:compare gap.
- `inspect()` at `relation.ts:1026` JSON.stringify's `_orderClauses` which
  may hold live `Nodes.Node` objects (partial stringify). Cosmetic only.

**From #2562 (R2 hash-form select):**

- [ ] ~15 LOC: route `_buildProjections` string args through `arelColumns`
      so bare literals (`"1"`, `"foo()"`, symbols) aren't table-qualified.
      Unskips `select with non field values`. Consider unifying
      `_buildProjections` with parallel `buildSelect`+`arelColumns` in
      query-methods.ts.
- Still skipped (blocked on other features): `select with hash and table
alias`, `select with hash argument with few tables` (need per-join table
  aliasing); `reselect with default scope select` (default_scope+select);
  `select without any arguments` + `select with block without any arguments`
  (need arity/block-form validation).

**From #2564 (R6 bundle — lock + having-hash):**

- [ ] ~5 LOC: add `Relation#lockValue` reader. Rails exposes `lock_value`
      (SINGLE_VALUE_METHODS); R6 shipped `isLocked` (mirrors `locked?`) but
      dropped `lockValue` as scope creep.
- Pre-existing internal divergence: Rails `lock!` stores `true` for default
  and lets Arel expand to `FOR UPDATE`; trails `lockBang` stores literal
  `"FOR UPDATE"` in `_lockValue`. SQL output identical. Strict `lock_value`
  parity would differ.
- **R6c (parameterized join strings) deliberately NOT shipped.** Rails
  `joins(*args)` wraps string joins in `Arel.sql` with no bind
  interpolation, so `joins("... WHERE x = ?", value)` is not Rails-faithful.
  Synthetic empty-body test `joins with string sql and string interpolation`
  (relations.test.ts:~1395) remains `it.skip`. Needs design decision before
  any implementation.

**From #2566 (R1 polymorphic/nested where):** test-only PR.

- [ ] ~30 LOC: fix `as:` polymorphic inverse FK _id_-column derivation.
      `has_many ..., as: "estimateOf"` emits correct TYPE constraint but derives
      FK id column from owner name (`treasure_id`) instead of `estimate_of_id`.
      Files: `src/associations/builder/has-many.ts` + `src/reflection.ts`.
- Still skipped (need join+fixture infra): `belongs to nested where with
relation`, `where not polymorphic id and type as nand`, `where not
association as nand`, `polymorphic nested array where not`, `type casting
nested joins`, `where with through association`, `where with relation on
has many association`, `where with relation on has one association`,
  `where on association with select relation`, `where on association with
collection polymorphic relation`.
- Type-system gaps: `where with rational for string column` (no JS
  Rational), `where with duration for string column` (ActiveSupport::Duration
  cast not wired).
- [ ] Cleanup: the synthetic, non-Rails-named stubs in
      `src/relation/where.test.ts` (lines ~252–498) are placeholders with no
      Rails counterpart — they don't mirror `where_test.rb`. Replace each
      with a properly Rails-mirrored test (verbatim name + body from the
      real counterpart) so test:compare can match it, or remove the
      placeholder. This is not a rename of existing Rails-mirrored tests.

**From #2569 (R5 inOrderOf extensions):**

- [ ] ~30-50 LOC: port `column_name_with_order_matcher` and wire
      `disallow_raw_sql!` guard into `inOrderOf` (and other order-path callers).
- [ ] ~10-20 LOC: add `type_cast_for_database` value casting in `inOrderOf`
      once a typed-column caller surfaces the gap.
- belongsTo accessor returns `null` in minimal inline-model + handler-suite
  test setups: `await book.author === null` despite valid `author_id`. Join
  SQL + ordering correct; only accessor broken. Worth own investigation (may
  affect other association tests).
