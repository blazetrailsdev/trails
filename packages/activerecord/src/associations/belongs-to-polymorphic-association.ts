import { Associations } from "../namespaces.js";
import type { Base } from "../base.js";
import type { AssociationReflection, ThroughReflection } from "../reflection.js";
import { presence } from "@blazetrails/activesupport";
import { BelongsToAssociation } from "./belongs-to-association.js";

export class BelongsToPolymorphicAssociation extends BelongsToAssociation {
  override get klass(): typeof Base {
    const type = this.owner.readAttribute(this.reflection.foreignType!) as string | null;
    return (presence(type) &&
      (this.owner.constructor as typeof Base).polymorphicClassFor(type!)) as typeof Base;
  }

  override isTargetChanged(): boolean {
    return super.isTargetChanged() || this.owner.attributeChanged(this.reflection.foreignType!);
  }

  override isTargetPreviouslyChanged(): boolean {
    return (
      super.isTargetPreviouslyChanged() ||
      this.owner.attributePreviouslyChanged(this.reflection.foreignType!)
    );
  }

  override isSavedChangeToTarget(): boolean {
    return (
      super.isSavedChangeToTarget() ||
      this.owner.isSavedChangeToAttribute(this.reflection.foreignType!)
    );
  }

  /** @internal */
  protected override raiseOnTypeMismatchBang(_record: Base): void {}

  protected override staleState(): unknown {
    const foreignKey = super.staleState();
    if (foreignKey != null) {
      return [foreignKey, this.owner.readAttribute(this.reflection.foreignType!)];
    }
  }

  protected override replaceKeys(
    record: Base | null,
    { force = false }: { force?: boolean } = {},
  ): void {
    super.replaceKeys(record, { force });

    const targetType = record ? (record.constructor as typeof Base).polymorphicName() : null;

    if (force || this.owner._readAttribute(this.reflection.foreignType!) !== targetType) {
      this.owner.set(this.reflection.foreignType!, targetType);
    }
  }

  /** @missingRailsName class — PERMANENT */
  protected override inverseReflectionFor(
    record: Base,
  ): AssociationReflection | ThroughReflection | null {
    return (this.reflection as AssociationReflection).polymorphicInverseOf(
      record.constructor as typeof Base,
    );
  }
}

Associations.BelongsToPolymorphicAssociation = BelongsToPolymorphicAssociation;
