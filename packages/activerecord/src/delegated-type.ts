import type { Base } from "./base.js";
import { camelize, inquiry, singularize, tableize, underscore } from "@blazetrails/activesupport";
import { resolveModel } from "./associations.js";

/**
 * Configuration for a delegated type.
 */
export interface DelegatedTypeOptions {
  types: string[];
  /**
   * Optional association scope lambda, forwarded to the generated polymorphic
   * `belongsTo`. Mirrors Rails' `delegated_type(role, types:, **options)`,
   * which passes `options.delete(:scope)` as the `belongs_to` scope proc.
   */
  scope?: (rel: any, owner?: any) => any;
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
 *   - entry.entryableClass         → constantized model class for the current foreign_type (Rails: `entryable_class`)
 *   - entry.entryableName          → StringInquirer (e.g. inquiry("message"))
 *   - entry.isMessage()            → type predicate
 *   - entry.isComment()            → type predicate
 *   - Entry.messages()             → scope (returns Relation)
 *   - Entry.comments()             → scope (returns Relation)
 *   - entry.message                → accessor (associated record via belongs_to)
 *   - entry.buildEntryable(attrs)  → role-level builder for the current type
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

  // Rails: belongs_to role, options.delete(:scope), **options.merge(polymorphic: true)
  // — the `:scope` proc becomes the belongs_to scope; the rest are options.
  // trails' belongsTo takes the scope as `options.scope`, so forward it there.
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

  // Add instance method: delegatedClass (e.g. entryableClass).
  // Rails: `define_method("#{role}_class") { public_send(role_type).constantize }`
  // — the constantized model class for the current foreign_type.
  Object.defineProperty(modelClass.prototype, `${role}Class`, {
    get(this: Base) {
      const typeName = this.readAttribute(foreignType) as string | null;
      if (!typeName) return null;
      return resolveModel(typeName);
    },
    configurable: true,
  });

  // Add instance method: delegatedName (e.g. entryableName).
  // Rails: public_send("#{role}_class").model_name.singular.inquiry —
  // returns an ActiveSupport::StringInquirer so callers can do
  // entryable_name.message?. We derive the same string value directly from
  // foreign_type (underscore + tr("/","_"), matching ModelName#singular)
  // rather than routing through `${role}Class.modelName`, avoiding a registry
  // lookup that an unsaved/unregistered foreign_type would make throw.
  Object.defineProperty(modelClass.prototype, `${role}Name`, {
    get(this: Base) {
      const typeName = this.readAttribute(foreignType) as string | null;
      if (!typeName) return null;
      // Rails: model_name.singular == name.underscore.tr("/", "_").
      // "Access::NoticeMessage" → "access/notice_message" → "access_notice_message".
      const singular = underscore(typeName).replace(/\//g, "_");
      return inquiry(singular);
    },
    configurable: true,
  });

  // Role-level builder: entry.buildEntryable(attrs) builds a new record of
  // the currently-set foreign_type and assigns it via the polymorphic
  // belongs_to writer (which also fills foreign_type/foreign_key).
  // Rails: define_method "build_#{role}" { |*params| public_send("#{role}=", public_send("#{role}_class").new(*params)) }
  Object.defineProperty(modelClass.prototype, `build${camelize(role, true)}`, {
    value: function (this: Base, attrs: Record<string, unknown> = {}): Base {
      const typeName = this.readAttribute(foreignType) as string | null;
      if (!typeName) {
        throw new Error(`Cannot build${camelize(role, true)}: ${foreignType} is not set`);
      }
      const TargetClass = resolveModel(typeName);
      const instance = new (TargetClass as unknown as new (a: Record<string, unknown>) => Base)(
        attrs,
      );
      (this as unknown as Record<string, unknown>)[role] = instance;
      return instance;
    },
    writable: true,
    configurable: true,
  });

  // For each type, add predicates, scopes, and accessors.
  // Rails: scope_name = type.tableize.tr("/", "_"); singular = scope_name.singularize
  // Namespaced types like "Access::NoticeMessage" tableize to "access/notice_messages",
  // then "/" → "_" gives "access_notice_messages" (a valid scope/method name).
  for (const typeName of options.types) {
    const scopeSnake = tableize(typeName).replace(/\//g, "_");
    const singularSnake = singularize(scopeSnake);
    const scopeName = camelize(scopeSnake, false);
    const singularName = camelize(singularSnake, false);
    // Predicate camelizes the singular scope name so it tracks Rails' query
    // method (which is "#{singular}?"). "Access::NoticeMessage" → isAccessNoticeMessage().
    const predicateSuffix = camelize(singularSnake, true);

    // Type predicate: isMessage(), isAccessNoticeMessage()
    Object.defineProperty(modelClass.prototype, `is${predicateSuffix}`, {
      value: function (this: Base): boolean {
        return this.readAttribute(foreignType) === typeName;
      },
      writable: true,
      configurable: true,
    });

    // Scope: Model.messages(), Model.accessNoticeMessages()
    Object.defineProperty(modelClass, scopeName, {
      value: function (this: typeof Base) {
        return this.where({ [foreignType]: typeName });
      },
      writable: true,
      configurable: true,
    });

    // Accessor: entry.message → returns the associated record via the
    // polymorphic belongs_to reader when type matches, otherwise null.
    // Rails: define_method(singular) { public_send(role) if public_send(query) }
    Object.defineProperty(modelClass.prototype, singularName, {
      get(this: Base) {
        if (this.readAttribute(foreignType) !== typeName) return null;
        return (this as unknown as Record<string, unknown>)[role];
      },
      configurable: true,
    });

    // FK accessor: entry.messageId (or entry.uuidMessageUuid for UUID PKs).
    // Rails: define_method("#{singular}_#{primary_key}") { public_send(role_id) if public_send(query) }
    const fkAccessorName = camelize(`${singularSnake}_${primaryKey}`, false);
    Object.defineProperty(modelClass.prototype, fkAccessorName, {
      get(this: Base) {
        if (this.readAttribute(foreignType) !== typeName) return null;
        return this.readAttribute(foreignKey);
      },
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
