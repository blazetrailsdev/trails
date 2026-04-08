import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { loadBelongsTo, resolveModel } from "../associations.js";
import { underscore, pluralize } from "@blazetrails/activesupport";
import { SingularAssociation } from "./singular-association.js";

/**
 * Mirrors: ActiveRecord::Associations::BelongsToAssociation
 *
 * Manages the belongs_to side of an association. Handles FK replacement,
 * counter cache updates, change tracking, and dependent destruction.
 */
export class BelongsToAssociation extends SingularAssociation {
  private _updated = false;

  constructor(owner: Base, definition: AssociationDefinition) {
    super(owner, definition);
  }

  /**
   * Handle dependent destruction/deletion of the target record.
   * Called by the owner's before_destroy callback.
   */
  async handleDependency(): Promise<void> {
    const target = await this.loadTarget();
    if (!target) return;

    const dependent = this.reflection.options.dependent;
    if (!dependent) return;

    switch (dependent) {
      case "destroy":
        if (typeof (target as any).destroy === "function") {
          await (target as any).destroy();
        }
        break;
      case "delete":
        if (typeof (target as any).delete === "function") {
          await (target as any).delete();
        }
        break;
    }
  }

  /**
   * When set from the inverse side, also update the FK on the owner
   * to point to the new record.
   */
  override inversedFrom(record: Base | null): void {
    this.replaceKeys(record);
    super.inversedFrom(record);
  }

  /**
   * Set the default value for this association if the current reader is nil.
   * Called by the before_validation callback set up by the builder.
   */
  default(block: (owner: Base) => Base | null): void {
    if (this.reader == null) {
      const value = block(this.owner);
      if (value != null) {
        this.writer(value);
      }
    }
  }

  override reset(): void {
    super.reset();
    this._updated = false;
  }

  isUpdated(): boolean {
    return this._updated;
  }

  /**
   * Decrement the counter cache column on the target by 1.
   */
  async decrementCounters(): Promise<void> {
    await this.updateCounters(-1);
  }

  /**
   * Increment the counter cache column on the target by 1.
   */
  async incrementCounters(): Promise<void> {
    await this.updateCounters(1);
  }

  /**
   * Decrement counters for the previously associated record (before last save).
   */
  async decrementCountersBeforeLastSave(): Promise<void> {
    let modelWas: any;
    if (this.reflection.options.polymorphic) {
      const foreignType =
        (this.reflection as any).foreignType ??
        (this.reflection.options as any).foreignType ??
        `${underscore(this.reflection.name)}_type`;
      const modelTypeWas =
        typeof this.owner.attributeBeforeLastSave === "function"
          ? this.owner.attributeBeforeLastSave(foreignType)
          : undefined;
      if (modelTypeWas) {
        try {
          modelWas = resolveModel(modelTypeWas as string);
        } catch {
          return;
        }
      }
    } else {
      modelWas = this.klass;
    }

    const fkNames = this.foreignKeyNames();
    const foreignKeyWas = fkNames.map((fk) =>
      typeof this.owner.attributeBeforeLastSave === "function"
        ? this.owner.attributeBeforeLastSave(fk)
        : undefined,
    );

    if (foreignKeyWas.some((v) => v != null) && modelWas) {
      const counterCol = this.counterCacheColumn();
      if (!counterCol) return;
      await this.updateCountersViaScope(modelWas, foreignKeyWas, -1);
    }
  }

  private async updateCountersViaScope(
    klass: any,
    foreignKeyValues: any[],
    by: number,
  ): Promise<void> {
    const counterCol = this.counterCacheColumn();
    if (!counterCol) return;
    if (typeof klass.where !== "function") return;

    const configuredPk = (this.reflection.options as any).primaryKey;
    const rawPk = configuredPk ?? klass.primaryKey ?? "id";
    const pks = Array.isArray(rawPk) ? rawPk : [rawPk];
    if (pks.length !== foreignKeyValues.length) return;
    const conditions: Record<string, unknown> = {};
    for (let i = 0; i < pks.length; i++) {
      if (foreignKeyValues[i] == null) return;
      conditions[pks[i]] = foreignKeyValues[i];
    }

    const scope = klass.where(conditions);
    if (typeof scope.updateCounters === "function") {
      await scope.updateCounters({ [counterCol]: by });
    }
  }

