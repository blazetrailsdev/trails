import { EncryptedContentIntegrity, ForbiddenClass } from "./errors.js";

const ALLOWED_TYPES = new Set(["string", "number", "boolean"]);

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class Properties {
  static readonly DEFAULT_PROPERTIES = {
    encryptedDataKey: "k",
    encryptedDataKeyId: "i",
    compressed: "c",
    iv: "iv",
    authTag: "at",
    encoding: "e",
  } as const;

  private _data = new Map<string, unknown>();

  constructor(initialProperties: Record<string, unknown> | Properties = {}) {
    this.add(initialProperties);
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

  each(fn: (key: string, value: unknown) => void): void {
    for (const [key, value] of this._data) {
      fn(key, value);
    }
  }

  isKey(key: string): boolean {
    return this._data.has(key);
  }

  add(otherProperties: Record<string, unknown> | Properties): void {
    const entries =
      otherProperties instanceof Properties
        ? otherProperties.entries()
        : Object.entries(otherProperties);
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

  validateValueType(value: unknown): void {
    if (value === null) return;
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

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export interface Properties {
  get encryptedDataKey(): string | undefined;
  set encryptedDataKey(value: string | undefined);
  get encryptedDataKeyId(): string | undefined;
  set encryptedDataKeyId(value: string | undefined);
  get compressed(): boolean | undefined;
  set compressed(value: boolean | undefined);
  get iv(): string | undefined;
  set iv(value: string | Buffer | undefined);
  get authTag(): string | undefined;
  set authTag(value: string | Buffer | undefined);
  get encoding(): string | undefined;
  set encoding(value: string | undefined);
}

for (const [name, key] of Object.entries(Properties.DEFAULT_PROPERTIES)) {
  Object.defineProperty(Properties.prototype, name, {
    configurable: true,
    get(this: Properties): unknown {
      return this.get(key);
    },
    set(this: Properties, value: unknown) {
      this.set(key, value);
    },
  });
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
