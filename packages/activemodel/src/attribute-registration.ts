import { Type } from "./type/value.js";
import { AttributeSet } from "./attribute-set.js";
import { buildDefaultAttributes, type AttributeDefinition } from "./attributes.js";

/**
 * AttributeRegistration mixin — provides the static attribute() method
 * and attribute type registration.
 *
 * Mirrors: ActiveModel::AttributeRegistration
 *
 * In Rails this is a module that handles the class-level attribute
 * declaration API. Model already implements this via Model.attribute().
 */
export interface AttributeRegistrationClassMethods {
  attribute(name: string, typeName: string, options?: { default?: unknown }): void;
  _defaultAttributes(): AttributeSet;
  decorateAttributes(names: string[] | null, decorator: (name: string, type: Type) => Type): void;
  attributeTypes(): Record<string, Type>;
  typeForAttribute(name: string): Type | null;
}

export type AttributeRegistration = AttributeRegistrationClassMethods;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyAttributeHost = any;

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#_default_attributes
 *
 * Cached AttributeSet built from _attributeDefinitions. All other attribute
 * accessors (attributeTypes, typeForAttribute) and the instance constructor
 * delegate through this method — it is the single source of truth, matching
 * the Rails delegation chain.
 */
export function _defaultAttributes(this: AnyAttributeHost): AttributeSet {
  if (!this._cachedDefaultAttributes) {
    this._cachedDefaultAttributes = buildDefaultAttributes(
      this._attributeDefinitions as Map<string, AttributeDefinition>,
    );
  }
  return this._cachedDefaultAttributes;
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#decorate_attributes
 */
export function decorateAttributes(
  this: AnyAttributeHost,
  names: string[] | null,
  decorator: (name: string, type: Type) => Type,
): void {
  if (!Object.prototype.hasOwnProperty.call(this, "_attributeDefinitions")) {
    this._attributeDefinitions = new Map(this._attributeDefinitions);
  }
  const defs = this._attributeDefinitions as Map<string, { name: string; type: Type }>;
  const targetNames = names ?? Array.from(defs.keys());
  for (const name of targetNames) {
    const def = defs.get(name);
    if (def) {
      const newType = decorator(name, def.type);
      if (newType) {
        defs.set(name, { ...def, type: newType });
      }
    }
  }
  // Mirrors: Rails reset_default_attributes
  this._cachedDefaultAttributes = null;
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#attribute_types
 *
 * Rails: @attribute_types ||= _default_attributes.cast_types
 * Delegates to _defaultAttributes — single codepath.
 */
export function attributeTypes(this: AnyAttributeHost): Record<string, Type> {
  return _defaultAttributes.call(this).castTypes();
}

/**
 * Mirrors: ActiveModel::AttributeRegistration::ClassMethods#type_for_attribute
 *
 * Rails: attribute_types[attribute_name]
 * Delegates to attributeTypes — single codepath.
 */
export function typeForAttribute(this: AnyAttributeHost, name: string): Type | null {
  return attributeTypes.call(this)[name] ?? null;
}
