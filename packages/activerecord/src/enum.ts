import type { Base } from "./base.js";
import { camelize, pluralize } from "@blazetrails/activesupport";
import { ValueType } from "@blazetrails/activemodel";

/**
 * Enum definition — maps symbolic names to integer values.
 *
 * Mirrors: ActiveRecord::Enum
 */

interface EnumDefinition {
  attribute: string;
  mapping: Map<string, number>;
  type: EnumType;
}

/**
 * Registry of enum definitions per model class.
 */
const enumRegistry = new WeakMap<typeof Base, Map<string, EnumDefinition>>();

/**
 * Get enum definitions for a model class.
 */
export function getEnumDefinitions(modelClass: typeof Base): Map<string, EnumDefinition> {
  if (!enumRegistry.has(modelClass)) {
    enumRegistry.set(modelClass, new Map());
  }
  return enumRegistry.get(modelClass)!;
}

/**
 * Define an enum on a model class.
 *
 * Supports:
 *   - Array form: enum('status', ['draft', 'published', 'archived'])
 *   - Object form: enum('status', { draft: 0, published: 1, archived: 2 })
 *
 * Generates:
 *   - Predicate methods: record.isDraft(), record.isPublished()
 *   - Setter methods: record.draft(), record.published()
 *   - Scopes: Model.draft(), Model.published()
 *   - The attribute getter returns the string name, setter accepts string or number
 *
 * Mirrors: ActiveRecord::Enum.enum
 */
export function defineEnum(
  modelClass: typeof Base,
  attribute: string,
  valuesInput: string[] | Record<string, number>,
  options?: { prefix?: boolean | string; suffix?: boolean | string },
): void {
  const mapping = new Map<string, number>();

  if (Array.isArray(valuesInput)) {
    valuesInput.forEach((name, index) => {
      mapping.set(name, index);
    });
  } else {
    for (const [name, value] of Object.entries(valuesInput)) {
      mapping.set(name, value);
    }
  }

  const defs = getEnumDefinitions(modelClass);
  const enumType = new EnumType(attribute, mapping, "integer");
  const def: EnumDefinition = { attribute, mapping, type: enumType };
  defs.set(attribute, def);

  // Compute prefix/suffix for method names
  const prefixStr =
    options?.prefix === true
      ? attribute
      : typeof options?.prefix === "string"
        ? options.prefix
        : "";
  const suffixStr =
    options?.suffix === true
      ? attribute
      : typeof options?.suffix === "string"
        ? options.suffix
        : "";

  const methodName = (name: string) => {
    if (prefixStr && suffixStr) return `${prefixStr}_${name}_${suffixStr}`;
    if (prefixStr) return `${prefixStr}_${name}`;
    if (suffixStr) return `${name}_${suffixStr}`;
    return name;
  };

  // Camel-case a method name: "status_draft" -> "statusDraft"
  const toCamel = (s: string) => camelize(s, false);

  // Define scopes for each enum value
  for (const [name, value] of mapping) {
    const scopeName = toCamel(methodName(name));
    modelClass.scope(scopeName, (rel: any) => rel.where({ [attribute]: value }));
  }

  // Define instance methods on the prototype
  for (const [name, value] of mapping) {
    const fullName = toCamel(methodName(name));
    const capitalizedFullName = camelize(methodName(name));

    // Predicate: record.isDraft() or record.isStatusDraft()
    Object.defineProperty(modelClass.prototype, `is${capitalizedFullName}`, {
      value: function (this: Base) {
        return this.readAttribute(attribute) === value;
      },
      writable: true,
      configurable: true,
    });

    // Setter: record.draft() or record.statusDraft() — sets the value in memory
    if (!Object.hasOwn(modelClass.prototype, fullName)) {
      Object.defineProperty(modelClass.prototype, fullName, {
        value: function (this: Base) {
          this.writeAttribute(attribute, value);
        },
        writable: true,
        configurable: true,
      });
    }

    // Bang setter: record.draftBang() or record.statusDraftBang()
    const bangName = `${fullName}Bang`;
    Object.defineProperty(modelClass.prototype, bangName, {
      value: async function (this: any) {
        this.writeAttribute(attribute, value);
        if (this.isPersisted()) {
          await this.updateColumn(attribute, value);
        }
      },
      writable: true,
      configurable: true,
    });

    // whereNot scope: Model.notDraft() or Model.notStatusDraft()
    const notScopeName = `not${capitalizedFullName}`;
    modelClass.scope(notScopeName, (rel: any) => rel.whereNot({ [attribute]: value }));
  }
}

