import type { Base } from "../base.js";
import {
  HasManyThroughCantAssociateThroughHasOneOrManyReflection,
  HasManyThroughNestedAssociationsAreReadonly,
  HasOneThroughCantAssociateThroughHasOneOrManyReflection,
  HasOneThroughNestedAssociationsAreReadonly,
} from "./errors.js";
import { compositeQueryConstraintsList } from "../persistence.js";

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

// A third copy of the subclass files' `safeKlass`: `constructJoinAttributes`
// needs `reflection.klass` before `checkValidityBang` has run, where the getter
// throws. Not a Rails member, so hoisting it to a shared home would be new
// non-Rails surface in a file `parity:api` scores — it stays file-local until
// the guard itself is retired.
function safeKlass(refl: { klass?: unknown } | null | undefined): any {
  try {
    return refl?.klass ?? null;
  } catch {
    return null;
  }
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
  // Resolve the rich reflection first — this.reflection is the
  // AssociationDefinition (no throughReflection getter), so we need
  // ThroughReflection#throughReflection from the registry.
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
  const reflKlass = safeKlass(refl);
  const assocPk =
    (typeof sourceRefl.associationPrimaryKeyFor === "function"
      ? sourceRefl.associationPrimaryKeyFor(reflKlass)
      : sourceRefl.associationPrimaryKey) ??
    sourceRefl.primaryKey ??
    "id";
  const pkArr: string[] = Array.isArray(assocPk) ? assocPk : [assocPk];
  // Mirrors Rails' `Array(association_primary_key) == reflection.klass.composite_query_constraints_list`.
  // For a single-PK join model this is `["id"] == ["id"]` → true, so the join
  // is expressed in association-form (`{ club: record }`) rather than by raw
  // FK value. That form carries the (possibly unsaved) source record itself, so
  // owner autosave cascades to persist it — the FK-value form would stamp a nil
  // id for a new source record.
  const compositeConstraints: string[] = reflKlass
    ? compositeQueryConstraintsList.call(reflKlass)
    : [];

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
  // HABTM associations are always mutable: the join model's right side is an
  // implicit belongsTo, but our habtm reflection doesn't expose that chain.
  // Rails reaches the same conclusion via source_reflection.belongs_to?.
  if (this.reflection.macro === "hasAndBelongsToMany") return;

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

/** @internal */
export function staleStateImpl(assoc: { owner: Base; reflection: any }): unknown[] | null {
  const tr = throughReflection.call(assoc as unknown as ThroughAssociationHost) as any;
  if (!tr?.isBelongsTo?.()) return null;
  const fks: string[] = Array.isArray(tr.foreignKey) ? tr.foreignKey : [tr.foreignKey];
  const vals = fks
    .map((fk: string) =>
      typeof (assoc.owner as any).readAttribute === "function"
        ? (assoc.owner as any).readAttribute(fk)
        : (assoc.owner as any)[fk],
    )
    .filter((v: unknown) => v != null);
  return vals.length > 0 ? vals : null;
}

/**
 * Mirrors Rails' `ThroughAssociation#target_scope`
 * (through_association.rb):
 *
 *     def target_scope
 *       scope = super
 *       reflection.chain.drop(1).each do |reflection|
 *         relation = reflection.klass.scope_for_association
 *         scope.merge!(
 *           relation.except(:select, :create_with, :includes, :preload,
 *                           :eager_load, :joins, :left_outer_joins)
 *         )
 *       end
 *       scope
 *     end
 *
 * `superScope` is the base `Association#targetScope` (= the AR bound to the
 * target klass). This helper folds in each intermediate reflection's
 * `klass.scopeForAssociation()` to propagate `default_scope` declared on
 * join models into the target query, stripping the parts that would conflict
 * with the JOIN-based query shape (mirrors Rails' `.except(:select, ...)`).
 *
 * @internal
 */
export function throughTargetScope(
  assoc: { owner: Base; reflection: { name: string } },
  superScope: unknown,
): unknown {
  let scope = superScope;
  if (!scope) return scope;
  const ctor = assoc.owner.constructor as {
    _reflectOnAssociation?: (n: string) => unknown;
  };
  const refl = ctor._reflectOnAssociation?.(assoc.reflection.name) as
    | { chain?: Array<{ klass?: { scopeForAssociation?: () => unknown } }> }
    | null
    | undefined;
  const chain = refl?.chain;
  if (!chain || chain.length <= 1) return scope;
  for (let i = 1; i < chain.length; i++) {
    const interKlass = chain[i]?.klass;
    let interScope = interKlass?.scopeForAssociation?.();
    // Rails: `relation.except(:select, :create_with, :includes, :preload,
    //   :eager_load, :joins, :left_outer_joins)` — strip query parts that
    // would conflict with the JOIN-based target query (e.g. a `select` on
    // the through model would otherwise shadow the target's columns).
    // Must be `except` (value removal), not `unscope`: the result is merged
    // into `scope`, and `unscope` would replay the resets onto `scope`.
    if (interScope && typeof (interScope as { except?: unknown }).except === "function") {
      interScope = (
        interScope as {
          except: (...keys: string[]) => unknown;
        }
      ).except(
        "select",
        "createWith",
        "includes",
        "preload",
        "eagerLoad",
        "joins",
        "leftOuterJoins",
      );
    }
    if (interScope && typeof (scope as { merge?: unknown }).merge === "function") {
      scope = (scope as { merge: (r: unknown) => unknown }).merge(interScope);
    }
  }
  return scope;
}

/** @internal */
export function throughForeignKeyPresent(assoc: { owner: Base; reflection: any }): boolean {
  const tr = throughReflection.call(assoc as unknown as ThroughAssociationHost) as any;
  if (!tr?.isBelongsTo?.()) return false;
  const fks: string[] = Array.isArray(tr.foreignKey) ? tr.foreignKey : [tr.foreignKey];
  return fks.every((fk: string) => {
    const val =
      typeof (assoc.owner as any).readAttribute === "function"
        ? (assoc.owner as any).readAttribute(fk)
        : (assoc.owner as any)[fk];
    return val != null;
  });
}

/** Rails' `include ThroughAssociation` — the module's instance methods. */
export const ThroughAssociation = {
  transaction,
  throughReflection,
  throughAssociation,
  constructJoinAttributes,
  ensureMutable,
  ensureNotNested,
};
