# Relation gap plan

275 skipped tests across 30 files. Organized into PR-sized work items
(~150–300 LOC each), ordered by unlock potential.

---

## Summary by cluster

This table is the original pre-cleanup landscape. Clusters whose PRs have
since shipped are marked ✓ — their residual edge cases (if any) are tracked
in **Post-merge follow-ups** below, not as open tracks. Only unmarked rows
remain open here.

| Cluster                                                   | Tests | Status / root cause                                                                                           |
| --------------------------------------------------------- | ----- | ------------------------------------------------------------------------------------------------------------- |
| WHERE with associations/polymorphic/CPK                   | 31    | ✓ R1 #2566 shipped (core path); residual nested/polymorphic/CPK edge cases — see follow-ups                   |
| load_async / FutureResult                                 | 28    | Ruby-thread-only; PERMANENT-SKIP                                                                              |
| Scoping — Arel nodes in `order()` / `reverseOrder`        | 20    | ✓ R3 #2551 shipped; residual reverseOrder `{raw}` double-flip — see follow-ups                                |
| Scoping — query cache + select narrowing                  | 8     | ✓ R3b #2573 shipped (select narrowing); 6 still need query cache (→ P12)                                      |
| Query cache                                               | 27    | Blocked on connection-pool (per-thread cache architecture)                                                    |
| Hash-form select                                          | 23    | ✓ R2 #2562 shipped (incl. `select(nil)`); residual raw-SQL keys/table-alias edge cases — see follow-ups       |
| WhereChain `.associated`/`.missing` with enums            | 12    | ✓ R4 #2582 shipped scoped-join enum cast (6 unskipped); 5 `missing with enum*` blocked on join table-aliasing |
| lock / FOR UPDATE                                         | 7     | ✓ R6a #2564 shipped; `lockValue` reader still missing — see follow-ups                                        |
| Standalone relation (joins, eager, race, fixture)         | 8     | Parameterized joins (2 — R6c deferred), eager_load toSql (3 → assoc A5), race/fixture/Ruby (3)                |
| Calculations with associations                            | 12    | Fixture-dependent + grouped association join                                                                  |
| `inOrderOf`                                               | 4     | ✓ R5 #2569 shipped; raw-SQL guard / type-cast follow-ups — see follow-ups                                     |
| Misc (batches, update-all, delegation, predicate-builder) | ~6    | Scattered single-test gaps                                                                                    |

---

## Track 4: WhereChain `.associated`/`.missing` with enums (R4 #2582 shipped — 5 remain)