/**
 * EnumType — wraps an underlying type to handle enum cast/serialize/deserialize.
 *
 * Mirrors: ActiveRecord::Enum::EnumType
 */
export class EnumType extends ValueType<string> {
  override readonly name: string;
  private _mapping: ReadonlyMap<string, number | string>;
  private _reverseMapping: ReadonlyMap<number | string, string>;
  private _raiseOnInvalidValues: boolean;
  readonly subtype: string;

  constructor(
    name: string,
    mapping: ReadonlyMap<string, number | string>,
    subtype: string,
    raiseOnInvalidValues = true,
  ) {
    super();
    this.name = name;
    this._mapping = mapping;
    const reverse = new Map<number | string, string>();
    for (const [k, v] of mapping) {
      reverse.set(v, k);
    }
    this._reverseMapping = reverse;
    this._raiseOnInvalidValues = raiseOnInvalidValues;
    this.subtype = subtype;
  }

  // Rails' EnumType does `delegate :type, to: :subtype` — callers that
  // ask what an enum column's storage type is want the underlying
  // column type (e.g. "integer"), not the enum's attribute name. Our
  // subtype is already the type string, so return it directly.
  override type(): string {
    return this.subtype;
  }

  cast(value: unknown): string | null {
    if (typeof value === "string" && this._mapping.has(value)) {
      return value;
    }
    if (
      (typeof value === "number" || typeof value === "string") &&
      this._reverseMapping.has(value)
    ) {
      return this._reverseMapping.get(value)!;
    }
    if (value === null || value === undefined) return null;
    return null;
  }

  deserialize(value: unknown): string | null {
    if (value === null || value === undefined) return null;
    const result = this._reverseMapping.get(value as number | string);
    if (result !== undefined) return result;
    if (typeof value === "string" && value !== "" && this.subtype === "integer") {
      const num = Number(value);
      if (!Number.isNaN(num)) return this._reverseMapping.get(num) ?? null;
    }
    return null;
  }

  serialize(value: unknown): number | string | null {
    if (value === null || value === undefined) return null;
    if (typeof value === "string" && this._mapping.has(value)) {
      return this._mapping.get(value)!;
    }
    if (typeof value === "number" && this._reverseMapping.has(value)) {
      return value;
    }
    if (typeof value === "string" && value !== "" && this.subtype === "integer") {
      const num = Number(value);
      if (!Number.isNaN(num) && this._reverseMapping.has(num)) return num;
    }
    return null;
  }

  isSerializable(value: unknown): boolean {
    if (value === null || value === undefined) return true;
    if (typeof value === "string" && this._mapping.has(value)) return true;
    if ((typeof value === "number" || typeof value === "string") && this._reverseMapping.has(value))
      return true;
    if (typeof value === "string" && value !== "" && this.subtype === "integer") {
      const num = Number(value);
      if (!Number.isNaN(num) && this._reverseMapping.has(num)) return true;
    }
    return false;
  }

  assertValidValue(value: unknown): void {
    if (!this._raiseOnInvalidValues) return;
    if (value === null || value === undefined || value === "") return;
    if (typeof value === "string" && this._mapping.has(value)) return;
    if ((typeof value === "number" || typeof value === "string") && this._reverseMapping.has(value))
      return;
    if (typeof value === "string" && this.subtype === "integer") {
      const num = Number(value);
      if (!Number.isNaN(num) && this._reverseMapping.has(num)) return;
    }
    throw new Error(`'${value}' is not a valid ${this.name}`);
  }
}

/**
 * Declare an enum attribute via `Base.enum(attribute, mapping, options)`.
 * Maps symbolic names to integer values; defines a getter/setter on the
 * prototype, `is{Name}()` predicates, `{name}Bang()` in-memory setters,
 * per-value scopes, and a static `pluralize(attribute)` accessor for the
 * mapping (e.g. `status` → `statuses`, `priority` → `priorities`).
 *
 * This is the simpler-semantics sibling to `defineEnum` — the bang setter
 * only mutates in-memory state (returns `this`), matching the historical
 * inline `Base.enum` behavior. Use `defineEnum(klass, ...)` for the
 * Rails-persisting variant with `not*` scopes.
 *
 * Mirrors: ActiveRecord::Enum.enum (the ClassMethods macro).
 */