  /**
   * Returns true if the FK has changed since the last save, or if the
   * target is an unsaved new record.
   */
  isTargetChanged(): boolean {
    const changed = this.foreignKeyNames().some((fk) => this.ownerAttributeChanged(fk));
    return (
      changed || (!this.foreignKeyPresent() && this.target != null && this.target.isNewRecord())
    );
  }

  isTargetPreviouslyChanged(): boolean {
    return this.foreignKeyNames().some((fk) => this.ownerAttributePreviouslyChanged(fk));
  }

  isSavedChangeToTarget(): boolean {
    return this.foreignKeyNames().some((fk) => this.ownerSavedChangeToAttribute(fk));
  }

  /**
   * Build a scope on the target model, filtering by the owner's FK value
   * against the target's PK. This is the reverse direction from has_many.
   */
  override scope(): any {
    const Klass = this.klass as any;
    if (!Klass || typeof Klass.all !== "function") return null;

    const fks = this.foreignKeyNames();
    const pks = this.associationPrimaryKeys(null);
    const conditions: Record<string, unknown> = {};

    for (let i = 0; i < fks.length; i++) {
      const fkValue =
        typeof this.owner.readAttribute === "function"
          ? this.owner.readAttribute(fks[i])
          : (this.owner as any)[fks[i]];
      if (fkValue == null) return null;
      conditions[pks[i] ?? pks[0]] = fkValue;
    }

    let rel = Klass.all().where(conditions);
    if (this.reflection.options.scope) {
      rel = this.reflection.options.scope(rel);
    }
    return rel;
  }

  // --- Protected ---

  protected override replace(record: Base | null): void {
    if (record) {
      this.setInverseInstance(record);
      this._updated = true;
    } else if (this.target) {
      this.removeInverseInstance(this.target);
    }

    this.replaceKeys(record);
    this.target = record;
    this.loadedBang();
  }

  protected override staleState(): unknown {
    const fks = this.foreignKeyNames();
    const values = fks.map((fk) =>
      typeof this.owner.readAttribute === "function"
        ? this.owner.readAttribute(fk)
        : (this.owner as any)[fk],
    );
    return values.length === 1 ? values[0] : JSON.stringify(values);
  }

  protected override findTargetNeeded(): boolean {
    return !this.isLoaded() && this.foreignKeyPresent();
  }

  protected override foreignKeyPresent(): boolean {
    return this.foreignKeyNames().every((fk) => {
      const value =
        typeof this.owner.readAttribute === "function"
          ? this.owner.readAttribute(fk)
          : (this.owner as any)[fk];
      return value != null;
    });
  }

  protected override async doAsyncFindTarget(): Promise<Base | null> {
    return loadBelongsTo(this.owner, this.reflection.name, this.reflection.options);
  }

  // --- Private helpers ---

  private foreignKeyName(): string {
    const fk = this.reflection.options.foreignKey;
    if (typeof fk === "string") return fk;
    if (Array.isArray(fk)) return fk[0];
    return `${underscore(this.reflection.name)}_id`;
  }

  private foreignKeyNames(): string[] {
    const fk = this.reflection.options.foreignKey;
    if (typeof fk === "string") return [fk];
    if (Array.isArray(fk)) return fk;

    // Derive composite FKs when target has composite PK (mirrors loadBelongsTo)
    const pks = this.associationPrimaryKeys(null);
    if (pks.length > 1) {
      const assocName = underscore(this.reflection.name);
      return pks.map((pk) => `${assocName}_${pk}`);
    }

    return [`${underscore(this.reflection.name)}_id`];
  }

