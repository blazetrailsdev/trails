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

/**
 * @internal
 * @noRailsEquivalent CONVERGEABLE association-helpers-extracted-for-the-collection-proxy
 */
export function foreignKeyPresentFor(reflection: AssociationReflection, owner: Base): boolean {
  const klass = (reflection as { klass?: { primaryKey?: unknown } }).klass;
  if (klass && klass.primaryKey == null) return false;
  const arPk = (reflection as { activeRecordPrimaryKey?: string | string[] })
    .activeRecordPrimaryKey;
  const keys = Array.isArray(arPk) ? arPk : [arPk ?? "id"];
  const rec = owner as Base & {
    attributePresent?: (key: string) => boolean;
    _readAttribute?: (key: string) => unknown;
    [key: string]: unknown;
  };
  return keys.every((key) =>
    typeof rec.attributePresent === "function"
      ? rec.attributePresent(key)
      : (typeof rec._readAttribute === "function" ? rec._readAttribute(key) : rec[key]) != null,
  );
}

export class ForeignAssociation {
  foreignKeyPresent: boolean;

  constructor() {
    this.foreignKeyPresent = false;
  }

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
