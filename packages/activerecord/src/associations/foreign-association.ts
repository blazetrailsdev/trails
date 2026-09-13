import { NoMethodError } from "@blazetrails/activemodel";

import type { AssociationReflection } from "../reflection.js";
import type { Base } from "../base.js";

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function ownerForeignKeyColumns(
  ctor: typeof Base,
  assocName: string,
  options: { foreignKey?: string | string[] },
): string[] {
  const fk = options.foreignKey;
  if (typeof fk === "string") return [fk];
  if (Array.isArray(fk)) return fk;

  const reflectionFk = (
    ctor as unknown as {
      _reflectOnAssociation?: (n: string) => { foreignKey?: string | string[] } | undefined;
    }
  )._reflectOnAssociation?.(assocName)?.foreignKey;
  if (typeof reflectionFk === "string") return [reflectionFk];
  if (Array.isArray(reflectionFk)) return reflectionFk;

  throw new NoMethodError(`undefined method 'foreign_key' for nil`);
}

interface ForeignAssociationHost {
  reflection: AssociationReflection;
  owner: Base & { attributePresent(attrName: string): boolean };
}

export function foreignKeyPresent(this: ForeignAssociationHost): boolean {
  if (this.reflection.klass.primaryKey != null) {
    return this.owner.attributePresent(this.reflection.activeRecordPrimaryKey as string);
  } else {
    return false;
  }
}

export class ForeignAssociation {
  foreignKeyPresent: boolean = false;

  /** @missingRailsCall new — PERMANENT */
  static nullifiedOwnerAttributes(
    reflection: Pick<AssociationReflection, "foreignKey" | "type">,
  ): Record<string, null> {
    const attrs: Record<string, null> = {};
    const fks = Array.isArray(reflection.foreignKey)
      ? reflection.foreignKey
      : [reflection.foreignKey];
    for (const fk of fks) attrs[fk] = null;
    if (reflection.type) attrs[reflection.type] = null;
    return attrs;
  }
}
