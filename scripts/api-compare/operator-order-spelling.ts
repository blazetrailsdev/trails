/**
 * Per-CLASS resolution of Ruby OPERATOR methods (`[]`, `==`, `<=>`, …) to their
 * TS spelling for the method-ORDER manifest (build-rails-file-structure-manifest.ts).
 *
 * api-compare's `rubyMethodToTs` returns `null` for every operator (they carry
 * no canonical camelCase spelling), so an operator a Rails class defines has a
 * real source POSITION but no mapping — the manifest builder would treat its TS
 * port as an unmapped helper and shove it past the mapped block, degrading
 * fidelity (e.g. `Arel::Table#[]` at table.rb:82, between `having`:78 and
 * `hash`:88, ports to `table.ts` `get` but sorts last).
 *
 * A name-only GLOBAL map is unsafe: `[]` ports to `get` in `Arel::Table` /
 * `ActiveModel::Errors` / `LazyAttributeHash`, but to `getAttribute` in
 * `ActiveModel::AttributeSet` — where `get` (attribute-set.ts:63/296) is instead
 * a non-Rails Map-compat invention. Mapping `[]`→`get` globally would promote
 * that invention into Rails' `[]` slot (tried and reverted in #5030). So the
 * table is keyed per Ruby fqn: each (fqn, operator) resolves to the spelling
 * that class's port actually uses. An operator not listed here for a class stays
 * unmapped and sorts after the mapped block, exactly as before.
 *
 * Each entry is verified against BOTH the Rails source position and the actual
 * TS class member; only add an operator once the port's spelling is confirmed.
 */
import { OPERATORS } from "./conventions.js";

// (Ruby fqn) → (operator) → ordered TS spelling candidates. Candidates mirror
// `rubyMethodToTs`'s multi-name shape: the rule filters to spellings actually
// present in the container, so listing more than one is a safe no-op.
export const OPERATOR_SPELLING_BY_FQN: Record<string, Record<string, string[]>> = {
  // arel/table.rb:82 `def [](name, table = self)` → table.ts `get`.
  "Arel::Table": { "[]": ["get"] },
  // active_model/errors.rb:229 `def [](attribute)` → errors.ts `get`.
  "ActiveModel::Errors": { "[]": ["get"] },
  // attribute_set/builder.rb:110 `def [](key)` → builder.ts `LazyAttributeHash#get`.
  "ActiveModel::AttributeSet::LazyAttributeHash": { "[]": ["get"] },
  // attribute_set.rb:16 `def [](name)` → attribute-set.ts `getAttribute` (NOT the
  // Map-compat `get` invention at attribute-set.ts:296).
  "ActiveModel::AttributeSet": { "[]": ["getAttribute"] },
};

/**
 * TS spelling candidates for a Ruby operator method on a given class, or
 * `undefined` when `name` is not an operator or the class has no verified entry.
 */
export function operatorSpelling(fqn: string, name: string): string[] | undefined {
  if (!OPERATORS.has(name)) return undefined;
  return OPERATOR_SPELLING_BY_FQN[fqn]?.[name];
}
