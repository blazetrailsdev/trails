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

  equals(other: unknown): boolean {
    const otherEntries = hashEntriesOf(other);
    if (otherEntries === null) return false;
    if (this._data.size !== otherEntries.length) return false;
    for (const [key, value] of otherEntries) {
      if (!this._data.has(key)) return false;
      if (!valuesEqual(this._data.get(key), value)) return false;
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

/** @internal */
function hashEntriesOf(value: unknown): [string, unknown][] | null {
  if (value instanceof Properties) return [...value.entries()];
  if (value instanceof Map) return [...(value as Map<string, unknown>).entries()];
  if (typeof value !== "object" || value === null) return null;
  const proto = Object.getPrototypeOf(value) as object | null;
  if (proto !== Object.prototype && proto !== null) return null;
  return Object.entries(value);
}

/** @internal */
function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
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
