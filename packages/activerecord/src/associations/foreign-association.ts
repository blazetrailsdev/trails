import { NoMethodError } from "@blazetrails/activemodel";

import type { AssociationReflection } from "../reflection.js";
import type { Base } from "../base.js";

/**
 * Mirrors `options[:foreign_key] || reflection.foreign_key` — the two rungs
 * Rails has, the second being `compute_foreign_key` (reflection.rb) keyed on
 * `reflection.active_record`, the class that *declared* the association.
 *
 * In Rails an association always has a registered reflection, so
 * `reflection.foreign_key` has nothing to fall through to; reaching the third
 * rung here means the receiver is `nil`, which is Ruby's NoMethodError.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE `options[:foreign_key] || reflection.foreign_key` spelled as a helper instead of inline (foreign_association.rb:5).
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
 * Mirrors `ActiveRecord::Associations::ForeignAssociation#foreign_key_present?`
 * (foreign_association.rb:5): the owner's `active_record_primary_key` columns
 * must be present for children — which carry the FK referencing them — to be
 * fetchable, so a new-record owner with its PK assigned can still load. Returns
 * false when the associated class has no primary key. Read by the OO
 * `CollectionAssociation`, which has_many's proxy delegates to through
 * `null_scope?` (collection_proxy.rb:1150-1152), so there is one copy.
 *
 * @internal
 * @noRailsEquivalent CONVERGEABLE ForeignAssociation#foreign_key_present? as a free function so the proxy shares the one copy (foreign_association.rb:5).
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
