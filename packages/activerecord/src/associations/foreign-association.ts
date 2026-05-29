import type { AssociationReflection } from "../reflection.js";
import type { Base } from "../base.js";

/**
 * Mirrors `ActiveRecord::Associations::ForeignAssociation#foreign_key_present?`
 * (foreign_association.rb:5): the owner's `active_record_primary_key` columns
 * must be present for children — which carry the FK referencing them — to be
 * fetchable, so a new-record owner with its PK assigned can still load. Returns
 * false when the associated class has no primary key. Shared by has_many's proxy
 * (`CollectionProxy#_foreignKeyPresent`) and the OO `CollectionAssociation`
 * so the two never disagree.
 *
 * @internal
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
  // Rails calls `owner.attribute_present?` (!nil && !empty), not a bare nil check.
  return keys.every((key) =>
    typeof rec.attributePresent === "function"
      ? rec.attributePresent(key)
      : (typeof rec._readAttribute === "function" ? rec._readAttribute(key) : rec[key]) != null,
  );
}

/**
 * Module mixed into has_many and has_one associations to provide
 * foreign-key based behavior.
 *
 * Mirrors: ActiveRecord::Associations::ForeignAssociation
 */
export class ForeignAssociation {
  foreignKeyPresent: boolean;

  constructor() {
    this.foreignKeyPresent = false;
  }

  /**
   * Build the attribute hash that nullifies the owner-side foreign key
   * (and the polymorphic type column, when applicable) on dependent
   * records — used by `dependent: :nullify` bulk updates.
   *
   * Mirrors: ActiveRecord::Associations::ForeignAssociation#nullified_owner_attributes
   */
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
