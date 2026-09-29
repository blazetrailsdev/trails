import type { AssociationReflection } from "../reflection.js";
import type { Base } from "../base.js";

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
    const foreignKey = reflection.foreignKey();
    const fks = Array.isArray(foreignKey) ? foreignKey : [foreignKey];
    for (const fk of fks) attrs[fk] = null;
    if (reflection.type) attrs[reflection.type] = null;
    return attrs;
  }
}
