import { CodeGenerator, include, Module } from "@blazetrails/activesupport";
import { isEmpty } from "@blazetrails/activesupport/ruby-empty";
import {
  AttributeMethods,
  type AttributeMethodPattern,
  type InstanceHost as AttributeMethodsInstanceHost,
  type DirtyOptions,
} from "@blazetrails/activemodel";
import { DangerousAttributeError } from "./errors.js";
import { formatForInspect as _formatForInspect } from "./attribute-inspection.js";
import {
  attributeForInspect as _attrForInspect,
  initializeGeneratedModules as _coreInitializeGeneratedModules,
} from "./core.js";
import { queryAttribute as _queryAttribute } from "./attribute-methods/query.js";
import { reload as _reload } from "./persistence.js";
import { cachedTableExists, loadSchema } from "./model-schema.js";
import {
  serializableHash as _serializableHash,
  attributeNamesForSerialization as _attrNamesForSerialization,
} from "./serialization.js";

export interface AttributeMethods {
  hasAttribute(name: string): boolean;
  attributePresent(name: string): boolean;
  attributeNames(): string[];
}

interface AttributeRecord {
  _attributes: {
    isKey(name: string): boolean;
    keys(): Iterable<string>;
    fetchValue(name: string): unknown;
    accessed(): string[];
  };
  readAttribute(name: string): unknown;
  /** @internal */
  _readAttribute(name: string): unknown;
}

/** @internal */
interface InstanceMethodHost {
  _attributes?: {
    isKey(name: string): boolean;
    keys(): Iterable<string>;
    getAttribute?(name: string): { valueForDatabase?: unknown } | null;
    fetchValue?(name: string): unknown;
  };
  _primaryKey?: string | string[];
  id?: unknown;
  readAttribute(name: string, block?: (name: string) => unknown): unknown;
  writeAttribute(name: string, value: unknown): void;
  /** @internal */
  _readAttribute(name: string, block?: (name: string) => unknown): unknown;
  _writeAttribute(name: string, value: unknown): void;
}

export function hasAttribute(this: AttributeRecord, attrName: string): boolean {
  attrName = String(attrName);
  attrName =
    (this.constructor as unknown as { attributeAliases: Record<string, string> }).attributeAliases[
      attrName
    ] ?? attrName;
  return this._attributes.isKey(attrName);
}

export function attributePresent(this: AttributeRecord, attrName: string): boolean {
  attrName = String(attrName);
  attrName =
    (this.constructor as unknown as { attributeAliases: Record<string, string> }).attributeAliases[
      attrName
    ] ?? attrName;
  const value = this._readAttribute(attrName);
  return value != null && !(respondsToEmpty(value) && isEmpty(value));
}

function respondsToEmpty(value: unknown): value is readonly unknown[] | string | object {
  if (typeof value === "string" || Array.isArray(value)) return true;
  if (value instanceof Set || value instanceof Map) return true;
  return (
    typeof value === "object" && value !== null && Object.getPrototypeOf(value) === Object.prototype
  );
}

export function attributeNames(this: AttributeRecord): string[] {
  return [...this._attributes.keys()];
}

export function attributes(this: AttributeRecord): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  for (const key of this._attributes.keys()) {
    result[key] = this.readAttribute(key);
  }
  return result;
}

export function accessedFields(this: AttributeRecord): string[] {
  return this._attributes.accessed();
}

export class GeneratedAttributeMethods extends Module {
  /**
   * @internal
   * @noRailsEquivalent PERMANENT
   */
  ownerName?: string;

  inspect(): string {
    return `${this.ownerName}::GeneratedAttributeMethods`;
  }
}

interface AttributeMethodsHost {
  name: string;
  _attributeMethodsGenerated?: boolean;
  _aliasAttributesMassGenerated?: boolean;
  _generatedAttributeMethods?: GeneratedAttributeMethods;
  attributeAliases?: Record<string, string>;
  _dangerousAttributeMethods?: Set<string>;
  _ignoredColumns?: string[];
  prototype: any;
  isBaseClass?(): boolean;
  attributeNames(): string[];
  abstractClass?: boolean;
  aliasAttribute(newName: string, oldName: string): void;
  _hasAttribute(attrName: string): boolean;
  attributeMethodPatterns: AttributeMethodPattern[];
  /** @internal */
  attributeMethodPatternsCache(): Map<string, unknown>;
  /** @internal */
  generatedAttributeMethods(): Module;
  defineAttributeMethodPattern(
    pattern: AttributeMethodPattern,
    attrName: string,
    options: { owner: CodeGenerator; as: string; override?: boolean },
  ): void;
  defineAttributeMethods?(): boolean;
  generateAliasAttributeMethods?(
    codeGenerator: CodeGenerator,
    newName: string,
    oldName: string,
  ): void;
  generateAliasAttributes?(): void;
}

