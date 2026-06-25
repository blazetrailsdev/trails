import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { loadBelongsTo, resolveModel, reflectLockVersionBump } from "../associations.js";
import { underscore } from "@blazetrails/activesupport";
import { belongsToCounterCacheColumn } from "../reflection.js";
import { hasQueryConstraints, queryConstraintsList } from "../persistence.js";
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
    // Make the assigned record available to `foreignKeyNames()` before
    // `replaceKeys` derives the FK columns: its composite-PK branch reads the
    // PK off the in-hand target instance (see `foreignKeyNames`), and without
    // a set target it falls back to `this.klass`, forcing a registry resolve of
    // the target class during pure inverse wiring (the has_many `<<`/push and
    // readonly-collection paths route here via `_cacheSingularTarget`, where
    // the class need not be registered). `super.inversedFrom` re-assigns the
    // target and snapshots stale state; assigning early is otherwise inert.
    if (record) this.target = record;
    this.replaceKeys(record);
    super.inversedFrom(record);
  }

  /**
   * Set the default value for this association if the current reader is nil.
   * Called by the before_validation callback set up by the builder.
   */
  async default(block: (owner: Base) => Base | null): Promise<void> {
    // Rails: `writer(...) if reader.nil?` — loads synchronously, fires when nil.
    // reader returns a Promise when FK is present but unloaded; await resolves it.
    if ((await this.reader) == null) {
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
      const touch = (this.reflection.options as any).touch;
      const opts = touch != null ? { touch } : undefined;
      await scope.updateCounters({ [counterCol]: by }, opts);
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
      typeof (this.owner as any)._readAttribute === "function"
        ? (this.owner as any)._readAttribute(fk)
        : (this.owner as any)[fk],
    );
    return values.length === 1 ? values[0] : JSON.stringify(values);
  }

  protected override findTargetNeeded(): boolean {
    // Mirrors Rails `find_target?`'s trailing `&& klass` factor
    // (association.rb:320): a polymorphic belongs_to whose `_type` column is
    // nil resolves `klass` to undefined, so no query is attempted even when
    // the foreign key is present. `klass` is evaluated last, matching Ruby's
    // left-to-right `&&`, so it is untouched when the FK guard is false.
    return !this.isLoaded() && this.foreignKeyPresent() && !!this.klass;
  }

  /**
   * Mirrors Rails' `BelongsToAssociation#invertible_for?`
   * (belongs_to_association.rb:158-161):
   *
   *   inverse = inverse_reflection_for(record)
   *   inverse && (inverse.has_one? || inverse.klass.has_many_inversing)
   *
   * Unlike the base, belongs_to does NOT require the record to carry the
   * foreign key (the FK lives on the owner). It instead requires the inverse
   * reflection to be present and to be either a has_one inverse or a has_many
   * whose `klass` enables `has_many_inversing`. Note `inverse.klass` is the
   * class the inverse collection holds — i.e. the owner (child) class — NOT
   * the record's class.
   * @internal
   */
  protected override isInvertibleFor(record: Base): boolean {
    const inverse = this.inverseReflectionOn(record);
    if (!inverse) return false;
    const isHasOne =
      typeof inverse.isHasOne === "function" ? inverse.isHasOne() : inverse.macro === "hasOne";
    const inverseKlass = inverse.klass;
    return isHasOne || !!inverseKlass?.hasManyInversing;
  }

  /**
   * Resolve the rich inverse reflection on `record`'s class — Rails'
   * `inverse_reflection_for(record)`. The polymorphic subclass routes through
   * `polymorphicInverseOf` (which raises when the configured inverse is
   * missing); the vanilla path resolves the inverse name (including automatic
   * detection) off the owner's reflection, then looks it up on the record.
   * @internal
   */
  private inverseReflectionOn(
    record: Base,
  ): { macro?: string; isHasOne?: () => boolean; klass?: typeof Base } | null {
    if ((this.reflection.options as { polymorphic?: boolean }).polymorphic) {
      return (
        (this.inverseReflectionFor(record) as {
          macro?: string;
          isHasOne?: () => boolean;
          klass?: typeof Base;
        }) ?? null
      );
    }
    const ownerCtor = this.owner.constructor as {
      _reflectOnAssociation?: (n: string) => { inverseName?: () => string | null } | null;
    };
    const inverseName =
      ownerCtor._reflectOnAssociation?.(this.reflection.name)?.inverseName?.() ??
      (this.reflection.options.inverseOf as string | undefined) ??
      null;
    if (!inverseName) return null;
    const recordCtor = record.constructor as {
      _reflectOnAssociation?: (
        n: string,
      ) => { macro?: string; isHasOne?: () => boolean; klass?: typeof Base } | null;
    };
    return recordCtor._reflectOnAssociation?.(inverseName) ?? null;
  }

  protected override foreignKeyPresent(): boolean {
    return this.foreignKeyNames().every((fk) => {
      const value =
        typeof (this.owner as any)._readAttribute === "function"
          ? (this.owner as any)._readAttribute(fk)
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

  protected foreignKeyNames(): string[] {
    const fk = this.reflection.options.foreignKey;
    if (typeof fk === "string") return [fk];
    if (Array.isArray(fk)) return fk;

    // When the owner uses query_constraints, the foreign key is derived from
    // them (Rails `derive_fk_query_constraints`), not from the target's primary
    // key — e.g. a `Sharded::Comment` belongs_to whose owner constraints are
    // `[blog_id, id]` carries `[blog_id, blog_post_id]`. The rich reflection's
    // computed `foreignKey` already does this; the scalar-PK fallback below
    // would drop the `blog_id` component. `this.reflection` is the lightweight
    // `AssociationDefinition` (`{ type, name, options }`) — it has no computed
    // `foreignKey` getter — so resolve the rich `AssociationReflection` (which
    // carries the cached `deriveFkQueryConstraints` value) via the registry.
    if (hasQueryConstraints.call(this.owner.constructor as never)) {
      const ctor = this.owner.constructor as {
        _reflectOnAssociation?: (n: string) => { foreignKey?: string | string[] } | null;
      };
      const computed = ctor._reflectOnAssociation?.(this.reflection.name)?.foreignKey;
      if (computed) return Array.isArray(computed) ? computed : [computed];
    }

    return [`${underscore(this.reflection.name)}_id`];
  }

  protected associationPrimaryKeys(record: Base | null): string[] {
    const configured = this.reflection.options.primaryKey;
    if (configured) {
      return Array.isArray(configured) ? configured : [configured];
    }
    // Mirrors Rails `BelongsToReflection#association_primary_key`
    // (reflection.rb:926-934): when the *target* (`klass`) uses
    // query_constraints — or the association configures `query_constraints:` —
    // the association primary key is the target's `composite_query_constraints_list`,
    // regardless of column count. This makes the composite FK columns zip against
    // the right target columns (e.g. `[blog_id, blog_post_id]` ← target
    // `[blog_id, id]`, not `[id, id]`). Gate on the target, not the owner, exactly
    // as Rails branches on `(klass || self.klass).has_query_constraints?`.
    const targetCtor = (record?.constructor ?? this.klass) as never;
    // A composite (array) `foreign_key` is normalized into `query_constraints`
    // on the *rich* reflection (Rails reflection.rb:533 deletes
    // `options[:foreign_key]`), so the lightweight `this.reflection.options`
    // here still carries the array and lacks `queryConstraints`. Consult the
    // rich reflection's `queryConstraints` too, otherwise a composite FK falls
    // through to the single-`id` inference below and the FK zip in `replaceKeys`
    // lines up `[author_id, book_id]` against `[id]` — writing the target's
    // `id` into the owner's first FK column.
    const richReflection = (
      this.owner.constructor as {
        _reflectOnAssociation?: (n: string) => { options?: { queryConstraints?: unknown } } | null;
      }
    )._reflectOnAssociation?.(this.reflection.name);
    if (
      targetCtor &&
      (hasQueryConstraints.call(targetCtor) ||
        this.reflection.options.queryConstraints ||
        richReflection?.options?.queryConstraints)
    ) {
      const qc = queryConstraintsList.call(targetCtor);
      if (qc) return qc;
    }
    // Mirrors Rails `BelongsToReflection#association_primary_key`
    // (reflection.rb:935-938): when the target has a composite primary key of
    // shape `[<tenant_key>, :id]` (and no query_constraints / explicit
    // primaryKey), Rails infers the single `"id"` as the association primary
    // key; only when the composite PK lacks an `"id"` column does it keep the
    // full array. Without this, the composite FK zip in `replaceKeys` would line
    // a scalar `<name>_id` FK up against a 2-column target PK.
    const pk = ((record?.constructor ?? this.klass) as any)?.primaryKey;
    if (pk) return inferCompositePrimaryKey(pk);
    return ["id"];
  }

  /**
   * Replace FK columns on the owner to point at the given record's PK.
   * Handles composite keys by zipping FK columns with PK columns.
   * Rails: replace_keys(record, force: false)
   */
  protected replaceKeys(record: Base | null): void {
    const fks = this.foreignKeyNames();
    const pks = this.associationPrimaryKeys(record);

    for (let i = 0; i < fks.length; i++) {
      const pkCol = pks[i] ?? pks[0];
      const value = record
        ? typeof (record as any)._readAttribute === "function"
          ? (record as any)._readAttribute(pkCol)
          : (record as any)[pkCol]
        : null;

      if (typeof (this.owner as any)._writeAttribute === "function") {
        (this.owner as any)._writeAttribute(fks[i], value);
      } else {
        (this.owner as any)[fks[i]] = value;
      }
    }
  }

  /**
   * Resolve the counter cache column name via the shared derivation helper
   * (mirrors Rails `reflection.counter_cache_column`), so the logic lives in
   * exactly one place. Unlike the previous inline version, this honors the
   * explicit `counterCache: "<column>"` / `{ column }` forms.
   */
  private counterCacheColumn(): string | null {
    // Prefer the reflection's own `counterCacheColumn()` (mirrors Rails
    // `reflection.counter_cache_column`): it resolves the inverse has_many to
    // recover the demodulized column name for flat-named CPK models
    // (`CpkBook` → `CpkOrder.books` → `books_count`, not `cpk_books_count`).
    // Fall back to the plain owner-name derivation only when the rich
    // reflection isn't available.
    const richReflection = (this.owner.constructor as any)._reflectOnAssociation?.(
      this.reflection.name,
    );
    const fromReflection = richReflection?.counterCacheColumn?.();
    if (fromReflection !== undefined && fromReflection !== null) return fromReflection;
    return belongsToCounterCacheColumn(
      this.reflection.options.counterCache,
      this.owner.constructor.name,
    );
  }

  private async updateCounters(by: number): Promise<void> {
    const counterCol = this.counterCacheColumn();
    if (!counterCol) return;
    if (!this.owner.isPersisted()) return;
    if (!this.foreignKeyPresent()) return;

    const touch = (this.reflection.options as any).touch;

    // Mirrors Rails belongs_to_association.rb#update_counters: when the target is
    // loaded and still the owner's current parent (`target && !stale_target?`),
    // dispatch through `target.increment!(col, by, touch:)` so the class-level
    // Locking::Optimistic#update_counters override bumps the lock version (and
    // applies `touch`) on the in-memory record. Otherwise fall back to an
    // in-place relation `update_counters`.
    //
    // `_cacheSingularTarget` now routes singular inverse writes through
    // `inversedFrom` (→ `replace_keys` → `loadedBang`), so `isStaleTarget()` is
    // authoritative here just as Rails' `stale_target?` is.
    const target = this.target as any;
    if (target && !this.isStaleTarget() && typeof target.incrementBang === "function") {
      await target.incrementBang(counterCol, by, touch != null ? { touch } : {});
      // The counter UPDATE advanced the target's lock_version in the DB; sync it
      // on the in-memory record so a read without a reload sees it and it isn't
      // left dirty (Rails keeps the loaded record consistent with the row it
      // just wrote).
      reflectLockVersionBump(target as Base);
      return;
    }

    const fks = this.foreignKeyNames();
    const pks = this.associationPrimaryKeys(null);
    const conditions: Record<string, unknown> = {};
    for (let i = 0; i < fks.length; i++) {
      const fkValue = (this.owner as any)._readAttribute?.(fks[i]);
      if (fkValue == null) return;
      conditions[pks[i] ?? pks[0]] = fkValue;
    }

    const Klass = this.klass;
    const opts = touch != null ? { touch } : undefined;
    if (Klass && typeof (Klass as any).where === "function") {
      const scope = (Klass as any).where(conditions);
      if (typeof scope.updateCounters === "function") {
        await scope.updateCounters({ [counterCol]: by }, opts);
      }
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

/**
 * Mirrors Rails `BelongsToReflection#association_primary_key`'s composite-PK
 * branch (reflection.rb:935-938): a composite primary key that includes `"id"`
 * infers the single `"id"`; otherwise the full composite array is kept. A
 * scalar primary key is returned as a one-element array.
 * @internal
 */
export function inferCompositePrimaryKey(pk: string | string[]): string[] {
  if (Array.isArray(pk)) return pk.includes("id") ? ["id"] : pk;
  return [pk];
}

/** @internal */
function isRequireCounterUpdate(assoc: BelongsToAssociation): boolean {
  const col = (assoc as any).counterCacheColumn?.();
  return !!(col && assoc.owner.isPersisted());
}

/** @internal */
function primaryKey(assoc: BelongsToAssociation, klass: unknown): string | string[] {
  // Rails: reflection.association_primary_key(klass)
  const refl = assoc.reflection as any;
  if (typeof refl.associationPrimaryKey === "function") {
    return refl.associationPrimaryKey(klass);
  }
  return refl.options?.primaryKey ?? (klass as any)?.primaryKey ?? "id";
}
