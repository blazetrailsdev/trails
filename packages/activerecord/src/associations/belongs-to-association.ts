import type { Base } from "../base.js";
import type { AssociationDefinition } from "../associations.js";
import { underscore } from "@blazetrails/activesupport";
import { belongsToCounterCacheColumn } from "../reflection.js";
import { hasQueryConstraints, queryConstraintsList } from "../persistence.js";
import { SingularAssociation } from "./singular-association.js";
import { Rollback } from "../errors.js";
import { MissingAttributeError } from "@blazetrails/activemodel";

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
          if ((await (target as any).destroy()) === false) {
            throw new Rollback();
          }
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
  async default(block: (owner: Base) => Base | null | Promise<Base | null>): Promise<void> {
    // `reader` and the block are both awaited: TS has no `instance_exec`, and
    // either side resolves asynchronously (belongs_to_association.rb:44).
    if ((await this.reader) == null) await this.writer(await block(this.owner));
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
        // Rails: `owner.class.polymorphic_class_for(model_type_was)` — a model
        // may override the hook to map a custom polymorphic_name back to its
        // class (belongs_to_association.rb:70).
        try {
          modelWas = (this.owner.constructor as typeof Base).polymorphicClassFor(
            modelTypeWas as string,
          );
        } catch {
          return;
        }
      }
    } else {
      modelWas = this.klass;
    }

    const fkNames = this.foreignKeyNames();
    const foreignKeyWas = fkNames.map((foreignKey) =>
      typeof this.owner.attributeBeforeLastSave === "function"
        ? this.owner.attributeBeforeLastSave(foreignKey)
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
    if (typeof klass.unscoped !== "function") return;

    // Rails' `update_counters_via_scope` keys on `primary_key(klass)` —
    // `reflection.association_primary_key(klass)` (belongs_to_association.rb:119,
    // :151-153) — not on `klass.primary_key`, so query_constraints and the
    // `[<tenant>, :id]` composite inference apply here too.
    const pks = this.associationPrimaryKeys(klass);
    if (pks.length !== foreignKeyValues.length) return;
    const conditions: Record<string, unknown> = {};
    for (let i = 0; i < pks.length; i++) {
      if (foreignKeyValues[i] == null) return;
      conditions[pks[i]] = foreignKeyValues[i];
    }

    const scope = klass.unscoped().whereBang(conditions);
    if (typeof scope.updateCounters === "function") {
      const touch = (this.reflection.options as any).touch;
      await scope.updateCounters({ [counterCol]: by, touch });
    }
  }

  /**
   * Returns true if the FK has changed since the last save, or if the
   * target is an unsaved new record.
   */
  isTargetChanged(): boolean {
    const changed = this.foreignKeyNames().some((fk) => this.owner.attributeChanged(fk));
    return (
      changed || (!this.foreignKeyPresent() && this.target != null && this.target.isNewRecord())
    );
  }

  isTargetPreviouslyChanged(): boolean {
    return this.foreignKeyNames().some((fk) => this.owner.attributePreviouslyChanged(fk));
  }

  isSavedChangeToTarget(): boolean {
    return this.foreignKeyNames().some((fk) => this.owner.savedChangeToAttribute(fk));
  }

  // --- Protected ---

  protected override replace(record: Base | null): void {
    if (record) {
      this.raiseOnTypeMismatchBang(record);
      this.setInverseInstance(record);
      this._updated = true;
    } else if (this.target) {
      this.removeInverseInstance(this.target);
    }

    this.replaceKeys(record, { force: true });
    this.target = record;
  }

  protected override staleState(): unknown {
    // Rails: `owner._read_attribute(reflection.foreign_key)`
    // (belongs_to_association.rb:164-166) with NO array branching. For a
    // composite (array) foreign key, Ruby's `@attributes[Array]` matches no
    // stored attribute and resolves to `Attribute.null` → nil (verified
    // against ActiveRecord 8.0.2: composite `stale_state` is nil, so
    // `stale_target?` never fires and an FK change does NOT reload a loaded
    // composite-FK belongs_to). Only a scalar FK yields a real state.
    const fks = this.foreignKeyNames();
    if (fks.length !== 1) return null;
    return typeof (this.owner as any)._readAttribute === "function"
      ? // Rails passes `{ |n| owner.send(:missing_attribute, n, caller) }` — a
        // known-but-unselected FK column raises MissingAttributeError.
        (this.owner as any)._readAttribute(fks[0], (n: string) => {
          throw new MissingAttributeError(
            `missing attribute '${n}' for ${(this.owner.constructor as { name?: string }).name ?? "unknown"}`,
          );
        })
      : (this.owner as any)[fks[0]];
  }

  protected override findTargetNeeded(): boolean {
    // Mirrors Rails `belongs_to_association.rb:124`:
    //   !loaded? && foreign_key_present? && klass
    // The trailing `&& klass` skips the query for a polymorphic belongs_to
    // whose `_type` column is nil (klass resolves to undefined), even with the
    // foreign key present. `klass` is last so it is untouched when FK is absent.
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
    const inverseName =
      this.reflection.inverseName?.() ??
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

  // --- Private helpers ---

  private foreignKeyName(): string {
    const fk = this.reflection.foreignKey ?? `${underscore(this.reflection.name)}_id`;
    return Array.isArray(fk) ? fk[0] : fk;
  }

  protected foreignKeyNames(): string[] {
    const fk = this.reflection.foreignKey ?? `${underscore(this.reflection.name)}_id`;
    return Array.isArray(fk) ? fk : [fk];
  }

  protected associationPrimaryKeys(klass: typeof Base | null): string[] {
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
    const targetCtor = (klass ?? this.klass) as never;
    // A composite (array) `foreign_key` is normalized into `query_constraints`
    // on the *rich* reflection (Rails reflection.rb:533 deletes
    // `options[:foreign_key]`), so the lightweight `this.reflection.options`
    // here still carries the array and lacks `queryConstraints`. Consult the
    // rich reflection's `queryConstraints` too, otherwise a composite FK falls
    // through to the single-`id` inference below and the FK zip in `replaceKeys`
    // lines up `[author_id, book_id]` against `[id]` — writing the target's
    // `id` into the owner's first FK column.
    if (
      targetCtor &&
      (hasQueryConstraints.call(targetCtor) || this.reflection.options.queryConstraints)
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
    const pk = ((klass ?? this.klass) as any)?.primaryKey;
    if (pk) return inferCompositePrimaryKey(pk);
    return ["id"];
  }

  /**
   * Replace FK columns on the owner to point at the given record's PK.
   * Handles composite keys by zipping FK columns with PK columns.
   * Rails: replace_keys(record, force: false)
   */
  protected replaceKeys(record: Base | null, { force = false }: { force?: boolean } = {}): void {
    const fks = this.foreignKeyNames();
    const pks = this.associationPrimaryKeys((record?.constructor as typeof Base) ?? null);

    const targetKeyValues = fks.map((_fk, i) => {
      const pkCol = pks[i] ?? pks[0];
      return record
        ? typeof (record as any)._readAttribute === "function"
          ? (record as any)._readAttribute(pkCol)
          : (record as any)[pkCol]
        : null;
    });

    // Rails skips the write entirely when the owner already holds the target's
    // key (belongs_to_association.rb:137/146) — writing anyway would dirty the
    // FK attribute on an assignment that changes nothing.
    const readOwner = (fk: string): unknown =>
      typeof (this.owner as any)._readAttribute === "function"
        ? (this.owner as any)._readAttribute(fk)
        : (this.owner as any)[fk];
    if (!force && fks.every((fk, i) => readOwner(fk) === targetKeyValues[i])) return;

    for (let i = 0; i < fks.length; i++) {
      const value = targetKeyValues[i];
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
    const fromReflection = this.reflection.counterCacheColumn?.();
    if (fromReflection !== undefined && fromReflection !== null) return fromReflection;
    return belongsToCounterCacheColumn(
      this.reflection.options.counterCache,
      this.owner.constructor.name,
    );
  }

  /**
   * Mirrors Rails `BelongsToAssociation#require_counter_update?`
   * (belongs_to_association.rb:127-129).
   */
  private requireCounterUpdate(): boolean {
    return this.counterCacheColumn() != null && this.owner.isPersisted();
  }

  /**
   * Mirrors Rails `BelongsToAssociation#update_counters`
   * (belongs_to_association.rb:109-117): the guard is
   * `require_counter_update? && foreign_key_present?`; the loaded-and-fresh
   * target is bumped in memory through `increment!` (so
   * `Locking::Optimistic#update_counters` bumps the lock version), otherwise
   * the write goes through `update_counters_via_scope`.
   *
   * `_cacheSingularTarget` routes singular inverse writes through
   * `inversedFrom` (→ `replace_keys` → `loadedBang`), so `isStaleTarget()` is
   * authoritative here just as Rails' `stale_target?` is.
   */
  private async updateCounters(by: number): Promise<void> {
    if (this.requireCounterUpdate() && this.foreignKeyPresent()) {
      const target = this.target as any;
      if (target && !this.isStaleTarget() && typeof target.incrementBang === "function") {
        const counterCol = this.counterCacheColumn()!;
        const touch = (this.reflection.options as any).touch;
        await target.incrementBang(counterCol, by, touch != null ? { touch } : {});
      } else {
        const foreignKey = this.foreignKeyNames().map((fk) =>
          (this.owner as any)._readAttribute?.(fk),
        );
        await this.updateCountersViaScope(this.klass, foreignKey, by);
      }
    }
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
