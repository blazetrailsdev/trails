import type { Base } from "./base.js";

/**
 * Configuration for a delegated type.
 */
export interface DelegatedTypeOptions {
  types: string[];
  foreignKey?: string;
  foreignType?: string;
}

/**
 * Registry of delegated type configurations per model class.
 */
const delegatedTypeRegistry = new WeakMap<
  object,
  Map<string, DelegatedTypeOptions & { foreignKey: string; foreignType: string }>
>();

/**
 * Declare a delegated type on a model class.
 *
 * Mirrors: ActiveRecord::DelegatedType.delegated_type
 *
 * Usage:
 *   delegatedType(Entry, "entryable", {
 *     types: ["Message", "Comment"],
 *   });
 *
 * This adds:
 *   - entry.entryableClass      → the class of the delegated type
 *   - entry.entryableName       → lowercase type name (e.g. "message")
 *   - entry.isMessage()         → type predicate
 *   - entry.isComment()         → type predicate
 *   - Entry.messages()          → scope (returns Relation)
 *   - Entry.comments()          → scope (returns Relation)
 *   - entry.message             → accessor (returns the associated record)
 *   - entry.buildMessage(attrs) → builder method
 */
export function delegatedType(
  modelClass: typeof Base,
  role: string,
  options: DelegatedTypeOptions
): void {
  const foreignKey = options.foreignKey ?? `${role}_id`;
  const foreignType = options.foreignType ?? `${role}_type`;
  const config = { ...options, foreignKey, foreignType };

  if (!delegatedTypeRegistry.has(modelClass)) {
    delegatedTypeRegistry.set(modelClass, new Map());
  }
  delegatedTypeRegistry.get(modelClass)!.set(role, config);

  // Store config on the class for introspection
  if (!(modelClass as any)._delegatedTypes) {
    (modelClass as any)._delegatedTypes = new Map();
  }
  (modelClass as any)._delegatedTypes.set(role, config);

  // Add instance method: delegatedClass (e.g. entryableClass)
  Object.defineProperty(modelClass.prototype, `${role}Class`, {
    get(this: Base) {
      const typeName = this.readAttribute(foreignType) as string | null;
      if (!typeName) return null;
      return typeName;
    },
    configurable: true,
  });

  // Add instance method: delegatedName (e.g. entryableName)
  Object.defineProperty(modelClass.prototype, `${role}Name`, {
    get(this: Base) {
      const typeName = this.readAttribute(foreignType) as string | null;
      if (!typeName) return null;
      return typeName.toLowerCase().replace(/.*::/, "");
    },
    configurable: true,
  });

  // For each type, add predicates, scopes, accessors, and builder methods
  for (const typeName of options.types) {
    const lowerName = typeName.charAt(0).toLowerCase() + typeName.slice(1);
    const snakeName = lowerName.replace(/([A-Z])/g, "_$1").toLowerCase();

    // Type predicate: isMessage(), isComment()
    Object.defineProperty(modelClass.prototype, `is${typeName}`, {
      value: function (this: Base): boolean {
        return this.readAttribute(foreignType) === typeName;
      },
      writable: true,
      configurable: true,
    });

    // Also add a snake_case predicate style: message?, comment? → we use isX

    // Scope: Model.messages(), Model.comments()
    const pluralName = snakeName + "s";
    Object.defineProperty(modelClass, pluralName, {
      value: function (this: typeof Base) {
        return this.where({ [foreignType]: typeName });
      },
      writable: true,
      configurable: true,
    });

    // Accessor: entry.message → returns the record if type matches
    Object.defineProperty(modelClass.prototype, snakeName, {
      get(this: Base) {
        if (this.readAttribute(foreignType) !== typeName) return null;
        return this.readAttribute(foreignKey);
      },
      configurable: true,
    });

    // Builder method: entry.buildMessage(attrs) → sets type and returns
    Object.defineProperty(modelClass.prototype, `build${typeName}`, {
      value: function (this: Base, attrs: Record<string, unknown> = {}): Base {
        this.writeAttribute(foreignType, typeName);
        for (const [k, v] of Object.entries(attrs)) {
          this.writeAttribute(k, v);
        }
        return this;
      },
      writable: true,
      configurable: true,
    });
  }
}

/**
 * Get the delegated type configuration for a model class and role.
 */
export function getDelegatedTypeConfig(
  modelClass: typeof Base,
  role: string
): DelegatedTypeOptions | undefined {
  return (modelClass as any)._delegatedTypes?.get(role);
}
