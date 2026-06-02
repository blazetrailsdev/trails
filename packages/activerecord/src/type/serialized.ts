import { Type, ValueType, BinaryData } from "@blazetrails/activemodel";

/**
 * Structural JSON key used to compare a value against the coder's default.
 * Unwraps objects that expose `toHash()` (the HashWithIndifferentAccess
 * interface) so their contents — not their Map-backed internal shape — drive
 * the comparison. Mirrors Rails comparing `value == coder.load(nil)` by value
 * rather than by identity/`JSON.stringify`.
 *
 * @internal
 */
function canonicalKey(value: unknown): string {
  return JSON.stringify(value, (_k, v) =>
    v && typeof v === "object" && typeof (v as { toHash?: unknown }).toHash === "function"
      ? (v as { toHash(): unknown }).toHash()
      : v,
  );
}

export interface Coder {
  dump(value: unknown): string | null;
  load(value: unknown): unknown;
  objectClass?: new (...args: any[]) => any;
  assertValidValue?(value: unknown): void;
}

/**
 * A type that wraps another type with a serialization coder. Values are
 * serialized through the coder before being stored and deserialized when
 * loaded.
 *
 * Mirrors: ActiveRecord::Type::Serialized
 */
export class Serialized extends ValueType {
  readonly name = "serialized";
  readonly subtype: Type;
  readonly coder: Coder;

  private _defaultValue: unknown;
  private _defaultValueJson: string | undefined;

  constructor(subtype: Type, coder: Coder) {
    super();
    this.subtype = subtype;
    this.coder = coder;
    this._defaultValue = coder.load(null);
    if (typeof this._defaultValue === "object" && this._defaultValue !== null) {
      try {
        this._defaultValueJson = canonicalKey(this._defaultValue);
      } catch {
        this._defaultValueJson = undefined;
      }
    }
  }

  accessor(): unknown {
    return null;
  }

  deserialize(value: unknown): unknown {
    if (this.isDefaultValue(value)) return value;
    const deserialized = this.subtype.deserialize?.(value) ?? value;
    return this.coder.load(deserialized);
  }

  cast(value: unknown): unknown {
    // A string (or null) is treated as an already-encoded payload and
    // deserialized directly. A structured value (Hash/Array/coder object) is
    // round-tripped through the coder — `deserialize(serialize(value))` — so
    // assigning e.g. a class-coder instance loads back through the coder.
    // Mirrors ActiveModel::Type::Helpers::Mutable#cast for the structured case
    // while still accepting pre-serialized string assignments.
    if (value === null || value === undefined || typeof value === "string") {
      return this.deserialize(value);
    }
    return this.deserialize(this.serialize(value));
  }

  serialize(value: unknown): unknown {
    if (value === null || value === undefined) return null;
    if (this.isDefaultValue(value)) return null;
    const dumped = this.coder.dump(value);
    if (this.subtype.serialize) {
      return this.subtype.serialize(dumped);
    }
    return dumped;
  }

  override isChangedInPlace(rawOldValue: unknown, value: unknown): boolean {
    const oldSerialized = this.serialize(this.deserialize(rawOldValue));
    const newSerialized = this.serialize(value);
    return oldSerialized !== newSerialized;
  }

  assertValidValue(value: unknown): void {
    if (this.coder.assertValidValue) {
      this.coder.assertValidValue(value);
    }
  }

  override isForceEquality(value: unknown): boolean {
    return this.coder.objectClass !== undefined && value instanceof this.coder.objectClass;
  }

  override isSerialized(): boolean {
    return true;
  }

  // Rails: Serialized uses DelegateClass so binary? delegates to subtype automatically.
  override isBinary(): boolean {
    return this.subtype.isBinary();
  }

  private isDefaultValue(value: unknown): boolean {
    if (value === this._defaultValue) return true;
    if (value === null || value === undefined)
      return this._defaultValue === null || this._defaultValue === undefined;
    if (typeof value === "object" && this._defaultValueJson !== undefined) {
      try {
        return canonicalKey(value) === this._defaultValueJson;
      } catch {
        return false;
      }
    }
    return false;
  }
}

/**
 * Returns the encoded (serialized) representation of a value, or undefined
 * if the value equals the default. Used for changed_in_place? detection.
 *
 * Mirrors: ActiveRecord::Type::Serialized#encoded (private)
 *
 * @internal
 */
export function encoded(serialized: Serialized, value: unknown): unknown {
  // Use the constructor-cached default to avoid calling coder.load(null) again,
  // which would produce a fresh object on every call and break reference equality.
  const s = serialized as any;
  const defaultVal = s._defaultValue;
  if (value === defaultVal) return undefined;
  if (typeof value === "object" && value !== null && s._defaultValueJson !== undefined) {
    try {
      if (canonicalKey(value) === s._defaultValueJson) return undefined;
    } catch {
      // non-serializable; treat as non-default
    }
  }
  const payload = serialized.coder.dump(value);
  // Rails: if payload && subtype.binary? → ActiveModel::Type::Binary::Data.new(payload)
  if (
    payload &&
    ((serialized.subtype as any).binary?.() ?? (serialized.subtype as any).isBinary?.())
  ) {
    return new BinaryData(payload);
  }
  return payload;
}
