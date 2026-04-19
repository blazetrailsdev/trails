/**
 * QueryAttribute — a value object for use when constructing query conditions.
 *
 * Extends ActiveModel::Attribute so instanceof checks work throughout
 * the system (BindMap, visitors, buildCasted, extractNodeValue).
 *
 * Mirrors: ActiveRecord::Relation::QueryAttribute < ActiveModel::Attribute
 */

import { Attribute, Type } from "@blazetrails/activemodel";

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

  isNil(): boolean {
    return this.valueBeforeTypeCast === null || this.valueBeforeTypeCast === undefined;
  }

  isInfinite(): boolean {
    const v = this.valueBeforeTypeCast;
    return v === Infinity || v === -Infinity;
  }

  isUnboundable(): boolean {
    return false;
  }
}