export function enumMethod(
  this: typeof Base,
  attribute: string,
  mapping: Record<string, number>,
  options?: { prefix?: boolean | string; suffix?: boolean | string },
): void {
  if (!Object.prototype.hasOwnProperty.call(this, "_enums")) {
    this._enums = new Map(this._enums);
  }
  this._enums.set(attribute, mapping);

  const prefix =
    options?.prefix === true
      ? `${attribute}_`
      : typeof options?.prefix === "string"
        ? `${options.prefix}_`
        : "";
  const suffix =
    options?.suffix === true
      ? `_${attribute}`
      : typeof options?.suffix === "string"
        ? `_${options.suffix}`
        : "";

  const attrName = attribute;
  const reverseMap: Record<number, string> = {};
  for (const [name, value] of Object.entries(mapping)) {
    reverseMap[value] = name;
  }

  // Define getter that returns the symbol name. Use hasOwnProperty checks so
  // inherited prototype keys like "toString" don't masquerade as enum values.
  const hasOwn = Object.prototype.hasOwnProperty;
  Object.defineProperty(this.prototype, attribute, {
    get(this: Base) {
      const raw = this._attributes.get(attrName);
      if (typeof raw === "number" && hasOwn.call(reverseMap, raw)) return reverseMap[raw];
      if (typeof raw === "string" && hasOwn.call(mapping, raw)) return raw;
      return raw;
    },
    set(this: Base, value: unknown) {
      if (typeof value === "string" && hasOwn.call(mapping, value)) {
        this.writeAttribute(attrName, mapping[value as string]);
      } else {
        this.writeAttribute(attrName, value);
      }
    },
    configurable: true,
  });

  for (const [name, value] of Object.entries(mapping)) {
    const methodBase = `${prefix}${name}${suffix}`;

    // Predicate: user.active? → user.isActive()
    Object.defineProperty(
      this.prototype,
      `is${methodBase.charAt(0).toUpperCase()}${methodBase.slice(1)}`,
      {
        value: function (this: Base) {
          return this._attributes.get(attrName) === value;
        },
        writable: true,
        configurable: true,
      },
    );

    // Bang setter: user.active! → user.activeBang() (in-memory only)
    Object.defineProperty(this.prototype, `${methodBase}Bang`, {
      value: function (this: Base) {
        this.writeAttribute(attrName, value);
        return this;
      },
      writable: true,
      configurable: true,
    });

    // Scope: User.active → User.where({ status: 0 })
    if (!Object.prototype.hasOwnProperty.call(this, "_scopes")) {
      this._scopes = new Map(this._scopes);
    }
    this._scopes.set(methodBase, (rel: any) => rel.where({ [attrName]: value }));

    // Static method that delegates to the scope
    Object.defineProperty(this, methodBase, {
      value: function () {
        return ((this as typeof Base).all() as any)[methodBase]();
      },
      writable: true,
      configurable: true,
    });
  }

  // Mapping accessor under the pluralized attribute name (e.g. User.statuses
  // for `status`). Rails: `singleton_class.define_method(name.to_s.pluralize)`.
  Object.defineProperty(this, pluralize(attribute), {
    get() {
      return { ...mapping };
    },
    configurable: true,
  });
}

// Alias the Base.enum implementation under the Rails-idiomatic name so
// api:compare can match `ActiveRecord::Enum#enum` to this file. The runtime
// binding wired onto Base uses the real (un-reserved-word) internal name.
export { enumMethod as enum };

/**
 * Get the human-readable enum value for an attribute.
 * Delegates to EnumType.deserialize for the mapping lookup.
 */
export function readEnumValue(record: Base, attribute: string): string | null {
  const ctor = record.constructor as typeof Base;
  const defs = getEnumDefinitions(ctor);
  const def = defs.get(attribute);
  if (!def) return null;

  const numericValue = record.readAttribute(attribute);
  return def.type.deserialize(numericValue);
}

/**
 * Cast an enum value (string name or number) to its integer storage value.
 * Delegates to EnumType.serialize for the mapping lookup.
 */
export function castEnumValue(
  modelClass: typeof Base,
  attribute: string,
  value: unknown,
): number | null {
  const defs = getEnumDefinitions(modelClass);
  const def = defs.get(attribute);
  if (!def) return null;

  return def.type.serialize(value) as number | null;
}
