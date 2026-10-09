import type { Base } from "./base.js";
import { registerModelConstant } from "./associations.js";
import { ActiveRecordError, NameError, SubclassNotFound } from "./errors.js";
import { ActiveRecord } from "./namespaces.js";
import type { IndexedRow } from "./result.js";
import {
  classAttribute,
  constantize,
  included,
  isPlainObject,
  isPresent,
  safeConstantize,
} from "@blazetrails/activesupport";
import { ArgumentError } from "@blazetrails/activemodel";
import { hashAref, rbClassSuperclass, rbModName, rbObjRespondTo } from "@blazetrails/ruby-compat";
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
  if (this === ActiveRecord.Base) {
    return false;
  } else if (rbClassSuperclass(this)!.abstractClass) {
    return rbClassSuperclass(this)!.isDescendsFromActiveRecord();
  } else {
    return (
      rbClassSuperclass(this) === ActiveRecord.Base ||
      !Object.keys(this.columnsHash()).includes(this.inheritanceColumn as string)
    );
  }
}

export function isBaseClass(modelClass: typeof Base): boolean {
  return modelClass.baseClass === modelClass;
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

/** @noRailsEquivalent CONVERGEABLE model-registry-and-register-model-are-deleted */
export function registerSubclass(klass: typeof Base): void {
  const parent = rbClassSuperclass(klass);
  if (!parent) return;
  if (klass.name) registerModelConstant(klass.name, klass);
  DescendantsTracker.registerSubclass(parent as never, klass as never);
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
  if (klass.isFinderNeedsTypeCondition()) {
    this._writeAttribute(klass.inheritanceColumn as string, klass.stiName());
  }
}

/** @internal */
export function discriminateClassForRecord(
  this: typeof Base,
  record: Record<string, unknown> | IndexedRow,
): typeof Base {
  if (this.usingSingleTableInheritance(record)) {
    return this.findStiClass(hashAref(record, this.inheritanceColumn) as string);
  } else {
    return this;
  }
}

/** @internal */
export function usingSingleTableInheritance(
  this: typeof Base,
  record: Record<string, unknown> | IndexedRow,
): boolean {
  return (
    isPresent(hashAref(record, this.inheritanceColumn)) &&
    this._hasAttribute(this.inheritanceColumn as string)
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
  if (rbObjRespondTo(attrs, "permitted")) {
    attrs = (attrs as unknown as { toH(): Record<string, unknown> }).toH();
  }

  if (attrs instanceof Map || isPlainObject(attrs)) {
    const subclassName = hashAref(attrs, this.inheritanceColumn);

    if (isPresent(subclassName)) {
      return this.findStiClass(subclassName as string);
    }
  }
  return null;
}
