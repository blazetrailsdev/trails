import type { Base } from "./base.js";

/**
 * Tracks stored attributes per model class.
 * Maps model class -> { storeName -> accessor keys[] }
 */
const _storedAttributes = new WeakMap<typeof Base, Record<string, string[]>>();

/**
 * Returns the stored attributes registry for a model class.
 */
export function storedAttributes(modelClass: typeof Base): Record<string, string[]> {
  return _storedAttributes.get(modelClass) ?? {};
}

/**
 * Reads/writes hash keys on a store attribute.
 *
 * Mirrors: ActiveRecord::Store::HashAccessor
 */
export class HashAccessor {
  static read(object: Base, attribute: string, key: string): unknown {
    const data = object.readAttribute(attribute);
    if (data === null || data === undefined) return null;
    const obj = this._readHash(data);
    return obj[key] ?? null;
  }

  static write(object: Base, attribute: string, key: string, value: unknown): void {
    const current = this.read(object, attribute, key);
    if (value !== current) {
      this.prepare(object, attribute);
      const raw = object.readAttribute(attribute);
      const obj = this._writeHash(raw);
      obj[key] = value;
      const isStringColumn = typeof raw === "string" || raw === null || raw === undefined;
      object.writeAttribute(attribute, isStringColumn ? JSON.stringify(obj) : obj);
    }
  }

  static prepare(object: Base, attribute: string): void {
    const val = object.readAttribute(attribute);
    if (val === null || val === undefined) {
      object.writeAttribute(attribute, "{}");
    }
  }

  protected static _readHash(data: unknown): Readonly<Record<string, unknown>> {
    if (data === null || data === undefined) return {};
    if (typeof data === "string") return JSON.parse(data);
    if (typeof data === "object" && !Array.isArray(data)) return data as Record<string, unknown>;
    return {};
  }

  protected static _writeHash(data: unknown): Record<string, unknown> {
    if (data === null || data === undefined) return {};
    if (typeof data === "string") {
      const parsed = JSON.parse(data);
      if (parsed !== null && typeof parsed === "object" && !Array.isArray(parsed)) {
        return { ...parsed };
      }
      return {};
    }
    if (typeof data === "object" && !Array.isArray(data)) {
      return { ...(data as Record<string, unknown>) };
    }
    return {};
  }
}

/**
 * In Rails, IndifferentHashAccessor ensures the store value is a
 * HashWithIndifferentAccess. In TypeScript, JS objects already use
 * string keys natively, so no additional behavior is needed beyond
 * HashAccessor. Kept as a distinct class for Rails API parity.
 *
 * Mirrors: ActiveRecord::Store::IndifferentHashAccessor
 */
export class IndifferentHashAccessor extends HashAccessor {}

/**
 * Store — JSON-backed attribute accessors.
 *
 * Mirrors: ActiveRecord::Store
 *
 * Stores a hash in a single database column (as JSON), but exposes
 * individual keys as virtual attribute accessors.
 *
 * Usage:
 *   store(User, 'settings', { accessors: ['theme', 'language'] })
 *   store(User, 'settings', { accessors: ['theme'], prefix: true })
 *   store(User, 'settings', { accessors: ['theme'], prefix: 'config' })
 *   store(User, 'settings', { accessors: ['theme'], suffix: true })
 *   store(User, 'settings', { accessors: ['theme'], suffix: 'setting' })
 *
 * The column should use the "json" type or a serialized text column.
 */
export function store(
  modelClass: typeof Base,
  attribute: string,
  options: {
    accessors: string[];
    prefix?: boolean | string;
    suffix?: boolean | string;
  },
): void {
  const { accessors, prefix, suffix } = options;

  // Track stored attributes
  const existing = _storedAttributes.get(modelClass) ?? {};
  const prev = existing[attribute] ?? [];
  existing[attribute] = [...prev, ...accessors];
  _storedAttributes.set(modelClass, existing);

  for (const accessor of accessors) {
    let accessorName = accessor;
    if (prefix) {
      const pre = prefix === true ? attribute : String(prefix);
      accessorName = `${pre}_${accessorName}`;
    }
    if (suffix) {
      const suf = suffix === true ? attribute : String(suffix);
      accessorName = `${accessorName}_${suf}`;
    }

    Object.defineProperty(modelClass.prototype, accessorName, {
      get: function (this: Base) {
        return IndifferentHashAccessor.read(this, attribute, accessor);
      },
      set: function (this: Base, value: unknown) {
        IndifferentHashAccessor.write(this, attribute, accessor, value);
      },
      configurable: true,
    });
  }
}

/**
 * Standalone store_accessor for adding accessors to an existing store column.
 *
 * Mirrors: ActiveRecord::Store.store_accessor
 */
export const storeAccessor = store;
