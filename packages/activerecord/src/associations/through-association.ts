import type { Base } from "../base.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughCantAssociateThroughHasOneOrManyReflection,
  HasOneThroughNestedAssociationsAreReadonly,
} from "./errors.js";
import { compositeQueryConstraintsList } from "../persistence.js";
import { drop, isNil, Module, zip } from "@blazetrails/ruby-compat";
import { filterMap, kernelArray as Array, presence } from "@blazetrails/activesupport";

/** @internal */
export interface ThroughAssociationHost {
  owner: Base;
  reflection: any;
  /** @internal */
  throughReflection(): any;
  /** @internal */
  throughAssociation(): any;
  /** @internal */
  ensureMutable(): void;
  /** @internal */
  sourceReflection(): {
    isCollection(): boolean;
    inverseOf(): { foreignKey(): string | string[] } | null | undefined;
  };
}

/** @internal */
export function transaction<R>(
  this: ThroughAssociationHost,
  block: (tx?: any) => Promise<R> | R,
): Promise<R | undefined> {
  const klass = (this.throughReflection() as { klass: { transaction(b: unknown): unknown } }).klass;
  return klass.transaction(block) as Promise<R | undefined>;
}

export function sourceReflection(assoc: { owner: Base; reflection: { name: string } }): unknown {
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name) ?? assoc.reflection;
  return (refl as { sourceReflection?: unknown })?.sourceReflection ?? null;
}

/** @internal */
export function throughReflection(this: ThroughAssociationHost): unknown {
  type Refl = {
    throughReflection?: Refl | null;
    isThroughReflection?: () => boolean;
  };
  const ctor = this.owner.constructor as { _reflectOnAssociation?: (n: string) => Refl | null };
  let refl: Refl | null =
    (ctor._reflectOnAssociation?.(this.reflection.name) as Refl | null)?.throughReflection ?? null;
  if (!refl) {
    const throughName = this.reflection.options.through;
    if (!throughName) return null;
    refl = ctor._reflectOnAssociation?.(throughName) ?? null;
  }
  while (refl?.isThroughReflection?.() && refl.throughReflection) {
    refl = refl.throughReflection;
  }
  return refl;
}

/** @internal */
export function throughAssociation(this: ThroughAssociationHost): any {
  const tr = this.throughReflection() as { name?: string } | null;
  if (!tr?.name) return null;
  return (this.owner as unknown as { association?: (n: string) => any }).association?.(tr.name);
}

/** @internal */
export function targetScope(this: ThroughAssociationHost): any {
  const scope = ThroughAssociation.superMethod(this, "targetScope")!() as any;
  for (const reflection of drop<any>(this.reflection.chain, 1)) {
    const relation = reflection.klass.scopeForAssociation();
    scope.mergeBang(
      relation.except(
        "select",
        "createWith",
        "includes",
        "preload",
        "eagerLoad",
        "joins",
        "leftOuterJoins",
      ),
    );
  }
  return scope;
}

/** @internal */
export function constructJoinAttributes(
  this: ThroughAssociationHost,
  ...records: Base[]
): Record<string, unknown> {
  this.ensureMutable();
  const ctor = this.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(this.reflection.name);
  const sourceRefl = refl?.sourceReflection;
  if (!sourceRefl) return {};
  const assocPk = sourceRefl.associationPrimaryKey?.(refl.klass) ?? sourceRefl.primaryKey ?? "id";
  const pkArr: string[] = Array(assocPk);
  const compositeConstraints: string[] = compositeQueryConstraintsList.call(refl.klass);

  let joinAttributes: Record<string, unknown>;
  if (
    pkArr.length === compositeConstraints.length &&
    pkArr.every((k: string, i: number) => k === compositeConstraints[i]) &&
    !refl.options?.sourceType
  ) {
    joinAttributes = { [sourceRefl.name]: records.length === 1 ? records[0] : records };
  } else {
    const fk: string = sourceRefl.foreignKey() ?? `${sourceRefl.name}_id`;
    const read = (r: any, k: string) => r._readAttribute?.(k) ?? r.readAttribute?.(k);
    const values = records.map((r: any) =>
      pkArr.length === 1 ? (read(r, pkArr[0]) ?? r.id) : pkArr.map((k: string) => read(r, k)),
    );
    joinAttributes = { [fk]: records.length === 1 ? values[0] : values };
  }

  if (refl.options?.sourceType) {
    const foreignType: string = sourceRefl.foreignType ?? `${sourceRefl.name}_type`;
    joinAttributes[foreignType] =
      records.length === 1 ? refl.options.sourceType : [refl.options.sourceType];
  }
  return joinAttributes;
}

