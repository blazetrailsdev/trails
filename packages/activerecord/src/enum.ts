import type { Base } from "./base.js";

/**
 * Enum definition — maps symbolic names to integer values.
 *
 * Mirrors: ActiveRecord::Enum
 */

interface EnumDefinition {
  attribute: string;
  mapping: Map<string, number>;
  reverseMapping: Map<number, string>;
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
  const reverseMapping = new Map<number, string>();

  if (Array.isArray(valuesInput)) {
    valuesInput.forEach((name, index) => {
      mapping.set(name, index);
      reverseMapping.set(index, name);
    });
  } else {
    for (const [name, value] of Object.entries(valuesInput)) {
      mapping.set(name, value);
      reverseMapping.set(value, name);
    }
  }

  const defs = getEnumDefinitions(modelClass);
  const def: EnumDefinition = { attribute, mapping, reverseMapping };
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
  const toCamel = (s: string) => s.replace(/_([a-z])/g, (_, c) => c.toUpperCase());

  // Define scopes for each enum value
  for (const [name, value] of mapping) {
    const scopeName = toCamel(methodName(name));
    modelClass.scope(scopeName, (rel: any) => rel.where({ [attribute]: value }));
  }

  // Define instance methods on the prototype
  for (const [name, value] of mapping) {
    const fullName = toCamel(methodName(name));
    const capitalizedFullName = fullName.charAt(0).toUpperCase() + fullName.slice(1);

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
 * Get the human-readable enum value for an attribute.
 */
export function readEnumValue(record: Base, attribute: string): string | null {
  const ctor = record.constructor as typeof Base;
  const defs = getEnumDefinitions(ctor);
  const def = defs.get(attribute);
  if (!def) return null;

  const numericValue = record.readAttribute(attribute);
  if (numericValue === null || numericValue === undefined) return null;
  return def.reverseMapping.get(Number(numericValue)) ?? null;
}

/**
 * Cast an enum value (string name or number) to its integer storage value.
 */
export function castEnumValue(
  modelClass: typeof Base,
  attribute: string,
  value: unknown,
): number | null {
  const defs = getEnumDefinitions(modelClass);
  const def = defs.get(attribute);
  if (!def) return null;

  if (typeof value === "string") {
    return def.mapping.get(value) ?? null;
  }
  if (typeof value === "number") {
    return def.reverseMapping.has(value) ? value : null;
  }
  return null;
}
