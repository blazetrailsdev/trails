import type { Base } from "./base.js";

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
 *
 * This stores { theme: '...', language: '...' } in the `settings` column
 * and exposes user.theme / user.theme = '...' as accessors.
 *
 * The column should use the "json" type.
 */
export function store(
  modelClass: typeof Base,
  attribute: string,
  options: { accessors: string[] }
): void {
  const { accessors } = options;

  for (const accessor of accessors) {
    Object.defineProperty(modelClass.prototype, accessor, {
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