  private associationPrimaryKeys(record: Base | null): string[] {
    const configured = this.reflection.options.primaryKey;
    if (configured) {
      return Array.isArray(configured) ? configured : [configured];
    }
    if (record) {
      const pk = (record.constructor as any).primaryKey;
      if (pk) return Array.isArray(pk) ? pk : [pk];
    }
    const pk = (this.klass as any).primaryKey;
    if (pk) return Array.isArray(pk) ? pk : [pk];
    return ["id"];
  }

  /**
   * Replace FK columns on the owner to point at the given record's PK.
   * Handles composite keys by zipping FK columns with PK columns.
   * Rails: replace_keys(record, force: false)
   */
  private replaceKeys(record: Base | null): void {
    const fks = this.foreignKeyNames();
    const pks = this.associationPrimaryKeys(record);

    for (let i = 0; i < fks.length; i++) {
      const pkCol = pks[i] ?? pks[0];
      const value = record
        ? typeof record.readAttribute === "function"
          ? record.readAttribute(pkCol)
          : (record as any)[pkCol]
        : null;

      if (typeof this.owner.writeAttribute === "function") {
        (this.owner as any).writeAttribute(fks[i], value);
      } else {
        (this.owner as any)[fks[i]] = value;
      }
    }
  }

  /**
   * Resolve the counter cache column name. In Rails, for a belongs_to :author
   * on Post, the counter column on Author is `posts_count` (pluralized
   * owner model name, snake_case, + _count).
   */
  private counterCacheColumn(): string | null {
    const cc = this.reflection.options.counterCache;
    if (!cc) return null;
    if (typeof cc === "string") return cc;
    const ownerCtor = this.owner.constructor as any;
    return `${pluralize(underscore(ownerCtor.name))}_count`;
  }

  private async updateCounters(by: number): Promise<void> {
    const counterCol = this.counterCacheColumn();
    if (!counterCol) return;
    if (!this.owner.isPersisted()) return;
    if (!this.foreignKeyPresent()) return;

    const fks = this.foreignKeyNames();
    const pks = this.associationPrimaryKeys(null);
    const conditions: Record<string, unknown> = {};
    for (let i = 0; i < fks.length; i++) {
      const fkValue = this.owner.readAttribute?.(fks[i]);
      if (fkValue == null) return;
      conditions[pks[i] ?? pks[0]] = fkValue;
    }

    const Klass = this.klass;
    if (Klass && typeof (Klass as any).where === "function") {
      const scope = (Klass as any).where(conditions);
      if (typeof scope.updateCounters === "function") {
        await scope.updateCounters({ [counterCol]: by });
      }
    }

    // Mirror the updated value in-memory if target is loaded
    if (this.target && !this.isStaleTarget()) {
      const current = (this.target as any)[counterCol] ?? 0;
      (this.target as any)[counterCol] = current + by;
    }
  }

  protected ownerAttributeChanged(attr: string): boolean {
    if (typeof (this.owner as any).attributeChanged === "function")
      return (this.owner as any).attributeChanged(attr);
    if (typeof (this.owner as any).isAttributeChanged === "function")
      return (this.owner as any).isAttributeChanged(attr);
    return false;
  }

  protected ownerAttributePreviouslyChanged(attr: string): boolean {
    if (typeof (this.owner as any).attributePreviouslyChanged === "function")
      return (this.owner as any).attributePreviouslyChanged(attr);
    if (typeof (this.owner as any).isAttributePreviouslyChanged === "function")
      return (this.owner as any).isAttributePreviouslyChanged(attr);
    return false;
  }

  protected ownerSavedChangeToAttribute(attr: string): boolean {
    if (typeof (this.owner as any).savedChangeToAttribute === "function")
      return (this.owner as any).savedChangeToAttribute(attr);
    if (typeof (this.owner as any).isSavedChangeToAttribute === "function")
      return (this.owner as any).isSavedChangeToAttribute(attr);
    return false;
  }
}
