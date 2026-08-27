import type { Base } from "../base.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughCantAssociateThroughHasOneOrManyReflection,
  HasOneThroughNestedAssociationsAreReadonly,
} from "./errors.js";
import { compositeQueryConstraintsList } from "../persistence.js";
import { drop } from "../ruby-drop.js";

/**
 * Shared module for through associations (has_many :through, has_one :through).
 * These helpers mirror the private/protected methods in Rails'
 * ActiveRecord::Associations::ThroughAssociation module, which Rails
 * `include`s into both `HasManyThroughAssociation`
 * (has_many_through_association.rb:8) and `HasOneThroughAssociation`
 * (has_one_through_association.rb:7). The `ThroughAssociation` object at the
 * bottom of this file installs them on both prototypes (the trails mixin
 * idiom), so every call site reads exactly as the Ruby does.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation
 */

/**
 * The state a `ThroughAssociation` member reads off `this` — the two
 * `Association` fields plus the sibling members it self-sends.
 *
 * @internal
 */
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

/**
 * Wrap `block` in a transaction on the through-reflection's class.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#transaction
 * (through_association.rb:10-12).
 *
 * @internal
 */
export function transaction<R>(
  this: ThroughAssociationHost,
  block: (tx?: any) => Promise<R> | R,
): Promise<R | undefined> {
  const klass = (this.throughReflection() as { klass: { transaction(b: unknown): unknown } }).klass;
  return klass.transaction(block) as Promise<R | undefined>;
}

/**
 * The reflection resolving the `:source` of this `has_*_through` association.
 *
 * Mirrors Rails' `delegate :source_reflection, to: :reflection`
 * (through_association.rb:7): forwards to the rich reflection's
 * `sourceReflection` getter, resolved via the owner class' association
 * registry (the lightweight `assoc.reflection` is a definition, so we look up
 * the rich reflection by name first).
 */
export function sourceReflection(assoc: { owner: Base; reflection: { name: string } }): unknown {
  const ctor = assoc.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name) ?? assoc.reflection;
  return (refl as { sourceReflection?: unknown })?.sourceReflection ?? null;
}

/**
 * Resolves the AssociationReflection for the `:through` join model, walking
 * past any intermediate through-reflections.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#through_reflection
 * (through_association.rb:14-24).
 *
 * @internal
 */
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

/**
 * Returns the live Association wrapper that owns the join model — i.e.,
 * `owner.association(throughReflection.name)`.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#through_association
 * (through_association.rb:26-28).
 *
 * @internal
 */
export function throughAssociation(this: ThroughAssociationHost): any {
  const tr = this.throughReflection() as { name?: string } | null;
  if (!tr?.name) return null;
  return (this.owner as unknown as { association?: (n: string) => any }).association?.(tr.name);
}

/**
 * Build the join-table attribute hash that pairs `records` with the owner via
 * the source reflection's foreign key (or the source association name when the
 * join is composite-keyed). Used when constructing through records.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#construct_join_attributes
 * (through_association.rb:56-84).
 *
 * @internal
 */
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
  // Mirrors Rails' `Array(association_primary_key) == reflection.klass.composite_query_constraints_list`.
  // For a single-PK join model this is `["id"] == ["id"]` → true, so the join
  // is expressed in association-form (`{ club: record }`) rather than by raw
  // FK value. That form carries the (possibly unsaved) source record itself, so
  // owner autosave cascades to persist it — the FK-value form would stamp a nil
  // id for a new source record.
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

/**
 * Throws when the source reflection is not a `belongsTo` — Rails treats such
 * through associations as read-only because mutating the source side isn't
 * well-defined. The error class is picked off `reflection.has_one?`, exactly as
 * Rails does (through_association.rb:87-91).
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#ensure_mutable
 * (through_association.rb:86-92).
 *
 * @internal
 */
