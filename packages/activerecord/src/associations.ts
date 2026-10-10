import type { Base } from "./base.js";
import type { AssociationReflection, ThroughReflection } from "./reflection.js";
import "./relation.js";
import type { Relation } from "./relation.js";
import { ActiveRecord, Associations as AssociationsNamespace } from "./namespaces.js";

import { ArgumentError } from "@blazetrails/activemodel";
import { AssociationNotFoundError } from "./associations/errors.js";
import type { Association as AssociationInstance } from "./associations/association.js";
export { joinTableName as joinHabtmTableNames } from "./migration/join-table.js";
import { Autoload, DescendantsTracker } from "@blazetrails/activesupport";
import { BelongsTo as BelongsToBuilder } from "./associations/builder/belongs-to.js";
import { HasOne as HasOneBuilder } from "./associations/builder/has-one.js";
import { HasMany as HasManyBuilder } from "./associations/builder/has-many.js";
import { HasAndBelongsToMany as HabtmBuilder } from "./associations/builder/has-and-belongs-to-many.js";
import * as Reflection from "./reflection.js";
import {
  Module,
  include,
  rbClassInheritedP,
  rbClassSuperclass,
  rbModConstSet,
  rbModName,
  registerConstant,
} from "@blazetrails/ruby-compat";

export type CollectionCallback<K extends string> =
  | string
  | ((owner: Base, record: Base) => void | false)
  | { [P in K]: (owner: Base, record: Base) => void | false };

export interface AssociationOptions {
  foreignKey?: string | string[];
  className?: string;
  anonymousClass?: typeof Base;
  primaryKey?: string | string[];
  queryConstraints?: string[];
  dependent?:
    | "destroy"
    | "destroyAsync"
    | "nullify"
    | "delete"
    | "deleteAll"
    | "restrictWithException"
    | "restrictWithError";
  ensuringOwnerWas?: string;
  inverseOf?: string | false;
  through?: string;
  source?: string;
  sourceType?: string;
  polymorphic?: boolean;
  as?: string;
  counterCache?: boolean | string;
  touch?: boolean | string | string[];
  autosave?: boolean;
  validate?: boolean;
  required?: boolean;
  optional?: boolean;
  default?: (owner: Base) => Base | null | Promise<Base | null>;
  beforeAdd?: CollectionCallback<"beforeAdd"> | CollectionCallback<"beforeAdd">[];
  afterAdd?: CollectionCallback<"afterAdd"> | CollectionCallback<"afterAdd">[];
  beforeRemove?: CollectionCallback<"beforeRemove"> | CollectionCallback<"beforeRemove">[];
  afterRemove?: CollectionCallback<"afterRemove"> | CollectionCallback<"afterRemove">[];
  extend?:
    | Record<string, (...args: unknown[]) => unknown>
    | Module
    | Array<Record<string, (...args: unknown[]) => unknown> | Module>;
  disableJoins?: boolean;
  associationForeignKey?: string;
  foreignType?: string;
  strictLoading?: boolean;
  indexErrors?: boolean | "nestedAttributesOrder";
}

export type AssociationDefinition = (AssociationReflection | ThroughReflection) & {
  readonly options: AssociationOptions & { joinTable?: string };
};

/** @internal */
export interface ReflectionLike {
  joinForeignKey: string | string[];
  throughReflection?: { joinForeignKey: string | string[] } | null;
  scope?: ((...args: any[]) => any) | null;
  klass: typeof Base;
  activeRecordPrimaryKey?: string | string[];
  isThroughReflection?: () => boolean;
  isNested?: () => boolean;
  sourceReflection?: { belongsTo?: () => boolean; isPolymorphic?: () => boolean } | null;
}

/** @internal */
function assertActiveRecordBase(model: typeof Base): void {
  if (typeof model !== "function" || rbClassInheritedP(model, ActiveRecord.Base) !== true) {
    throw new ArgumentError(
      `registerModel expects an ActiveRecord::Base subclass, got ${String(model?.name ?? model)}`,
    );
  }
}

