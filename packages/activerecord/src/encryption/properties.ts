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

  add(props: Record<string, unknown>): void {
    for (const [key, value] of Object.entries(props)) {
      this.set(key, value);
    }
  }

  toJSON(): Record<string, unknown> {
    const result: Record<string, unknown> = Object.create(null) as Record<string, unknown>;
    for (const [key, value] of this._data) {
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

  get iv(): string | undefined {
    return this.get("iv") as string | undefined;
  }

  get authTag(): string | undefined {
    return this.get("at") as string | undefined;
  }

  validateValueType(value: unknown): void {
    if (value === null) return;
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
}

function _typeNameFor(value: unknown): string {
  const t = typeof value;
  if ((t === "object" || t === "function") && value !== null) {
    const name = (value as { constructor?: { name?: string } }).constructor?.name;
    if (name) return name;
  }
  return t;
}
