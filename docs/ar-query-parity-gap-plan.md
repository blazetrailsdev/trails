# AR Query Parity Gap Closure Plan

One remaining gap tracked in
[`scripts/parity/canonical/query-known-gaps.json`](../scripts/parity/canonical/query-known-gaps.json).

## Completed

| Gap          | Fix                                      | PR   |
| ------------ | ---------------------------------------- | ---- |
| ar-55        | Nested table-keyed `where` hash          | #854 |
| ar-36, ar-37 | `whereMissing`/`whereAssociated` JOIN    | #856 |
| ar-32        | `inOrderOf` Rails parity                 | #863 |
| ar-16, ar-57 | `eagerLoad` JOIN + column-aliased SELECT | #899 |

## Remaining — ar-01 / ar-52 / ar-65: datetime precision

**Goal.** `Order.where(created_at: oneWeekAgo..now).toSql()` should emit second-precision
SQL matching Rails' `quoted_date` (no fractional seconds for unscaled DATETIME columns).

**Current behaviour.** When the frozen-at has non-zero ms (e.g. `175ms`):

```sql
... WHERE "orders"."created_at" BETWEEN '2026-04-18 17:53:16.175000' AND '2026-04-25 17:53:16.175000'
```

**Expected (Rails).**

```sql
... WHERE "orders"."created_at" BETWEEN '2026-04-18 17:53:16' AND '2026-04-25 17:53:16'
```

**Root cause.** Trails inlines dates from `Quoted` nodes with full precision. PR #845 added
bind extraction for `compileWithBinds`, but `toSql()` still inlines. The gap flakes
(closes when frozen-at lands on a whole second).

**Options:**

- **Option A (BindParam-first):** In `predicate-builder/basic-object-handler.ts` and
  `range-handler.ts`, wrap Date values in `new Nodes.BindParam(queryAttribute)` instead
  of `Quoted`. Add a `quotedDateForBind` branch in `visitBindParam` that truncates to
  seconds (matching Rails' default `quoted_date` for unscaled DATETIME). Do not change
  `visitQuoted` (INSERT precision preserved).
- **Option B (parity runner):** PR #850 adds `paramSql` + binds comparison. If merged,
  ar-01/52/65 may close in the diff layer without trails code changes — the runner
  compares binds as ISO 8601 cross-side.

**Files:**

- `packages/activerecord/src/relation/predicate-builder/basic-object-handler.ts`
- `packages/activerecord/src/relation/predicate-builder/range-handler.ts`
- `packages/arel/src/visitors/to-sql.ts` — `visitBindParam`
- `scripts/parity/fixtures/ar-01/`, `ar-52/`, `ar-65/`

**Risk:** Medium — touches every WHERE clause in the suite. Must keep INSERT microsecond
precision and numeric/string predicates unchanged.

## References

- [Query parity verification doc](query-parity-verification.md)
- [`scripts/parity/canonical/query-known-gaps.json`](../scripts/parity/canonical/query-known-gaps.json)
