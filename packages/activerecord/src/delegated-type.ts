import type { Base } from "./base.js";
import { underscore } from "@blazetrails/activesupport";

/**
 * Configuration for a delegated type.
 */
export interface DelegatedTypeOptions {
  types: string[];
  foreignKey?: string;
  foreignType?: string;
  /**
   * Primary key column on the delegated-type target models.
   * Defaults to "id". Set to "uuid" (or another column name) when the
   * target models use a non-integer primary key — e.g.
   * `delegatedType(Entry, "entryable", { types: [...], primaryKey: "uuid", foreignKey: "entryable_uuid" })`.
   * Mirrors Rails' `:primary_key` option, which controls the name of the
   * generated `${singular}_${primaryKey}` accessor on each type.
   */
  primaryKey?: string;
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
  options: DelegatedTypeOptions,
): void {
  const foreignKey = options.foreignKey ?? `${role}_id`;
  const foreignType = options.foreignType ?? `${role}_type`;
  const primaryKey = options.primaryKey ?? "id";
  const config = { ...options, foreignKey, foreignType, primaryKey };

  // Rails: belongs_to role, **options.merge(polymorphic: true)
  // (Rails also accepts an optional scope proc; we omit it as there's no proc equivalent)
  const { types: _types, ...assocOptions } = options as DelegatedTypeOptions & { types?: unknown };
  (modelClass as any).belongsTo(role, {
    ...assocOptions,
    polymorphic: true,
    foreignKey,
    foreignType,
  });

  if (!delegatedTypeRegistry.has(modelClass)) {
    delegatedTypeRegistry.set(modelClass, new Map());
  }
  delegatedTypeRegistry.get(modelClass)!.set(role, config);

  // Store config on the class for introspection
  if (!(modelClass as any)._delegatedTypes) {
    (modelClass as any)._delegatedTypes = new Map();
  }
  (modelClass as any)._delegatedTypes.set(role, config);

  // Class method: Entry.entryableTypes → ["Message", "Comment"]
  // Mirrors Rails' define_singleton_method("#{role}_types") { types.map(&:to_s) }
  Object.defineProperty(modelClass, `${role}Types`, {
    get() {
      return options.types.map(String);
    },
    configurable: true,
  });

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
    const snakeName = underscore(typeName);

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

    // Accessor: entry.message → returns the FK value if type matches
    Object.defineProperty(modelClass.prototype, snakeName, {
      get(this: Base) {
        if (this.readAttribute(foreignType) !== typeName) return null;
        return this.readAttribute(foreignKey);
      },
      configurable: true,
    });

    // FK accessor: entry.message_id (or entry.message_uuid for UUID PKs) → returns FK if type matches
    // Mirrors Rails' define_method("#{singular}_#{primary_key}") { public_send(role_id) if public_send(query) }
    Object.defineProperty(modelClass.prototype, `${snakeName}_${primaryKey}`, {
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
  role: string,
): DelegatedTypeOptions | undefined {
  return (modelClass as any)._delegatedTypes?.get(role);
}

/**
 * Define all accessor methods for a delegated type role on the given model class.
 * Called internally by `delegatedType`; the public entry point is `delegatedType`.
 *
 * Mirrors: ActiveRecord::DelegatedType#define_delegated_type_methods (private)
 *
 * @internal
 */
export function defineDelegatedTypeMethods(
  modelClass: typeof Base,
  role: string,
  types: string[],
  options: DelegatedTypeOptions,
): void {
  delegatedType(modelClass, role, { ...options, types });
}
