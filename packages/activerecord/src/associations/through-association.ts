import type { Base } from "../base.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughCantAssociateThroughHasOneOrManyReflection,
  HasOneThroughNestedAssociationsAreReadonly,
} from "./errors.js";
import { compositeQueryConstraintsList } from "../persistence.js";
import { drop } from "../ruby-drop.js";

/** @internal */
export interface ThroughAssociationHost {
  owner: Base;
  reflection: any;
  /** @internal */
  throughReflection(): unknown;
  /** @internal */
  throughAssociation(): unknown;
  /** @internal */
  ensureMutable(): void;
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
export function constructJoinAttributes(
  this: ThroughAssociationHost,
  ...records: Base[]
): Record<string, unknown> {
  this.ensureMutable();
  const ctor = this.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(this.reflection.name);
  const sourceRefl = refl?.sourceReflection;
  if (!sourceRefl) return {};
  const reflKlass = refl.klass;
  const assocPk = sourceRefl.associationPrimaryKey?.(reflKlass) ?? sourceRefl.primaryKey ?? "id";
  const pkArr: string[] = Array.isArray(assocPk) ? assocPk : [assocPk];
  const compositeConstraints: string[] = compositeQueryConstraintsList.call(reflKlass);

  let joinAttributes: Record<string, unknown>;
  if (
    pkArr.length === compositeConstraints.length &&
    pkArr.every((k: string, i: number) => k === compositeConstraints[i]) &&
    !refl.options?.sourceType
  ) {
    joinAttributes = { [sourceRefl.name]: records.length === 1 ? records[0] : records };
  } else {
    const fk: string = sourceRefl.foreignKey ?? `${sourceRefl.name}_id`;
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
function toArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE
 */
export function throughBuildRecord(
  assoc: { owner: Base; reflection: any },
  attributes: Record<string, unknown>,
): void {
  const srcRefl = sourceReflection(assoc) as any;
  if (srcRefl?.isCollection?.()) {
    const inverse = srcRefl.inverseOf?.();
    const target = throughAssociation.call(assoc as unknown as ThroughAssociationHost)?.target;

    if (inverse && target && !Array.isArray(target)) {
      const primaryKeyValues: unknown[] = toArray(target.id);
      const foreignKeyColumns: string[] = toArray(inverse.foreignKey) as string[];
      primaryKeyValues.map((primaryKeyValue, i) => {
        const foreignKeyColumn = foreignKeyColumns[i];
        if (foreignKeyColumn != null) attributes[foreignKeyColumn] = primaryKeyValue;
      });
    }
  }
}

export const ThroughAssociation = {
  transaction,
  throughReflection,
  throughAssociation,

  targetScope(this: ThroughAssociationHost): any {
    let scope = super.targetScope();
    if (!scope) return scope;
    const ctor = this.owner.constructor as {
      _reflectOnAssociation?: (n: string) => unknown;
    };
    const refl = ctor._reflectOnAssociation?.(this.reflection.name) as
      | { chain?: Array<{ klass?: { scopeForAssociation?: () => unknown } }> }
      | null
      | undefined;
    const chain = refl?.chain;
    if (!chain) return scope;
    for (const reflection of drop(chain, 1)) {
      let relation = reflection?.klass?.scopeForAssociation?.();
      if (relation && typeof (relation as { except?: unknown }).except === "function") {
        relation = (relation as { except: (...keys: string[]) => unknown }).except(
          "select",
          "createWith",
          "includes",
          "preload",
          "eagerLoad",
          "joins",
          "leftOuterJoins",
        );
      }
      if (relation && typeof (scope as { merge?: unknown }).merge === "function") {
        scope = (scope as { merge: (r: unknown) => unknown }).merge(relation);
      }
    }
    return scope;
  },

  constructJoinAttributes,

  staleState(this: ThroughAssociationHost): unknown {
    if (!(this.throughReflection() as any)?.isBelongsTo?.()) return null;
    const state = toArray((this.throughReflection() as any).foreignKey)
      .map((foreignKeyColumn) => (this.owner as any).readAttribute(foreignKeyColumn as string))
      .filter((value) => value != null);
    if (state.length === 0) return null;
    return state.length === 1 ? state[0] : JSON.stringify(state);
  },

  foreignKeyPresent(this: ThroughAssociationHost): boolean {
    if (!(this.throughReflection() as any)?.isBelongsTo?.()) return false;
    return toArray((this.throughReflection() as any).foreignKey).every(
      (foreignKeyColumn) => (this.owner as any).readAttribute(foreignKeyColumn as string) != null,
    );
  },

  ensureMutable,
  ensureNotNested,
};
