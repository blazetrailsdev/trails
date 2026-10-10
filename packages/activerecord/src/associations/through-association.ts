import type { Base } from "../base.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughCantAssociateThroughHasOneOrManyReflection,
  HasOneThroughNestedAssociationsAreReadonly,
} from "./errors.js";
import { compositeQueryConstraintsList } from "../persistence.js";
import {
  drop,
  first,
  isNil,
  Module,
  rbEqual,
  transformValues,
  zip,
} from "@blazetrails/ruby-compat";
import { delegate, filterMap, kernelArray as Array, presence } from "@blazetrails/activesupport";

/** @internal */
export interface ThroughAssociationHost {
  owner: Base;
  reflection: any;
  options: any;
  /** @internal */
  _throughReflection?: any;
  /** @internal */
  _throughAssociation?: any;
  /** @internal */
  throughReflection(): any;
  /** @internal */
  throughAssociation(): any;
  /** @internal */
  ensureMutable(): void;
  /** @internal */
  sourceReflection(): any;
}

/** @internal */
export function transaction<R>(
  this: ThroughAssociationHost,
  block: (tx?: any) => Promise<R> | R,
): Promise<R | undefined> {
  const klass = (this.throughReflection() as { klass: { transaction(b: unknown): unknown } }).klass;
  return klass.transaction(block) as Promise<R | undefined>;
}

/** @internal */
export function throughReflection(this: ThroughAssociationHost): any {
  return (this._throughReflection ??= (() => {
    let refl = this.reflection.throughReflection;

    while (refl.isThroughReflection()) {
      refl = refl.throughReflection;
    }

    return refl;
  })());
}

/** @internal */
export function throughAssociation(this: ThroughAssociationHost): any {
  return (this._throughAssociation ??= this.owner.association(this.throughReflection().name));
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

  const associationPrimaryKey = this.sourceReflection().associationPrimaryKey(
    this.reflection.klass,
  );

  let joinAttributes: Record<string, unknown>;
  if (
    rbEqual(
      Array(associationPrimaryKey),
      compositeQueryConstraintsList.call(this.reflection.klass),
    ) &&
    this.options.sourceType == null
  ) {
    joinAttributes = { [this.sourceReflection().name]: records };
  } else {
    const assocPkValues = records.map((record) =>
      record._readAttribute(associationPrimaryKey as string),
    );
    joinAttributes = { [this.sourceReflection().foreignKey() as string]: assocPkValues };
  }

  if (this.options.sourceType != null) {
    joinAttributes[this.sourceReflection().foreignType] = [this.options.sourceType];
  }

  if (records.length === 1) {
    return transformValues(joinAttributes, (value) => first(value as unknown[]));
  } else {
    return joinAttributes;
  }
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
  if (!this.sourceReflection().isBelongsTo()) {
    const ownerName = (this.owner.constructor as { name: string }).name;
    if (this.reflection.isHasOne()) {
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
  if (this.reflection.isNested()) {
    if (this.reflection.isHasOne()) {
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

export const ThroughAssociation: Module = new Module((mod) => {
  delegate.call(mod, "sourceReflection", { to: "reflection" });

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
  });
});
