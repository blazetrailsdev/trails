import { CodeGenerator, include, indexWith, Module, toFs } from "@blazetrails/activesupport";
import { AttributeMethods as AMAttributeMethods, Model } from "@blazetrails/activemodel";
import {
  type Concurrent,
  type Hash,
  hasKey,
  isEmpty,
  keys as hashKeys,
  rbClassSuperclass,
  rbFCaller,
  rbInspect as inspect,
  rbModConstSet,
  rbModPublicInstanceMethod,
  rbObjIvarGet,
  rbObjIvarSet,
  rbObjMethod,
  rbObjRespondTo,
  NameError,
  type UnboundMethod,
} from "@blazetrails/ruby-compat";
import {
  ArgumentError,
  AttributeMethods,
  type AttributeMethodPattern,
  type InstanceHost as AttributeMethodsInstanceHost,
  type DirtyOptions,
} from "@blazetrails/activemodel";
import { DangerousAttributeError } from "./errors.js";
import { ActiveRecord } from "./namespaces.js";
import { Temporal, Time as RubyTime } from "@blazetrails/date";
import {
  type InspectionMask,
  initializeGeneratedModules as _coreInitializeGeneratedModules,
  inspectionFilter as _coreInspectionFilter,
} from "./core.js";
import { queryAttribute as _queryAttribute } from "./attribute-methods/query.js";
import { cachedTableExists, isSchemaLoaded, loadSchema } from "./model-schema.js";
import { attributeNamesForSerialization as _attrNamesForSerialization } from "./serialization.js";
import { AttributeMethods as AttributeMethodsNamespace } from "./namespaces.js";

export interface AttributeMethods {
  hasAttribute(name: string): boolean;
  attributePresent(name: string): boolean;
  attributeNames(): string[];
}

interface AttributeRecord {
  _attributes: {
    isKey(name: string): boolean;
    keys(): Iterable<string>;
    toHash(): Record<string, unknown>;
    fetchValue(name: string): unknown;
    accessed(): string[];
  };
  readAttribute(name: string): unknown;
  /** @internal */
  _readAttribute(name: string): unknown;
}

/** @internal */
export interface InstanceMethodHost {
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
  columnForAttribute(name: string): { isVirtual(): boolean };
  /** @internal */
  _readAttribute(name: string, block?: (name: string) => unknown): unknown;
}

export function methodMissing(
  this: AttributeRecord & InstanceMethodHost,
  name: string,
  ...args: unknown[]
): unknown {
  const klass = this.constructor as unknown as {
    prototype: object;
    defineAttributeMethods(): boolean;
  };
  klass.defineAttributeMethods();

  let method: UnboundMethod | null;
  try {
    method = rbModPublicInstanceMethod(klass, name);
  } catch (e) {
    if (!(e instanceof NameError)) throw e;
    method = null;
  }

  while (method && !(method.owner instanceof GeneratedAttributeMethods)) {
    method = method.superMethod();
  }
  if (method) {
    return method.bindCall(this, ...args);
  } else {
    return AMAttributeMethods.AttributeMethods.methodMissing.call(this as never, name, ...args);
  }
}

export function isRespondTo(
  this: AttributeRecord & InstanceMethodHost,
  name: string,
  includePrivate: boolean = false,
): boolean {
  if (!AMAttributeMethods.AttributeMethods.isRespondTo.call(this as never, name, includePrivate))
    return false;

  if (this._attributes) {
    const column = (
      this.constructor as unknown as { symbolColumnToString(name: string): string | null }
    ).symbolColumnToString(name);
    if (column != null) {
      return _hasAttribute.call(this, column);
    }
  }

  return true;
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
  return this._attributes.toHash();
}

export function accessedFields(this: AttributeRecord): string[] {
  return this._attributes.accessed();
}

export class GeneratedAttributeMethods extends Module {}