/** @noRailsEquivalent PERMANENT */
export function registerModel(model: typeof Base): void;
export function registerModel(name: string, model: typeof Base): void;
export function registerModel(models: (typeof Base)[]): void;
export function registerModel(
  nameOrModel: string | typeof Base | (typeof Base)[],
  model?: typeof Base,
): void {
  if (Array.isArray(nameOrModel)) {
    for (const m of nameOrModel) registerModel(m);
    return;
  }
  if (typeof nameOrModel === "string") {
    if (!model) throw new ArgumentError("registerModel(name, model) requires a model class");
    assertActiveRecordBase(model);
    registerConstant(nameOrModel, model);
  } else {
    model = nameOrModel;
    assertActiveRecordBase(model);
    registerConstant(model.name, model);
    const qualified = rbModName(model)!;
    if (qualified !== model.name) registerConstant(qualified, model);
  }
  if (model === ActiveRecord.Base) return;
  DescendantsTracker.registerSubclass(rbClassSuperclass(model) as never, model as never);
}

/** @internal */
export function _cacheSingularTarget(record: Base, assocName: string, target: Base | null): void {
  const macro = (record.constructor as typeof Base)._reflectOnAssociation?.(assocName)?.macro;
  if (macro === "belongsTo" || macro === "hasOne") {
    const assoc = record.association(assocName);
    assoc.inversedFrom(target);
    return;
  }
  (associationInstanceGet.call(record, assocName) as AssociationInstance | null)?.inversedFrom(
    target,
  );
}

export class Associations {
  static belongsTo(
    name: string,
    scope: ((...args: any[]) => any) | AssociationOptions | null = {},
    options: AssociationOptions = {},
  ): void {
    const reflection = BelongsToBuilder.build(
      this,
      name,
      scope as ((...args: any[]) => any) | Record<string, unknown> | null,
      options as Record<string, unknown>,
    );
    Reflection.addReflection(this as any, name, reflection);
  }

  static hasOne(
    name: string,
    scope: ((...args: any[]) => any) | AssociationOptions | null = {},
    options: AssociationOptions = {},
  ): void {
    const reflection = HasOneBuilder.build(
      this,
      name,
      scope as ((...args: any[]) => any) | Record<string, unknown> | null,
      options as Record<string, unknown>,
    );
    Reflection.addReflection(this as any, name, reflection);
  }

  static hasMany(
    name: string,
    scope: ((...args: any[]) => any) | AssociationOptions | null = {},
    options: AssociationOptions = {},
    extension?: (mod: Module) => void,
  ): void {
    const reflection = HasManyBuilder.build(
      this,
      name,
      scope as ((...args: any[]) => any) | Record<string, unknown> | null,
      options as Record<string, unknown>,
      extension,
    );
    Reflection.addReflection(this as any, name, reflection);
  }

  static hasAndBelongsToMany(
    name: string,
    scope: ((...args: any[]) => any) | (AssociationOptions & { joinTable?: string }) | null = {},
    options: AssociationOptions & { joinTable?: string } = {},
    extension?: (mod: Module) => void,
  ): void {
    if (
      typeof scope === "object" &&
      scope !== null &&
      !Array.isArray(scope) &&
      !(scope instanceof Function)
    ) {
      options = scope;
      scope = null;
    }
    const self = this as any;
    const habtmReflection = new Reflection.HasAndBelongsToManyReflection(
      name,
      scope as ((...args: any[]) => any) | null,
      options as Record<string, unknown>,
      self,
    );

    const builder = new HabtmBuilder(name, self, options as Record<string, unknown>);

    const joinModel = builder.throughModel();

    rbModConstSet(self, joinModel.name, joinModel);

    const middleReflection = builder.middleReflection(joinModel);
    HasManyBuilder.defineCallbacks(self, middleReflection);
    Reflection.addReflection(self, middleReflection.name, middleReflection);
    middleReflection.parentReflection = habtmReflection;

    include(
      this,
      new Module((mod) => {
        mod.defineMethod("destroyAssociations", async function (this: any): Promise<void> {
          await this.association(middleReflection.name).deleteAll("deleteAll");
          this.association(name).reset();
          await mod.superMethod(this, "destroyAssociations")!();
        });
      }),
    );

    const hmOptions: Record<string, unknown> = {};
    hmOptions.through = middleReflection.name;
    hmOptions.source = joinModel.rightReflection.name;

    for (const k of [
      "beforeAdd",
      "afterAdd",
      "beforeRemove",
      "afterRemove",
      "autosave",
      "validate",
      "joinTable",
      "className",
      "extend",
      "strictLoading",
    ] as const) {
      if (Object.prototype.hasOwnProperty.call(options, k)) hmOptions[k] = options[k];
    }

    this.hasMany(name, scope as ((...args: any[]) => any) | null, hmOptions, extension);
    (self._reflections as Record<string, { parentReflection?: unknown }>)[name].parentReflection =
      habtmReflection;
  }
}