const __FILE__ = import.meta.url;
const __LINE__ = 0;

const RESTRICTED_CLASS_METHODS = new Set(["allocate", "new", "name", "parent", "superclass"]);

let _dangerousMethodsCache: Set<string> | null = null;

/** @missingRailsCall map — PERMANENT */
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
    "createOrUpdate",
    "isFrozen",
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
    "encrypt",
    "decrypt",
    "encryptedAttribute",
    "ciphertextFor",
    "attributes",
    "logger",
  ]);
  return _dangerousMethodsCache;
}

export function initializeGeneratedModules(this: AttributeMethodsHost): void {
  this._generatedAttributeMethods = new GeneratedAttributeMethods();
  this._generatedAttributeMethods.ownerName = this.name;
  this._attributeMethodsGenerated = false;
  this._aliasAttributesMassGenerated = false;
  include(this as unknown as new (...args: unknown[]) => unknown, this._generatedAttributeMethods);
  _coreInitializeGeneratedModules.call(
    this as unknown as ThisParameterType<typeof _coreInitializeGeneratedModules>,
  );
}

export function aliasAttribute(this: AttributeMethodsHost, newName: string, oldName: string): void {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  AttributeMethods.ClassMethods.aliasAttribute.call(this as never, newName, oldName);

  if (
    Object.prototype.hasOwnProperty.call(this, "_aliasAttributesMassGenerated") &&
    this._aliasAttributesMassGenerated
  ) {
    CodeGenerator.batch(this.generatedAttributeMethods(), __FILE__, __LINE__, (codeGenerator) => {
      generateAliasAttributeMethods.call(this, codeGenerator, newName, oldName);
    });
  }
}

export function eagerlyGenerateAliasAttributeMethods(
  this: AttributeMethodsHost,
  _newName: string,
  _oldName: string,
): void {}

export function generateAliasAttributeMethods(
  this: AttributeMethodsHost,
  codeGenerator: CodeGenerator,
  newName: string,
  oldName: string,
): void {
  for (const pattern of this.attributeMethodPatterns) {
    aliasAttributeMethodDefinition.call(this, codeGenerator, pattern, newName, oldName);
  }
  this.attributeMethodPatternsCache().clear();
}

/** @missingRailsCall has_attribute? — CONVERGEABLE converge-alias-attribute-not-an-attribute-raise */
export function aliasAttributeMethodDefinition(
  this: AttributeMethodsHost,
  codeGenerator: CodeGenerator,
  pattern: AttributeMethodPattern,
  newName: string,
  oldName: string,
): void {
  oldName = String(oldName);

  this.defineAttributeMethodPattern(pattern, oldName, {
    owner: codeGenerator,
    as: newName,
    override: true,
  });
}

export function isAttributeMethodsGenerated(this: AttributeMethodsHost): boolean {
  return this._attributeMethodsGenerated ?? false;
}

export function defineAttributeMethods(this: AttributeMethodsHost): boolean {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  if (
    Object.prototype.hasOwnProperty.call(this, "_attributeMethodsGenerated") &&
    this._attributeMethodsGenerated
  ) {
    return false;
  }
  if (typeof this.isBaseClass === "function" && !this.isBaseClass()) {
    const superclass = Object.getPrototypeOf(this) as AttributeMethodsHost | null;
    if (superclass && typeof superclass.defineAttributeMethods === "function") {
      superclass.defineAttributeMethods();
    }
  }
  if (this.abstractClass !== true) {
    loadSchema.call(this as never);
    AttributeMethods.ClassMethods.defineAttributeMethods.call(
      this as never,
      ...this.attributeNames(),
    );
    if (this._hasAttribute("id")) this.aliasAttribute("id_value", "id");
  }
  generateAliasAttributes.call(this);
  this._attributeMethodsGenerated = true;
  return true;
}