export interface AttributeMethodsHost {
  new (...args: never[]): unknown;
  name: string;
  _attributeMethodsGenerated?: boolean;
  _aliasAttributesMassGenerated?: boolean;
  _generatedAttributeMethods?: GeneratedAttributeMethods;
  attributeAliases?: Record<string, string>;
  _dangerousAttributeMethods?: Set<string>;
  _ignoredColumns?: string[];
  prototype: any;
  isBaseClass(): boolean;
  attributeNames(): string[];
  abstractClass?: boolean;
  aliasAttribute(newName: string, oldName: string): void;
  hasAttribute(attrName: string): boolean;
  _hasAttribute(attrName: string): boolean;
  attributeMethodPatterns: AttributeMethodPattern[];
  /** @internal */
  attributeMethodPatternsCache(): InstanceType<typeof Concurrent.Map<string, unknown>>;
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

const RESTRICTED_CLASS_METHODS = new Set([
  "private",
  "public",
  "protected",
  "allocate",
  "new",
  "name",
  "superclass",
]);

let _dangerousMethodsCache: Set<string> | null = null;

/** @missingRailsCall map — CONVERGEABLE dangerous-attribute-methods-computed-not-curated */
export function dangerousAttributeMethods(): Set<string> {
  return (_dangerousMethodsCache ||= new Set([
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
    "isEncryptedAttribute",
    "ciphertextFor",
    "attributes",
    "logger",
  ]));
}

/** @missingRailsName generatedAttributeMethods — PERMANENT */
export function initializeGeneratedModules(this: AttributeMethodsHost): void {
  this._generatedAttributeMethods = rbModConstSet(
    this,
    "GeneratedAttributeMethods",
    new GeneratedAttributeMethods(),
  );
  this._attributeMethodsGenerated = false;
  this._aliasAttributesMassGenerated = false;
  include(this, this._generatedAttributeMethods);

  _coreInitializeGeneratedModules.call(
    this as unknown as ThisParameterType<typeof _coreInitializeGeneratedModules>,
  );
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function generatedAttributeMethods(this: AttributeMethodsHost): Module {
  if (!Object.prototype.hasOwnProperty.call(this, "_generatedAttributeMethods")) {
    initializeGeneratedModules.call(this);
  }
  return this._generatedAttributeMethods!;
}

export function aliasAttribute(this: AttributeMethodsHost, newName: string, oldName: string): void {
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

export function aliasAttributeMethodDefinition(
  this: AttributeMethodsHost,
  codeGenerator: CodeGenerator,
  pattern: AttributeMethodPattern,
  newName: string,
  oldName: string,
): void {
  oldName = String(oldName);

  if (
    this.abstractClass !== true &&
    !this.hasAttribute(oldName) &&
    isSchemaLoaded.call(this as never)
  ) {
    throw new ArgumentError(
      `${this.name} model aliases \`${oldName}\`, but \`${oldName}\` is not an attribute. ` +
        `Use \`alias_method :${newName}, :${oldName}\` or define the method manually.`,
    );
  } else {
    this.defineAttributeMethodPattern(pattern, oldName, {
      owner: codeGenerator,
      as: newName,
      override: true,
    });
  }
}

export function isAttributeMethodsGenerated(this: AttributeMethodsHost): boolean {
  return this._attributeMethodsGenerated ?? false;
}

export function defineAttributeMethods(this: AttributeMethodsHost): boolean {
  if (
    Object.prototype.hasOwnProperty.call(this, "_attributeMethodsGenerated") &&
    this._attributeMethodsGenerated
  ) {
    return false;
  }
  if (
    Object.prototype.hasOwnProperty.call(this, "_attributeMethodsGenerated") &&
    this._attributeMethodsGenerated
  ) {
    return false;
  }
  if (!this.isBaseClass()) rbClassSuperclass(this)!.defineAttributeMethods!();
  if (!this.abstractClass) {
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
  if (rbClassSuperclass(this) !== ActiveRecord.Base) {
    rbClassSuperclass(this)!.generateAliasAttributes!();
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
  for (let proto = klass.prototype; proto; proto = Object.getPrototypeOf(proto)) {
    const descriptor = Object.getOwnPropertyDescriptor(proto, name);
    if (!descriptor) continue;
    if ("value" in descriptor && descriptor.value === undefined) return undefined;
    if (Object.prototype.hasOwnProperty.call(proto, "constructor")) return proto;
    for (let c = klass; typeof c === "function"; c = Object.getPrototypeOf(c)) {
      const mod = Object.prototype.hasOwnProperty.call(c, "_generatedAttributeMethods")
        ? c._generatedAttributeMethods
        : undefined;
      const entry = mod instanceof Module ? mod.instanceMethod(name) : undefined;
      if (entry && (entry.get ?? entry.value) === (descriptor.get ?? descriptor.value)) return mod;
    }
    return proto;
  }
  return undefined;
}

export function isInstanceMethodAlreadyImplemented(
  this: AttributeMethodsHost,
  methodName: string,
): boolean {
  if (isDangerousAttributeMethod.call(this, methodName)) {
    throw new DangerousAttributeError(
      `${methodName} is defined by Active Record. Check to make sure that you don't have an attribute or method with the same name.`,
    );
  }

  const superclass = rbClassSuperclass(this);
  if (superclass === ActiveRecord.Base) {
    return AttributeMethods.ClassMethods.isInstanceMethodAlreadyImplemented.call(
      this as any,
      methodName,
    );
  } else {
    const defined =
      isMethodDefinedWithin.call(this, methodName, superclass, ActiveRecord.Base) &&
      !isOwnedByGeneratedAttributeMethods(superclass, methodName);
    return (
      defined ||
      AttributeMethods.ClassMethods.isInstanceMethodAlreadyImplemented.call(this as any, methodName)
    );
  }
}

export function isDangerousAttributeMethod(this: AttributeMethodsHost, name: string): boolean {
  return dangerousAttributeMethods().has(name);
}

export function isMethodDefinedWithin(
  this: AttributeMethodsHost,
  name: string,
  klass: any,
  superklass: any = rbClassSuperclass(klass) ?? Object,
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

  if (rbObjRespondTo(ActiveRecord.Base, methodName, true)) {
    if (rbObjRespondTo(Object, methodName, true)) {
      return (
        rbObjMethod(ActiveRecord.Base, methodName).owner() !==
        rbObjMethod(Object, methodName).owner()
      );
    } else {
      return true;
    }
  } else {
    return false;
  }
}

export function isAttributeMethod(
  this: { _attributes?: { isKey(name: string): boolean } },
  attrName: string,
): boolean | undefined {
  return this._attributes?.isKey(attrName);
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
): Hash<string, unknown> {
  return indexWith(attributeNames, (name) => this._attributes!.getAttribute!(name));
}

/** @internal */
export function attributesForUpdate(this: InstanceMethodHost, attributeNames: string[]): string[] {
  const klass = this.constructor as any;
  attributeNames = attributeNames.filter((name) => klass.columnNames().includes(name));
  return attributeNames.filter(
    (name) =>
      !(
        klass.isReadonlyAttribute(name) ||
        klass.isCounterCacheColumn(name) ||
        this.columnForAttribute(name).isVirtual()
      ),
  );
}

/** @internal */
export function attributesForCreate(this: InstanceMethodHost, attributeNames: string[]): string[] {
  const klass = this.constructor as any;
  attributeNames = attributeNames.filter((name) => klass.columnNames().includes(name));
  return attributeNames.filter(
    (name) =>
      !(
        (pkAttribute.call(this, name) && this.id == null) ||
        this.columnForAttribute(name).isVirtual()
      ),
  );
}

/** @internal */
export function formatForInspect(
  this: InstanceMethodHost,
  name: string,
  value: unknown,
): string | InspectionMask {
  if (value == null) {
    return inspect(value);
  } else {
    let inspectedValue: string;
    if (typeof value === "string" && value.length > 50) {
      inspectedValue = inspect(`${value.slice(0, 50)}...`);
    } else if (
      value instanceof Temporal.PlainDate ||
      value instanceof RubyTime ||
      value instanceof Temporal.Instant
    ) {
      inspectedValue = `"${toFs(value, "inspect")}"`;
    } else {
      inspectedValue = inspect(value);
    }

    return _coreInspectionFilter.call(this as never).filterParam(name, inspectedValue) as
      | string
      | InspectionMask;
  }
}

/** @internal */
export function pkAttribute(this: InstanceMethodHost, name: string): boolean {
  const pk = (this.constructor as any)?.primaryKey ?? this._primaryKey;
  return name === pk;
}

interface AttributeNamesHost {
  attributeTypes(): Record<string, unknown> | Hash<string, unknown>;
  abstractClass?: boolean;
}

/** @internal */
function classHasAttribute(
  this: { attributeTypes(): Record<string, unknown> | Hash<string, unknown> },
  attrName: string,
): boolean {
  return hasKey(this.attributeTypes(), attrName);
}

export const ClassMethods = {
  /** @missingRailsCall table_exists? — PERMANENT */
  isAttributeMethod(this: { columnNames(): string[] } & object, attribute: string): boolean {
    return (
      Model.isAttributeMethod.call(this as never, attribute) ||
      (cachedTableExists.call(this as never) !== false &&
        this.columnNames().includes(String(attribute).replace(/=$/, "")))
    );
  },
  /**
   * @missingRailsCall table_exists? — PERMANENT
   * @inventedArm if — PERMANENT
   */
  attributeNames(this: AttributeNamesHost): string[] {
    return (rbObjIvarGet(this, "@attribute_names") ??
      (!this.abstractClass && cachedTableExists.call(this as never) === undefined
        ? hashKeys(this.attributeTypes())
        : rbObjIvarSet(
            this,
            "@attribute_names",
            Object.freeze(
              !this.abstractClass && cachedTableExists.call(this as never)
                ? hashKeys(this.attributeTypes())
                : [],
            ),
          ))) as string[];
  },
  _hasAttribute: classHasAttribute,
};

export function attributeForInspect(
  this: InstanceMethodHost,
  attrName: string,
): string | InspectionMask {
  attrName = String(attrName);
  attrName =
    (this.constructor as unknown as { attributeAliases: Record<string, string> }).attributeAliases[
      attrName
    ] ?? attrName;
  const value = this._readAttribute(attrName);
  return formatForInspect.call(this, attrName, value);
}

export function get(this: InstanceMethodHost, attrName: string): unknown {
  return this.readAttribute(attrName, (n) =>
    AttributeMethods.AttributeMethods.missingAttribute.call(
      this as unknown as AttributeMethodsInstanceHost,
      n,
      rbFCaller(),
    ),
  );
}

export function set(this: InstanceMethodHost, attrName: string, value: unknown): void {
  this.writeAttribute(attrName, value);
}

export function queryAttribute(this: InstanceMethodHost, attrName: string): boolean {
  return _queryAttribute.call(this as any, attrName);
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
export function attributesBeforeTypeCast(
  this: InstanceMethodHost,
): Record<string, unknown> | Hash<string, unknown> {
  return _attributesBeforeTypeCast.call(this as any);
}
export function attributesForDatabase(
  this: InstanceMethodHost,
): Record<string, unknown> | Hash<string, unknown> {
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
): boolean | undefined {
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
): boolean | undefined {
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

ActiveRecord.AttributeMethods = AttributeMethodsNamespace;
