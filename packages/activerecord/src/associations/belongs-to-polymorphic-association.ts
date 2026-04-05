import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { resolveModel, loadBelongsTo } from "../associations.js";
import { underscore } from "@blazetrails/activesupport";
import { BelongsToAssociation } from "./belongs-to-association.js";

/**
 * Extends BelongsToAssociation to handle polymorphic type columns.
 * Reads the foreign_type attribute on the owner to determine the
 * target class at runtime.
 *
 * Mirrors: ActiveRecord::Associations::BelongsToPolymorphicAssociation
 */
export class BelongsToPolymorphicAssociation extends BelongsToAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  /**
   * Resolve the target class from the polymorphic type column.
   * Returns the class for whatever type string is stored on the owner.
   */
  override get klass(): typeof Base {
    const type = this.readForeignType();
    if (!type) return undefined as any;
    return resolveModel(type);
  }

  /**
   * Also check if the type column has changed, not just the FK.
   */
  override isTargetChanged(): boolean {
    return super.isTargetChanged() || this.ownerAttributeChanged(this.foreignTypeName());
  }

  override isTargetPreviouslyChanged(): boolean {
    return (
      super.isTargetPreviouslyChanged() ||
      this.ownerAttributePreviouslyChanged(this.foreignTypeName())
    );
  }

  override isSavedChangeToTarget(): boolean {
    return (
      super.isSavedChangeToTarget() || this.ownerSavedChangeToAttribute(this.foreignTypeName())
    );
  }

  protected override staleState(): unknown {
    const fkState = super.staleState();
    if (fkState != null) {
      return JSON.stringify([fkState, this.readForeignType()]);
    }
    return undefined;
  }

  /**
   * Override replace to also write/clear the polymorphic type column.
   * Rails: BelongsToPolymorphicAssociation#replace_keys sets foreign_type.
   */
  protected override replace(record: Base | null): void {
    const typeCol = this.foreignTypeName();
    const typeName = record ? (record.constructor as any).name : null;
    if (typeof this.owner.writeAttribute === "function") {
      (this.owner as any).writeAttribute(typeCol, typeName);
    } else {
      (this.owner as any)[typeCol] = typeName;
    }
    super.replace(record);
  }

  protected override async doAsyncFindTarget(): Promise<Base | null> {
    return loadBelongsTo(this.owner, this.reflection.name, this.reflection.options);
  }

  /**
   * Derive the type column name from the association name, matching
   * loadBelongsTo which reads `${underscore(assocName)}_type`.
   */
  private foreignTypeName(): string {
    return `${underscore(this.reflection.name)}_type`;
  }

  private readForeignType(): string | null {
    const ft = this.foreignTypeName();
    const value =
      typeof this.owner.readAttribute === "function"
        ? this.owner.readAttribute(ft)
        : (this.owner as any)[ft];
    return (value as string) ?? null;
  }
}
