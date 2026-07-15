/**
 * QueryAttribute — a value object for use when constructing query conditions.
 *
 * Extends ActiveModel::Attribute so instanceof checks work throughout
 * the system (BindMap, visitors, Attribute#quotedNode, extractNodeValue).
 *
 * Mirrors: ActiveRecord::Relation::QueryAttribute < ActiveModel::Attribute
 */

import { Attribute, Type } from "@blazetrails/activemodel";
import { Substitute } from "../statement-cache.js";

type CastType = Pick<Type, "cast" | "serialize">;

/**
 * Wraps a duck-typed {cast, serialize} as a full Type for the
 * Attribute constructor.
 */
class DelegatingType extends Type<unknown> {
  readonly name = "query";
  private _delegate: CastType;

  constructor(delegate: CastType) {
    super();
    this._delegate = delegate;
  }

  cast(value: unknown): unknown {
    return this._delegate.cast(value);
  }

  override serialize(value: unknown): unknown {
    return this._delegate.serialize(value);
  }
}

function ensureType(type: CastType): Type {
  if (type instanceof Type) return type;
  return new DelegatingType(type);
}

export class QueryAttribute extends Attribute {
  /** Rails' `@_unboundable`; `undefined` stands in for `defined?` being false. @internal */
  private _unboundable?: 1 | -1 | false;

  constructor(name: string, value: unknown, type: CastType) {
    super(name, value, ensureType(type));
  }

  typeCast(value: unknown): unknown {
    return this.type.cast(value);
  }

  static override withCastValue(name: string, value: unknown, type: CastType): QueryAttribute {
    const attr = new QueryAttribute(name, value, type);
    attr.overrideCastValue(value);
    return attr;
  }

  override withCastValue(value: unknown): QueryAttribute {
    return QueryAttribute.withCastValue(this.name, value, this.type);
  }

  override get valueForDatabase(): unknown {
    return super.valueForDatabase;
  }

  // A query bind may hold an un-cast raw value (StatementCache substitution binds
  // via `withCastValue` without casting), so serialize through the FULL `serialize`
  // path — which, for a NormalizedValueType, casts+normalizes the raw value before
  // serializing (mirroring `type_for_attribute(name).serialize`). The base
  // `_valueForDatabase` fast-path is only correct for already-cast persisted values.
  protected override _valueForDatabase(): unknown {
    return this.type.serialize(this.value);
  }

  // Mirrors Rails QueryAttribute#nil? (query_attribute.rb:35-41): a bind is nil
  // not only when its raw value is nil, but also when the type carries a
  // `subtype` (enum) or `normalizer` and the value *serializes* to nil — so
  // `where(last_read: :forgotten)` (a label mapped to null) or an unknown enum
  // label routes through `IS NULL`. A StatementCache substitute is never nil.
  isNil(): boolean {
    if (this.valueBeforeTypeCast instanceof Substitute) return false;
    if (this.valueBeforeTypeCast === null || this.valueBeforeTypeCast === undefined) return true;
    const type = this.type as { subtype?: unknown; normalizer?: unknown };
    const hasSubtypeOrNormalizer = type.subtype !== undefined || type.normalizer !== undefined;
    if (!hasSubtypeOrNormalizer || !this.isSerializable()) return false;
    const forDatabase = this.valueForDatabase;
    return forDatabase === null || forDatabase === undefined;
  }

  /**
   * Mirrors: ActiveRecord::Relation::QueryAttribute#infinite?
   * (query_attribute.rb:42-44) — `infinity?(value_before_type_cast) ||
   * serializable? && infinity?(value_for_database)`. Yields the *sign*, not a
   * boolean, because Ruby's `Float#infinite?` returns `1 | -1 | nil`; Arel's
   * `Predications#between` reads it to pick which side of a range collapses.
   */
  isInfinite(): 1 | -1 | false {
    return (
      isInfinity(this.valueBeforeTypeCast) ||
      (this.isSerializable() && isInfinity(this.valueForDatabase))
    );
  }

  /**
   * Mirrors: ActiveRecord::Relation::QueryAttribute#unboundable?
   * (query_attribute.rb:45-51) —
   * `serializable? { |value| @_unboundable = value <=> 0 } && @_unboundable = nil`,
   * memoized behind `unless defined?(@_unboundable)`. `_unboundable === undefined`
   * is that `defined?` guard, so the `false` result caches too: Rails assigns on
   * both paths, and both `between` and the visitor read this.
   *
   * No exception handling, because Rails has none here: `serializable?`
   * (attribute.rb:62-64) delegates to `Type#serializable?`, which is a
   * predicate — `Integer#serializable?` (integer.rb:74-80) tests `in_range?`
   * and yields the *cast* value to the block rather than raising. A serializer
   * error is therefore never swallowed; it propagates as in Rails.
   */
  isUnboundable(): 1 | -1 | false {
    if (this._unboundable === undefined) {
      // Ruby's `value <=> 0` on the value `serializable?` yields, which is
      // `cast(value)` (integer.rb:75). `this.value` is already cast here —
      // trails' `typeCast` above casts, where Rails' QueryAttribute#type_cast is
      // a no-op (query_attribute.rb:22-24) — so it is passed through as-is
      // rather than cast a second time.
      this._unboundable = this.isSerializable() ? false : compareToZero(this.value);
    }
    return this._unboundable;
  }
}

// private

/**
 * Mirrors: ActiveRecord::Relation::QueryAttribute#infinity? (query_attribute.rb:53-55)
 * — `value.respond_to?(:infinite?) && value.infinite?`. Returns the sign rather
 * than a boolean; see `isInfinite` above.
 *
 * `infinite?` ports to `isInfinite()`, the one spelling the protocol has across
 * the port — `Quoted` (casted.ts), `BindParam` (bind-param.ts), `UnboundableBound`
 * (predicate-builder/range-handler.ts) and arel's `infinitySign` all read it.
 * Rails has a single `respond_to?(:infinite?)` protocol, so this must not fork
 * into a second name: reading `infinite()` here made
 * `QueryAttribute(Quoted(INFINITY)).infinite?` false while `infinitySign` said 1.
 *
 * @internal
 */
function isInfinity(value: unknown): 1 | -1 | false {
  if (value === Infinity) return 1;
  if (value === -Infinity) return -1;
  if (value === null || value === undefined) return false;
  const fn = (value as { isInfinite?: unknown }).isInfinite;
  if (typeof fn !== "function") return false;
  const result = (fn as () => unknown).call(value);
  if (result === 1 || result === -1) return result;
  return false;
}

/**
 * Ruby's `value <=> 0` for the numeric shapes a bound can take. Only the sign is
 * used; a non-numeric value that failed serialization is treated as past the
 * upper bound.
 *
 * @internal
 */
function compareToZero(value: unknown): 1 | -1 {
  if (typeof value === "bigint") return value >= 0n ? 1 : -1;
  if (typeof value === "number") return value >= 0 ? 1 : -1;
  return 1;
}