export function ensureMutable(this: ThroughAssociationHost): void {
  const ctor = this.owner.constructor as { _reflectOnAssociation?: (n: string) => any };
  const refl = ctor._reflectOnAssociation?.(this.reflection.name);
  // Rails' `reflection.has_one?`; the lightweight definition is the fallback
  // when no rich reflection is registered, and carries the macro under `type`.
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

/**
 * Throws when this through-association points at another through-association
 * (a "nested through"). Rails treats nested-through chains as read-only, and
 * picks the error class off `reflection.has_one?` (through_association.rb:95-97).
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation#ensure_not_nested
 * (through_association.rb:94-98).
 *
 * @internal
 */
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

/** Ruby's `Array()` Kernel method: `nil` becomes `[]`, an Array passes through. @internal */
function toArray(value: unknown): unknown[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

/**
 * Mirrors Rails' `ThroughAssociation#build_record`
 * (through_association.rb:116-129): when the source reflection is a
 * collection, seed the new record's attributes with the through record's
 * primary key under the source inverse's foreign key, so the built record
 * already points back at the through record. Rails then calls `super`;
 * in trails the caller (`HasManyThroughAssociation#buildRecord`) runs the
 * `super` half itself, so this helper only performs the seeding.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE the pre-super seeding half of ThroughAssociation#build_record (through_association.rb:116-129); the caller runs the super half.
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
      // `Array(nil)` is `[]`, so an unpersisted through target zips to nothing
      // and Rails assigns no attribute at all — a `[undefined]` here would put
      // the foreign key in the built record's attribute hash.
      const primaryKeyValues: unknown[] = toArray(target.id);
      const foreignKeyColumns: string[] = toArray(inverse.foreignKey) as string[];
      primaryKeyValues.map((primaryKeyValue, i) => {
        const foreignKeyColumn = foreignKeyColumns[i];
        if (foreignKeyColumn != null) attributes[foreignKeyColumn] = primaryKeyValue;
      });
    }
  }
}

/** Rails' `include ThroughAssociation` — the module's instance methods. */
export const ThroughAssociation = {
  transaction,
  throughReflection,
  throughAssociation,

  // We merge in these scopes for two reasons:
  //
  //   1. To get the default_scope conditions for any of the other reflections in the chain
  //   2. To get the type conditions for any STI models in the chain
  //
  // Mirrors: ActiveRecord::Associations::ThroughAssociation#target_scope
  // (through_association.rb:34-42).
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
      // Rails: `relation.except(:select, :create_with, :includes, :preload,
      //   :eager_load, :joins, :left_outer_joins)` — strip query parts that
      // would conflict with the JOIN-based target query (e.g. a `select` on
      // the through model would otherwise shadow the target's columns).
      // Must be `except` (value removal), not `unscope`: the result is merged
      // into `scope`, and `unscope` would replay the resets onto `scope`.
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

  // Note: this does not capture all cases, for example it would be impractical
  // to try to properly support stale-checking for nested associations.
  //
  // Rails returns the filtered array itself; `Association#isStaleTarget`
  // compares stale states with `!==`, which on a JS array is identity, so a
  // single value stays scalar and a composite one folds to a comparable string.
  //
  // Mirrors: ActiveRecord::Associations::ThroughAssociation#stale_state
  // (through_association.rb:82-88).
  staleState(this: ThroughAssociationHost): unknown {
    if (!(this.throughReflection() as any)?.isBelongsTo?.()) return null;
    const state = toArray((this.throughReflection() as any).foreignKey)
      .map((foreignKeyColumn) => (this.owner as any).readAttribute(foreignKeyColumn as string))
      .filter((value) => value != null);
    if (state.length === 0) return null;
    return state.length === 1 ? state[0] : JSON.stringify(state);
  },

  /**
   * Mirrors: ActiveRecord::Associations::ThroughAssociation#foreign_key_present?
   * (through_association.rb:90-94).
   */
  foreignKeyPresent(this: ThroughAssociationHost): boolean {
    if (!(this.throughReflection() as any)?.isBelongsTo?.()) return false;
    return toArray((this.throughReflection() as any).foreignKey).every(
      (foreignKeyColumn) => (this.owner as any).readAttribute(foreignKeyColumn as string) != null,
    );
  },

  ensureMutable,
  ensureNotNested,
};