export function generateAliasAttributes(this: AttributeMethodsHost): void {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  const superclass = Object.getPrototypeOf(this) as AttributeMethodsHost | null;
  if (
    superclass &&
    !Object.prototype.hasOwnProperty.call(superclass, "_isActiveRecordBase") &&
    typeof superclass.generateAliasAttributes === "function"
  ) {
    superclass.generateAliasAttributes();
  }
  if (
    Object.prototype.hasOwnProperty.call(this, "_aliasAttributesMassGenerated") &&
    this._aliasAttributesMassGenerated
  ) {
    return;
  }
  CodeGenerator.batch(this.generatedAttributeMethods(), __FILE__, __LINE__, (codeGenerator) => {
    for (const [oldName, newNames] of AttributeMethods.ClassMethods.aliasesByAttributeName.call(
      this as never,
    )) {
      for (const newName of newNames) {
        generateAliasAttributeMethods.call(this, codeGenerator, newName, oldName);
      }
    }
  });
  this._aliasAttributesMassGenerated = true;
}

export function undefineAttributeMethods(this: AttributeMethodsHost): void {
  if (
    Object.prototype.hasOwnProperty.call(this, "_attributeMethodsGenerated") &&
    this._attributeMethodsGenerated
  ) {
    AttributeMethods.ClassMethods.undefineAttributeMethods.call(this as never);
  }
  this._attributeMethodsGenerated = false;
  this._aliasAttributesMassGenerated = false;
}

function isOwnedByGeneratedAttributeMethods(klass: any, name: string): boolean {
  return instanceMethodOwner(klass, name) instanceof Module;
}

function instanceMethodOwner(klass: any, name: string): unknown {
  for (let c = klass; typeof c === "function"; c = Object.getPrototypeOf(c)) {
    if (c.prototype && Object.prototype.hasOwnProperty.call(c.prototype, name)) return c.prototype;
    const mod = Object.prototype.hasOwnProperty.call(c, "_generatedAttributeMethods")
      ? c._generatedAttributeMethods
      : undefined;
    if (mod instanceof Module && mod.isMethodDefined(name)) return mod;
  }
  return undefined;
}

export function isInstanceMethodAlreadyImplemented(
  this: AttributeMethodsHost,
  methodName: string,
): boolean {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  if (isDangerousAttributeMethod.call(this, methodName)) {
    throw new DangerousAttributeError(
      `${methodName} is defined by Active Record. Check to make sure that you don't have an attribute or method with the same name.`,
    );
  }

  const superclass = Object.getPrototypeOf(this);
  if (Object.prototype.hasOwnProperty.call(superclass ?? {}, "_isActiveRecordBase")) {
    return AttributeMethods.ClassMethods.isInstanceMethodAlreadyImplemented.call(
      this as any,
      methodName,
    );
  } else {
    const base = frameworkBase(this);
    const defined =
      base != null &&
      isMethodDefinedWithin.call(this, methodName, superclass, base) &&
      !isOwnedByGeneratedAttributeMethods(superclass, methodName);
    return (
      defined ||
      AttributeMethods.ClassMethods.isInstanceMethodAlreadyImplemented.call(this as any, methodName)
    );
  }
}

function frameworkBase(klass: unknown): any {
  let c: unknown = klass;
  while (typeof c === "function" && c !== Function.prototype) {
    if (Object.prototype.hasOwnProperty.call(c, "_isActiveRecordBase")) return c;
    c = Object.getPrototypeOf(c);
  }
  return null;
}

export function isDangerousAttributeMethod(this: AttributeMethodsHost, name: string): boolean {
  return dangerousAttributeMethods().has(name);
}

export function isMethodDefinedWithin(
  this: AttributeMethodsHost,
  name: string,
  klass: any,
  superklass: any = Object.getPrototypeOf(klass),
): boolean {
  if (name in klass.prototype) {
    if (superklass?.prototype != null && name in superklass.prototype) {
      return instanceMethodOwner(klass, name) !== instanceMethodOwner(superklass, name);
    } else {
      return true;
    }
  } else {
    return false;
  }
}

export function isDangerousClassMethod(this: AttributeMethodsHost, methodName: string): boolean {
  if (RESTRICTED_CLASS_METHODS.has(methodName)) return true;
  return typeof (this as any)[methodName] === "function";
}

export function isAttributeMethod(
  this: { _attributes?: { isKey(name: string): boolean } },
  attrName: string,
): boolean {
  return this._attributes?.isKey(attrName) ?? false;
}

/** @internal */
export function _hasAttribute(this: InstanceMethodHost, attrName: string): boolean {
  return this._attributes?.isKey(attrName) ?? false;
}

function attributeMethod(this: InstanceMethodHost, attrName: string): boolean {
  return this._attributes != null && (this._attributes.isKey(attrName) ?? false);
}

