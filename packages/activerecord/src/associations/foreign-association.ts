import { kernelArray as Array } from "@blazetrails/activesupport";
import { zip } from "@blazetrails/ruby-compat";
import type { AssociationReflection } from "../reflection.js";
import type { Base } from "../base.js";

interface ForeignAssociationHost {
  reflection: AssociationReflection;
  owner: Base & { attributePresent(attrName: string): boolean };
  options: { through?: unknown };
}

export function foreignKeyPresent(this: ForeignAssociationHost): boolean {
  if (this.reflection.klass.primaryKey != null) {
    return this.owner.attributePresent(this.reflection.activeRecordPrimaryKey as string);
  } else {
    return false;
  }
}

/** @internal */
export function setOwnerAttributes(this: ForeignAssociationHost, record: Base): void {
  if (this.options.through != null) return;

  const primaryKeyAttributeNames = Array(this.reflection.joinPrimaryKey());
  const foreignKeyAttributeNames = Array(this.reflection.joinForeignKey);

  const primaryKeyForeignKeyPairs = zip(primaryKeyAttributeNames, foreignKeyAttributeNames);

  for (const [primaryKey, foreignKey] of primaryKeyForeignKeyPairs) {
    const value = this.owner._readAttribute(foreignKey!);
    record._writeAttribute(primaryKey!, value);
  }

  if (this.reflection.type != null) {
    record._writeAttribute(
      this.reflection.type,
      (this.owner.constructor as typeof Base).polymorphicName(),
    );
  }
}

export class ForeignAssociation {
  foreignKeyPresent: boolean = false;

  static nullifiedOwnerAttributes(
    reflection: Pick<AssociationReflection, "foreignKey" | "type">,
  ): Record<string, null> {
    const attrs: Record<string, null> = {};
    for (const foreignKey of Array(reflection.foreignKey())) attrs[foreignKey] = null;
    if (reflection.type) attrs[reflection.type] = null;
    return attrs;
  }
}
