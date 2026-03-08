import type { Base } from "./base.js";

/**
 * Tracks stored attributes per model class.
 * Maps model class -> { storeName -> accessor keys[] }
 */
const _storedAttributes = new WeakMap<
  typeof Base,
  Record<string, string[]>
>();

/**
 * Returns the stored attributes registry for a model class.
 */
export function storedAttributes(
  modelClass: typeof Base
): Record<string, string[]> {
  return _storedAttributes.get(modelClass) ?? {};
}

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
 * The column should use the "json" type.
 */
export function store(
  modelClass: typeof Base,
  attribute: string,
  options: {
    accessors: string[];
    prefix?: boolean | string;
    suffix?: boolean | string;
  }
): void {
  const { accessors, prefix, suffix } = options;

  // Track stored attributes
  const existing = _storedAttributes.get(modelClass) ?? {};
  const prev = existing[attribute] ?? [];
  existing[attribute] = [...prev, ...accessors];
  _storedAttributes.set(modelClass, existing);

  for (const accessor of accessors) {
    // Build the accessor name with prefix/suffix
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
        const data = this.readAttribute(attribute);
        if (data === null || data === undefined) return null;
        const obj = typeof data === "string" ? JSON.parse(data) : data;
        return obj[accessor] ?? null;
      },
      set: function (this: Base, value: unknown) {
        const raw = this.readAttribute(attribute);
        const obj =
          raw === null || raw === undefined
            ? {}
            : typeof raw === "string"
              ? JSON.parse(raw)
              : { ...(raw as Record<string, unknown>) };
        obj[accessor] = value;
        this.writeAttribute(attribute, JSON.stringify(obj));
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
