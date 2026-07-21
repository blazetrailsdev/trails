/**
 * Source-order merge for a Rails entity's two method buckets.
 *
 * `rails-api.json` splits an entity's methods into `instanceMethods` and
 * `classMethods`. Consumers that care about *file layout* (the
 * `rails-file-structure-method-order` manifest) must not simply concatenate
 * them: a Rails class whose `class << self` block sits at the TOP of the file
 * would have its factory methods demanded LAST. `activemodel/lib/
 * active_model/attribute.rb:7-24` defines `from_database` / `from_user` /
 * `with_cast_value` / `null` / `uninitialized` before `initialize` (:33).
 *
 * Constraints: no `node:` specifiers, no `process` references.
 */

/** The subset of a `rails-api.json` method entry this module needs. */
export interface SourcePositioned {
  /** 1-based source line, as recorded by `extract-ruby-api.rb`. */
  line?: number;
}

/**
 * Merge `instanceMethods` + `classMethods` into one list ordered by source
 * line.
 *
 * Entries without a `line` sort last while keeping their relative order, which
 * reproduces the historical instance-then-class append for any consumer reading
 * a `rails-api.json` written before the `line` field existed.
 *
 * The sort is stable and total, so restricting the result to the methods of any
 * single source file still yields that file's methods in ascending-line order —
 * which is what the manifest needs, since it buckets by `file` after ordering
 * (an entity's methods can span files when Rails reopens a class).
 */
export function mergeBySourceLine<T extends SourcePositioned>(
  instanceMethods: readonly T[] = [],
  classMethods: readonly T[] = [],
): T[] {
  return [...instanceMethods, ...classMethods]
    .map((m, i) => ({ m, i }))
    .sort((a, b) => {
      const al = a.m.line ?? Infinity;
      const bl = b.m.line ?? Infinity;
      return al === bl ? a.i - b.i : al - bl;
    })
    .map(({ m }) => m);
}