/** @internal */
export function attributesWithValues(
  this: InstanceMethodHost,
  attributeNames: string[],
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const attributes = this._attributes;
  if (attributes == null) return result;
  for (const name of attributeNames) {
    if (attributes.isKey(name)) result[name] = attributes.getAttribute?.(name);
  }
  return result;
}

/** @internal */
export function attributesForUpdate(this: InstanceMethodHost, attributeNames: string[]): string[] {
  const mc = this.constructor as any;
  const colNames = new Set<string>(mc.columnNames?.() ?? []);
  return attributeNames.filter((name) => {
    if (!colNames.has(name)) return false;
    if (mc.readonlyAttributeQ?.(name)) return false;
    if (mc.isCounterCacheColumn?.(name)) return false;
    const col = mc.columnForAttribute?.(name);
    if (col?.virtual || col?.isVirtual?.()) return false;
    return true;
  });
}

/** @internal */
export function attributesForCreate(this: InstanceMethodHost, attributeNames: string[]): string[] {
  const mc = this.constructor as any;
  const colNames = new Set<string>(mc.columnNames?.() ?? []);

  return attributeNames.filter((name) => {
    if (!colNames.has(name)) return false;
    if (pkAttribute.call(this, name) && this.id == null) return false;
    const col = mc.columnForAttribute?.(name);
    if (col?.virtual || col?.isVirtual?.()) return false;
    return true;
  });
}

/** @internal */
export function formatForInspect(this: InstanceMethodHost, name: string, value: unknown): string {
  return _formatForInspect.call(this as any, name, value);
}

/** @internal */
export function pkAttribute(this: InstanceMethodHost, name: string): boolean {
  const pk = (this.constructor as any)?.primaryKey ?? this._primaryKey;
  return name === pk;
}

interface AttributeNamesHost {
  attributeTypes(): Record<string, unknown>;
  abstractClass?: boolean;
  _attributeNamesMemo?: { names: readonly string[] };
}

function classAttributeNames(this: AttributeNamesHost): string[] {
  const memo = Object.prototype.hasOwnProperty.call(this, "_attributeNamesMemo")
    ? this._attributeNamesMemo
    : undefined;
  if (memo) return memo.names as string[];
  const exists = cachedTableExists.call(this as never);
  if (this.abstractClass || exists === false) {
    const frozen = Object.freeze([] as string[]);
    this._attributeNamesMemo = { names: frozen };
    return frozen as string[];
  }
  const names = Object.keys(this.attributeTypes());
  if (exists !== undefined) {
    const frozen = Object.freeze(names);
    this._attributeNamesMemo = { names: frozen };
    return frozen as string[];
  }
  return names;
}

/** @internal */
function classHasAttribute(
  this: { attributeTypes(): Record<string, unknown> },
  attrName: string,
): boolean {
  return Object.prototype.hasOwnProperty.call(this.attributeTypes(), attrName);
}

export const ClassMethods = {
  attributeNames: classAttributeNames,
  _hasAttribute: classHasAttribute,
};

export function attributeForInspect(this: InstanceMethodHost, attrName: string): string {
  return _attrForInspect.call(this as any, attrName);
}

export function get(this: InstanceMethodHost, attrName: string): unknown {
  return this.readAttribute(attrName, (n) =>
    AttributeMethods.InstanceMethods.missingAttribute.call(
      this as unknown as AttributeMethodsInstanceHost,
      n,
    ),
  );
}

export function set(this: InstanceMethodHost, attrName: string, value: unknown): void {
  this.writeAttribute(attrName, value);
}

export function queryAttribute(this: InstanceMethodHost, attrName: string): boolean {
  return _queryAttribute.call(this as any, attrName);
}

export function toKey(this: InstanceMethodHost): unknown[] | null {
  const pk = this.id;
  if (pk == null) return null;
  const arr = Array.isArray(pk) ? pk : [pk];
  return arr.some((v: unknown) => v == null) ? null : arr;
}

export function id(this: InstanceMethodHost, value?: unknown): unknown {
  const ctor = this.constructor as any;
  const pk = ctor.primaryKey as string | string[];
  if (value !== undefined) {
    if (Array.isArray(pk)) {
      if (!Array.isArray(value)) {
        throw new TypeError(
          `Expected an array for composite primary key [${pk.join(", ")}], got ${value === null ? "null" : typeof value}`,
        );
      }
      pk.forEach((col: string, i: number) => this._writeAttribute(col, (value as unknown[])[i]));
    } else {
      this._writeAttribute(pk, value);
    }
    return value;
  }
  if (Array.isArray(pk)) return pk.map((col: string) => this._readAttribute(col));
  return this._readAttribute(pk);
}

