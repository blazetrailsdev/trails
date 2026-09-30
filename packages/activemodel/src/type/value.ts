import { registerConstant } from "@blazetrails/activesupport";
import { rbInspect as inspect, rbEqual } from "@blazetrails/ruby-compat";
import { NoMethodError } from "../attribute-assignment.js";

export interface ValueType<T = unknown> {
  readonly precision: number | null;
  readonly scale: number | null;
  readonly limit: number | null;
}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ValueType<T = unknown> {
  constructor(options?: {
    precision?: number | null;
    scale?: number | null;
    limit?: number | null;
  }) {
    const self = this as { -readonly [K in "precision" | "scale" | "limit"]: number | null };
    const proto = Object.getPrototypeOf(this) as object;
    if (!("precision" in proto)) self.precision = options?.precision ?? null;
    if (!("scale" in proto)) self.scale = options?.scale ?? null;
    if (!("limit" in proto)) self.limit = options?.limit ?? null;
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

registerConstant("ActiveModel::Type::Value", ValueType);
