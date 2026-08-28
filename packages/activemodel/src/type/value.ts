import { NoMethodError } from "../attribute-assignment.js";

export abstract class Type<T = unknown> {
  abstract readonly name: string;
  #precision?: number;
  #limit?: number;
  protected readonly _scale?: number;

  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    if (options?.precision !== undefined) this.#precision = options.precision;
    if (options?.scale !== undefined) this._scale = options.scale;
    if (options?.limit !== undefined) this.#limit = options.limit;
  }

  get precision(): number | undefined {
    return this.#precision;
  }

  get scale(): number | undefined {
    return this._scale;
  }

  get limit(): number | undefined {
    return this.#limit;
  }

  isSerializable(value: unknown, _block?: (castValue: unknown) => void): boolean {
    return true;
  }

  type(): string | undefined {
    return this.name;
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

  typeCastForSchema(value: unknown): string {
    if (typeof value === "bigint") return value.toString();
    return JSON.stringify(value) ?? String(value);
  }

  isBinary(): boolean {
    return false;
  }

  isChanged(oldValue: unknown, newValue: unknown, _newValueBeforeTypeCast?: unknown): boolean {
    return oldValue !== newValue;
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

export class ValueType<T = unknown> extends Type<T> {
  readonly name: string = "value";

  override type(): string | undefined {
    return this.name === "value" ? undefined : this.name;
  }

  equals(other: Type): boolean {
    return (
      this.constructor === other.constructor &&
      this.precision === other.precision &&
      this.scale === other.scale &&
      this.limit === other.limit
    );
  }
}
