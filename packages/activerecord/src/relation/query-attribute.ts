/**
 * QueryAttribute — a value object for use when constructing query conditions.
 *
 * Wraps a value with its type, memoizing cast and serialized values.
 *
 * Mirrors: ActiveRecord::Relation::QueryAttribute
 */

import type { Type } from "@blazetrails/activemodel";

type CastType = Pick<Type, "cast" | "serialize">;

export class QueryAttribute {
  readonly name: string;
  readonly valueBeforeTypeCast: unknown;
  readonly type: CastType;
  private _castValue: unknown = undefined;
  private _hasCastValue = false;
  private _serializedValue: unknown = undefined;
  private _hasSerialized = false;

  constructor(name: string, value: unknown, type: CastType) {
    this.name = name;
    this.valueBeforeTypeCast = value;
    this.type = type;
  }

  /**
   * Construct with an already-cast value (skips re-casting).
   */
  static withCastValue(name: string, value: unknown, type: CastType): QueryAttribute {
    const attr = new QueryAttribute(name, value, type);
    attr._castValue = value;
    attr._hasCastValue = true;
    return attr;
  }

  get value(): unknown {
    if (!this._hasCastValue) {
      this._castValue = this.type.cast(this.valueBeforeTypeCast);
      this._hasCastValue = true;
    }
    return this._castValue;
  }

  typeCast(): unknown {
    return this.value;
  }

  valueForDatabase(): unknown {
    if (!this._hasSerialized) {
      this._serializedValue = this.type.serialize(this.value);
      this._hasSerialized = true;
    }
    return this._serializedValue;
  }

  withCastValue(value: unknown): QueryAttribute {
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

  equals(other: QueryAttribute): boolean {
    if (this.name !== other.name) return false;
    if (this.valueBeforeTypeCast !== other.valueBeforeTypeCast) return false;
    if (this.type === other.type) return true;
    if ("equals" in this.type && typeof (this.type as any).equals === "function") {
      return (this.type as any).equals(other.type);
    }
    // Compare by constructor for proper Type classes (not plain objects)
    const thisCtor = this.type.constructor;
    const otherCtor = other.type.constructor;
    if (thisCtor !== Object && thisCtor === otherCtor) return true;
    return false;
  }
}
