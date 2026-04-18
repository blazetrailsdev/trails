import type { AssociationReflection } from "../reflection.js";

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
