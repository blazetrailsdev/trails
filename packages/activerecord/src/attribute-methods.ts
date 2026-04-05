/**
 * AttributeMethods — methods for working with model attributes.
 *
 * Mirrors: ActiveRecord::AttributeMethods
 */
import { isBlank } from "@blazetrails/activesupport";
// ActiveModel provides aliasAttribute and undefineAttributeMethods on Model.
// aliasAttribute delegates via the prototype chain. defineAttributeMethods
// is implemented here since AM doesn't expose it as a static on Model.

/**
 * The AttributeMethods module interface.
 *
 * Mirrors: ActiveRecord::AttributeMethods
 */
export interface AttributeMethods {
  hasAttribute(name: string): boolean;
  attributePresent(name: string): boolean;
  attributeNamesList: string[];
}

interface AttributeRecord {
  _attributes: { has(name: string): boolean; keys(): Iterable<string>; get(name: string): unknown };
  _accessedFields: Set<string>;
  readAttribute(name: string): unknown;
}

/**
 * Check whether an attribute exists on a record.
 *
 * Mirrors: ActiveRecord::AttributeMethods#has_attribute?
 */
export function hasAttribute(this: AttributeRecord, name: string): boolean {
  return this._attributes.has(name);
}

/**
 * Check whether an attribute is present (not null, not undefined, not empty string).
 *
 * Mirrors: ActiveRecord::AttributeMethods#attribute_present?
 */
export function attributePresent(this: AttributeRecord, name: string): boolean {
  return !isBlank(this.readAttribute(name));
}

/**
 * Return all attribute names for a record.
 *
 * Mirrors: ActiveRecord::AttributeMethods#attribute_names
 */
export function attributeNamesList(this: AttributeRecord): string[] {
  return [...this._attributes.keys()];
}

/**
 * Return all attributes as a plain object.
 *
 * Mirrors: ActiveRecord::AttributeMethods#attributes
 */
export function attributes(this: AttributeRecord): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of this._attributes.keys()) {
    result[key] = this.readAttribute(key);
  }
  return result;
}

/**
 * Return the list of attribute names that have been read on this record.
 * Useful for identifying unused columns to optimize SELECT queries.
 *
 * Mirrors: ActiveRecord::AttributeMethods#accessed_fields
 */
export function accessedFields(this: AttributeRecord): string[] {
  return [...this._accessedFields];
}

/**
 * Generated attribute methods placeholder.
 * Model classes mix dynamically-generated accessors into this module.
 *
 * Mirrors: ActiveRecord::AttributeMethods::GeneratedAttributeMethods
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type
export interface GeneratedAttributeMethods {}

// ---------------------------------------------------------------------------
// Class methods — mirrors ActiveRecord::AttributeMethods::ClassMethods
// ---------------------------------------------------------------------------

interface AttributeMethodsHost {
  name: string;
  _attributeDefinitions: Map<string, any>;
  _attributeMethodsGenerated?: boolean;
  _aliasAttributesMassGenerated?: boolean;
  _attributeAliases?: Record<string, string>;
  _dangerousAttributeMethods?: Set<string>;
  prototype: any;
}

const RESTRICTED_CLASS_METHODS = new Set(["allocate", "new", "name", "parent", "superclass"]);

let _dangerousMethodsCache: Set<string> | null = null;

/**
 * Rails: collects Base.instance_methods + private_instance_methods
 * minus superclass methods. These are method names that would conflict
 * with attribute accessors if a column had the same name.
 */
export function dangerousAttributeMethods(): Set<string> {
  if (_dangerousMethodsCache) return _dangerousMethodsCache;
  _dangerousMethodsCache = new Set([
    "save",
    "saveBang",
    "destroy",
    "delete",
    "reload",
    "update",
    "increment",
    "decrement",
    "toggle",
    "touch",
    "lock",
    "freeze",
    "dup",
    "clone",
    "becomes",
    "inspect",
    "toJSON",
    "isNewRecord",
    "isPersisted",
    "isDestroyed",
    "isReadonly",
    "isChanged",
    "isValid",
    "errors",
    "validate",
    "readAttribute",
    "writeAttribute",
    "assignAttributes",
  ]);
  return _dangerousMethodsCache;
}

