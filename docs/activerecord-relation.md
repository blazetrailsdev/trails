# ActiveRecord Relation: Road to 100%

Nearly all relation files are at 100%. The remaining gap is concentrated
in `relation/query_methods.rb`.

Run `pnpm run api:compare --package activerecord --missing` and filter to
`relation/` for the current snapshot.

## The remaining gap: query_methods.rb bang variants

Current: **45/84 methods matched (54%) — 39 missing, all bang variants.**

In Rails, every query method `foo` has a `foo!` variant that mutates
`self` instead of cloning. Our Relation creates a clone for every call
and has no bang path. Missing methods:

```
includes! eager_load! preload! references! _select! with! with_recursive!
reselect! group! regroup! order! reorder! unscope! joins! left_outer_joins!
where! invert_where! and! or! having! limit! offset! lock! none! readonly!
strict_loading! create_with! from! distinct! extending! optimizer_hints!
reverse_order! skip_query_cache! skip_preloading! annotate! uniq! excluding!
construct_join_dependency
null_relation?
```

(plus `null_relation?` → `isNullRelation` and `construct_join_dependency` →
`constructJoinDependency`, which aren't bang methods — they're regular
methods missing from the TS file.)

### Approach

Follow CLAUDE.md's Module Mixins pattern: define each bang as a `this`-typed
function in `relation/query-methods.ts`, assign on `Relation`.

```ts
// relation/query-methods.ts
export function whereBang(this: QueryMethodsHost, conditions: Record<string, unknown>): this {
  this._whereClause = this._whereClause.merge(new WhereClause(conditions));
  return this;
}

// relation.ts
import { whereBang } from "./relation/query-methods.js";

export class Relation<T> {
  whereBang = whereBang;
}
```

Under the hood, extract the existing non-bang query method bodies out of
`relation.ts` into `query-methods.ts`, parameterize them on mutate-vs-clone,
and have the non-bang `foo()` call `foo!` on a clone. That way both variants
share a single implementation.

Expected gain: query-methods.ts from 54% → ~95%+.
