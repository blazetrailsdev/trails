import type { Base } from "./base.js";
import { modelRegistry, registerModelConstant } from "./associations.js";
import { ActiveRecordError, NameError, SubclassNotFound } from "./errors.js";
import {
  camelize,
  constantize,
  isPresent,
  safeConstantize,
  underscore,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { DescendantsTracker } from "@blazetrails/activesupport";
import { ActiveRecord } from "./ar-config.js";

function castInheritanceColumnValue(
  modelClass: typeof Base,
  inheritCol: string,
  value: unknown,
): unknown {
  const casted = (
    modelClass.typeForAttribute(inheritCol) as { cast(value: unknown): unknown }
  ).cast(value);
  if (casted == null) return casted;
  return typeof casted === "string" ? casted : String(casted);
}

/** @internal */
export function computeType(baseClass: typeof Base, typeName: string): typeof Base {
  if (typeName.startsWith("::")) {
    return constantize(typeName) as typeof Base;
  }
  const candidates = computeTypeCandidates(baseClass, typeName);
  for (const candidate of candidates) {
    const klass = safeConstantize(candidate) as typeof Base | undefined;
    if (klass && qualifiedName(klass) === candidate) return klass;
  }
  throw new NameError(`uninitialized constant ${candidates[0]}`, candidates[0]);
}

/** @internal */
function computeTypeCandidates(baseClass: typeof Base, typeName: string): string[] {
  const segs = qualifiedName(baseClass).split("::");
  const candidates: string[] = [];
  for (let i = segs.length; i > 0; i--) {
    candidates.push(`${segs.slice(0, i).join("::")}::${typeName}`);
  }
  candidates.push(typeName);
  return candidates;
}

export function subclasses(modelClass: typeof Base): (typeof Base)[] {
  const result: (typeof Base)[] = Object.prototype.hasOwnProperty.call(modelClass, "_subclasses")
    ? [...((modelClass as any)._subclasses as (typeof Base)[])]
    : [];
  for (const klass of DescendantsTracker.subclasses(
    modelClass as never,
  ) as unknown as (typeof Base)[]) {
    if (klass !== modelClass && !result.includes(klass)) result.push(klass);
  }
  return result;
}

export function descendants(modelClass: typeof Base): (typeof Base)[] {
  const result: (typeof Base)[] = [];
  for (const sub of subclasses(modelClass)) {
    result.push(sub);
    result.push(...descendants(sub));
  }
  return result;
}

export function isDescendsFromActiveRecord(this: typeof Base): boolean {
  const modelClass = this;
  if (Object.prototype.hasOwnProperty.call(modelClass, "_isActiveRecordBase")) return false;
  const superclass = Object.getPrototypeOf(modelClass) as typeof Base | null;
  if (!superclass || superclass === Function.prototype || typeof superclass.name !== "string")
    return true;
  if (superclass.abstractClass) return isDescendsFromActiveRecord.call(superclass);
  if (Object.prototype.hasOwnProperty.call(superclass, "_isActiveRecordBase")) return true;
  return !Object.keys(modelClass.columnsHash()).includes(modelClass.inheritanceColumn as string);
}

export function isBaseClass(modelClass: typeof Base): boolean {
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_computedBaseClass"))
    setBaseClass(modelClass);
  return (modelClass as any)._computedBaseClass === modelClass;
}

/** @internal */
export function setBaseClass(modelClass: typeof Base): void {
  if (Object.prototype.hasOwnProperty.call(modelClass, "_isActiveRecordBase")) {
    (modelClass as any)._computedBaseClass = modelClass;
    return;
  }
  const parent = Object.getPrototypeOf(modelClass) as typeof Base | null;
  if (!parent || parent === Function.prototype || typeof parent.name !== "string") {
    (modelClass as any)._computedBaseClass = modelClass;
    return;
  }
  const parentIsARBase = Object.prototype.hasOwnProperty.call(parent, "_isActiveRecordBase");
  const parentIsAbstract = parent.abstractClass;
  if (parentIsARBase || parentIsAbstract) {
    (modelClass as any)._computedBaseClass = modelClass;
  } else {
    if (!Object.prototype.hasOwnProperty.call(parent, "_computedBaseClass")) setBaseClass(parent);
    (modelClass as any)._computedBaseClass = (parent as any)._computedBaseClass;
  }
}

/** @noRailsEquivalent PERMANENT */
export function qualifiedName(modelClass: typeof Base): string {
  const klass = modelClass as typeof Base & { moduleName?: string; _demodulizedName?: string };
  if (!klass.moduleName) return modelClass.name;
  return `${klass.moduleName}::${klass._demodulizedName ?? modelClass.name}`;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function namespaceSegments(modelClass: typeof Base): string[] {
  const moduleName = (modelClass as typeof Base & { moduleName?: string }).moduleName;
  return moduleName ? moduleName.split("::") : [];
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function moduleParentChain(moduleName: string | undefined): string[] {
  if (!moduleName) return [];
  const segs = moduleName.split("::");
  const chain: string[] = [];
  for (let i = segs.length; i > 0; i--) {
    chain.push(segs.slice(0, i).join("::"));
  }
  return chain;
}

const moduleTableNamePrefixes = new Map<string, string>();
const moduleTableNameSuffixes = new Map<string, string>();

/** @noRailsEquivalent PERMANENT */
export function registerModuleTableNamePrefix(moduleName: string, prefix: string): void {
  moduleTableNamePrefixes.set(moduleName, prefix);
}

/** @noRailsEquivalent PERMANENT */
export function registerModuleTableNameSuffix(moduleName: string, suffix: string): void {
  moduleTableNameSuffixes.set(moduleName, suffix);
}

function lookupModuleDecoration(
  moduleName: string | undefined,
  registered: Map<string, string>,
  classDecoration: (model: typeof Base) => string,
): string | undefined {
  for (const parent of moduleParentChain(moduleName)) {
    const fromModule = registered.get(parent);
    if (fromModule !== undefined) return fromModule;
    const model = modelRegistry.get(parent);
    if (model) return classDecoration(model);
  }
  return undefined;
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function lookupModuleTableNamePrefix(moduleName: string | undefined): string | undefined {
  return lookupModuleDecoration(
    moduleName,
    moduleTableNamePrefixes,
    (model) => (model as typeof Base & { _tableNamePrefix?: string })._tableNamePrefix ?? "",
  );
}

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function lookupModuleTableNameSuffix(moduleName: string | undefined): string | undefined {
  return lookupModuleDecoration(
    moduleName,
    moduleTableNameSuffixes,
    (model) => (model as typeof Base & { _tableNameSuffix?: string })._tableNameSuffix ?? "",
  );
}

export function stiName(modelClass: typeof Base): string {
  const name = qualifiedName(modelClass);
  const klass = modelClass as typeof Base & {
    storeFullStiClass?: boolean;
    storeFullClassName?: boolean;
  };
  return klass.storeFullStiClass && klass.storeFullClassName ? name : demodulize(name);
}

export function polymorphicName(modelClass: typeof Base): string {
  const base = baseClass.call(modelClass);
  const name = qualifiedName(base);
  const klass = modelClass as typeof Base & { storeFullClassName?: boolean };
  return klass.storeFullClassName ? name : demodulize(name);
}

export function demodulize(name: string): string {
  const idx = name.lastIndexOf("::");
  return idx === -1 ? name : name.slice(idx + 2);
}

/** @noRailsEquivalent PERMANENT */
export function registerSubclass(klass: typeof Base): void {
  const parent = Object.getPrototypeOf(klass) as typeof Base;
  if (!parent || parent === Function.prototype) return;
  if (klass.name) registerModelConstant(klass.name, klass);
  if (!Object.prototype.hasOwnProperty.call(parent, "_subclasses")) {
    (parent as any)._subclasses = [];
  }
  if (!(parent as any)._subclasses.includes(klass)) {
    (parent as any)._subclasses.push(klass);
  }
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function stiEnabled(modelClass: object): boolean {
  return (modelClass as any)._inheritanceColumn != null;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function isStiSubclass(modelClass: object): boolean {
  let current = Object.getPrototypeOf(modelClass);
  while (current && current !== Function.prototype) {
    if (current._inheritanceColumn) return true;
    current = Object.getPrototypeOf(current);
  }
  return false;
}

export function baseClass(this: typeof Base): typeof Base {
  if (!Object.prototype.hasOwnProperty.call(this, "_computedBaseClass")) setBaseClass(this);
  return (this as any)._computedBaseClass as typeof Base;
}

export class ClassMethods {
  static get abstractClass(): boolean {
    return Object.prototype.hasOwnProperty.call(this, "_abstractClass")
      ? (this as any)._abstractClass
      : false;
  }

  static set abstractClass(value: boolean) {
    (this as any)._abstractClass = value;
  }
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function getStiBase(modelClass: object): typeof Base {
  let current = modelClass as typeof Base;
  let base = current;
  while (current && current !== Function.prototype) {
    if ((current as any)._inheritanceColumn) {
      base = current;
    }
    current = Object.getPrototypeOf(current) as typeof Base;
  }
  return base;
}

/** @internal */
export function findStiClass(baseClass: typeof Base, typeName: string): typeof Base {
  typeName = baseClass.baseClass
    .typeForAttribute(baseClass.inheritanceColumn as string)
    .cast(typeName) as string;

  const subclass = baseClass.stiClassFor(typeName);

  if (!(subclass === baseClass || baseClass.descendants.includes(subclass))) {
    throw new SubclassNotFound(
      `Invalid single-table inheritance type: ${subclass.name} is not a subclass of ${baseClass.name}`,
    );
  }

  return subclass;
}

const SELECT_ALIAS_READERS = Symbol.for("activerecord.selectAliasReaders");

/**
 * @internal
 * @noRailsEquivalent PERMANENT
 */
export function defineDynamicSelectReaders(record: Base): void {
  const attrs = (record as any)._attributes as { keys(): Iterable<string> };
  const rec = record as unknown as Record<string | symbol, unknown>;
  const installed = (rec[SELECT_ALIAS_READERS] as Set<string> | undefined) ?? new Set<string>();
  if (installed.size > 0) {
    const live = new Set(attrs.keys());
    for (const name of installed) {
      if (!live.has(name)) {
        delete rec[name];
        installed.delete(name);
      }
    }
  }
  const proto = Object.getPrototypeOf(record) as object;
  for (const name of attrs.keys()) {
    if (installed.has(name)) continue;
    if (Object.prototype.hasOwnProperty.call(record, name)) continue;
    let hasProtoMember = false;
    for (let p: object | null = proto; p != null; p = Object.getPrototypeOf(p)) {
      if (Object.getOwnPropertyDescriptor(p, name)) {
        hasProtoMember = true;
        break;
      }
    }
    if (hasProtoMember) continue;
    Object.defineProperty(record, name, {
      get(this: Base) {
        return (this as any).readAttribute(name);
      },
      configurable: true,
      enumerable: false,
    });
    installed.add(name);
  }
  if (installed.size > 0 && rec[SELECT_ALIAS_READERS] === undefined) {
    Object.defineProperty(record, SELECT_ALIAS_READERS, {
      value: installed,
      configurable: true,
      enumerable: false,
      writable: false,
    });
  }
}

export function isFinderNeedsTypeCondition(modelClass: typeof Base): boolean {
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_finderNeedsTypeCondition")) {
    (modelClass as any)._finderNeedsTypeCondition = !modelClass.isDescendsFromActiveRecord();
  }
  return (modelClass as any)._finderNeedsTypeCondition === true;
}

export function __resetPrimaryAbstractClass(): void {
  ActiveRecord.applicationRecordClass = null;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function getApplicationRecordClass(): typeof Base | null {
  return ActiveRecord.applicationRecordClass as typeof Base | null;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function applicationRecordClassQ(modelClass: typeof Base): boolean {
  if (ActiveRecord.applicationRecordClass) {
    return modelClass === ActiveRecord.applicationRecordClass;
  }
  return modelClass === (globalThis as Record<string, unknown>)["ApplicationRecord"];
}

export function primaryAbstractClass(modelClass: typeof Base): void {
  if (ActiveRecord.applicationRecordClass && ActiveRecord.applicationRecordClass !== modelClass) {
    throw new ArgumentError(
      `The \`primary_abstract_class\` is already set to ${ActiveRecord.applicationRecordClass.name}. ` +
        "There can only be one `primary_abstract_class` in an application.",
    );
  }
  (modelClass as any).abstractClass = true;
  ActiveRecord.applicationRecordClass = modelClass;
}

export function stiClassFor(modelClass: typeof Base, typeName: string): typeof Base {
  const klass = modelClass as typeof Base & {
    storeFullStiClass?: boolean;
    storeFullClassName?: boolean;
  };
  let subclass: typeof Base;
  try {
    if (klass.storeFullStiClass && klass.storeFullClassName) {
      subclass = constantize(typeName) as typeof Base;
    } else {
      subclass = modelClass.computeType(typeName);
    }
  } catch (cause) {
    if (!(cause instanceof NameError)) throw cause;
    throw new SubclassNotFound(
      `The single-table inheritance mechanism failed to locate the subclass: '${typeName}'. ` +
        `This error is raised because the column '${modelClass.inheritanceColumn}' is reserved for storing the class in case of inheritance.`,
      { cause },
    );
  }
  return subclass;
}

export function polymorphicClassFor(modelClass: typeof Base, name: string): typeof Base {
  const klass = modelClass as typeof Base & { storeFullClassName?: boolean };
  if (klass.storeFullClassName) {
    return constantize(name) as typeof Base;
  }
  return modelClass.computeType(name);
}

export function initializeDup(this: Base, super_: (other: unknown) => void, other: unknown): void {
  super_(other);
  ensureProperType.call(this);
}

/** @internal */
export function initializeInternalsCallback(this: Base): void {
  ensureProperType.call(this);
}

/** @internal */
export function ensureProperType(this: Base): void {
  const klass = this.constructor as typeof Base;
  if (!isFinderNeedsTypeCondition(klass)) return;
  const inheritCol = klass.inheritanceColumn;
  if (inheritCol === null) return;
  (this as any)._writeAttribute(inheritCol, stiName(klass));
}

/** @internal */
export function discriminateClassForRecord(
  modelClass: typeof Base,
  record: Record<string, unknown>,
): typeof Base {
  if (modelClass.usingSingleTableInheritance(record)) {
    const inheritCol = modelClass.inheritanceColumn;
    if (inheritCol === null) return modelClass;
    const castValue = castInheritanceColumnValue(
      baseClass.call(modelClass),
      inheritCol,
      record[inheritCol],
    );
    const typeName = (castValue as string | null) ?? String(record[inheritCol]);
    return findStiClassForRow(modelClass, typeName);
  }
  return modelClass;
}

/** @internal */
export function usingSingleTableInheritance(
  this: typeof Base,
  record: Record<string, unknown>,
): boolean {
  const modelClass = this;
  const inheritCol = modelClass.inheritanceColumn;
  if (inheritCol === null) return false;
  if (!isPresent(record[inheritCol])) return false;
  return stiColumnIsAttribute(modelClass, inheritCol, record);
}

/** @internal */
function stiColumnIsAttribute(
  modelClass: typeof Base,
  inheritCol: string,
  record: Record<string, unknown>,
): boolean {
  if (Object.prototype.hasOwnProperty.call(record, inheritCol)) return true;
  return modelClass._hasAttribute(inheritCol);
}

/** @internal */
export function typeCondition(modelClass: typeof Base, arelTable?: any): any {
  const inheritCol = modelClass.inheritanceColumn;
  if (inheritCol === null) {
    throw new ActiveRecordError("Cannot build type condition without an inheritance column");
  }
  const table = arelTable || (modelClass as any).arelTable;
  if (!table) throw new ActiveRecordError("Cannot build type condition without arel table");

  const stiColumn = typeof table.get === "function" ? table.get(inheritCol) : table[inheritCol];
  const stiNames = ([modelClass] as (typeof Base)[])
    .concat(modelClass.descendants)
    .map((klass) => stiName(klass));

  const predicateBuilder = (modelClass as any).predicateBuilder;
  if (predicateBuilder && predicateBuilder.build) {
    return predicateBuilder.build(stiColumn, stiNames);
  }

  return stiColumn.in(stiNames);
}

/** @internal */
export function subclassFromAttributes(
  modelClass: typeof Base,
  attrs: Record<string, unknown> | null | undefined,
): typeof Base | null {
  if (!attrs) return null;

  let attrsHash = attrs;
  if (typeof (attrs as any).toH === "function") {
    attrsHash = (attrs as any).toH();
  } else if (typeof (attrs as any).toObject === "function") {
    attrsHash = (attrs as any).toObject();
  }

  if (!attrsHash || typeof attrsHash !== "object") return null;

  const inheritCol = modelClass.inheritanceColumn;
  if (inheritCol === null) return null;
  if (!modelClass._hasAttribute(inheritCol)) return null;

  const cast = castStiValueFromAttrs(modelClass, attrsHash, inheritCol);
  if (!cast.found) return null;
  return findStiClass(modelClass, cast.value as string);
}

/** @internal */
function castStiValueFromAttrs(
  modelClass: typeof Base,
  attrsHash: Record<string, unknown>,
  inheritCol: string,
): { found: false } | { found: true; value: unknown } {
  const camelCol = camelize(inheritCol, false);
  const snakeCol = underscore(inheritCol);
  const subclassValue =
    attrsHash[inheritCol] ?? attrsHash[snakeCol] ?? attrsHash[camelCol] ?? undefined;
  if (!isPresent(subclassValue)) return { found: false };
  return {
    found: true,
    value: castInheritanceColumnValue(baseClass.call(modelClass), inheritCol, subclassValue),
  };
}

/** @internal */
function findStiClassInHierarchy(baseClass: typeof Base, typeName: string): typeof Base | null {
  const registered = modelRegistry.get(typeName);
  for (const klass of [baseClass, ...descendants(baseClass)]) {
    if (stiName(klass) === typeName || klass === registered) return klass;
  }
  return null;
}

/** @internal */
function findStiClassForRow(baseClass: typeof Base, typeName: string): typeof Base {
  const found = findStiClassInHierarchy(baseClass, typeName);
  if (found) return found;
  if (stiEnabled(baseClass)) return findStiClass(baseClass, typeName);
  return baseClass;
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function subclassFromAttributesForNew(
  modelClass: typeof Base,
  attrs: Record<string, unknown> | null | undefined,
): typeof Base | null {
  const col = modelClass.inheritanceColumn;
  if (col === null) return null;
  if (!modelClass._hasAttribute(col) && !stiEnabled(modelClass)) return null;

  const resolve = (source: unknown): typeof Base | null => {
    if (!source || typeof source !== "object") return null;
    const cast = castStiValueFromAttrs(modelClass, source as Record<string, unknown>, col);
    if (!cast.found) return null;
    const typeName = cast.value as string;
    const found = findStiClassInHierarchy(modelClass, typeName);
    if (found) return found;
    return findStiClass(modelClass, typeName);
  };

  let subclass = resolve(attrs);
  if (!subclass) {
    const scopeAttrs = (
      modelClass.currentScope?.() as { scopeForCreate?(): unknown } | null
    )?.scopeForCreate?.();
    subclass = resolve(scopeAttrs);
  }
  if (!subclass && isBaseClass(modelClass)) {
    subclass = resolve(modelClass.columnDefaults);
  }
  return subclass;
}