The R4 scoped-join enum cast shipped (#2582): `Relation#_appendAssociationScope`
folds the reflection `scope:` lambda into the JOIN ON, unskipping the 5
`associated with enum*` tests + `missing with composite primary key`.

**Still blocked:** the 5 `missing with enum*` tests join `reading_listing`
(inner) AND left-join `unread_listing` — two has_one associations on the SAME
target table (Book) differentiated only by enum scope. Rails aliases the
second join; `_addAssocJoin` (`relation.ts` ~line 168) throws on the same-table
collision because join table-aliasing isn't implemented. They remain `it.skip`
with that root-cause note; they need the join-aliasing feature (large, separate
track), not a predicate-builder change.

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

R1, R2, R2b, R3, R3b, R4, R5, R6a, R6b shipped (#2566, #2562, #2551, #2573,
#2582, #2569, #2564). Remaining:

```
R6c (parameterized join strings — deferred, needs design decision)
```

## Recommended priority

| PR  | Tests | Est LOC | Depends on | Why                                                  |
| --- | ----- | ------- | ---------- | ---------------------------------------------------- |
| R6c | 2     | ~40     | —          | Parameterized join strings — deferred, design needed |

The remaining edge cases beyond R6c (join table-aliasing for `missing with
enum*`, raw-SQL/table-alias hash select, etc.) are itemized under
**Post-merge follow-ups** below.

**Coverage:** 275 tests total.

- **Remaining actionable here:** ~2 tests (R6c, deferred). The shipped
  R1/R2/R2b/R3/R3b/R4/R5/R6a/R6b work (~98 tests) is no longer counted.
- **Cross-blocked:** ~47 tests (connection-pool P12, associations A5,
  Phase G fixtures, join table-aliasing)
- **Permanently skipped:** ~36 tests (load_async, GVL/fork, SimpleDelegator)

---

## Post-merge follow-ups

Items surfaced after the shipped batch (R1 #2566, R2 #2562, R3 #2551,
R5 #2569, R6a+R6b #2564).

### Actionable PR queue

Open `[ ]` items bundled into ≤300-LOC work units, ordered by readiness.
Detail/rationale in the per-PR sections below.

**Ready now:**

- **RF1 — FK-derivation consolidation** (~40–60 LOC, refactor). Fold the four
  near-identical `derive_foreign_key` reimplementations in `relation.ts`
  (`_resolveAssociationTarget` ~584, `_resolveHasManySubquery` ~620,
  `_resolveHasManyJoin` ~655, `_resolveAssociationJoin` ~1455) into one helper
  mirroring `Reflection#derive_foreign_key`, plus a direct-assertion test sweep
  of the `.joins` string resolver's through/HABTM/STI branches. Files:
  `relation.ts`, `relation/where.test.ts`. Source: #2590.
- **RF2 — `where.test.ts` stub cleanup** (size TBD). Replace or remove the
  synthetic, non-Rails-named placeholder stubs at `relation/where.test.ts`
  ~252–498 with properly Rails-mirrored tests (verbatim name + body from
  `where_test.rb`), so test:compare can match. Files: `relation/where.test.ts`.
  Source: #2566.
- **RF3 — `inOrderOf` type-cast** (~10–20 LOC). Add `type_cast_for_database`
  value casting in `inOrderOf`. Files: `relation.ts` /
  `relation/query-methods.ts`. Source: #2569. (Surfaces only once a
  typed-column caller exists — low urgency.)

**Blocked / needs a design decision (not a clean PR yet):**

- **Join table-aliasing** (large, separate track) — two has_one associations to
  the same target table in one query. Unblocks the 5 `missing with enum*` tests
  (relation) and overlaps the associations H2 self-join work (AF6). Source:
  #2582.
- **Enum write-casting from string labels** — `create({ enumCol: "label" })` /
  `where({ enumCol: "label" })` store/compare as `null` instead of casting
  label → integer (enum _scope_ methods already cast). Source: #2582.
- **Select-narrowing edges** — `select with hash and table alias`, `... with few
tables` (per-join table aliasing); `reselect with default scope select`;
  `select`/`select`-block arity validation. Feature-gated. Source: #2562.
- **R6c — parameterized join strings** — `joins("... WHERE x = ?", value)` is
  not Rails-faithful (`joins(*args)` wraps in `Arel.sql`, no bind interpolation).
  Needs a design decision before any implementation. Source: #2564.
- **Async `inspect()`** — the unloaded path needs sync DB I/O Rails does but JS
  can't in a string-returning method; 4 `#inspect` + 3 `#pretty_print` tests
  stay on weakened assertions until an async-inspect API is designed. Source:
  #2617.

**From #2551 (R3 Arel order identity / reverseOrder):**

- [x] `reverseOrderBang` `{raw}` double-flip fixed (Done #2595) — now delegates
      to the Rails-faithful `reverseSqlOrder` helper.
- The 3 `reorder replaces existing order` tests have no verbatim Rails
  counterpart (Rails names this behavior `test_finding_with_reorder` /
  `test_reorder_deduplication` in `relations_test.rb`). Pre-existing in our
  suite. Don't rename in place — instead verify each maps to a real Rails
  test and, where it does, align body + name to that counterpart so
  test:compare matches; otherwise document the genuine test:compare gap.
- [x] `inspect()` Arel-node stringification fixed (Done #2617) — `inspect()`
      now stringifies live `Nodes.Node` objects in `_orderClauses`, and the
      loaded path renders Rails' `#<Class [records...]>` format (11-cap, `...`
      truncation). New follow-up (needs a design decision, not a quick fix):
      the UNLOADED `inspect()` path is fundamentally divergent — Rails does
      synchronous blocking DB I/O (`annotate("loading for inspect").take(n)`),
      which JS can't do in a string-returning method, so trails falls back to a
      query-chain representation. 4 `relations_test.rb` `#inspect` tests + 3
      `#pretty_print` tests stay on weakened (typeof / load-first) assertions
      with Rails-verbatim names; closing the gap likely needs an async inspect
      API.

**From #2562 (R2 hash-form select):**

- [x] `_buildProjections` bare-string literals/symbols now route through
      `arelColumns` (Done #2595) — `select with non field values` unskipped.
- Still skipped (blocked on other features): `select with hash and table
alias`, `select with hash argument with few tables` (need per-join table
  aliasing); `reselect with default scope select` (default_scope+select);
  `select without any arguments` + `select with block without any arguments`
  (need arity/block-form validation).

**From #2564 (R6 bundle — lock + having-hash):**

- [x] `Relation#lockValue` reader added (Done #2595).
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

- [x] `as:` polymorphic inverse FK id-column derivation fixed (Done #2590).
      The fix was solely in `relation.ts` `_resolveAssociationJoin` (the
      `.joins("assoc")` string resolver), NOT `builder/has-many.ts` +
      `reflection.ts` as the bullet originally pointed — both already derived
      `estimate_of_id` correctly (since #459). Follow-ups: (a) ~30–50 LOC
      refactor consolidating the four near-identical FK-derivation sites in
      `relation.ts` (`_resolveAssociationTarget` ~584, `_resolveHasManySubquery`
      ~620, `_resolveHasManyJoin` ~655, `_resolveAssociationJoin` ~1455) into
      one helper mirroring `Reflection#derive_foreign_key`; (b) ~10 LOC
      direct-assertion test sweep of the `.joins` string resolver's other
      branches (through, HABTM, STI) — actual-vs-expected tests sharing the
      same resolver are blind to column bugs.
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

- [x] `column_name_with_order_matcher` guard wired into `inOrderOf` (Done
      #2609). Other order-path callers (`order`/`reorder`) were already guarded
      via `resolveOrderMatcher`. Minor: `resolveColumnNameMatcher` vs
      `resolveColumnNameWithOrderMatcher` in `relation.ts` are near-duplicates —
      candidate for a shared helper.
- [ ] ~10-20 LOC: add `type_cast_for_database` value casting in `inOrderOf`
      once a typed-column caller surfaces the gap.
- belongsTo accessor returns `null` in minimal inline-model + handler-suite
  test setups: `await book.author === null` despite valid `author_id`. Join
  SQL + ordering correct; only accessor broken. Worth own investigation (may
  affect other association tests).

**From #2573 (R3b scoped-select hasAttribute):**

- `narrowToProjectedColumns` (`inheritance.ts`) uses `columnNames()`, which
  includes every declared `attribute()` (not just schema-reflected columns).
  Sound today (validators register no attributes; a declared attribute with no
  column fails on INSERT), but fragile: if trails ever gains true virtual/in-set
  attributes a projected SELECT would wrongly uninitialize them. The schema
  cache (`getCachedColumnsHash`) is the correct source but `isCached` is `false`
  under `defineSchema`-based tests. Revisit if in-set virtual attributes land.
- Implicit `id` PK is not tracked in `_attributes` for inline-declared models —
  `hasAttribute("id")` is false when `id` isn't in the projected row, whereas
  Rails retains the nil-initialized PK default. Pre-existing; orthogonal.

**From #2582 (R4 fold association scope into joins):**

- [ ] (large, separate track) Join table-aliasing — unblocks the 5 `missing
with enum*` tests (two has_one associations to the same target table in
      one query). Next actionable PR in the WhereChain enum track.
- [ ] (separate gap) Enum write-casting from string labels is NOT wired:
      `Model.create({ enumCol: "label" })` and `Model.where({ enumCol: "label" })`
      both store/compare as `null` instead of casting label → integer. Enum
      _scope_ methods (`Book.reading()`) DO cast correctly. This is why R4's
      fixture inserts raw integers and uses the generated enum scope method.
- `_appendAssociationScope` is anchored to JoinDependency
  (`join-dependency.ts:272-282`) as source of truth (converged after 5 Copilot
  rounds): invoke unconditionally via `invokeScopeLambda` with `owner=undefined`,
  no arity gate, no error rescue. Cite that convergence if reopened.
