import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { modelRegistry } from "../associations.js";
import { baseClass, demodulize } from "../inheritance.js";
import { BelongsToAssociation, inferCompositePrimaryKey } from "./belongs-to-association.js";

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
    // Rails: `owner.class.polymorphic_class_for(type)` — a model may override
    // the hook to map a custom `polymorphic_name` type string back to its
    // class (belongs_to_polymorphic_association.rb:9).
    return (this.owner.constructor as typeof Base).polymorphicClassFor(type);
  }

  /**
   * Also check if the type column has changed, not just the FK.
   */
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

  /**
   * Mirrors Rails `BelongsToPolymorphicAssociation#raise_on_type_mismatch!`:
   * "A polymorphic association cannot have a type mismatch, by definition."
   * @internal
   */
  protected override raiseOnTypeMismatchBang(_record: Base): void {}

  protected override staleState(): unknown {
    const fkState = super.staleState();
    if (fkState != null) {
      return JSON.stringify([fkState, this.readForeignType()]);
    }
    return undefined;
  }

  /**
   * Write the polymorphic type column alongside the foreign key. Mirrors
   * Rails `BelongsToPolymorphicAssociation#replace_keys` — both column
   * writes happen here (after `super.replace` has already run
   * `setInverseInstance`, so a missing-inverse raise leaves owner state
   * untouched).
   */
  protected override replaceKeys(
    record: Base | null,
    { force = false }: { force?: boolean } = {},
  ): void {
    const typeCol = this.reflection.foreignType!;
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

  /**
   * Polymorphic belongs_to has no static target class, so when neither an
   * explicit `primaryKey` option nor a target class is given we fall
   * back to the loaded target's class (the generic
   * `BelongsToAssociation` path can't do this — it has no polymorphic
   * type column to consult).
   */
  protected override associationPrimaryKeys(klass: typeof Base | null): string[] {
    const configured = this.reflection.options.primaryKey;
    if (configured) return Array.isArray(configured) ? configured : [configured];
    // Mirrors Rails `BelongsToReflection#association_primary_key`
    // (reflection.rb:935-938): a composite PK of shape `[<tenant_key>, :id]`
    // infers the single `"id"` as the association primary key (else keeps the
    // array). The `klass` argument Rails passes is the runtime polymorphic
    // target, so this branch applies to polymorphic belongs_to too — without it
    // a scalar `<name>_id` FK would zip against the 2-column target PK.
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

  /**
   * Mirrors Rails `BelongsToPolymorphicAssociation#inverse_reflection_for`
   * (associations/belongs_to_polymorphic_association.rb:35-37) — looks up
   * the inverse on the assigned record's class via `polymorphic_inverse_of`,
   * which raises `InverseOfAssociationNotFoundError` when the configured
   * inverse name does not exist on that class.
   */
  protected override inverseReflectionFor(record: Base): unknown {
    const refl = this.reflection as unknown as {
      polymorphicInverseOf?: (klass: typeof Base) => unknown;
    };
    if (typeof refl.polymorphicInverseOf === "function") {
      return refl.polymorphicInverseOf(record.constructor as typeof Base);
    }
    return null;
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
    // Rails writes `record.class.polymorphic_name`. When the record's class
    // overrides that static (e.g. returning a custom type string), honor it
    // verbatim — the registry-key reconstruction below exists only to recover
    // `::`-namespaced names that JS class names flatten, which does not apply
    // to an explicit override.
    const recordCtor = record.constructor as typeof Base;
    if (Object.prototype.hasOwnProperty.call(recordCtor, "polymorphicName")) {
      return recordCtor.polymorphicName();
    }
    // Rails: `record.class.polymorphic_name` resolves to the STI base class
    // name (`base_class.name`), so subclass records store their base type.
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
    // `store_full_class_name` is read on `record.class` (Rails reads it on self,
    // not base_class); as an inherited class_attribute the two agree. When off,
    // demodulize via the same helper `polymorphic_name` uses.
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
