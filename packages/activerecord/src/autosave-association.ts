/**
 * Mirrors: ActiveRecord::AutosaveAssociation
 *
 * Mixed into Base via include(Base, AutosaveAssociation).
 * Instance methods are this-typed functions on the module object.
 */
import type { Base } from "./base.js";
import { RecordInvalid } from "./validations.js";
import { CompositePrimaryKeyMismatchError } from "./associations/errors.js";
import { routeThroughCheckValidity } from "./associations/validate-through-reflection.js";
import { NestedError as AssociationsNestedError } from "./associations/nested-error.js";
import { associationInstanceGet, type AssociationDefinition } from "./associations.js";
import { hasQueryConstraints, queryConstraintsList } from "./persistence.js";
import { underscore } from "@blazetrails/activesupport";
import { afterCreate, afterUpdate, beforeSave } from "./callbacks.js";

const MARKED_FOR_DESTRUCTION = Symbol.for("blazetrails.markedForDestruction");
const VALIDATING_BELONGS_TO_FOR = Symbol.for("blazetrails.validatingBelongsToFor");
const AUTOSAVING_BELONGS_TO_FOR = Symbol.for("blazetrails.autosavingBelongsToFor");

function _guardKey(association: unknown): string {
  if (typeof association === "string") return association;
  if (association && typeof (association as any).name === "string")
    return (association as any).name;
  return String(association);
}

// ---------------------------------------------------------------------------
// Host interface — what `this` must provide for all this-typed functions
// ---------------------------------------------------------------------------

interface AutosaveAssociationHost {
  [key: symbol]: unknown;
  isNewRecord(): boolean;
  hasChangesToSave?: unknown;
  changed?: unknown;
  destroyedByAssociation?: unknown;
  changedForAutosave(): boolean;
  isChangedForAutosave(): boolean;
  isValidatingBelongsToFor(association: unknown): boolean;
  isAutosavingBelongsToFor(association: unknown): boolean;
  _alreadyCalled?: Record<string, boolean> | null;
  _newRecordBeforeSave?: boolean;
  errors?: {
    add(attr: string, type: string, opts?: Record<string, unknown>): void;
    uniqBang?(): void;
  };
  constructor: { primaryKey?: string | string[]; name: string };
}

// ---------------------------------------------------------------------------
// Module object — included into Base via include(Base, AutosaveAssociation)
// ---------------------------------------------------------------------------

type ReloadOptions = { lock?: boolean | string; unscoped?: boolean };
type ReloadFn<T extends Base> = (this: T, options?: ReloadOptions) => Promise<T>;

/**
 * Reset the in-memory autosave flags before reloading from the database, then
 * delegate to the inherited `reload` (Ruby `super`). `inheritedReload` is the
 * reload method that sat on the prototype when AutosaveAssociation was mixed in,
 * captured at include time so the delegation walks the real ancestry
 * (AutosaveAssociation → Persistence) rather than hardcoding a jump.
 *
 * Mirrors: ActiveRecord::AutosaveAssociation#reload
 */
export function reload<T extends Base>(inheritedReload: ReloadFn<T>): ReloadFn<T> {
  return function (this: T, options?: ReloadOptions): Promise<T> {
    const record = this as unknown as AutosaveAssociationHost;
    record[MARKED_FOR_DESTRUCTION] = false;
    record.destroyedByAssociation = null;
    return inheritedReload.call(this, options);
  };
}

