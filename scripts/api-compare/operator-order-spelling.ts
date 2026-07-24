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
 * `ActiveModel::AttributeSet` — where `get` (attribute-set.ts) is instead
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
  // attribute_set/builder.rb:110 `def [](key)` → builder.ts `LazyAttributeHash#get`,
  // :114 `def []=(key, value)` → `set` (a faithful delegate-hash write, unlike
  // AttributeSet's `set` below). The class is declared at builder.rb:94 directly
  // under `module ActiveModel`, so its fqn is NOT nested under `AttributeSet`.
  "ActiveModel::LazyAttributeHash": { "[]": ["get"], "[]=": ["set"] },
  // attribute_set.rb:16 `def [](name)` → attribute-set.ts `getAttribute` (NOT the
  // Map-compat `get` invention in attribute-set.ts). `[]=` (attribute_set.rb:20)
  // stays UNMAPPED: attribute-set.ts `set` accepts a bare value and wraps it in
  // an `Attribute`, so it is the Map-compat sibling of `get`, not the `[]=` port.
  "ActiveModel::AttributeSet": { "[]": ["getAttribute"] },
  // attribute.rb:115 `def ==(other)` → attribute.ts `equals`.
  "ActiveModel::Attribute": { "==": ["equals"] },
  // type/value.rb:121 `def ==(other)` → type/value.ts `equals`.
  "ActiveModel::Type::Value": { "==": ["equals"] },
  // error.rb:190 `def ==(other)` → error.ts `equals`.
  "ActiveModel::Error": { "==": ["equals"] },
  // naming.rb:151 `delegate :==, :===, :<=>, …, to: :name` → naming.ts `equals`
  // and `compare`. `===` / `=~` share that line but have no TS member, so they
  // stay unmapped.
  "ActiveModel::Name": { "==": ["equals"], "<=>": ["compare"] },
  // association_relation.rb:14 `def ==(other)` → association-relation.ts `equals`.
  "ActiveRecord::AssociationRelation": { "==": ["equals"] },
  // reflection.rb:440 `def ==(other_aggregation)` → reflection.ts `equals`
  // (on `MacroReflection`, declared reflection.rb:369).
  "ActiveRecord::Reflection::MacroReflection": { "==": ["equals"] },
  // relation/from_clause.rb:21 `def ==(other)` → relation/from-clause.ts `equals`.
  "ActiveRecord::Relation::FromClause": { "==": ["equals"] },
  // connection_adapters/mysql/type_metadata.rb:18 `def ==(other)` →
  // connection-adapters/mysql/type-metadata.ts `equals`.
  "ActiveRecord::ConnectionAdapters::MySQL::TypeMetadata": { "==": ["equals"] },
  // connection_adapters/postgresql/type_metadata.rb:20 `def ==(other)` →
  // connection-adapters/postgresql/type-metadata.ts `equals`.
  "ActiveRecord::ConnectionAdapters::PostgreSQL::TypeMetadata": { "==": ["equals"] },
  // connection_adapters/postgresql/utils.rb:30 `def ==(o)` →
  // connection-adapters/postgresql/utils.ts `Name#equals`.
  "ActiveRecord::ConnectionAdapters::PostgreSQL::Name": { "==": ["equals"] },
  // connection_adapters/statement_pool.rb:23 `def [](key)` / :31 `def []=(sql, stmt)`
  // → connection-adapters/statement-pool.ts `get` / `set`.
  "ActiveRecord::ConnectionAdapters::StatementPool": { "[]": ["get"], "[]=": ["set"] },
  // encryption/properties.rb:20 `delegate :[], to: :data` / :50 `def []=(key, value)`
  // → encryption/properties.ts `get` / `set`.
  "ActiveRecord::Encryption::Properties": { "[]": ["get"], "[]=": ["set"] },
  // result.rb:148 `def [](idx)` → result.ts `at` (Result declares no `at` in
  // Ruby, so the name is free).
  "ActiveRecord::Result": { "[]": ["at"] },
  // result.rb:58 `def ==(other)` / :80 `def [](column)` → result.ts `IndexedRow#equals`
  // / `IndexedRow#get`.
  "ActiveRecord::Result::IndexedRow": { "==": ["equals"], "[]": ["get"] },
};

// `fqn#operator` keys this process has actually resolved. A key that is never
// resolved during a full manifest build is DEAD — the fqn (or the operator on
// it) does not exist in the Ruby API extract, so the entry silently does
// nothing. That is not hypothetical: the original
// `ActiveModel::AttributeSet::LazyAttributeHash` key never matched, because
// builder.rb:94 declares the class directly under `module ActiveModel`.
const usedKeys = new Set<string>();

/**
 * TS spelling candidates for a Ruby operator method on a given class, or
 * `undefined` when `name` is not an operator or the class has no verified entry.
 */
export function operatorSpelling(fqn: string, name: string): string[] | undefined {
  if (!OPERATORS.has(name)) return undefined;
  const spelling = OPERATOR_SPELLING_BY_FQN[fqn]?.[name];
  if (spelling) usedKeys.add(`${fqn}#${name}`);
  return spelling;
}

/**
 * `fqn#operator` keys never resolved since the last {@link resetOperatorSpellingUsage}.
 * Meaningful only after a FULL pass over the Ruby API (the manifest build), where
 * anything left over is a typo'd fqn or an operator the class no longer defines.
 */
export function unusedOperatorSpellings(): string[] {
  const unused: string[] = [];
  for (const [fqn, ops] of Object.entries(OPERATOR_SPELLING_BY_FQN)) {
    for (const op of Object.keys(ops)) {
      if (!usedKeys.has(`${fqn}#${op}`)) unused.push(`${fqn}#${op}`);
    }
  }
  return unused;
}

/** Clears resolution tracking, so a second pass starts from a clean slate. */
export function resetOperatorSpellingUsage(): void {
  usedKeys.clear();
}