export function initializeGeneratedModules(this: AttributeMethodsHost): void {
  if (!this._attributeMethodsGenerated) {
    this._attributeMethodsGenerated = false;
  }
}

/**
 * Delegates to ActiveModel::AttributeMethods#alias_attribute which
 * handles aliases, getter/setter generation, and pattern-based methods.
 */
export function aliasAttribute(this: AttributeMethodsHost, newName: string, oldName: string): void {
  // Delegate to ActiveModel's aliasAttribute via prototype chain
  const amFn = Object.getPrototypeOf(this)?.aliasAttribute;
  if (typeof amFn === "function") {
    amFn.call(this, newName, oldName);
  } else {
    if (!this._attributeAliases) this._attributeAliases = {};
    this._attributeAliases[newName] = oldName;
  }
}

export function eagerlyGenerateAliasAttributeMethods(this: AttributeMethodsHost): void {
  this._aliasAttributesMassGenerated = true;
}

export function generateAliasAttributeMethods(
  this: AttributeMethodsHost,
  _newName: string,
  _oldName: string,
): void {
  // Alias attribute methods are defined eagerly via Object.defineProperty
  // in activemodel's aliasAttribute. This hook exists for Rails parity.
}

export function aliasAttributeMethodDefinition(
  this: AttributeMethodsHost,
  newName: string,
  oldName: string,
): void {
  // Rails generates pattern-based alias methods for a single pattern.
  // Define a direct getter/setter for the alias name.
  if (this.prototype && !(newName in this.prototype)) {
    Object.defineProperty(this.prototype, newName, {
      get(this: any) {
        return this.readAttribute(oldName);
      },
      set(this: any, value: unknown) {
        this.writeAttribute(oldName, value);
      },
      configurable: true,
    });
  }
}

export function isAttributeMethodsGenerated(this: AttributeMethodsHost): boolean {
  return this._attributeMethodsGenerated ?? false;
}

export function defineAttributeMethods(this: AttributeMethodsHost): boolean {
  if (this._attributeMethodsGenerated) return false;
  // Generate getter/setter for each attribute definition that doesn't
  // already have one on the prototype (mirrors Rails' define_attribute_methods)
  for (const name of this._attributeDefinitions.keys()) {
    if (Object.prototype.hasOwnProperty.call(this.prototype, name)) continue;
    Object.defineProperty(this.prototype, name, {
      get(this: any) {
        return this.readAttribute(name);
      },
      set(this: any, value: unknown) {
        this.writeAttribute(name, value);
      },
      configurable: true,
    });
  }
  this._attributeMethodsGenerated = true;
  return true;
}

export function generateAliasAttributes(this: AttributeMethodsHost): void {
  if (!this._attributeAliases) return;
  for (const [newName, oldName] of Object.entries(this._attributeAliases)) {
    aliasAttributeMethodDefinition.call(this, newName, oldName);
  }
  this._aliasAttributesMassGenerated = true;
}

export function undefineAttributeMethods(this: AttributeMethodsHost): void {
  const amFn = Object.getPrototypeOf(this)?.undefineAttributeMethods;
  if (typeof amFn === "function") amFn.call(this);
  this._attributeMethodsGenerated = false;
  this._aliasAttributesMassGenerated = false;
}

export function isInstanceMethodAlreadyImplemented(
  this: AttributeMethodsHost,
  methodName: string,
): boolean {
  return methodName in this.prototype;
}

export function isDangerousAttributeMethod(this: AttributeMethodsHost, name: string): boolean {
  return dangerousAttributeMethods().has(name);
}

export function isMethodDefinedWithin(
  this: AttributeMethodsHost,
  name: string,
  klass: any,
  superklass?: any,
): boolean {
  if (!(name in klass.prototype)) return false;
  if (!superklass) return true;
  return !(name in superklass.prototype);
}

export function isDangerousClassMethod(this: AttributeMethodsHost, methodName: string): boolean {
  if (RESTRICTED_CLASS_METHODS.has(methodName)) return true;
  return typeof (this as any)[methodName] === "function";
}

export function isAttributeMethod(this: AttributeMethodsHost, name: string): boolean {
  return this._attributeDefinitions.has(name);
}
