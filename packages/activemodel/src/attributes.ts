import { Type } from "./type/value.js";
import { typeRegistry } from "./type/registry.js";
import { Attribute } from "./attribute.js";
import { AttributeSet } from "./attribute-set.js";

export interface AttributeDefinition {
  name: string;
  type: Type;
  defaultValue: unknown;
  virtual?: boolean;
}

/**
 * Attributes module contract.
 *
 * Mirrors: ActiveModel::Attributes
 */
export interface Attributes {
  readonly attributes: Record<string, unknown>;
  attributeNames(): string[];
}

// ---------------------------------------------------------------------------
// Class methods — Mirrors: ActiveModel::Attributes::ClassMethods
// ---------------------------------------------------------------------------

/**
 * Declare a typed attribute with an optional default.
 *
 * Mirrors: ActiveModel::Attributes::ClassMethods#attribute
 *
 * Model.attribute() delegates here. This is the canonical implementation
 * of the class-level `attribute` declaration.
 */
export function attribute(
  this: { _attributeDefinitions: Map<string, AttributeDefinition>; prototype: object },
  name: string,
  typeName: string,
  options?: { default?: unknown; virtual?: boolean },
): void {
  const type = typeRegistry.lookup(typeName);
  const defaultValue = options?.default ?? null;
  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
    this._attributeDefinitions = new Map(this._attributeDefinitions);
  }
  this._attributeDefinitions.set(name, { name, type, defaultValue, virtual: options?.virtual });

  if (!Object.prototype.hasOwnProperty.call(this.prototype, name)) {
    Object.defineProperty(this.prototype, name, {
      get(this: { readAttribute(n: string): unknown }) {
        return this.readAttribute(name);
      },
      set(this: { writeAttribute(n: string, v: unknown): void }, value: unknown) {
        this.writeAttribute(name, value);
      },
      configurable: true,
    });
  }
}

// ---------------------------------------------------------------------------
// Instance methods — Mirrors: ActiveModel::Attributes instance methods
// ---------------------------------------------------------------------------

/**
 * Build default AttributeSet from class definitions.
 *
 * Mirrors: ActiveModel::AttributeRegistration._default_attributes
 */
export function buildDefaultAttributes(defs: Map<string, AttributeDefinition>): AttributeSet {
  const attrMap = new Map<string, Attribute>();
  for (const [name, def] of defs) {
    let defVal = typeof def.defaultValue === "function" ? def.defaultValue() : def.defaultValue;
    if (defVal !== null && typeof defVal === "object") {
      defVal = structuredClone(defVal);
    }
    attrMap.set(name, Attribute.withCastValue(name, defVal ?? null, def.type));
  }
  return new AttributeSet(attrMap);
}

/**
 * Initialize instance attributes by building from class definitions.
 *
 * Mirrors: ActiveModel::Attributes#initialize
 */
export function constructor(defs: Map<string, AttributeDefinition>): AttributeSet {
  return buildDefaultAttributes(defs);
}

/**
 * Return all attributes as a plain hash.
 *
 * Mirrors: ActiveModel::Attributes#attributes
 */
export function attributes(attrs: AttributeSet): Record<string, unknown> {
  return attrs.toHash();
}
