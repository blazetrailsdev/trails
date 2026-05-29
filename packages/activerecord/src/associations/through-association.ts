import type { Base } from "../base.js";

/**
 * Shared module for through associations (has_many :through, has_one :through).
 * These helpers mirror the private/protected methods in Rails'
 * ActiveRecord::Associations::ThroughAssociation module.
 *
 * Mirrors: ActiveRecord::Associations::ThroughAssociation
 */

/** @internal */
function transaction(
  assoc: { owner: Base; reflection: any },
  block: () => Promise<void>,
): Promise<void> {
  const throughKlass = assoc.reflection.options.through
    ? (assoc.owner.constructor as any)._reflectOnAssociation?.(assoc.reflection.options.through)
        ?.klass
    : null;
  if (throughKlass && typeof throughKlass.transaction === "function") {
    return throughKlass.transaction(block);
  }
  return block();
}

/** @internal */
function throughReflection(assoc: { owner: Base; reflection: any }): unknown {
  let refl = assoc.reflection.throughReflection?.();
  if (!refl) {
    const throughName = assoc.reflection.options.through;
    if (!throughName) return null;
    const ctor = assoc.owner.constructor as any;
    refl = ctor._reflectOnAssociation?.(throughName) ?? null;
  }
  return refl;
}

/** @internal */
function throughAssociation(assoc: { owner: Base; reflection: any }): unknown {
  // Rails: @through_association ||= owner.association(through_reflection.name)
  const tr = throughReflection(assoc) as any;
  if (!tr) return null;
  return (assoc.owner as any).association?.(tr.name);
}

/** @internal */
function constructJoinAttributes(
  assoc: { owner: Base; reflection: any },
  ...records: Base[]
): Record<string, unknown> {
  ensureMutable(assoc);
  const refl = assoc.reflection as any;
  const sourceRefl = refl.sourceReflection?.() as any;
  if (!sourceRefl) return {};

  // Rails: source_reflection.association_primary_key(reflection.klass)
  const assocPk = sourceRefl.associationPrimaryKey?.(refl.klass) ?? sourceRefl.primaryKey ?? "id";
  const pkArr: string[] = Array.isArray(assocPk) ? assocPk : [assocPk];
  const compositeConstraints: string[] = refl.klass?.compositeQueryConstraintsList ?? [];

  let joinAttributes: Record<string, unknown>;
  if (
    pkArr.length === compositeConstraints.length &&
    pkArr.every((k: string, i: number) => k === compositeConstraints[i]) &&
    !refl.options?.sourceType
  ) {
    // Association-form: pass the record objects directly under the source name
    joinAttributes = { [sourceRefl.name]: records.length === 1 ? records[0] : records };
  } else {
    const fk: string = sourceRefl.foreignKey ?? `${sourceRefl.name}_id`;
    const pkValues = records.map((r: any) =>
      pkArr.length === 1
        ? (r.readAttribute?.(pkArr[0]) ?? r.id)
        : pkArr.map((k: string) => r.readAttribute?.(k)),
    );
    joinAttributes = { [fk]: records.length === 1 ? pkValues[0] : pkValues };
  }

  if (refl.options?.sourceType) {
    const foreignType: string = sourceRefl.foreignType ?? `${sourceRefl.name}_type`;
    joinAttributes[foreignType] =
      records.length === 1 ? refl.options.sourceType : [refl.options.sourceType];
  }

  return joinAttributes;
}

/** @internal */
function ensureMutable(assoc: { owner: Base; reflection: any }): void {
  const sourceRefl = assoc.reflection.sourceReflection?.() as any;
  if (sourceRefl && sourceRefl.macro !== "belongsTo") {
    throw new Error(
      `Cannot modify association '${assoc.reflection.name}': ` +
        `through associations with a non-belongs-to source are read-only.`,
    );
  }
}

/** @internal */
function ensureNotNested(assoc: { owner: Base; reflection: any }): void {
  if (assoc.reflection.options.through) {
    const throughRefl = (assoc.owner.constructor as any)._reflectOnAssociation?.(
      assoc.reflection.options.through,
    );
    if (throughRefl?.options?.through) {
      throw new Error(`Nested through associations are read-only.`);
    }
  }
}

/** @internal */
function staleState(assoc: { owner: Base; reflection: any }): unknown[] | null {
  const tr = throughReflection(assoc) as any;
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
 * `superScope` is the base `Association#targetScope` (= `klass.all()`).
 * This helper folds in each intermediate reflection's
 * `klass.scopeForAssociation()` to propagate `default_scope` declared on
 * join models into the target query.
 *
 * The clause-removal (`.except(:select, ...)`) is not applied: our
 * `Relation#except` is a set-operation (SQL EXCEPT). Correct for
 * `default_scope { where(...) }`; lossy for exotic default scopes
 * (tracked as a follow-up).
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
    const interScope = interKlass?.scopeForAssociation?.();
    if (interScope && typeof (scope as { merge?: unknown }).merge === "function") {
      scope = (scope as { merge: (r: unknown) => unknown }).merge(interScope);
    }
  }
  return scope;
}

/** @internal */
export function throughForeignKeyPresent(assoc: { owner: Base; reflection: any }): boolean {
  const tr = throughReflection(assoc) as any;
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
