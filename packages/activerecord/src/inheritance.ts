import type { Base } from "./base.js";
import { modelRegistry, registerModelConstant } from "./associations.js";
import { NameError, SubclassNotFound } from "./errors.js";
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
    (model) => (model as typeof Base & { tableNamePrefix?: string }).tableNamePrefix ?? "",
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
    (model) => (model as typeof Base & { tableNameSuffix?: string }).tableNameSuffix ?? "",
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
 * True when STI was explicitly enabled on this class or an ancestor (the
 * inherited `_inheritanceColumn` sentinel). Distinct from `inheritanceColumn`,
 * which resolves to a name (default "type") for any model that hasn't disabled
 * STI: the column merely names where STI *would* read the type; this reports
 * whether the model actually participates in STI.
 *
 * Used to gate the database-row dispatch paths (instantiate, association build),
 * which resolve through the ambiguous global registry and so must stay scoped to
 * explicitly-modeled hierarchies. The `new`-from-attributes path resolves within
 * the class's own subtree and instead gates on the column-aware
 * `_has_attribute?`.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE distinguishes an STI-participating class from one that merely names an inheritance_column (inheritance.rb:311); Ruby reads _has_attribute? instead.
 */
export function stiEnabled(modelClass: object): boolean {
  return (modelClass as any)._inheritanceColumn != null;
}

/**
 * Check if a model class is an STI subclass (not the base STI class).
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the `self != base_class` test Ruby writes inline (inheritance.rb:119).
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
 * Get the STI base class for a model.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE Inheritance::ClassMethods#base_class (inheritance.rb:119) as a free function so callers without a Base-typed receiver can reach it.
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
    .typeForAttribute(baseClass.inheritanceColumn as string)!
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
 * @noRailsEquivalent CONVERGEABLE resolves the ApplicationRecord constant Ruby names directly (core.rb:121).
 */
export function getApplicationRecordClass(): typeof Base | null {
  return ActiveRecord.applicationRecordClass as typeof Base | null;
}

/**
 * Returns true if this class is the designated application-record base class.
 * When a primary abstract class has been explicitly set via `primaryAbstractClass`,
 * this compares against that class. Otherwise it falls back to checking whether
 * the class is registered on `globalThis` as `"ApplicationRecord"`.
 *
 * @internal
 * Mirrors: ActiveRecord::Core::ClassMethods#application_record_class?
 * @noRailsEquivalent CONVERGEABLE Core::ClassMethods#application_record_class? (core.rb:121) as a free function; it also exists on Base, and one of the two should go.
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
export function typeCondition(
  modelClass: typeof Base,
  table: any = (modelClass as any).arelTable,
): any {
  const stiColumn = table.get(modelClass.inheritanceColumn);
  const stiNames = ([modelClass] as (typeof Base)[])
    .concat(modelClass.descendants)
    .map((klass) => stiName(klass));

  return (modelClass as any).predicateBuilder.build(stiColumn, stiNames);
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
 * Resolve the subclass to construct for `new modelClass(attrs)`.
 *
 * Mirrors the dispatch in ActiveRecord::Inheritance::ClassMethods#new, which
 * tries three attribute sources in order — the explicit `attrs`, the
 * `current_scope`'s create attributes, then (for a base class) the table's
 * `column_defaults` — stopping at the first that names a subclass. We resolve
 * each through {@link findStiClassInHierarchy} (registry-safe) instead of
 * Rails' constant-lookup `find_sti_class`. `inheritance_column` now always
 * resolves to a name (default `"type"`), and the dispatch is gated on the
 * column-aware `_has_attribute?` — or, for a
 * receiver that is explicitly STI-enabled ({@link stiEnabled}), on that
 * assignment, which is the same structural fact Rails reads off
 * `_has_attribute?`. Rails reads `_has_attribute?` alone because
 * `attribute_types` loads the schema synchronously on first touch; trails
 * cannot query the database from a synchronous constructor, so reflection can
 * still be cold at `new` and the `stiEnabled` arm covers exactly that window
 * (an STI *leaf* whose `type` column had not reflected yet otherwise built
 * as-is where Rails raises). Returns null (no dispatch) when no source names
 * an inheritance value at all.
 *
 * Matching Rails' `subclass_from_attributes` → `find_sti_class`: a receiver
 * carrying a *present* inheritance value that names no subclass of it raises
 * {@link SubclassNotFound} (e.g. `Company.new(type: "Account")` or an unknown
 * `"InvalidType"`) rather than silently building the receiver as-is. All three
 * sources resolve identically — `find_sti_class`'s valid set is
 * `self || descendants` (`inheritance.rb:242-265`), so a scope naming an STI
 * *ancestor* of the receiver raises just as an explicit attribute does. The
 * subtree walk resolves in-hierarchy types registry-safely first, then defers
 * to the global `find_sti_class`, which also resolves a registered subclass not
 * tracked as a descendant and raises for a genuine out-of-hierarchy/unknown
 * type.
 *
 * @internal Used by Base's constructor to dispatch `new` to a subclass.
 * @noRailsEquivalent CONVERGEABLE Inheritance::ClassMethods#subclass_from_attributes (inheritance.rb:331-265) split out of `new` because our reflection can be cold.
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