export const AutosaveAssociation = {
  markForDestruction(this: AutosaveAssociationHost): void {
    this[MARKED_FOR_DESTRUCTION] = true;
  },

  markedForDestruction(this: AutosaveAssociationHost): boolean {
    return !!this[MARKED_FOR_DESTRUCTION];
  },

  setDestroyedByAssociation(this: AutosaveAssociationHost, reflection: unknown): void {
    this.destroyedByAssociation = reflection;
  },

  changedForAutosave(this: AutosaveAssociationHost): boolean {
    return (
      this.isNewRecord() ||
      !!this.hasChangesToSave ||
      !!this.changed ||
      !!this[MARKED_FOR_DESTRUCTION] ||
      isNestedRecordsChangedForAutosave.call(this)
    );
  },

  isChangedForAutosave(this: AutosaveAssociationHost): boolean {
    return this.changedForAutosave();
  },

  isValidatingBelongsToFor(this: AutosaveAssociationHost, association: unknown): boolean {
    const map = this[VALIDATING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
    return map?.get(_guardKey(association)) ?? false;
  },

  isAutosavingBelongsToFor(this: AutosaveAssociationHost, association: unknown): boolean {
    const map = this[AUTOSAVING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
    return map?.get(_guardKey(association)) ?? false;
  },

  associatedRecordsToValidateOrSave,
  isNestedRecordsChangedForAutosave,
  validateHasOneAssociation,
  validateBelongsToAssociation,
  validateCollectionAssociation,
  isAssociationValid,
  aroundSaveCollectionAssociation,
  saveCollectionAssociation,
  saveHasOneAssociation,
  is_recordChanged,
  isAssociationForeignKeyChanged,
  isInversePolymorphicAssociationChanged,
  saveBelongsToAssociation,
};

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function _setValidatingBelongsToFor(record: any, association: unknown, value: boolean): void {
  let map = record[VALIDATING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
  if (!map) {
    if (!value) return;
    map = new Map();
    record[VALIDATING_BELONGS_TO_FOR] = map;
  }
  const key = _guardKey(association);
  if (value) {
    map.set(key, true);
  } else {
    map.delete(key);
    if (map.size === 0) delete record[VALIDATING_BELONGS_TO_FOR];
  }
}

function _setAutosavingBelongsToFor(record: any, association: unknown, value: boolean): void {
  let map = record[AUTOSAVING_BELONGS_TO_FOR] as Map<string, boolean> | undefined;
  if (!map) {
    if (!value) return;
    map = new Map();
    record[AUTOSAVING_BELONGS_TO_FOR] = map;
  }
  const key = _guardKey(association);
  if (value) {
    map.set(key, true);
  } else {
    map.delete(key);
    if (map.size === 0) delete record[AUTOSAVING_BELONGS_TO_FOR];
  }
}

// ---------------------------------------------------------------------------
// Standalone exports (used by other modules, called via dynamic import)
// ---------------------------------------------------------------------------

export function markForDestruction(record: Base): void {
  (record as any)[MARKED_FOR_DESTRUCTION] = true;
}

export function isMarkedForDestruction(record: Base): boolean {
  return !!(record as any)[MARKED_FOR_DESTRUCTION];
}

export function isDestroyable(record: Base): boolean {
  return !record.isNewRecord() && isMarkedForDestruction(record);
}

export function build(_model: typeof Base, reflection: { options: Record<string, unknown> }): void {
  if (reflection.options.autosave && reflection.options.validate === undefined) {
    reflection.options.validate = true;
  }
}

export function validOptions(): string[] {
  return ["autosave"];
}

// Post-commit flush for association instances that still queue a deferred
// `_pendingReplace`. Collection associations no longer participate: their
// persisted-owner assignment throws (`CollectionPersistedAssignmentError`) and
// the awaitable `CollectionAssociation#writer` persists inline, so they no
// longer define `persistReplace` at all (RFC 0068). The sole remaining matcher
// of the duck-type below is `HasOneThroughAssociation`, which still defines
// both `persistReplace` (has-one-through-association.ts) and `_pendingReplace`.
// Its marker is normally consumed during the save (`autosaveHasOne` ->
// `persistReplace` from Rails' `save_has_one_association` through arm), so by
// post-commit it is usually null and the loop no-ops — this is deliberately
// kept as its safety net for a marker that survives the save, not dead code.
export async function flushPendingReplaces(record: Base): Promise<void> {
  const instances: Map<string, unknown> = (record as any)._associationInstances;
  if (!instances?.values) return;
  for (const assoc of instances.values()) {
    if (typeof (assoc as any).persistReplace === "function" && (assoc as any)._pendingReplace) {
      await (assoc as any).persistReplace();
    }
  }
}

// ---------------------------------------------------------------------------
// Validate & autosave (called from Base.isValid and Base.save)
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Save callbacks, registered per association by
// `addAutosaveAssociationCallbacks` (autosave_association.rb:171-206).
// HABTM reflections route into `saveCollectionAssociation` as a hasMany-typed
// def, mirroring Rails, which backs `has_and_belongs_to_many` with
// `has_many :through` and runs `save_collection_association` for both.
// ---------------------------------------------------------------------------

/** @internal */
export async function saveCollectionAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<boolean> {
  const association = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  if (!association) return true;
  const autosave = reflection.options?.autosave;

  // By saving the instance variable in a local variable,
  // we make the whole callback re-entrant.
  const newRecordBeforeSave = !!(this as any)._newRecordBeforeSave;

  // reconstruct the scope now that we know the owner's id
  association.resetScope();

  let records: Base[] | null = associatedRecordsToValidateOrSave(
    association,
    newRecordBeforeSave,
    autosave,
  );
  if (records) {
    if (autosave) {
      const recordsToDestroy = records.filter((record: Base) => isMarkedForDestruction(record));
      for (const record of recordsToDestroy) {
        await association.destroy(record);
      }
      records = records.filter((record: Base) => !recordsToDestroy.includes(record));
    }

    for (const record of records) {
      if ((record as any).isDestroyed?.()) continue;

      let saved = true;

      if (autosave !== false && (newRecordBeforeSave || record.isNewRecord())) {
        association.setInverseInstance(record);

        if (autosave) {
          saved = !!(await association.insertRecord(record, false));
        } else if (!reflection.isNested()) {
          const associationSaved = !!(await association.insertRecord(record));

          if (reflection.options?.validate !== false) {
            if (!associationSaved) propagateErrors(this as unknown as Base, reflection.name);
            saved = associationSaved;
          }
        }
      } else if (autosave) {
        saved = !!(await record.save({ validate: false }));
      }

      // Rails raises `RecordInvalid.new(association.owner)`; trails surfaces the
      // failure by returning false, which makes the registered
      // after_create/after_update callback raise it instead.
      if (!saved) return false;
    }
  }
  return true;
}

/** @internal */
export async function saveHasOneAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<boolean> {
  const owner = this as unknown as Base;
  const assoc: AssociationDefinition = {
    name: reflection.name,
    type: "hasOne",
    options: reflection.options ?? {},
  } as AssociationDefinition;
  const association = associationInstanceGet.call(owner, reflection.name) as any;
  const ctor = owner.constructor as typeof Base;
  // Rails `save_has_one_association` reads `reflection.through_reflection`
  // (autosave_association.rb:489).
  const isThrough = !!reflection?.throughReflection;

  // Rails `save_has_one_association`'s `through_reflection` arm persists the
  // join side of a has_one *through* (build/update/destroy via
  // `createThroughRecord`) — the analog of Rails' assignment-time
  // `create_through_record`, deferred here to the owner's save. This is
  // autosave-option-independent (Rails creates the join in `replace` regardless
  // of `:autosave`) and only acts when an assignment queued `_pendingReplace`,
  // so it runs unconditionally: it no-ops for a merely-cached target, and it
  // must precede the `!record` early return so the nil-target destroy arm runs.
  // An awaited `writer` on a persisted owner already persisted (clearing the
  // marker), so this no-ops there; the sync `build`/`create` path leaves the
  // marker for this callback to flush. Control then FALLS THROUGH to the shared
  // body below — which, per Rails (autosave_association.rb:489), skips only the
  // foreign-key write for through, but still runs the end-record
  // `marked_for_destruction` and (autosave-gated) `record.save` arms.
  if (isThrough && typeof association?.persistReplace === "function") {
    await association.persistReplace();
  }

  // A has_one *through* suppresses its through-proxy's independent autosave by
  // planting a sentinel `_pendingReplace` on the (plain has_one) proxy: over an
  // UNLOADED pre-existing join row the through builds a fresh join record in
  // memory so `owner.through` reads present it synchronously, but that record
  // must NOT be inserted here — the through's own `persistReplace` reconciles
  // the existing DB row via `load_target` + `update`, and persisting it here
  // would duplicate that row. A plain `HasOneAssociation` never sets
  // `_pendingReplace` itself (its displacement removal runs inline, via
  // `detachDisplacedTarget`), and the through association itself clears its marker
  // in the `persistReplace` above, so a truthy marker on a non-through
  // association is unambiguously that suppression sentinel. Skip
  // the end-record persistence; the through owns the join row.
  if (association?._pendingReplace && !isThrough) {
    return true;
  }

  const target = association?.target;
  if (!target || Array.isArray(target) || !(target instanceof Object)) return true;
  const record = target as Base;

  // Rails: `autosave = reflection.options[:autosave]`. The callback is
  // registered unconditionally (autosave_association.rb:199-200), so `autosave`
  // may be `true`, `undefined`/nil, or `false` here. The `autosave != false`
  // decision lives in this method (autosave_association.rb:484), not at
  // registration: `false` skips the destroy branch (:482, gated on `autosave &&`)
  // AND the entire FK-assignment/save block (:484 `elsif autosave != false`),
  // while nil/true still persists a NEW/changed child via the `_record_changed?`
  // leg (:487).
  //
  // Read the option from the `reflection` closed over at registration time
  // (forwarded here as `assoc.options`), mirroring Rails: the callback closes
  // over the `reflection` param of `add_autosave_association_callbacks`
  // (autosave_association.rb:200) and `define_non_cyclic_method` guards
  // re-registration (:160 `return if method_defined?`), so a later
  // re-declaration is NOT picked up — Rails keeps the original reflection.
  const autosave = assoc.options.autosave;

  // NOTE: the join side of a has_one *through* was already persisted above by
  // `persistReplace` (which consumes the association's `_pendingReplace`),
  // so control falls through here to run the shared end-record arms — the FK
  // write is skipped for through further down (Rails autosave_association.rb:489)
  // while `marked_for_destruction`/`record.save` still apply.

  // Rails save_has_one_association:478 — `return unless record && !record.destroyed?`.
  // Must precede the marked_for_destruction branch (Rails:482) so an
  // already-destroyed child isn't re-destroyed.
  if (typeof (record as any).isDestroyed === "function" && (record as any).isDestroyed())
    return true;
  // Rails: `if autosave && record.marked_for_destruction?` — only destroy the
  // child when the autosave option is enabled.
  if (autosave && isMarkedForDestruction(record)) {
    // Rails save_has_one_association:482-483 — `record.destroy` runs
    // unconditionally; even a new_record? child runs the destroy callback
    // chain, dependent cascades, and freeze (only the DB DELETE is skipped).
    await record.destroy();
    return true;
  }
  // Rails save_has_one_association:484 — `elsif autosave != false`. An explicit
  // `autosave: false` opts the association out of persistence entirely: no FK
  // assignment, no `_record_changed?` save. Registered unconditionally above
  // (matching Rails autosave_association.rb:199-200), the option is honored here
  // in-method rather than at callback registration.
  if (autosave === false) return true;
  // Rails save_has_one_association:487 — gate via
  // `(autosave && record.changed_for_autosave?) || _record_changed?(reflection, record, pk)`.
  // The first leg only fires when the autosave option is enabled; the
  // _record_changed? leg (FK / inverse-polymorphic / will-save-change /
  // new_record?) applies for a nil/true autosave (the `false` case already
  // returned above), so a NEW child persists whether or not autosave is set.
  // Rails:485-486 — `primary_key = Array(compute_primary_key(reflection, self))`
  // then `primary_key_value = primary_key.map { _read_attribute(_1) }`.
  const pkSpec = reflection ? computePrimaryKey(reflection, owner) : (ctor.primaryKey ?? "id");
  const pkArr: string[] = Array.isArray(pkSpec) ? pkSpec : [pkSpec];
  const pkForChangeCheck = pkArr.map((k) => owner._readAttribute(k));
  const changedForSave =
    typeof (record as any).changedForAutosave === "function"
      ? (record as any).changedForAutosave()
      : !!(record as any).changed;
  const recordChanged = reflection
    ? is_recordChanged(reflection, record, pkForChangeCheck)
    : record.isNewRecord();
  if ((autosave && changedForSave) || recordChanged) {
    // Rails save_has_one_association:489 — `unless reflection.through_reflection`.
    // A has_one *through* never writes a foreign key onto the end record (its
    // owner-linkage lives on the join row, persisted above via
    // `persistReplace`); it also skips `set_inverse_instance`. Both are
    // guarded here, while the `record.save` arm below still runs for through
    // (gated by the same `(autosave && changed) || _record_changed?` condition),
    // so an `autosave: true` through re-saves a mutated end record.
    if (!reflection?.throughReflection) {
      // reflection.foreignKey resolves queryConstraints-derived FK columns;
      // fall back to the raw option or the default scalar FK.
      const foreignKey: string | string[] =
        (reflection && reflection.foreignKey != null ? reflection.foreignKey : null) ??
        assoc.options.foreignKey ??
        `${underscore(ctor.name)}_id`;
      // Mirrors Rails compute_primary_key (autosave_association.rb:576-587).
      // Use the reflection (when available) so the normalized queryConstraints option
      // (array FKs are moved there by the reflection constructor) is visible to branch 2.
      const explicitPk = assoc.options.primaryKey;
      let primaryKey: string | string[];
      if (explicitPk) {
        primaryKey = explicitPk;
      } else {
        const candidatePk = computePrimaryKey(reflection ?? assoc, owner);
        // computePrimaryKey may collapse a CPK to "id" when queryConstraintsList is null
        // (our queryConstraintsList doesn't auto-return composite PK, unlike Rails).
        // When that produces a scalar against a composite FK, fall back to ctor.primaryKey
        // so CPK models with explicit composite FKs still pair correctly.
        primaryKey =
          !Array.isArray(candidatePk) && Array.isArray(foreignKey) ? ctor.primaryKey : candidatePk;
      }
      // Mirrors Rails composite_primary_key? collapse (autosave_association.rb:582-585):
      // collapse only when the PK array IS the class composite primary key (not a QC-derived
      // list). QC branch returns early before reaching composite_primary_key? in Rails,
      // so we gate on Array.isArray(ctor.primaryKey) — QC models typically keep scalar PK.
      if (
        !explicitPk &&
        Array.isArray(ctor.primaryKey) &&
        Array.isArray(primaryKey) &&
        !Array.isArray(foreignKey)
      ) {
        if (primaryKey.includes("id")) primaryKey = "id";
      }
      if (Array.isArray(primaryKey) && Array.isArray(foreignKey)) {
        if (primaryKey.length !== foreignKey.length) {
          // Route through the reflection's canonical checkValidityBang (Rails'
          // single raise site) so the error carries the Rails-faithful message.
          routeThroughCheckValidity(owner.constructor as typeof Base, assoc.name);
          // No reflection resolvable — minimal trails-only fallback guard.
          throw new CompositePrimaryKeyMismatchError({
            activeRecord: (owner.constructor as typeof Base).name,
            name: assoc.name,
            primaryKey,
            foreignKey,
          });
        }
        primaryKey.forEach((pk: string, i: number) => {
          const pkValue = owner._readAttribute(pk);
          if (pkValue != null) record._writeAttribute(foreignKey[i], pkValue);
        });
      } else if (!Array.isArray(primaryKey) && !Array.isArray(foreignKey)) {
        const pkValue = owner._readAttribute(primaryKey);
        if (pkValue != null) record._writeAttribute(foreignKey, pkValue);
      } else {
        // Route through the reflection's canonical checkValidityBang (Rails'
        // single raise site) so the error carries the Rails-faithful message.
        routeThroughCheckValidity(owner.constructor as typeof Base, assoc.name);
        // No reflection resolvable — minimal trails-only fallback guard.
        throw new CompositePrimaryKeyMismatchError({
          activeRecord: (owner.constructor as typeof Base).name,
          name: assoc.name,
          primaryKey,
          foreignKey,
        });
      }
      // Mirrors Rails save_has_one_association:496: set_inverse_instance fires
      // after FK assignment, before save (autosave_association.rb:497).
      association?.setInverseInstance?.(record);
    }

    // Rails save_has_one_association:500-501 — skip the save when the inverse
    // belongs_to is currently autosaving (prevents mutual-save infinite loops).
    const inverse =
      typeof reflection?.inverseOf === "function"
        ? reflection.inverseOf()
        : (reflection?.inverseOf ?? null);
    if (
      inverse &&
      typeof (record as any).isAutosavingBelongsToFor === "function" &&
      (record as any).isAutosavingBelongsToFor(inverse)
    )
      return true;

    // Rails: `record.save(validate: !autosave)`. With autosave enabled the
    // child was already validated in the owner's validation phase, so
    // validate: false; with autosave nil it is validated here at save time.
    const saved = await record.save({ validate: !autosave });
    if (!saved) {
      // Rails: `raise ActiveRecord::Rollback if !saved && autosave` — a failed
      // save only rolls the owner back when the autosave option is enabled (and
      // adds no owner error; child validation errors were already imported
      // during the validation phase). trails surfaces that rollback by returning
      // false, which makes the after_create/after_update callback throw
      // RecordInvalid. With autosave nil there is no rollback, so return true.
      return !autosave;
    }
  }
  return true;
}

/** @internal */
export async function saveBelongsToAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<boolean> {
  const owner = this as unknown as Base;
  const assoc: AssociationDefinition = {
    name: reflection.name,
    type: "belongsTo",
    options: reflection.options ?? {},
  } as AssociationDefinition;
  const association = associationInstanceGet.call(owner, reflection.name) as any;
  // Rails save_belongs_to_association:538 — skip when the loaded target is
  // stale (FK changed since the target was cached).
  if (association?.isStaleTarget?.()) return true;
  const associated = association?.target;
  if (!associated || Array.isArray(associated) || !(associated instanceof Object)) return true;
  const record = associated as Base;
  // Rails save_belongs_to_association:541 — `if record && !record.destroyed?`.
  if (typeof (record as any).isDestroyed === "function" && (record as any).isDestroyed())
    return true;

  const autosave = assoc.options.autosave;
  // Rails save_belongs_to_association:548 — `elsif autosave != false`.
  // Explicit `autosave: false` opts out entirely.
  if (autosave === false) return true;

  if (autosave && isMarkedForDestruction(record)) {
    // Rails save_belongs_to_association:544-547 — destroy path is only
    // reached when `autosave` is truthy; the destruction nulls the FK on
    // self first so the owner save doesn't keep a dangling reference.
    // Rails save_belongs_to_association:545 — `foreign_key = Array(reflection.foreign_key)`.
    const foreignKey: string[] = Array.isArray(reflection.foreignKey)
      ? reflection.foreignKey
      : [reflection.foreignKey];
    for (const key of foreignKey) owner._writeAttribute(key, null);
    // Rails save_belongs_to_association:544-547 — `record.destroy` runs
    // unconditionally after nulling the owner FK; a new_record? child still
    // runs destroy callbacks, dependent cascades, and freeze.
    await record.destroy();
    return true;
  }

  // Rails save_belongs_to_association:549 — `record.new_record? || (autosave && record.changed_for_autosave?)`.
  const beChangedForSave =
    autosave &&
    (typeof (record as any).changedForAutosave === "function"
      ? (record as any).changedForAutosave()
      : !!(record as any).changed);
  const isNewOrChanged = record.isNewRecord() || beChangedForSave;
  if (isNewOrChanged) {
    _setAutosavingBelongsToFor(owner, assoc, true);
    let saved: boolean | undefined;
    try {
      // Rails save_belongs_to_association:553: `record.save(validate: !autosave)`.
      saved = await record.save({ validate: !autosave });
    } finally {
      _setAutosavingBelongsToFor(owner, assoc, false);
    }
    if (!saved) {
      // Rails save_belongs_to_association:571 — `saved if autosave`. Only
      // autosave==true propagates the failure to abort the owner save; child
      // errors were already surfaced on the owner via the validation phase
      // (validate_belongs_to_association → association_valid?), so no error is
      // added here. Default belongs_to leaves owner.errors untouched.
      if (autosave) {
        return false;
      }
      return true;
    }
  }

  // Rails save_belongs_to_association:560 — the FK write is gated on
  // `association.updated?`, independent of whether the target itself needed
  // saving. This matters when two relations share one target (e.g. an order's
  // billing and shipping pointing at the same customer): the second relation
  // re-assigns an already-persisted, unchanged record, so the save above is
  // skipped, but its FK must still be propagated. We keep `isNewOrChanged` in
  // the guard so the `setTarget` test shortcut — which bypasses the writer and
  // leaves `updated?` false — still propagates the FK as before.
  if (isNewOrChanged || association?.isUpdated?.()) {
    // Rails save_belongs_to_association:562 — `foreign_key = Array(reflection.foreign_key)`.
    const foreignKey: string[] = Array.isArray(reflection.foreignKey)
      ? reflection.foreignKey
      : [reflection.foreignKey];
    // Pair against the target's PK columns in the same shape the writer
    // (BelongsToAssociation#replaceKeys) used, so autosave FK
    // propagation lands on the same columns the writer populated.
    // Rails save_belongs_to_association:561 —
    // `primary_key = Array(compute_primary_key(reflection, record)).map(&:to_s)`.
    let primaryKey: string[] | null = null;
    if (assoc.options.primaryKey == null) {
      // Defer to computePrimaryKey when the target has *explicit* class-level
      // query_constraints and Rails' compute_primary_key (steps 2/3 at
      // autosave_association.rb:577-582) would pick that list.
      const targetHasQc = hasQueryConstraints.call(record.constructor as any);
      const targetQcWouldApply =
        targetHasQc && (assoc.options.queryConstraints != null || assoc.options.foreignKey == null);
      if (!targetQcWouldApply) {
        // When the FK is explicitly composite, pair the full composite PK
        // against the composite FK columns so the zip hits every column.
        const explicitFk = assoc.options.foreignKey ?? assoc.options.queryConstraints;
        const fkIsComposite = Array.isArray(explicitFk) && explicitFk.length > 1;
        const reflFk = reflection?.foreignKey;
        const reflFkIsComposite = Array.isArray(reflFk) && reflFk.length > 1;
        if (fkIsComposite || reflFkIsComposite) {
          const pk = (record.constructor as typeof Base).primaryKey;
          if (Array.isArray(pk) && pk.length > 1) primaryKey = pk;
        }
      }
    }
    if (primaryKey === null) {
      const rawPk = computePrimaryKey(reflection, record);
      primaryKey = Array.isArray(rawPk) ? rawPk : [rawPk];
    }
    // Rails save_belongs_to_association:563: `primary_key.zip(foreign_key)`.
    // Ruby's Array#zip drops trailing args when the argument is longer than
    // the receiver, and pads with nil when the argument is shorter. Mirror
    // that here so shape mismatches don't raise — they just don't write FK
    // columns we have no PK source for (and vice versa).
    for (let i = 0; i < primaryKey.length; i++) {
      const fkCol = foreignKey[i];
      if (fkCol == null) continue;
      const associationId = record._readAttribute(primaryKey[i]);
      // Rails save_belongs_to_association:566 — `unless self[fk] == id`.
      if (owner._readAttribute(fkCol) !== associationId) {
        owner._writeAttribute(fkCol, associationId);
      }
    }
    // Rails save_belongs_to_association:568 — `association.loaded!` fires
    // inside the `if association.updated?` branch after the FK write.
    if (association?.isUpdated?.()) association.loadedBang?.();
  }
  return true;
}

// Mirrors Rails `save_collection_association` (autosave_association.rb:466-468):
// when a child insert fails and the reflection validates, the owner gets a
// single humanized `errors.add(reflection.name)` ("Published books is invalid")
// — NOT a `base`/"X is invalid" error plus a duplicate of every child
// full-message. has_one/belongs_to save failures add nothing on the owner
// (Rails' save_has_one_association / save_belongs_to_association just abort);
// any child validation errors were already imported on the owner during the
// validation phase via `association_valid?` (isAssociationValid).
function propagateErrors(parent: Base, reflectionName: string): void {
  // Rails reflection names are snake_case (`:published_books`), so the default
  // humanized full message reads "Published books is invalid". trails reflection
  // names are camelCase, so underscore first to reproduce the same humanization.
  parent.errors.add(underscore(reflectionName));
}

/** @internal */
function initInternals(this: AutosaveAssociationHost): void {
  this._alreadyCalled = null;
}

/** @internal */
export function associatedRecordsToValidateOrSave(
  association: any,
  newRecord: boolean,
  autosave: boolean,
): any[] | null {
  const raw = association?.target;
  if (raw == null) return null;
  const target: any[] = Array.isArray(raw) ? raw : [raw];
  if (newRecord) return target;
  if (autosave) return target.filter((r: any) => r.changedForAutosave?.() ?? false);
  return target.filter((r: any) => r.isNewRecord?.() ?? false);
}

/** @internal */
export function isNestedRecordsChangedForAutosave(this: AutosaveAssociationHost): boolean {
  const record = this as any;
  record._nestedRecordsChangedForAutosaveAlreadyCalled ??= false;
  if (record._nestedRecordsChangedForAutosaveAlreadyCalled) return false;
  try {
    record._nestedRecordsChangedForAutosaveAlreadyCalled = true;
    const reflections: Record<string, any> = record.constructor._reflections ?? {};
    for (const reflection of Object.values(reflections)) {
      if (!reflection.options?.autosave) continue;
      const association = associationInstanceGet.call(record, reflection.name) as any;
      if (!association || association.target == null) continue;
      // Rails: `Array.wrap(association.target).any?(&:changed_for_autosave?)`.
      const target: any[] = Array.isArray(association.target)
        ? association.target
        : [association.target];
      if (
        target.some((r: any) =>
          typeof r.changedForAutosave === "function" ? r.changedForAutosave() : false,
        )
      )
        return true;
    }
    return false;
  } finally {
    record._nestedRecordsChangedForAutosaveAlreadyCalled = false;
  }
}

/** @internal */
export async function validateHasOneAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  const inst = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  const record = inst?.target;
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  // Rails autosave_association.rb:332 — `record.changed_for_autosave? || custom_validation_context?`.
  const customCtx =
    typeof (this as any).customValidationContext === "function" &&
    (this as any).customValidationContext();
  if (!(record.changedForAutosave?.() ?? false) && !customCtx) return;
  // Mirrors Rails: skip if the inverse belongs_to is currently validating or autosaving
  // to prevent infinite mutual-validation loops.
  const inverse =
    typeof reflection.inverseOf === "function"
      ? reflection.inverseOf()
      : (reflection.inverseOf ?? null);
  if (inverse) {
    const inverseInst = associationInstanceGet.call(record, inverse.name) as any;
    if (
      inverseInst &&
      (record.isValidatingBelongsToFor?.(inverse) || record.isAutosavingBelongsToFor?.(inverse))
    )
      return;
  }
  await isAssociationValid.call(this, inst, record);
}

/** @internal */
export async function validateBelongsToAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  const inst = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  const record = inst?.target;
  if (!record || typeof record !== "object" || Array.isArray(record)) return;
  // Rails autosave_association.rb:346 — `record.changed_for_autosave? || custom_validation_context?`.
  const customCtx =
    typeof (this as any).customValidationContext === "function" &&
    (this as any).customValidationContext();
  if (!(record.changedForAutosave?.() ?? false) && !customCtx) return;
  _setValidatingBelongsToFor(this, reflection, true);
  try {
    await isAssociationValid.call(this, inst, record);
  } finally {
    _setValidatingBelongsToFor(this, reflection, false);
  }
}

/** @internal */
export async function validateCollectionAssociation(
  this: AutosaveAssociationHost,
  reflection: any,
): Promise<void> {
  // Mirrors Rails: use associatedRecordsToValidateOrSave to filter by new_record/autosave state.
  // Pass the real Association instance so downstream readers can reach
  // subclass methods (`isUpdated`, `setInverseInstance`, etc.) — Slot A.
  const association = associationInstanceGet.call(this as unknown as Base, reflection.name) as any;
  // Mirrors Rails autosave_association.rb:298-305 — a custom validation context
  // bypasses the changed/new filter so unchanged persisted children still run
  // their context-specific validators (the `|| custom_validation_context?` arm).
  const customCtx =
    typeof (this as any).customValidationContext === "function" &&
    (this as any).customValidationContext();
  const records = customCtx
    ? association?.target == null
      ? null
      : Array.isArray(association.target)
        ? (association.target as any[])
        : [association.target]
    : associatedRecordsToValidateOrSave(
        association,
        typeof this.isNewRecord === "function" ? this.isNewRecord() : false,
        !!reflection.options?.autosave,
      );
  if (!records) return;
  for (const record of records) {
    await isAssociationValid.call(this, association, record);
  }
}

/** @internal */
export async function isAssociationValid(
  this: AutosaveAssociationHost,
  association: any,
  record: any,
): Promise<boolean> {
  // Mirrors Rails `association_valid?` (autosave_association.rb:371-398), which
  // reads the reflection off the association and the errors off `self` — so
  // neither rides in as an extra param.
  const owner = this as any;
  const reflection = association.reflection;
  if (typeof record.isDestroyed === "function" && record.isDestroyed()) return true;
  if (reflection.options?.autosave && isMarkedForDestruction(record)) return true;
  const context =
    typeof owner?.customValidationContext === "function" && owner.customValidationContext()
      ? owner._validationContext
      : undefined;
  const isChildValid = typeof record.isValid === "function" ? await record.isValid(context) : true;
  if (isChildValid) return true;

  const childErrors: any[] = record.errors?.objects ?? [];
  const associatedErrors =
    record.isNewRecord?.() || record.changed || context
      ? childErrors
      : childErrors.filter((e: any) => e instanceof AssociationsNestedError);

  const parentErrors = owner?.errors;
  if (!parentErrors) return isChildValid;

  if (reflection.options?.autosave) {
    if (owner === record) return isChildValid; // Rails: `return if equal?(record)`
    for (const error of associatedErrors) {
      parentErrors.objects.push(new AssociationsNestedError(association, error));
    }
  } else if (associatedErrors.length > 0) {
    parentErrors.add(reflection.name);
  }
  return isChildValid;
}

/** @internal */
export function aroundSaveCollectionAssociation(
  this: AutosaveAssociationHost,
  fn: () => void | Promise<any>,
): void | Promise<any> {
  const prev = this._newRecordBeforeSave ?? false;
  this._newRecordBeforeSave =
    !prev && (typeof this.isNewRecord === "function" ? this.isNewRecord() : false);
  const restore = () => {
    this._newRecordBeforeSave = prev;
  };
  let result: void | Promise<any>;
  try {
    result = fn();
  } catch (e) {
    restore();
    throw e;
  }
  if (result != null && typeof (result as any).then === "function") {
    return result.then(
      (v) => {
        restore();
        return v;
      },
      (e) => {
        restore();
        throw e;
      },
    );
  }
  restore();
  return result;
}

/** @internal */
export function is_recordChanged(reflection: any, record: any, key: any[]): boolean {
  const fkCols: string[] = Array.isArray(reflection.foreignKey)
    ? reflection.foreignKey
    : [reflection.foreignKey];
  return (
    (typeof record.isNewRecord === "function" ? record.isNewRecord() : false) ||
    isAssociationForeignKeyChanged(reflection, record, key) ||
    isInversePolymorphicAssociationChanged(reflection, record) ||
    (typeof record.willSaveChangeToAttribute === "function"
      ? fkCols.some((col) => record.willSaveChangeToAttribute(col))
      : false)
  );
}

/** @internal */
export function isAssociationForeignKeyChanged(reflection: any, record: any, key: any[]): boolean {
  if (reflection.throughReflection) return false;
  const fk: string[] = Array.isArray(reflection.foreignKey)
    ? reflection.foreignKey
    : [reflection.foreignKey];
  if (!fk.every((k: string) => record.hasAttribute?.(k) !== false)) return false;
  const recordFk = fk.map((k: string) => String(record._readAttribute?.(k) ?? ""));
  const keyArr = (Array.isArray(key) ? key : [key]).map((v) => String(v ?? ""));
  return recordFk.join("\0") !== keyArr.join("\0");
}

/** @internal */
export function isInversePolymorphicAssociationChanged(reflection: any, record: any): boolean {
  const inverse =
    typeof reflection.inverseOf === "function"
      ? reflection.inverseOf()
      : (reflection.inverseOf ?? null);
  if (!inverse?.options?.polymorphic) return false;
  // Rails inverse_polymorphic_association_changed? — read the polymorphic
  // type column off the child record and compare the parent class to the
  // class resolved for that name. Detects swaps where the FK is unchanged
  // but the polymorphic _type column points at a different active_record.
  const foreignType: string = inverse.foreignType ?? `${underscore(String(inverse.name))}_type`;
  const className = record._readAttribute(foreignType);
  const recordClass = record.constructor as {
    polymorphicClassFor: (n: string) => unknown;
  };
  return reflection.activeRecord !== recordClass.polymorphicClassFor(className);
}

/** @internal */
export function computePrimaryKey(reflection: any, record: any): string | string[] {
  if (reflection.options?.primaryKey) return reflection.options.primaryKey;
  const ctor = record.constructor as typeof Base & {
    primaryKey?: string | string[];
    _hasQueryConstraints?: boolean;
    _queryConstraintsList?: string[] | null;
  };
  // Mirrors Rails autosave_association.rb:579-587
  if (reflection.options?.queryConstraints) {
    const qcl = queryConstraintsList.call(ctor as any);
    if (qcl) return qcl;
  }
  if (hasQueryConstraints.call(ctor as any) && !reflection.options?.foreignKey) {
    const qcl = queryConstraintsList.call(ctor as any);
    if (qcl) return qcl;
  }
  if (Array.isArray(ctor.primaryKey)) {
    const pk: string[] = ctor.primaryKey;
    return pk.includes("id") ? "id" : pk;
  }
  return ctor.primaryKey ?? "id";
}

/** @internal */
export function _ensureNoDuplicateErrors(this: AutosaveAssociationHost): void {
  if (typeof this.errors?.uniqBang === "function") this.errors.uniqBang();
}

/** @internal */
export function defineNonCyclicMethod(klass: any, name: string, fn: (this: any) => any): void {
  if (!klass.prototype) return;
  // Mirrors Ruby method_defined?(name, false) — check only the immediate class prototype.
  if (Object.prototype.hasOwnProperty.call(klass.prototype, name)) return;
  if (klass.prototype) {
    klass.prototype[name] = function (this: any) {
      this._alreadyCalled ??= Object.create(null);
      if (this._alreadyCalled[name]) return true;
      this._alreadyCalled[name] = true;
      const clear = () => {
        this._alreadyCalled[name] = false;
      };
      let result: any;
      try {
        result = fn.call(this);
      } catch (e) {
        clear();
        throw e;
      }
      // Keep the guard set until async work settles to prevent re-entrant autosave cycles.
      if (result != null && typeof result.then === "function") {
        return result.then(
          (v: any) => {
            clear();
            return v;
          },
          (e: any) => {
            clear();
            throw e;
          },
        );
      }
      clear();
      return result;
    };
  }
}

/**
 * Registers save callbacks for an association declared with `autosave: true`.
 *
 * - Collection (hasMany / habtm): dedup-registers `aroundSave` for
 *   `_newRecordBeforeSave` tracking, then `afterCreate` + `afterUpdate` to
 *   persist children. Raises `RecordInvalid` on failure so `save()` returns
 *   false and the enclosing DB transaction is rolled back.
 * - HasOne: same as collection minus the around_save.
 * - BelongsTo: `beforeSave` that halts the chain on failure.
 *
 * @internal
 */
export function addAutosaveAssociationCallbacks(model: any, reflection: any): void {
  const saveMethod = `autosaveAssociatedRecordsFor_${reflection.name}`;
  // Mirrors Rails' `define_non_cyclic_method` early-return: if the method is
  // already defined on the model's own prototype, all callbacks for this
  // association are already registered — calling again would duplicate the
  // after_create/after_update/before_save lambdas.
  if (Object.prototype.hasOwnProperty.call(model.prototype ?? {}, saveMethod)) return;
  const isCollection: boolean =
    typeof reflection.isCollection === "function"
      ? reflection.isCollection()
      : reflection.collection === true ||
        reflection.macro === "hasMany" ||
        reflection.macro === "hasAndBelongsToMany" ||
        reflection.type === "hasMany" ||
        reflection.type === "hasAndBelongsToMany";
  const isHasOne: boolean =
    typeof reflection.hasOne === "function"
      ? reflection.hasOne()
      : reflection.hasOne === true || reflection.macro === "hasOne" || reflection.type === "hasOne";

  if (isCollection) {
    model.aroundSave(":aroundSaveCollectionAssociation");
    defineNonCyclicMethod(model, saveMethod, async function (this: any) {
      return saveCollectionAssociation.call(this, reflection);
    });
    // Mirrors Rails: save_collection_association runs for every collection
    // association unless `autosave: false` opts out. The option's true-form
    // gates additional behavior (validating already-persisted records,
    // destroying marked-for-destruction children); its absence still
    // propagates inserts of new children so owner.save surfaces failures —
    // see autosave_association.rb `save_collection_association`.
    const collectionName = reflection.name;
    afterCreate(model, async (record: any) => {
      const assocDef = record.constructor._associations?.find(
        (a: any) => a.name === collectionName,
      );
      if (assocDef?.options?.autosave === false) return;
      if ((await record[saveMethod]()) === false) throw new RecordInvalid(record);
    });
    afterUpdate(model, async (record: any) => {
      const assocDef = record.constructor._associations?.find(
        (a: any) => a.name === collectionName,
      );
      if (assocDef?.options?.autosave === false) return;
      if ((await record[saveMethod]()) === false) throw new RecordInvalid(record);
    });
  } else if (isHasOne) {
    defineNonCyclicMethod(model, saveMethod, async function (this: any) {
      return saveHasOneAssociation.call(this, reflection);
    });
    // Mirrors Rails: `save_has_one_association` is registered for after_create
    // and after_update UNCONDITIONALLY (autosave_association.rb:199-200,
    // `add_autosave_association_callbacks`, `elsif reflection.has_one?` — no
    // autosave-option gate). The `autosave != false` decision lives INSIDE
    // `autosaveHasOne` (Rails autosave_association.rb:484), not here. Registering
    // unconditionally keeps a nil/true-autosave NEW/changed child's persistence
    // in-save (via the `_record_changed?` → `new_record?` leg) rather than
    // deferring it to the post-commit `flushPendingReplaces` net.
    afterCreate(model, async (record: any) => {
      if ((await record[saveMethod]()) === false) throw new RecordInvalid(record);
    });
    afterUpdate(model, async (record: any) => {
      if ((await record[saveMethod]()) === false) throw new RecordInvalid(record);
    });
  } else {
    // belongs_to
    defineNonCyclicMethod(model, saveMethod, function (this: any) {
      return saveBelongsToAssociation.call(this, reflection);
    });
    beforeSave(
      model,
      (record: any): Promise<void> =>
        // Wrap with Promise.resolve so the re-entrant branch of
        // defineNonCyclicMethod (returns sync `true` to mirror Rails'
        // cyclic-guard early return) doesn't blow up on `.then`. Mirrors
        // Rails' callback chain, which tolerates both throw-abort and
        // truthy returns.
        Promise.resolve(record[saveMethod]()).then((ok: boolean) =>
          ok ? undefined : (false as unknown as void),
        ),
    );
  }

  defineAutosaveValidationCallbacks(model, reflection);
}

/** @internal */
export function defineAutosaveValidationCallbacks(klass: any, reflection: any): void {
  if (!reflection.validate) return;
  const validationName = `validateAssociatedRecordsFor_${reflection.name}`;
  if (!klass.prototype) return;
  // Mirrors method_defined?(name, false) — only skip if defined on this exact class.
  if (Object.prototype.hasOwnProperty.call(klass.prototype, validationName)) return;
  const isCol =
    typeof reflection.isCollection === "function"
      ? reflection.isCollection()
      : !!reflection.collection;
  const isHasOne =
    typeof reflection.hasOne === "function" ? reflection.hasOne() : !!reflection.hasOne;
  if (isCol) {
    defineNonCyclicMethod(klass, validationName, function (this: any) {
      return validateCollectionAssociation.call(this, reflection);
    });
  } else if (isHasOne) {
    defineNonCyclicMethod(klass, validationName, function (this: any) {
      return validateHasOneAssociation.call(this, reflection);
    });
  } else {
    defineNonCyclicMethod(klass, validationName, function (this: any) {
      return validateBelongsToAssociation.call(this, reflection);
    });
  }
  // Mirrors Rails autosave_association.rb:231 — `validate validation_method`
  // registers the per-association validator as a before_validate callback.
  // Cycle-breaking is handled per-record by `defineNonCyclicMethod`'s
  // `_alreadyCalled` guard, so co-recursive owner/child chains terminate
  // even though each validator runs independently.
  if (typeof klass.validate === "function") {
    klass.validate(validationName);
  }
  klass.afterValidation(":_ensureNoDuplicateErrors");
}