export function isAssociationCached(this: Base, name: string): boolean {
  return this._associationCache.has(name);
}

/** @internal */
export function _scopeForAssociation(model: typeof Base): Relation<Base> {
  return (
    (model as unknown as { scopeForAssociation?(): Relation<Base> }).scopeForAssociation?.() ??
    model.all()
  );
}

/** @internal */
export function _buildAssociationInstance(
  this: Base,
  assocDef: AssociationDefinition,
): AssociationInstance {
  const opts = (assocDef.options ?? {}) as Record<string, unknown>;
  switch (assocDef.macro) {
    case "belongsTo":
      if (opts.polymorphic)
        return new AssociationsNamespace.BelongsToPolymorphicAssociation(this, assocDef as any);
      return new AssociationsNamespace.BelongsToAssociation(this, assocDef as any);
    case "hasOne":
      if (opts.through)
        return new AssociationsNamespace.HasOneThroughAssociation(this, assocDef as any);
      return new AssociationsNamespace.HasOneAssociation(this, assocDef as any);
    case "hasMany":
      if (opts.through)
        return new AssociationsNamespace.HasManyThroughAssociation(this, assocDef as any);
      return new AssociationsNamespace.HasManyAssociation(this, assocDef as any);
    default:
      return new AssociationsNamespace.HasManyThroughAssociation(this, assocDef as any);
  }
}

export async function eagerLoadBang(this: typeof AssociationsNamespace): Promise<void> {
  await Autoload.eagerLoadBang.call(this);
  await this.Preloader.eagerLoadBang();
  await this.JoinDependency.eagerLoadBang();
}

export function association(this: Base, name: string): AssociationInstance {
  const existing = associationInstanceGet.call(this, name) as AssociationInstance | null;
  if (existing) return existing;

  const ctor = this.constructor as typeof Base;
  const assocDef = ctor._reflectOnAssociation?.(name) as unknown as
    | AssociationDefinition
    | undefined;
  if (!assocDef) {
    throw new AssociationNotFoundError(this, name);
  }

  const instance = _buildAssociationInstance.call(this, assocDef);
  associationInstanceSet.call(this, name, instance);
  return instance;
}

/** @internal */
export function initInternals(this: Base): void {
  AssociationsNamespace.superMethod(this, "initInternals")!();
  this._associationCache = new Map();
}

export function initializeDup(this: Base, other: unknown): void {
  this._associationCache = new Map();
  AssociationsNamespace.superMethod(this, "initializeDup")!(other);
}

AssociationsNamespace.defineMethod("initInternals", initInternals);
AssociationsNamespace.defineMethod("initializeDup", initializeDup);

/** @internal */
export function associationInstanceGet(this: Base, name: string): unknown {
  return this._associationCache.get(name) ?? null;
}

/** @internal */
export function associationInstanceSet(this: Base, name: string, association: unknown): void {
  this._associationCache.set(name, association as AssociationInstance);
}

Object.defineProperty(AssociationsNamespace, "eagerLoadBang", {
  value: eagerLoadBang,
  writable: true,
  configurable: true,
});
