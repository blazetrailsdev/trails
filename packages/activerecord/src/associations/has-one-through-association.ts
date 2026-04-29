import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { HasOneAssociation } from "./has-one-association.js";

/**
 * Mirrors: ActiveRecord::Associations::HasOneThroughAssociation
 */
export class HasOneThroughAssociation extends HasOneAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }
}

/** @internal */
async function createThroughRecord(
  assoc: HasOneThroughAssociation,
  record: Base | null,
  save: boolean,
): Promise<Base | null> {
  ensureNotNestedThrough(assoc);

  const throughName = assoc.reflection.options.through as string | undefined;
  if (!throughName) return null;
  const throughProxy = (assoc.owner as any).association?.(throughName);
  if (!throughProxy) return null;

  const throughRecord = await throughProxy.loadTarget?.();

  if (throughRecord && !record) {
    await (throughRecord as any).destroy?.();
    return null;
  }

  if (record) {
    const attrs = buildJoinAttributes(assoc, record);

    if (throughRecord) {
      if ((throughRecord as any).isNewRecord?.()) {
        await (throughRecord as any).assignAttributes?.(attrs);
      } else {
        await (throughRecord as any).update?.(attrs);
      }
    } else if ((assoc.owner as any).isNewRecord?.() || !save) {
      throughProxy.build?.(attrs);
    } else {
      await throughProxy.create?.(attrs);
    }
  }
  return record;
}

function ensureNotNestedThrough(assoc: { reflection: any; owner: Base }): void {
  if (assoc.reflection.options.through) {
    const throughRefl = (assoc.owner.constructor as any)._reflectOnAssociation?.(
      assoc.reflection.options.through,
    );
    if (throughRefl?.options?.through) {
      throw new Error(`Nested through associations are read-only.`);
    }
  }
}

function buildJoinAttributes(
  assoc: { owner: Base; reflection: any },
  record: Base,
): Record<string, unknown> {
  const refl = assoc.reflection as any;
  const sourceRefl = refl.sourceReflection?.() as any;
  if (!sourceRefl) return {};
  const assocPk = sourceRefl.associationPrimaryKey?.(refl.klass) ?? sourceRefl.primaryKey ?? "id";
  const pkArr: string[] = Array.isArray(assocPk) ? assocPk : [assocPk];
  const compositeConstraints: string[] = refl.klass?.compositeQueryConstraintsList ?? [];

  let joinAttributes: Record<string, unknown>;
  if (
    pkArr.length === compositeConstraints.length &&
    pkArr.every((k: string, i: number) => k === compositeConstraints[i]) &&
    !refl.options?.sourceType
  ) {
    joinAttributes = { [sourceRefl.name]: record };
  } else {
    const fk: string = sourceRefl.foreignKey ?? `${sourceRefl.name}_id`;
    const pkVal =
      pkArr.length === 1
        ? ((record as any).readAttribute?.(pkArr[0]) ?? (record as any).id)
        : pkArr.map((k: string) => (record as any).readAttribute?.(k));
    joinAttributes = { [fk]: pkVal };
  }

  if (refl.options?.sourceType) {
    const foreignType: string = sourceRefl.foreignType ?? `${sourceRefl.name}_type`;
    joinAttributes[foreignType] = refl.options.sourceType;
  }
  return joinAttributes;
}
