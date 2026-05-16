import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { resolveModel, loadBelongsTo, modelRegistry } from "../associations.js";
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
    // Rails: writes record.class.polymorphic_name, which is the Ruby class
    // name (including "::" for namespaced classes). JS class names can't
    // contain "::", so deriving purely from `constructor.name` would
    // clobber values like "Access::NoticeMessage" into "AccessNoticeMessage".
    // Prefer a registered registry key for this class — using the same
    // selection as MacroReflection#activeRecordRegistryName:
    //   1. If the owner already has a *_type matching one of this class's
    //      registry keys, preserve it (so delegated_type round-trips the
    //      exact configured type string).
    //   2. Otherwise pick the most deeply namespaced registry key.
    //   3. Otherwise fall back to constructor.name.
    const typeName = record ? this.polymorphicTypeName(record) : null;
    if (typeof (this.owner as any)._writeAttribute === "function") {
      (this.owner as any)._writeAttribute(typeCol, typeName);
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

  /**
   * Mirror of MacroReflection#activeRecordRegistryName plus a
   * "preserve existing value" rule: when the owner already stores a
   * foreign_type that points to this record's class, keep it (covers
   * delegated_type round-trips where the configured type string is the
   * source of truth). Otherwise prefer the most deeply namespaced
   * registry key, falling back to constructor.name.
   */
  private polymorphicTypeName(record: Base): string {
    const ctor = record.constructor as { name: string; _registryKeys?: string[] };
    const matching = (ctor._registryKeys ?? []).filter((k) => modelRegistry.get(k) === ctor);
    if (matching.length > 0) {
      const existing = this.readForeignType();
      if (existing && matching.includes(existing)) return existing;
      return matching.reduce((best, k) =>
        (k.match(/::/g) ?? []).length > (best.match(/::/g) ?? []).length ? k : best,
      );
    }
    return ctor.name;
  }

  private readForeignType(): string | null {
    const ft = this.foreignTypeName();
    const value =
      typeof (this.owner as any)._readAttribute === "function"
        ? (this.owner as any)._readAttribute(ft)
        : (this.owner as any)[ft];
    return (value as string) ?? null;
  }
}