/** @internal */
export function staleState(this: ThroughAssociationHost): unknown[] | null {
  if (this.throughReflection().isBelongsTo()) {
    return (
      presence(
        filterMap(Array(this.throughReflection().foreignKey()), (foreignKeyColumn) =>
          this.owner.get(foreignKeyColumn),
        ),
      ) ?? null
    );
  }
  return null;
}

/** @internal */
export function foreignKeyPresent(this: ThroughAssociationHost): boolean {
  return (
    this.throughReflection().isBelongsTo() &&
    Array(this.throughReflection().foreignKey()).every(
      (foreignKeyColumn) => !isNil(this.owner.get(foreignKeyColumn)),
    )
  );
}

/** @internal */
export function ensureMutable(this: ThroughAssociationHost): void {
  const ctor = this.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(this.reflection.name);
  const hasOne: boolean = refl?.isHasOne?.() ?? this.reflection.type === "hasOne";
  const sourceRefl = refl?.sourceReflection as
    | { isBelongsTo?: () => boolean; macro?: string }
    | undefined;
  const isBelongs = sourceRefl?.isBelongsTo?.() ?? sourceRefl?.macro === "belongsTo";
  if (!isBelongs) {
    const ownerName = (this.owner.constructor as { name: string }).name;
    if (hasOne) {
      throw new HasOneThroughCantAssociateThroughHasOneOrManyReflection(
        ownerName,
        this.reflection.name,
      );
    } else {
      throw new HasManyThroughCantAssociateThroughHasOneOrManyReflection(
        ownerName,
        this.reflection.name,
      );
    }
  }
}

/** @internal */
export function ensureNotNested(this: ThroughAssociationHost): void {
  const ctor = this.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(this.reflection.name) as {
    isNested?: () => boolean;
    isHasOne?: () => boolean;
  } | null;
  if (refl?.isNested?.()) {
    if (refl.isHasOne?.() ?? this.reflection.type === "hasOne") {
      throw new HasOneThroughNestedAssociationsAreReadonly(this.owner, this.reflection);
    } else {
      throw new HasManyThroughNestedAssociationsAreReadonly(this.owner, this.reflection);
    }
  }
}

/** @internal */
export function buildRecord(
  this: ThroughAssociationHost,
  attributes: Record<string, unknown>,
  block?: (record: Base) => void,
): Base | null {
  if (this.sourceReflection().isCollection()) {
    const inverse = this.sourceReflection().inverseOf();
    const target = this.throughAssociation().target;

    if (inverse != null && target != null && !globalThis.Array.isArray(target)) {
      zip(Array(target.id), Array(inverse.foreignKey())).map(
        ([primaryKeyValue, foreignKeyColumn]) => {
          attributes[foreignKeyColumn as string] = primaryKeyValue;
        },
      );
    }
  }

  return ThroughAssociation.superMethod(this, "buildRecord")!(attributes, block) as Base | null;
}

export const ThroughAssociation: Module = new Module((mod) =>
  mod.include({
    transaction,
    throughReflection,
    throughAssociation,
    targetScope,
    constructJoinAttributes,
    staleState,
    foreignKeyPresent,
    ensureMutable,
    ensureNotNested,
    buildRecord,
  }),
);
