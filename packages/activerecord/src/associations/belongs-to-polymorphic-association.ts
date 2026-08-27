import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { modelRegistry } from "../associations.js";
import { baseClass, demodulize } from "../inheritance.js";
import { BelongsToAssociation, inferCompositePrimaryKey } from "./belongs-to-association.js";

export class BelongsToPolymorphicAssociation extends BelongsToAssociation {
  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  override get klass(): typeof Base {
    const type = this.readForeignType();
    if (!type) return undefined as any;
    return (this.owner.constructor as typeof Base).polymorphicClassFor(type);
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
    const fkState = super.staleState();
    if (fkState != null) {
      return JSON.stringify([fkState, this.readForeignType()]);
    }
    return undefined;
  }

  protected override replaceKeys(
    record: Base | null,
    { force = false }: { force?: boolean } = {},
  ): void {
    const typeCol = this.reflection.foreignType!;
    const typeName = record ? this.polymorphicTypeName(record) : null;
    const currentType =
      typeof (this.owner as any)._readAttribute === "function"
        ? (this.owner as any)._readAttribute(typeCol)
        : (this.owner as any)[typeCol];
    if (force || currentType !== typeName) {
      if (typeof (this.owner as any)._writeAttribute === "function") {
        (this.owner as any)._writeAttribute(typeCol, typeName);
      } else {
        (this.owner as any)[typeCol] = typeName;
      }
    }
    super.replaceKeys(record, { force });
  }

  protected override associationPrimaryKeys(klass: typeof Base | null): string[] {
    const configured = this.reflection.options.primaryKey;
    if (configured) return Array.isArray(configured) ? configured : [configured];
    if (klass) {
      const recordPk = (klass as any).primaryKey;
      if (recordPk) return inferCompositePrimaryKey(recordPk);
    }
    const pk = (this.klass as any)?.primaryKey;
    if (pk) return inferCompositePrimaryKey(pk);
    const targetPk = (this.target as any)?.constructor?.primaryKey;
    if (targetPk) return inferCompositePrimaryKey(targetPk);
    return ["id"];
  }

  protected override inverseReflectionFor(record: Base): unknown {
    const refl = this.reflection as unknown as {
      polymorphicInverseOf?: (klass: typeof Base) => unknown;
    };
    if (typeof refl.polymorphicInverseOf === "function") {
      return refl.polymorphicInverseOf(record.constructor as typeof Base);
    }
    return null;
  }

  private polymorphicTypeName(record: Base): string {
    const recordCtor = record.constructor as typeof Base;
    if (Object.prototype.hasOwnProperty.call(recordCtor, "polymorphicName")) {
      return recordCtor.polymorphicName();
    }
    const ctor = baseClass.call(record.constructor as typeof Base) as typeof Base & {
      name: string;
      _registryKeys?: string[];
    };
    const matching = (ctor._registryKeys ?? []).filter((k) => modelRegistry.get(k) === ctor);
    let name: string;
    if (matching.length > 0) {
      const existing = this.readForeignType();
      if (existing && matching.includes(existing)) return existing;
      name = matching.reduce((best, k) =>
        (k.match(/::/g) ?? []).length > (best.match(/::/g) ?? []).length ? k : best,
      );
    } else {
      name = ctor.name;
    }
    const storeFull = (record.constructor as typeof Base & { storeFullClassName?: boolean })
      .storeFullClassName;
    return storeFull === false ? demodulize(name) : name;
  }

  private readForeignType(): string | null {
    const ft = this.reflection.foreignType!;
    const value =
      typeof (this.owner as any)._readAttribute === "function"
        ? (this.owner as any)._readAttribute(ft)
        : (this.owner as any)[ft];
    return (value as string) ?? null;
  }
}
