import {
  rbDeclareIvar,
  rbInspect as inspect,
  rbEqual,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { NoMethodError } from "../attribute-assignment.js";

export class ValueType<T = unknown> {
  private _precision: number | null;
  private _scale: number | null;
  private __limit: number | null;

  get precision(): number | null {
    return this._precision;
  }

  get scale(): number | null {
    return this._scale;
  }

  get limit(): number | null {
    return this.__limit;
  }

  constructor({
    precision = null,
    limit = null,
    scale = null,
  }: {
    precision?: number | null;
    limit?: number | null;
    scale?: number | null;
  } = {}) {
    this._precision = precision;
    this._scale = scale;
    this.__limit = limit;
  }

  isSerializable(value: unknown, _block?: (castValue: unknown) => void): boolean {
    return true;
  }

  type(): string | undefined {
    return undefined;
  }

  deserialize(value: unknown): T | null {
    return this.cast(value);
  }

  cast(value: unknown): T | null {
    if (value === null || value === undefined) return null;
    return this.castValue(value);
  }

  serialize(value: unknown): unknown {
    return value;
  }

  typeCastForSchema(value: unknown): unknown {
    return inspect(value);
  }

  isBinary(): boolean {
    return false;
  }

  isChanged(oldValue: unknown, newValue: unknown, _newValueBeforeTypeCast?: unknown): boolean {
    return !rbEqual(oldValue, newValue);
  }

  isChangedInPlace(_rawOldValue: unknown, _newValue: unknown): boolean {
    return false;
  }

  isValueConstructedByMassAssignment(_value: unknown): boolean {
    return false;
  }

  isForceEquality(_value: unknown): boolean {
    return false;
  }

  map(value: T | null, _block: (value: unknown) => unknown): T | null {
    return value;
  }

  equals(other: ValueType): boolean {
    return (
      this.constructor === other.constructor &&
      this.precision === other.precision &&
      this.scale === other.scale &&
      this.limit === other.limit
    );
  }

  assertValidValue(_: unknown): void {}

  isSerialized(): boolean {
    return false;
  }

  isMutable(): boolean {
    return false;
  }

  asJson(): never {
    throw new NoMethodError("Unimplemented");
  }

  /** @internal */
  protected castValue(value: unknown): T | null {
    return value as T | null;
  }

  serializeCastValue(value: T | null): unknown {
    return value;
  }

  itselfIfSerializeCastValueCompatible(): this | null {
    return (
      this.constructor as unknown as { serializeCastValueCompatible(): boolean }
    ).serializeCastValueCompatible()
      ? this
      : null;
  }

  static serializeCastValueCompatible(this: { _serializeCastValueCompatible?: boolean }): boolean {
    if (Object.hasOwn(this, "_serializeCastValueCompatible")) {
      return this._serializeCastValueCompatible as boolean;
    }
    let proto: object | null = (this as unknown as { prototype: object }).prototype;
    let serializeDepth = -1;
    let castDepth = -1;
    let depth = 0;
    while (proto && proto !== Object.prototype) {
      if (serializeDepth < 0 && Object.prototype.hasOwnProperty.call(proto, "serialize")) {
        serializeDepth = depth;
      }
      if (castDepth < 0 && Object.prototype.hasOwnProperty.call(proto, "serializeCastValue")) {
        castDepth = depth;
      }
      proto = Object.getPrototypeOf(proto);
      depth++;
    }
    const result = castDepth >= 0 && serializeDepth >= 0 && castDepth <= serializeDepth;
    Object.defineProperty(this, "_serializeCastValueCompatible", {
      value: result,
      writable: true,
      configurable: true,
    });
    return result;
  }
}

rbDeclareIvar(ValueType, "@precision", "_precision");
rbDeclareIvar(ValueType, "@scale", "_scale");
rbDeclareIvar(ValueType, "@limit", "__limit");

registerConstant("ActiveModel::Type::Value", ValueType);
