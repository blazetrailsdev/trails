import type { Base } from "./base.js";
import { modelRegistry, registerModelConstant } from "./associations.js";
import { ActiveRecordError, NameError, SubclassNotFound } from "./errors.js";
import { ActiveRecord } from "./namespaces.js";
import { IndexedRow } from "./result.js";
import {
  camelize,
  classAttribute,
  constantize,
  included,
  isPresent,
  safeConstantize,
  underscore,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { rbClassSuperclass, rbModName } from "@blazetrails/ruby-compat";
import { DescendantsTracker, demodulize } from "@blazetrails/activesupport";
import { applicationRecordClass, setApplicationRecordClass } from "./active-record.js";

export interface Inheritance {
  readonly storeFullClassName: boolean;
  readonly storeFullStiClass: boolean;
}

export const Inheritance = {
  [included](base: object): void {
    classAttribute.call(base, "storeFullClassName", { instanceWriter: false, default: true });
    classAttribute.call(base, "storeFullStiClass", { instanceWriter: false, default: true });

    setBaseClass(base as typeof Base);
  },
};

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
  } else {
    const klass = baseClass as typeof Base & { _typeCandidatesCache: Map<string, string> };
    if (!Object.prototype.hasOwnProperty.call(klass, "_typeCandidatesCache")) {
      klass._typeCandidatesCache = new Map();
    }
    const typeCandidate = klass._typeCandidatesCache.get(typeName);
    let typeConstant: typeof Base | null | undefined;
    if (
      typeCandidate != null &&
      (typeConstant = safeConstantize(typeCandidate) as typeof Base | null | undefined) != null
    ) {
      return typeConstant;
    }

    const candidates: string[] = [];
    const name = rbModName(baseClass)!;
    for (const match of name.matchAll(/::|$/g)) {
      candidates.unshift(`${name.slice(0, match.index)}::${typeName}`);
    }
    candidates.push(typeName);

    for (const candidate of candidates) {
      const constant = safeConstantize(candidate) as typeof Base | null | undefined;
      if (constant != null && candidate === rbModName(constant)) {
        klass._typeCandidatesCache.set(typeName, candidate);
        return constant;
      }
    }

    throw new NameError(`uninitialized constant ${candidates[0]}`, candidates[0]);
  }
}

export function isDescendsFromActiveRecord(this: typeof Base): boolean {
  const modelClass = this;
  if (Object.prototype.hasOwnProperty.call(modelClass, "_isActiveRecordBase")) return false;
  const superclass = rbClassSuperclass(modelClass);
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
  const klass = modelClass as typeof Base & { _computedBaseClass?: typeof Base };
  if (modelClass === ActiveRecord.Base) {
    klass._computedBaseClass = modelClass;
  } else {
    if (!(modelClass.prototype instanceof ActiveRecord.Base)) {
      throw new ActiveRecordError(
        `${modelClass.name} doesn't belong in a hierarchy descending from ActiveRecord`,
      );
    }

    const superclass = rbClassSuperclass(modelClass)!;
    if (superclass === ActiveRecord.Base || superclass.abstractClass) {
      klass._computedBaseClass = modelClass;
    } else {
      klass._computedBaseClass = baseClass.call(superclass);
    }
  }
}

export function stiName(modelClass: typeof Base): string | null {
  const name = rbModName(modelClass);
  const klass = modelClass as typeof Base & {
    storeFullStiClass?: boolean;
    storeFullClassName?: boolean;
  };
  return klass.storeFullStiClass && klass.storeFullClassName ? name : demodulize(name!);
}

export function polymorphicName(modelClass: typeof Base): string {
  const base = baseClass.call(modelClass);
  const name = rbModName(base)!;
  const klass = modelClass as typeof Base & { storeFullClassName?: boolean };
  return klass.storeFullClassName ? name : demodulize(name);
}

/** @noRailsEquivalent CONVERGEABLE model-class-names-resolve-through-constantize-not-a-model-registry */
export function registerSubclass(klass: typeof Base): void {
  const parent = rbClassSuperclass(klass);
  if (!parent) return;
  if (klass.name) registerModelConstant(klass.name, klass);
  DescendantsTracker.registerSubclass(parent as never, klass as never);
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
export function findStiClass(this: typeof Base, typeName: string): typeof Base {
  typeName = this.baseClass
    .typeForAttribute(this.inheritanceColumn as string)!
    .cast(typeName) as string;

  const subclass = this.stiClassFor(typeName);

  if (!(subclass === this || this.descendants.includes(subclass))) {
    throw new SubclassNotFound(
      `Invalid single-table inheritance type: ${rbModName(subclass)} is not a subclass of ${rbModName(this)}`,
    );
  }

  return subclass;
}

export function isFinderNeedsTypeCondition(modelClass: typeof Base): boolean {
  if (!Object.prototype.hasOwnProperty.call(modelClass, "_finderNeedsTypeCondition")) {
    (modelClass as any)._finderNeedsTypeCondition = !modelClass.isDescendsFromActiveRecord();
  }
  return (modelClass as any)._finderNeedsTypeCondition === true;
}

export function __resetPrimaryAbstractClass(): void {
  setApplicationRecordClass(null);
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE resolves the ApplicationRecord constant Ruby names directly (core.rb:121).
 */
export function getApplicationRecordClass(): typeof Base | null {
  return applicationRecordClass() as typeof Base | null;
}

export function primaryAbstractClass(modelClass: typeof Base): void {
  if (applicationRecordClass() && applicationRecordClass()!.name !== modelClass.name) {
    throw new ArgumentError(
      `The \`primary_abstract_class\` is already set to ${applicationRecordClass()!.name}. ` +
        "There can only be one `primary_abstract_class` in an application.",
    );
  }
  (modelClass as any).abstractClass = true;
  setApplicationRecordClass(modelClass);
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

export function initializeClone(
  this: typeof Base,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  super_(other);
  setBaseClass(this);
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
  this: typeof Base,
  record: Record<string, unknown> | IndexedRow,
): typeof Base {
  if (this.usingSingleTableInheritance(record)) {
    const inheritanceColumn = this.inheritanceColumn as string;
    return this.findStiClass(
      (record instanceof IndexedRow
        ? record.get(inheritanceColumn)
        : record[inheritanceColumn]) as string,
    );
  } else {
    return this;
  }
}

/** @internal */
export function usingSingleTableInheritance(
  this: typeof Base,
  record: Record<string, unknown> | IndexedRow,
): boolean {
  const inheritanceColumn = this.inheritanceColumn as string;
  return (
    isPresent(
      record instanceof IndexedRow ? record.get(inheritanceColumn) : record[inheritanceColumn],
    ) && this._hasAttribute(inheritanceColumn)
  );
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
  this: typeof Base,
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

  const subclassName = attrsHash[this.inheritanceColumn as string];

  if (isPresent(subclassName)) {
    return this.findStiClass(subclassName as string);
  }
  return null;
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
  for (const klass of [baseClass, ...baseClass.descendants]) {
    if (stiName(klass) === typeName || klass === registered) return klass;
  }
  return null;
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
    return modelClass.findStiClass(typeName);
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