export async function reload<T>(this: T): Promise<T> {
  return _reload.call(this as any) as unknown as Promise<T>;
}

export function serializableHash(
  this: InstanceMethodHost,
  options?: unknown,
): Record<string, unknown> {
  return _serializableHash.call(this as any, options as any);
}

/** @internal */
export function attributeNamesForSerialization(this: InstanceMethodHost): string[] {
  return _attrNamesForSerialization.call(this as any);
}

import {
  readAttributeBeforeTypeCast as _readAttributeBeforeTypeCast,
  readAttributeForDatabase as _readAttributeForDatabase,
  attributesBeforeTypeCast as _attributesBeforeTypeCast,
  attributesForDatabase as _attributesForDatabase,
  attributeBeforeTypeCast as _attributeBeforeTypeCast,
  attributeForDatabase as _attributeForDatabase,
  attributeCameFromUser as _attributeCameFromUser,
} from "./attribute-methods/before-type-cast.js";
import { queryCastAttribute as _queryCastAttribute } from "./attribute-methods/query.js";
import {
  isSavedChangeToAttribute as _isSavedChangeToAttribute,
  savedChangeToAttribute as _savedChangeToAttribute,
  attributeBeforeLastSave as _attributeBeforeLastSave,
  isSavedChanges as _isSavedChanges,
  isWillSaveChangeToAttribute as _isWillSaveChangeToAttribute,
  attributeChangeToBeSaved as _attributeChangeToBeSaved,
  attributeInDatabase as _attributeInDatabase,
  attributeNamesForPartialUpdates as _attributeNamesForPartialUpdates,
  attributeNamesForPartialInserts as _attributeNamesForPartialInserts,
} from "./attribute-methods/dirty.js";

export function readAttributeBeforeTypeCast(this: InstanceMethodHost, attrName: string): unknown {
  return _readAttributeBeforeTypeCast(this as any, attrName);
}
export function readAttributeForDatabase(this: InstanceMethodHost, attrName: string): unknown {
  return _readAttributeForDatabase(this as any, attrName);
}
export function attributesBeforeTypeCast(this: InstanceMethodHost): Record<string, unknown> {
  return _attributesBeforeTypeCast.call(this as any);
}
export function attributesForDatabase(this: InstanceMethodHost): Record<string, unknown> {
  return _attributesForDatabase(this as any);
}
export function attributeBeforeTypeCast(this: InstanceMethodHost, attrName: string): unknown {
  return _attributeBeforeTypeCast.call(this as any, attrName);
}
export function attributeForDatabase(this: InstanceMethodHost, attrName: string): unknown {
  return _attributeForDatabase.call(this as any, attrName);
}
export function attributeCameFromUser(this: InstanceMethodHost, attrName: string): boolean {
  return _attributeCameFromUser.call(this as any, attrName);
}
export function queryCastAttribute(
  this: InstanceMethodHost,
  attrName: string,
  value: unknown,
): unknown {
  return _queryCastAttribute.call(this as any, attrName, value);
}
export function isSavedChangeToAttribute(
  this: InstanceMethodHost,
  attrName: string,
  options?: DirtyOptions,
): boolean {
  return _isSavedChangeToAttribute(this as any, attrName, options);
}
export function savedChangeToAttribute(
  this: InstanceMethodHost,
  attrName: string,
): [unknown, unknown] | null {
  return _savedChangeToAttribute(this as any, attrName);
}
export function attributeBeforeLastSave(this: InstanceMethodHost, attrName: string): unknown {
  return _attributeBeforeLastSave(this as any, attrName);
}
export function isSavedChanges(this: InstanceMethodHost): boolean {
  return _isSavedChanges(this as any);
}
export function isWillSaveChangeToAttribute(
  this: InstanceMethodHost,
  attrName: string,
  options?: DirtyOptions,
): boolean {
  return _isWillSaveChangeToAttribute(this as any, attrName, options);
}
export function attributeChangeToBeSaved(
  this: InstanceMethodHost,
  attrName: string,
): [unknown, unknown] | null {
  return _attributeChangeToBeSaved(this as any, attrName);
}
export function attributeInDatabase(this: InstanceMethodHost, attrName: string): unknown {
  return _attributeInDatabase(this as any, attrName);
}
export function attributeNamesForPartialUpdates(this: InstanceMethodHost): string[] {
  return _attributeNamesForPartialUpdates.call(this as any);
}
export function attributeNamesForPartialInserts(this: InstanceMethodHost): string[] {
  return _attributeNamesForPartialInserts.call(this as any);
}
