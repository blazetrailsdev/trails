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
import { OPERATORS } from "@blazetrails/parity/conventions";

// (Ruby fqn) → (operator) → ordered TS spelling candidates. Candidates mirror
// `rubyMethodToTs`'s multi-name shape: the rule filters to spellings actually
// present in the container, so listing more than one is a safe no-op.
export const OPERATOR_SPELLING_BY_FQN: Record<string, Record<string, string[]>> = {
  // arel/math.rb:5-41 — the arithmetic/bitwise mixin. Every operator has a
  // named counterpart on math.ts's `Math` mixin object, one per Ruby `def`:
  // `*`:5 `+`:9 `-`:13 `/`:17 `&`:21 `|`:25 `^`:29 `<<`:33 `>>`:37 `~@`:41.
  // math.ts ports the mixin as an object literal, which the ORDER rule (it
  // reads top-level function declarations only) reports as a dropped bucket —
  // the pin is what makes that drop visible rather than silent, so keep it.
  "Arel::Math": {
    "*": ["multiply"],
    "+": ["add"],
    "-": ["subtract"],
    "/": ["divide"],
    "&": ["bitwiseAnd"],
    "|": ["bitwiseOr"],
    "^": ["bitwiseXor"],
    "<<": ["bitwiseShiftLeft"],
    ">>": ["bitwiseShiftRight"],
    "~@": ["bitwiseNot"],
  },
  // arel/table.rb:82 `def [](name, table = self)` → table.ts `get`.
  "Arel::Table": { "[]": ["get"] },
  // active_model/errors.rb:229 `def [](attribute)` → errors.ts `get`.
  "ActiveModel::Errors": { "[]": ["get"] },
  // attribute_set/builder.rb:110 `def [](key)` → builder.ts
  // `LazyAttributeHash#getAttribute`, and :114 `def []=(key, value)` → `set`,
  // the same spellings AttributeSet uses below (RFC 0115 retired the Map-facade
  // `get`/`has` pair this class used to carry). The class is declared at
  // builder.rb:94 directly under `module ActiveModel`, so its fqn is NOT nested
  // under `AttributeSet`.
  "ActiveModel::LazyAttributeHash": { "[]": ["getAttribute"], "[]=": ["set"] },
  // attribute_set.rb:16 `def [](name)` → attribute-set.ts `getAttribute`, and
  // :20 `def []=(name, value)` → `set`, which takes the `Attribute` Rails
  // stores (RFC 0115 retired the bare-value Map-compat sibling it used to be).
  "ActiveModel::AttributeSet": { "[]": ["getAttribute"], "[]=": ["set"] },
  // attribute.rb:115 `def ==(other)` → attribute.ts `equals`.
  "ActiveModel::Attribute": { "==": ["equals"] },
  // type/value.rb:121 `def ==(other)` → type/value.ts `equals`.
  "ActiveModel::Type::Value": { "==": ["equals"] },
  // error.rb:190 `def ==(other)` → error.ts `equals`.
  "ActiveModel::Error": { "==": ["equals"] },
  // naming.rb:151 `delegate :==, :===, :<=>, :=~, :"!~", :eql?, …, to: :name` →
  // naming.ts `equals`, `caseEquals` and `compare` (`eql?` is not an operator;
  // it ports as `eql` and `rubyMethodToTs` already spells it). `=~` and `!~`
  // stay UNMAPPED under the naming.rb entry in `SCOPED_SKIP_GROUPS`, which
  // carries the reason.
  "ActiveModel::Name": { "==": ["equals"], "===": ["caseEquals"], "<=>": ["compare"] },
  // abstract_adapter.rb:252 `def <=>(version_string)` → abstract-adapter.ts
  // `compare`. `Version` does `include Comparable`, so `>=` / `<` are derived
  // and have no TS member of their own.
  "ActiveRecord::ConnectionAdapters::AbstractAdapter::Version": { "<=>": ["compare"] },
  // core.rb:631 `def ==(comparison_object)` / :665 `def <=>(other_object)` →
  // core.ts `equals` / `compare`. The aliased `eql?` (:637) has no TS member.
  "ActiveRecord::Core": { "==": ["equals"], "<=>": ["compare"] },
  // association_relation.rb:14 `def ==(other)` → association-relation.ts `equals`.
  "ActiveRecord::AssociationRelation": { "==": ["equals"] },
  // reflection.rb:440 `def ==(other_aggregation)` → reflection.ts `equals`
  // (on `MacroReflection`, declared reflection.rb:369).
  "ActiveRecord::Reflection::MacroReflection": { "==": ["equals"] },
  // relation/from_clause.rb:21 `def ==(other)` → relation/from-clause.ts `equals`.
  "ActiveRecord::Relation::FromClause": { "==": ["equals"] },
  // relation/where_clause.rb:14 `def +(other)` / :18 `def -(other)` / :22
  // `def |(other)` / :75 `def ==(other)` → relation/where-clause.ts `plus` /
  // `minus` / `union` / `equals`. `|` keeps the `union` spelling the class
  // already used for Ruby `Array#|`.
  "ActiveRecord::Relation::WhereClause": {
    "+": ["plus"],
    "-": ["minus"],
    "|": ["union"],
    "==": ["equals"],
  },
  // connection_adapters/mysql/type_metadata.rb:18 `def ==(other)` →
  // connection-adapters/mysql/type-metadata.ts `equals`.
  "ActiveRecord::ConnectionAdapters::MySQL::TypeMetadata": { "==": ["equals"] },
  // connection_adapters/postgresql/type_metadata.rb:20 `def ==(other)` →
  // connection-adapters/postgresql/type-metadata.ts `equals`.
  "ActiveRecord::ConnectionAdapters::PostgreSQL::TypeMetadata": { "==": ["equals"] },
  // connection_adapters/column.rb:75 `def ==(other)` →
  // connection-adapters/column.ts `Column#equals`. The aliased `eql?` and the
  // paired `hash` (:87) are SKIP_GROUPS members, so `==` is the only mapped
  // member of the trio.
  "ActiveRecord::ConnectionAdapters::Column": { "==": ["equals"] },
  // connection_adapters/sql_type_metadata.rb:19 `def ==(other)` →
  // connection-adapters/sql-type-metadata.ts `equals`.
  "ActiveRecord::ConnectionAdapters::SqlTypeMetadata": { "==": ["equals"] },
  // connection_adapters/postgresql/column.rb:64 `def ==(other)` →
  // connection-adapters/postgresql/column.ts `Column#equals`.
  "ActiveRecord::ConnectionAdapters::PostgreSQL::Column": { "==": ["equals"] },
  // connection_adapters/sqlite3/column.rb:46 `def ==(other)` →
  // connection-adapters/sqlite3/column.ts `Column#equals`.
  "ActiveRecord::ConnectionAdapters::SQLite3::Column": { "==": ["equals"] },
  // encryption/message.rb:21 `def ==(other_message)` →
  // encryption/message.ts `equals`.
  "ActiveRecord::Encryption::Message": { "==": ["equals"] },
  // active_model/type/binary.rb:56 `def ==(other)` →
  // activemodel/src/type/binary.ts `Data#equals`.
  "ActiveModel::Type::Binary::Data": { "==": ["equals"] },
  // connection_adapters/postgresql/utils.rb:30 `def ==(o)` →
  // connection-adapters/postgresql/utils.ts `Name#equals`.
  "ActiveRecord::ConnectionAdapters::PostgreSQL::Name": { "==": ["equals"] },
  // attribute_methods.rb:415 `def [](attr_name)` / :428 `def []=(attr_name, value)`
  // → attribute-methods.ts `get` / `set`.
  "ActiveRecord::AttributeMethods": { "[]": ["get"], "[]=": ["set"] },
  // connection_adapters/statement_pool.rb:23 `def [](key)` / :31 `def []=(sql, stmt)`
  // → connection-adapters/statement-pool.ts `get` / `set`.
  "ActiveRecord::ConnectionAdapters::StatementPool": { "[]": ["get"], "[]=": ["set"] },
  // encryption/properties.rb:20 `delegate :==, :[], to: :data` / :50
  // `def []=(key, value)` → encryption/properties.ts `equals` / `get` / `set`.
  "ActiveRecord::Encryption::Properties": {
    "==": ["equals"],
    "[]": ["get"],
    "[]=": ["set"],
  },
  // abstract/schema_definitions.rb:421 `def [](name)` →
  // connection-adapters/abstract/schema-definitions.ts `TableDefinition#get`.
  "ActiveRecord::ConnectionAdapters::TableDefinition": { "[]": ["get"] },
  // result.rb:148 `def [](idx)` → result.ts `at` (Result declares no `at` in
  // Ruby, so the name is free).
  "ActiveRecord::Result": { "[]": ["at"] },
  // result.rb:58 `def ==(other)` / :80 `def [](column)` → result.ts `IndexedRow#equals`
  // / `IndexedRow#get`.
  "ActiveRecord::Result::IndexedRow": { "==": ["equals"], "[]": ["get"] },
  // messages/rotation_coordinator.rb:18 `def [](salt)` / :22 `def []=(salt, codec)`
  // → messages/rotation-coordinator.ts `get` / `set`.
  "ActiveSupport::Messages::RotationCoordinator": { "[]": ["get"], "[]=": ["set"] },
  // core_ext/range/compare_range.rb:16 `def ===(value)` →
  // core-ext/range/compare-range.ts `caseEquals` (the `include?` sibling at :42
  // maps through `rubyMethodToTs` as `isInclude` and needs no pin).
  "ActiveSupport::CompareWithRange": { "===": ["caseEquals"] },
  // rack-session abstract/id.rb:88 `def [](key)` → abstract/id.ts
  // `SessionHash#get`.
  "Rack::Session::Abstract::SessionHash": { "[]": ["get"] },
  // rack-session abstract/id.rb:462 `def [](key)` → abstract/id.ts
  // `SecureSessionHash#get`.
  "Rack::Session::Abstract::PersistedSecure::SecureSessionHash": { "[]": ["get"] },
  // railties configuration.rb:94 `def +(other)` → trailties configuration.ts
  // `MiddlewareStackProxy#plus`, the spelling `Relation::WhereClause` already
  // uses for Ruby `+`.
  "Rails::Configuration::MiddlewareStackProxy": { "+": ["plus"] },
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
