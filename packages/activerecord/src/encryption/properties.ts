/**
 * Properties for encryption message headers.
 *
 * Mirrors: ActiveRecord::Encryption::Properties
 */

import { EncryptedContentIntegrity, ForbiddenClass } from "./errors.js";

const ALLOWED_TYPES = new Set(["string", "number", "boolean"]);

export class Properties {
  private _data = new Map<string, unknown>();

  constructor(initial?: Record<string, unknown>) {
    if (initial) {
      for (const [key, value] of Object.entries(initial)) {
        this._validateType(value);
        this._data.set(key, value);
      }
    }
  }

  /**
   * Mirrors: `delegate :==, to: :data` (properties.rb:20) — Hash equality,
   * which in Ruby is same-size plus per-key `==` on the values.
   *
   * Values are the types `validate_value_type` admits plus nested `Message`s
   * (message_serializer_test.rb:19 stores one), so the per-value comparison
   * dispatches to `Message#equals` and to byte equality for the Buffers a
   * deserialized payload carries — both of which are what Ruby's `==` reaches
   * for those same values.
   */
  equals(other: unknown): boolean {
    if (!(other instanceof Properties)) return false;
    if (this._data.size !== other._data.size) return false;
    for (const [key, value] of this._data) {
      if (!other._data.has(key)) return false;
      if (!valuesEqual(value, other._data.get(key))) return false;
    }
    return true;
  }

  get(key: string): unknown {
    return this._data.get(key);
  }

  set(key: string, value: unknown): void {
    if (this._data.has(key)) {
      throw new EncryptedContentIntegrity(`Can't override property '${key}': already set`);
    }
    this._validateType(value);
    this._data.set(key, value);
  }

  has(key: string): boolean {
    return this._data.has(key);
  }

  // Mirrors Rails' `delegate :each, :key?, to: :data` (properties.rb:20).
  each(fn: (key: string, value: unknown) => void): void {
    for (const [key, value] of this._data) {
      fn(key, value);
    }
  }

  isKey(key: string): boolean {
    return this._data.has(key);
  }

  add(props: Record<string, unknown> | Properties): void {
    const entries = props instanceof Properties ? props.entries() : Object.entries(props);
    for (const [key, value] of entries) {
      this.set(key, value);
    }
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, value] of this.data) {
      result[key] = value;
    }
    return result;
  }

  get size(): number {
    return this._data.size;
  }

  entries(): IterableIterator<[string, unknown]> {
    return this._data.entries();
  }

  get encrypted(): boolean {
    return this.get("e") === true;
  }

  set encrypted(value: boolean) {
    if (this._data.has("e")) {
      throw new EncryptedContentIntegrity("Can't override property 'e': already set");
    }
    this._data.set("e", value);
  }

  get encryptedDataKey(): string | undefined {
    return this.get("k") as string | undefined;
  }

  set encryptedDataKey(value: string | undefined) {
    this.set("k", value);
  }

  get encryptedDataKeyId(): string | undefined {
    return this.get("i") as string | undefined;
  }

  set encryptedDataKeyId(value: string | undefined) {
    this.set("i", value);
  }

  get iv(): string | undefined {
    return this.get("iv") as string | undefined;
  }

  get authTag(): string | undefined {
    return this.get("at") as string | undefined;
  }

  validateValueType(value: unknown): void {
    if (value === null) return;
    // Raw cipher header bytes (iv, at) are carried as Buffers — the TS analogue
    // of Rails' binary Strings. The serializer base64-encodes them in one hop.
    if (Buffer.isBuffer(value)) return;
    if (typeof value === "object" && value !== null && "payload" in value && "headers" in value)
      return;
    const t = typeof value;
    if (!ALLOWED_TYPES.has(t)) {
      const typeName = _typeNameFor(value);
      throw new ForbiddenClass(
        `Can't store a ${typeName}, only properties of type string, number, boolean, null are allowed`,
      );
    }
  }

  private _validateType(value: unknown): void {
    this.validateValueType(value);
  }

  /** @internal */
  private get data(): Map<string, unknown> {
    return this._data;
  }
}

/**
 * Ruby's `Hash#==` compares each value with `value == other_value`, dispatching
 * on the value's own class. `equals` is the TS spelling of that `==`, so
 * duck-typing on it is the faithful analogue of the dynamic dispatch — and it
 * keeps this module from importing `Message` (which imports us), the same cycle
 * `validateValueType` above sidesteps by shape-checking.
 *
 * @internal
 */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  // Ruby has ONE String type for both text and raw bytes; trails splits it into
  // `string` and `Buffer` (a serialize→deserialize round trip hands back
  // Buffers where the original held strings), so both stand in for the same
  // Ruby value and must compare equal.
  if (Buffer.isBuffer(a) || Buffer.isBuffer(b)) {
    if (!isBinaryish(a) || !isBinaryish(b)) return false;
    return Buffer.from(a as string | Buffer).equals(Buffer.from(b as string | Buffer));
  }
  if (typeof a === "object" && a !== null && typeof (a as Equatable).equals === "function") {
    return (a as Equatable).equals(b);
  }
  return false;
}

interface Equatable {
  equals(other: unknown): boolean;
}

/** @internal */
function isBinaryish(value: unknown): boolean {
  return typeof value === "string" || Buffer.isBuffer(value);
}

function _typeNameFor(value: unknown): string {
  const t = typeof value;
  if ((t === "object" || t === "function") && value !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    if (name) return name;
  }
  return t;
}
