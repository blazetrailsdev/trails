export abstract class Type<T = unknown> {
  abstract readonly name: string;
  readonly precision?: number;
  readonly limit?: number;
  protected readonly _scale?: number;

  constructor(options?: { precision?: number; scale?: number; limit?: number }) {
    if (options?.precision !== undefined) this.precision = options.precision;
    if (options?.scale !== undefined) this._scale = options.scale;
    if (options?.limit !== undefined) this.limit = options.limit;
  }

  /**
   * Rails defines `scale` as a method (`def scale; @scale; end`) so
   * subclasses like OID::Money can override with a constant value.
   * Expose it as a getter here so subclass `override get scale()` works.
   */
  get scale(): number | undefined {
    return this._scale;
  }

  abstract cast(value: unknown): T | null;

  type(): string {
    return this.name;
  }

  deserialize(value: unknown): T | null {
    return this.cast(value);
  }

  serialize(value: unknown): unknown {
    return value;
  }

  serializeCastValue(value: T | null): unknown {
    return value;
  }

  /**
   * Mirrors: ActiveModel::Type::SerializeCastValue#itself_if_serialize_cast_value_compatible
   * (serialize_cast_value.rb:36-38)
   *
   *   def itself_if_serialize_cast_value_compatible
   *     self if self.class.serialize_cast_value_compatible?
   *   end
   *
   * Returns `this` when the type's serialize path can short-circuit
   * through serialize_cast_value (i.e. the subclass has overridden
   * serialize_cast_value at the same level or above its `serialize`
   * override). Returns null otherwise. Callers can use this predicate
   * to choose the cast-value fast-path via `serializeCastValue(...)`
   * instead of a redundant `serialize(...)` call. Rails wires that
   * dispatcher at `serialize_cast_value.rb:25-33`; trails callers do
   * the same check inline against this method's truthiness.
   */
  itselfIfSerializeCastValueCompatible(): this | null {
    return (
      this.constructor as unknown as { serializeCastValueCompatible(): boolean }
    ).serializeCastValueCompatible()
      ? this
      : null;
  }

  /**
   * Mirrors: ActiveModel::Type::SerializeCastValue::ClassMethods#serialize_cast_value_compatible?
   * (serialize_cast_value.rb:9-12). Result is memoized on the class:
   *
   *   return @serialize_cast_value_compatible if defined?(@serialize_cast_value_compatible)
   *
   * Walks the prototype chain to compare ancestor depth of `serialize`
   * vs `serializeCastValue` — compatible when serializeCastValue is
   * defined at or above serialize.
   */
  static serializeCastValueCompatible(this: { _serializeCastValueCompatible?: boolean }): boolean {
    // Per-class memoization: JS static properties are inherited, so a
    // subclass that overrides serialize/serializeCastValue would otherwise
    // reuse a parent's cached result. Only treat the cache as set when it
    // is an own property of THIS constructor — Rails caches in @ivars on
    // the class object itself for the same reason (serialize_cast_value.rb:9-12).
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
    // Define as own property so subclasses don't read this through the
    // static prototype chain.
    Object.defineProperty(this, "_serializeCastValueCompatible", {
      value: result,
      writable: true,
      configurable: true,
    });
    return result;
  }

  isSerializable(_value: unknown): boolean {
    return true;
  }

  typeCastForSchema(value: unknown): string {
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

  map(value: T | null): T | null {
    return value;
  }

  assertValidValue(_value: unknown): void {}

  isSerialized(): boolean {
    return false;
  }

  isMutable(): boolean {
    return false;
  }

  asJson(): never {
    throw new Error("Unimplemented");
  }
}

export class ValueType<T = unknown> extends Type<T> {
  readonly name: string = "value";

  cast(value: unknown): T | null {
    // No-op default: pass the value through. Subclasses narrow by
    // overriding `cast` with a concrete return type.
    return value as T | null;
  }

  equals(other: Type): boolean {
    return this.constructor === other.constructor;
  }
}
