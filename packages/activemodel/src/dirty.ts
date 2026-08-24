import { AttributeSet } from "./attribute-set.js";
import { attributeMissing as attributeMissingDispatch } from "./attribute-methods.js";

/** Rails' `**options` on `AttributeMutationTracker#changed?` (attribute_mutation_tracker.rb:44). */
export interface DirtyOptions {
  from?: unknown;
  to?: unknown;
}

/**
 * `ActiveModel::Dirty` — the instance half of the module, mixed onto a model
 * by `include(Model, Dirty)`.
 *
 * A class module rather than a plain-object one because only `include()`'s
 * class branch copies accessor descriptors, and every Ruby body here that is a
 * zero-arg reader ports as an accessor property (CLAUDE.md, "Generated
 * attribute readers are properties"); an object literal is read by value and
 * would flatten each getter into a data property.
 *
 * Mirrors: ActiveModel::Dirty (dirty.rb:123-421)
 */
export class Dirty {
  /** The mutation tracker `mutations_from_database` returns (dirty.rb:379-386). */
  declare _dirty: DirtyTracker;
  declare _attributes: AttributeSet;
  /** @internal */

  /**
   * Mirrors: ActiveModel::Dirty#changes_applied (dirty.rb:272-279)
   */
  changesApplied(): void {
    this._dirty.changesApplied(this._attributes);
    this.forgetAttributeAssignments();
  }

  /**
   * Returns `true` if any of the attributes has unsaved changes.
   *
   * Mirrors: ActiveModel::Dirty#changed? (dirty.rb:286-288)
   */
  get isChanged(): boolean {
    return this._dirty.changed;
  }

  /**
   * Returns an array with the name of the attributes with unsaved changes.
   *
   * Mirrors: ActiveModel::Dirty#changed (dirty.rb:295-297)
   */
  get changed(): string[] {
    return this._dirty.changedAttributeNames;
  }

  /**
   * Mirrors: ActiveModel::Dirty#attribute_changed? (dirty.rb:300-302) —
   * `mutations_from_database.changed?(attr_name.to_s, **options)`.
   */
  attributeChanged(name: string, options?: DirtyOptions): boolean {
    return this._dirty.attributeChanged(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
      options,
    );
  }

  /**
   * Mirrors: ActiveModel::Dirty#attribute_was (dirty.rb:305-307)
   */
  attributeWas(name: string): unknown {
    return this._dirty.attributeWas(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
    );
  }

  /**
   * Check if a specific attribute changed in the last save.
   *
   * Mirrors: ActiveModel::Dirty#attribute_previously_changed?
   * (dirty.rb:310-312)
   */
  attributePreviouslyChanged(name: string, options?: DirtyOptions): boolean {
    return this._dirty.attributePreviouslyChanged(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
      options,
    );
  }

  /**
   * Get the value of an attribute before the last save.
   *
   * Mirrors: ActiveModel::Dirty#attribute_previously_was (dirty.rb:315-317)
   */
  attributePreviouslyWas(name: string): unknown {
    return this._dirty.originalValue(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
    );
  }

  /**
   * Restore all previous data of the provided attributes.
   *
   * Mirrors: ActiveModel::Dirty#restore_attributes (dirty.rb:320-322)
   */
  restoreAttributes(attrNames: string[] = this.changed): void {
    attrNames.forEach((attrName) => this.restoreAttributeBang(attrName));
  }

  /**
   * Clears all dirty data: current changes and previous changes.
   *
   * Mirrors: ActiveModel::Dirty#clear_changes_information (dirty.rb:325-329)
   */
  clearChangesInformation(): void {
    this._dirty.clearChangesInformation();
    this.forgetAttributeAssignments();
  }

  /**
   * Mirrors: ActiveModel::Dirty#clear_attribute_changes (dirty.rb:331-335)
   */
  clearAttributeChanges(attrNames: string[]): void {
    attrNames.forEach((attrName) => this.clearAttributeChange(attrName));
  }

  /**
   * Map of each changed attribute's name to its old (pre-change) value.
   *
   * Mirrors: ActiveModel::Dirty#changed_attributes (dirty.rb:343-345)
   */
  get changedAttributes(): Record<string, unknown> {
    return this._dirty.changedAttributes;
  }

  /**
   * Mirrors: ActiveModel::Dirty#changes (dirty.rb:353-355)
   */
  get changes(): Record<string, [unknown, unknown]> {
    return this._dirty.changes;
  }

  /**
   * Mirrors: ActiveModel::Dirty#previous_changes (dirty.rb:363-365)
   */
  get previousChanges(): Record<string, [unknown, unknown]> {
    return this._dirty.previousChanges;
  }

  /**
   * Check if an attribute value has changed in-place (by identity).
   *
   * Mirrors: ActiveModel::Dirty#attribute_changed_in_place? (dirty.rb:367-369)
   */
  attributeChangedInPlace(name: string): boolean {
    return this._dirty.changedInPlace(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
    );
  }

  /**
   * Drop a single attribute's pending change without reverting its value.
   *
   * Mirrors: ActiveModel::Dirty#clear_attribute_change (dirty.rb:378-380)
   *
   * @internal
   */
  clearAttributeChange(name: string): void {
    this._dirty.forgetChange(this._attributes, name);
  }

  /**
   * Pending changes diff against the values loaded from the database.
   *
   * Mirrors: ActiveModel::Dirty#mutations_from_database (dirty.rb:382-388)
   *
   * @internal
   */
  get mutationsFromDatabase(): Record<string, [unknown, unknown]> {
    return this._dirty.mutationsFromDatabase;
  }

  /**
   * Drop all pending assignment tracking without reverting values.
   *
   * Mirrors: ActiveModel::Dirty#forget_attribute_assignments (dirty.rb:390-392)
   *
   * @internal
   */
  forgetAttributeAssignments(): void {
    this._attributes = this._attributes.map((attr) => attr.forgettingAssignment());
    this._dirty.forgetAttributeAssignments(this._attributes);
  }

  /**
   * Snapshot of the pending changes at the moment of the last save.
   *
   * Mirrors: ActiveModel::Dirty#mutations_before_last_save (dirty.rb:394-396)
   *
   * @internal
   */
  get mutationsBeforeLastSave(): Record<string, [unknown, unknown]> {
    return this._dirty.mutationsBeforeLastSave;
  }

  /**
   * Dispatch target for `*_change` per-attribute methods.
   *
   * Mirrors: ActiveModel::Dirty#attribute_change (dirty.rb:399-401)
   *
   * @internal
   */
  attributeChange(name: string): [unknown, unknown] | null {
    return this._dirty.attributeChange(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
    );
  }

  /**
   * Dispatch target for `*_previous_change` per-attribute methods.
   *
   * Mirrors: ActiveModel::Dirty#attribute_previous_change (dirty.rb:404-406)
   *
   * @internal
   */
  attributePreviousChange(name: string): [unknown, unknown] | undefined {
    return this._dirty.previousChanges[
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name)
    ];
  }

  /**
   * Dispatch target for `*_will_change!` per-attribute methods. Force-marks an
   * attribute as changed for in-place mutations (e.g. array push) where the
   * object reference stays the same but the content has changed.
   *
   * Returns the forced value, mirroring Rails where `attribute_will_change!`
   * returns `mutations_from_database.force_change(...)` — a truthy value relied
   * on by `assert pirate.catchphrase_will_change!` (dirty_test.rb:317).
   *
   * Mirrors: ActiveModel::Dirty#attribute_will_change! (dirty.rb:409-411)
   *
   * @internal
   */
  attributeWillChangeBang(name: string): unknown {
    return this._dirty.forceChange(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
    );
  }

  /**
   * Dispatch target for `restore_*!` per-attribute methods. Restores the
   * attribute to its pre-change value and clears the dirty entry.
   *
   * Mirrors: ActiveModel::Dirty#restore_attribute! (dirty.rb:414-420)
   *
   * @internal
   */
  restoreAttributeBang(name: string): void {
    this._dirty.restoreAttribute(
      this._attributes,
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
    );
  }
}

/**
 * The class half a `Dirty` body self-sends: Ruby's `attr_name.to_s` sits
 * alongside the alias resolution `AttributeMethods::ClassMethods#resolve_attribute_name`
 * (attribute_methods.rb:396-398) does, and a module body cannot name the
 * including class.
 */
type DirtyClass = { resolveAttributeName(name: string): string };

/**
 * Mirrors `Dirty#initialize_dup`'s `@mutations_from_database = nil`
 * (activemodel/lib/active_model/dirty.rb:248-251): give the copy its own tracker,
 * so writing to one no longer marks the other dirty. Rails nils the ivar and lets
 * it rebuild from the deep-dup'd `@attributes`, which reproduces the source's
 * `changes` on the copy; {@link DirtyTracker.deepDup} is that rebuild, since a
 * fresh empty tracker would instead wipe pending changes. Ruby's `super` is
 * `super_()`, the receiver-bound link `prepend()` hands the module.
 *
 * @internal Rails-private helper.
 */
/**
 * Mirrors `ActiveModel::Dirty#init_attributes` (dirty.rb:253-262): rebuild a
 * persisted source's duped attributes as `FromUser`-over-default, so the copy
 * is dirty against the class defaults the way a freshly assigned record is.
 * An unsaved source keeps what `super` returned. Ruby's `super` is `super_()`,
 * the receiver-bound link `prepend()` hands the module — here the real
 * `ActiveRecord::Core#init_attributes` (core.rb:563-573), which sits below this
 * module in the ancestors.
 *
 * @internal Rails-private helper.
 */
export function initAttributes(
  this: { constructor: { _defaultAttributes?: () => AttributeSet } },
  super_: (other: unknown) => AttributeSet,
  other: unknown,
): AttributeSet {
  const attrs = super_(other);
  const klass = this.constructor;
  if ((other as { isPersisted(): boolean }).isPersisted() && klass._defaultAttributes) {
    return klass
      ._defaultAttributes()
      .map((attr) => attr.withValueFromUser(attrs.fetchValue(attr.name)));
  }
  return attrs;
}

/**
 * Per-instance reset hook for dirty-tracking state. Mirrors Rails
 * `ActiveModel::Dirty#init_internals`
 * (activemodel/lib/active_model/dirty.rb:372-376):
 *
 *   def init_internals
 *     super
 *     @mutations_before_last_save = nil
 *     @mutations_from_database = nil
 *   end
 *
 * Trails consolidates Rails' two mutation trackers into a single
 * `DirtyTracker`, so a fresh tracker is the equivalent reset. Ruby's `super`
 * is `super_()`, the receiver-bound link `prepend()` hands the module (model.ts
 * wires the chain in include order); the Model constructor enters it.
 *
 * @internal Rails-private helper.
 */
export function initInternals(this: DirtyInternalsHost, super_: () => void): void {
  super_();
  this._dirty = new DirtyTracker();
}

/**
 * Host shape consumed by `initInternals`.
 */
export interface DirtyInternalsHost {
  _dirty: DirtyTracker;
}

/** Host shape consumed by `initializeDup` — the duplicate, mid-`dup()`. */
export interface DirtyDupHost extends DirtyInternalsHost {
  _attributes: AttributeSet;
}

/**
 * Dirty tracking mixin — tracks attribute changes on a model.
 *
 * Mirrors: ActiveModel::Dirty
 */
export class DirtyTracker {
  private _originalAttributes: Map<string, unknown> = new Map();
  private _originalHas: Set<string> = new Set();
  private _changedAttributes: Map<string, [unknown, unknown]> = new Map();
  private _previousChanges: Map<string, [unknown, unknown]> = new Map();
  /**
   * Rails' `@mutations_before_last_save` is nil until `changes_applied` assigns
   * the pre-save tracker (dirty.rb:276), and `mutations_before_last_save`
   * substitutes the `NullMutationTracker` while it is (dirty.rb:394-396). One
   * tracker holds both change sets here, so that nil is this flag.
   */
  private _hasMutationsBeforeLastSave = false;
  /** Names explicitly force-dirtied via attribute_will_change!. @internal */
  private _forcedNames: Set<string> = new Set();
  /** Live AttributeSet reference — set on first snapshot, used to detect changedInPlace(). */
  private _attrs: AttributeSet | null = null;
  /**
   * Attribute names whose dirtiness has not been derived from the `Attribute`
   * graph yet. Rails never carries such a set: `Attribute#changed?`
   * (attribute.rb:139-141) runs when someone asks, so a new record's dirtiness
   * costs nothing until it is read. This tracker records changes instead of
   * deriving them, so "ask later" is spelled as a queue drained by
   * {@link _deriveChanges} on the first read.
   */
  private _pendingNames: Set<string> = new Set();
  /**
   * Names written since the last derivation. Same deferral, different baseline:
   * a written attribute is compared against the tracker's snapshot original,
   * which is what every non-new-record read already diffs against.
   */
  private _pendingWrites: Set<string> = new Set();

  initAttributes(
    attributes: Map<string, unknown> | { snapshotValues(): Map<string, unknown> },
  ): void {
    this.snapshot(attributes);
  }

  /**
   * An independent tracker carrying this one's state, with `_attrs` repointed at
   * the duplicate's own AttributeSet.
   *
   * @noRailsEquivalent CONVERGEABLE — Rails' `initialize_dup` just nils
   * `@mutations_from_database` and lets `mutations_from_database`
   * (dirty.rb:379-386) rebuild it from the copy's own `@attributes`. This
   * tracker also holds `mutations_before_last_save`, which Ruby's `Object#dup`
   * carries over rather than nils, so a null-and-rebuild would lose it; the
   * rebuild is spelled as this method until the split into two
   * `AttributeMutationTracker`s (story
   * `0023-surfaced-deviations/dirty-tracker-is-one-object-where-rails-has-two-mutation-trackers`).
   * The rebuild queues every name rather than carrying this tracker's recorded
   * answers, which were derived against the source's attributes and not the
   * `FromUser`-over-default ones `init_attributes` leaves behind.
   */
  deepDup(attrs: AttributeSet): DirtyTracker {
    const copy = new DirtyTracker();
    copy._originalAttributes = attrs.snapshotValues();
    copy._originalHas = new Set(copy._originalAttributes.keys());
    copy._previousChanges = new Map(this._previousChanges);
    copy._hasMutationsBeforeLastSave = this._hasMutationsBeforeLastSave;
    copy._attrs = attrs;
    copy._pendingNames = new Set(attrs.keys());
    return copy;
  }

  // Rails `Dirty#as_json` (dirty.rb:264-268) exists only to hide the
  // mutation-tracker ivars from Ruby's default serializer; trails
  // `Model#asJson` serializes attributes via serializableHash and never sees
  // the tracker, so that exclusion is inherent and no tracker-level asJson
  // exists here.

  changesApplied(
    currentAttributes: Map<string, unknown> | { snapshotValues(): Map<string, unknown> },
  ): void {
    this._deriveChanges();
    const snapshot = new Map(this._changedAttributes);
    this._attrs?.forEach((attr, name) => {
      if (!snapshot.has(name) && attr.type.isMutable() && attr.changedInPlace()) {
        snapshot.set(name, [attr.originalValue, attr.value]);
      }
    });
    this._previousChanges = snapshot;
    this._hasMutationsBeforeLastSave = true;
    if (currentAttributes instanceof Map) {
      this._originalAttributes = new Map(currentAttributes);
      this._originalHas = new Set(currentAttributes.keys());
    } else {
      this._originalAttributes = currentAttributes.snapshotValues();
      this._originalHas = new Set(this._originalAttributes.keys());
    }
    this._clearChanges();
  }

  get changed(): boolean {
    this._deriveChanges();
    if (this._changedAttributes.size > 0) return true;
    return this._hasInPlaceMutableChange();
  }

  /**
   * Mirrors: ActiveModel::AttributeMutationTracker#changed?
   * (attribute_mutation_tracker.rb:44-48) over `mutations_from_database` —
   * `attribute_changed?` conjoined with the `from:`/`to:` comparisons.
   */
  attributeChanged(name: string, options?: DirtyOptions): boolean {
    return this.isChanged(this.mutationsFromDatabase, name, options);
  }

  /**
   * Mirrors: ActiveModel::AttributeMutationTracker#changed?
   * (attribute_mutation_tracker.rb:44-48) over `mutations_before_last_save`.
   */
  attributePreviouslyChanged(name: string, options?: DirtyOptions): boolean {
    return this.isChanged(this.mutationsBeforeLastSave, name, options);
  }

  /**
   * Mirrors: ActiveModel::AttributeMutationTracker#changed_in_place?
   * (attribute_mutation_tracker.rb:50-52) — `attributes[attr_name].changed_in_place?`.
   * An attribute the set does not carry answers through `Attribute::Null`,
   * whose `changed_in_place?` is false.
   */
  changedInPlace(name: string): boolean {
    return this._attrs?.getAttribute(name).changedInPlace() ?? false;
  }

  /**
   * Mirrors: ActiveModel::AttributeMutationTracker#changed?
   * (attribute_mutation_tracker.rb:44-48) — the one body every
   * `attribute_changed?` / `attribute_previously_changed?` /
   * `saved_change_to_attribute?` / `will_save_change_to_attribute?` reader
   * delegates to.
   *
   * @missingRailsArgs changed? — CONVERGEABLE: Rails picks the change set by picking one of its two tracker INSTANCES (`mutations_from_database` / `mutations_before_last_save`); trails has a single DirtyTracker holding both sets, so the set Ruby chose by receiver is a leading argument here. It converges when DirtyTracker splits into two AttributeMutationTracker instances (story `0023-surfaced-deviations/dirty-tracker-is-one-object-where-rails-has-two-mutation-trackers` owns that split).
   */
  isChanged(
    changes: Record<string, [unknown, unknown]>,
    name: string,
    options?: DirtyOptions,
  ): boolean {
    if (!Object.hasOwn(changes, name)) return false;
    if (!options) return true;
    const change = changes[name];
    if ("from" in options && change[0] !== options.from) return false;
    if ("to" in options && change[1] !== options.to) return false;
    return true;
  }

  attributeWas(name: string): unknown {
    this._deriveChanges();
    const change = this._changedAttributes.get(name);
    if (change) return change[0];
    if (this._isInPlaceMutableChange(name)) {
      return this._attrs!.getAttribute(name).originalValue;
    }
    return resolveValue(this._originalAttributes.get(name));
  }

  /**
   * Mirrors: ActiveModel::AttributeMutationTracker#original_value
   * (attribute_mutation_tracker.rb:59-61) over `mutations_before_last_save`.
   * {@link attributeWas} is the same Ruby method read off
   * `mutations_from_database`; one object holds both change sets here, so the
   * two readings cannot share the Ruby name until DirtyTracker splits into two
   * `AttributeMutationTracker`s (story `0023-surfaced-deviations/
   * dirty-tracker-is-one-object-where-rails-has-two-mutation-trackers`).
   *
   * Before the first save Rails' `mutations_before_last_save` is the
   * `NullMutationTracker`, whose `original_value` returns nil
   * (attribute_mutation_tracker.rb:186-187, dirty.rb:394-396); this tracker
   * holds both change sets in one object, so `_hasMutationsBeforeLastSave` is
   * where the nil-vs-real-tracker distinction lives. Otherwise the answer is
   * the pre-save value: the recorded change's `from` for an attribute the save
   * changed, and the snapshot baseline `changes_applied` left behind for one
   * it did not.
   */
  originalValue(name: string): unknown {
    if (!this._hasMutationsBeforeLastSave) return undefined;
    const change = this._previousChanges.get(name);
    if (change) return change[0];
    return resolveValue(this._originalAttributes.get(name));
  }

  clearChangesInformation(): void {
    this._clearChanges();
    this._previousChanges.clear();
    this._hasMutationsBeforeLastSave = false;
  }

  clearAttributeChanges(attributes: string[]): void {
    for (const attr of attributes) {
      this._deleteChange(attr);
    }
  }

  /**
   * Names of all attributes with pending (unsaved) changes.
   *
   * Mirrors: ActiveModel::AttributeMutationTracker#changed_attribute_names
   * (surfaced by Rails' `changed_attribute_names_to_save`), NOT
   * `changed_attributes` — see `changedAttributes` for the name->old-value map.
   */
  get changedAttributeNames(): string[] {
    this._deriveChanges();
    const names = Array.from(this._changedAttributes.keys());
    this._attrs?.forEach((attr, name) => {
      if (!this._changedAttributes.has(name) && attr.type.isMutable() && attr.changedInPlace()) {
        names.push(name);
      }
    });
    return names;
  }

  /**
   * Map of each changed attribute's name to its *old* (pre-change) value.
   *
   * Mirrors: ActiveModel::Dirty#changed_attributes
   * -> `mutations_from_database.changed_values`, a name->original-value hash.
   */
  get changedAttributes(): Record<string, unknown> {
    this._deriveChanges();
    const result: Record<string, unknown> = {};
    for (const [name, change] of this._changedAttributes) {
      result[name] = change[0];
    }
    this._attrs?.forEach((attr, name) => {
      if (!Object.hasOwn(result, name) && attr.type.isMutable() && attr.changedInPlace()) {
        result[name] = attr.originalValue;
      }
    });
    return result;
  }

  get changes(): Record<string, [unknown, unknown]> {
    this._deriveChanges();
    const result: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of this._changedAttributes) {
      result[k] = v;
    }
    this._attrs?.forEach((attr, name) => {
      if (!Object.hasOwn(result, name) && attr.type.isMutable() && attr.changedInPlace()) {
        result[name] = [attr.originalValue, attr.value];
      }
    });
    return result;
  }

  get previousChanges(): Record<string, [unknown, unknown]> {
    const result: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of this._previousChanges) {
      result[k] = v;
    }
    return result;
  }

  /**
   * Drop a single attribute's pending change and rebind its baseline to
   * the current value, so a later write reports `[current, next]` instead
   * of `[originalFromFirstSnapshot, next]`.
   *
   * Mirrors: ActiveModel::AttributeMutationTracker#forget_change
   * (attribute_mutation_tracker.rb:54-57), whose body is
   * `attributes[name] = attributes[name].forgetting_assignment`
   * (attribute_mutation_tracker.rb:33-35) — so the assigned value becomes the
   * new from-database seat and `original_value_for_database` moves with it, not
   * just the dirty baseline. A plain-Map baseline carries no Attribute to
   * forget.
   *
   * @internal
   */
  forgetChange(
    attributes:
      | Map<string, unknown>
      | { has(name: string): boolean; fetchValue(name: string): unknown }
      | { snapshotValues(): Map<string, unknown> },
    name: string,
  ): void {
    this._deleteChange(name);
    let has: boolean;
    let value: unknown;
    const perAttr = attributes as { has?: unknown; fetchValue?: unknown };
    if (typeof perAttr.has === "function" && typeof perAttr.fetchValue === "function") {
      const src = attributes as { has(n: string): boolean; fetchValue(n: string): unknown };
      has = src.has(name);
      value = has ? src.fetchValue(name) : undefined;
    } else {
      const snap =
        attributes instanceof Map
          ? attributes
          : (attributes as { snapshotValues(): Map<string, unknown> }).snapshotValues();
      has = snap.has(name);
      value = snap.get(name);
    }
    if (has) {
      this._originalAttributes.set(name, value);
      this._originalHas.add(name);
    } else {
      this._originalAttributes.delete(name);
      this._originalHas.delete(name);
    }
    const forgetful = attributes as { forgetAttributeAssignment?: (n: string) => void };
    if (typeof forgetful.forgetAttributeAssignment === "function") {
      forgetful.forgetAttributeAssignment(name);
    }
  }

  /**
   * Pending changes diff against the values loaded from the database —
   * what will be written on the next save. Cleared by `changesApplied()`.
   *
   * Mirrors: ActiveModel::Dirty#mutations_from_database
   * (activemodel/lib/active_model/dirty.rb + attribute_mutation_tracker.rb).
   *
   * @internal
   */
  get mutationsFromDatabase(): Record<string, [unknown, unknown]> {
    return this.changes;
  }

  /**
   * Drop all pending assignment tracking and reset the baseline to the
   * current in-memory values. Subsequent writes diff from the new baseline.
   *
   * Rails' `forget_attribute_assignments` replaces `@attributes` with
   * `@attributes.map(&:forgotten_change)`, which rebinds each Attribute's
   * `@original_attribute` to its current cast value. Mirror that by
   * re-snapshotting (while preserving `_previousChanges` from the last save).
   *
   * Mirrors: ActiveModel::Dirty#forget_attribute_assignments
   *
   * @internal
   */
  forgetAttributeAssignments(
    attributes: Map<string, unknown> | { snapshotValues(): Map<string, unknown> },
  ): void {
    // Same shape as snapshot(): reset baseline + clear pending changes.
    // `snapshot` also clears `_changedAttributes`, so the single call
    // covers both sides of Rails' `forget_attribute_assignments`.
    this.snapshot(attributes);
  }

  /**
   * Snapshot of `mutations_from_database` at the moment of the last save.
   * Lives until the next save.
   *
   * Mirrors: ActiveModel::Dirty#mutations_before_last_save
   *
   * @internal
   */
  get mutationsBeforeLastSave(): Record<string, [unknown, unknown]> {
    return this.previousChanges;
  }

  /** @internal */
  attributeChange(name: string): [unknown, unknown] | null {
    this._deriveChanges();
    const explicit = this._changedAttributes.get(name);
    if (explicit) return explicit;
    if (this._isInPlaceMutableChange(name)) {
      const attr = this._attrs!.getAttribute(name);
      return [attr.originalValue, attr.value];
    }
    return null;
  }

  private _isInPlaceMutableChange(name: string): boolean {
    if (!this._attrs?.has(name)) return false;
    const attr = this._attrs.getAttribute(name);
    return attr.type.isMutable() && attr.changedInPlace();
  }

  private _hasInPlaceMutableChange(): boolean {
    if (!this._attrs) return false;
    let found = false;
    this._attrs.forEach((attr) => {
      if (!found && attr.type.isMutable() && attr.changedInPlace()) found = true;
    });
    return found;
  }

  /** @internal Delete a single change entry and its forced-dirty marker together. */
  private _deleteChange(name: string): void {
    this._changedAttributes.delete(name);
    this._forcedNames.delete(name);
    this._pendingNames.delete(name);
    this._pendingWrites.delete(name);
  }

  /**
   * @internal Clear all change entries, forced-dirty markers and queued
   * derivations together — a queued derivation is a pending change like any
   * other, and must not resurface after a clear.
   */
  private _clearChanges(): void {
    this._changedAttributes.clear();
    this._forcedNames.clear();
    this._pendingNames.clear();
    this._pendingWrites.clear();
  }

  /**
   * Take a snapshot of the current attributes as the "clean" state.
   * For AttributeSet, uses snapshotValues() which captures values
   * without forcing lazy evaluation on unread FromDatabase attributes.
   */
  snapshot(attributes: Map<string, unknown> | { snapshotValues(): Map<string, unknown> }): void {
    if (attributes instanceof AttributeSet) this._attrs = attributes;
    if (attributes instanceof Map) {
      this._originalAttributes = new Map(attributes);
      this._originalHas = new Set(attributes.keys());
    } else {
      this._originalAttributes = attributes.snapshotValues();
      this._originalHas = new Set(this._originalAttributes.keys());
    }
    this._clearChanges();
  }

  /**
   * Force-mark an attribute as changed regardless of whether from === to.
   * Used by `attribute_will_change!` for in-place mutations (e.g. array push)
   * where the object reference stays the same but the content has changed.
   *
   * `currentValue` is the value at the moment the force is requested (before
   * the in-place mutation).
   *
   * The AR `attribute_will_change!` path goes through `AttributeMutationTracker`
   * (selected by `mutations_from_database` whenever `@attributes` is defined,
   * dirty.rb:382-386 — always true for records), whose `force_change` is the
   * unconditional `forced_changes[attr] = fetch_value(attr)` that **returns the
   * current value** (attribute_mutation_tracker.rb:63-64) — no nil guard. There,
   * the stored value is only a changed-set marker; the "was" comes from
   * `attributes[attr].original_value`, which a repeat call leaves untouched.
   *
   * The marker is set **unconditionally**, even when the attribute is already
   * dirty from a normal assignment: Rails' `attribute_changed?` is
   * `forced_changes.include?(attr) || attributes[attr].changed?`
   * (attribute_mutation_tracker.rb:78-79), so a forced attribute that is later
   * written back to its original value stays changed via `forced_changes`.
   * `_forcedNames` is our forced-marker set; `attributeWritten()` consults it to
   * avoid clearing a forced change. Skipping the marker for the
   * assigned-but-not-forced case would let such a write-back wrongly clear it.
   *
   * trails has no separate per-attribute `original_value`, so the stored
   * `[was, was]` tuple *is* our "was". We capture it (cloned, so an in-place
   * mutation can't corrupt it) only the first time the attribute becomes changed,
   * and preserve it on any later force — both reproduce Rails' stable
   * `original_value`. The return is the live current value (Rails' `fetch_value`),
   * so `attribute_will_change!` stays truthy (dirty_test.rb:317
   * `assert pirate.catchphrase_will_change!`).
   *
   * Mirrors: ActiveModel::AttributeMutationTracker#force_change
   */
  forceChange(name: string): unknown {
    const currentValue = this.fetchValue(name);
    // Unconditional forced marker (Rails: forced_changes[attr] = fetch_value).
    this._forcedNames.add(name);
    if (!this._changedAttributes.has(name)) {
      let cloned: unknown;
      try {
        cloned =
          currentValue !== null && typeof currentValue === "object"
            ? structuredClone(currentValue)
            : currentValue;
      } catch {
        cloned = currentValue;
      }
      this._changedAttributes.set(name, [cloned, cloned]);
    }
    return currentValue;
  }

  /**
   * Mirrors: ActiveModel::AttributeMutationTracker#fetch_value
   * (attribute_mutation_tracker.rb:97-99) — `attributes.fetch_value(attr_name)`
   * off the tracker's own AttributeSet, which {@link snapshot} binds.
   */
  private fetchValue(attrName: string): unknown {
    return this._attrs?.fetchValue(attrName);
  }

  /**
   * Queue every attribute of a freshly built record for dirtiness derivation,
   * to be answered from the `Attribute` graph the first time someone asks.
   *
   * Rails needs no queue: `changed?` walks `@attributes` on demand
   * (attribute_mutation_tracker.rb:44-48 → attribute.rb:139-141), so a new
   * record's dirtiness is computed by the read that wants it and never at
   * construction. This tracker records changes as they happen, so the
   * new-record case — where the changes happened inside `Attribute` rather than
   * through {@link attributeWritten} — is queued here and drained by
   * {@link _deriveChanges}.
   *
   * @internal
   */
  deferNewRecordChanges(attributes: AttributeSet, skipNames?: ReadonlySet<string>): void {
    this._attrs = attributes;
    for (const name of attributes.keys()) {
      if (skipNames?.has(name)) continue;
      this._pendingNames.add(name);
    }
  }

  /**
   * Drain the queue: for each pending name, ask the `Attribute` whether it is
   * changed and record the answer.
   *
   * Rails marks an attribute dirty when it differs from the *database column
   * default* (`Attribute#original_value`), not the model's declared default. A
   * user-provided `attribute :x, default: ...` whose value equals the model
   * default but differs from the column default is therefore still dirty, so
   * under partial_inserts it is persisted rather than dropped (the DB would
   * otherwise store its own column default). `Attribute#changed?` already
   * compares value against original_value — for a UserProvidedDefault that
   * original_value is the column default — so defer to it.
   *
   * As in Rails, asking flips the attribute's `has_been_read?`
   * (attribute.rb:100-103): the ask IS a read, which is why `accessed_fields`
   * stays empty until something asks. A name the tracker already answered keeps
   * that answer, because Rails' `changed?` is
   * `forced_changes.include?(attr) || attributes[attr].changed?`
   * (attribute_mutation_tracker.rb:78-79).
   */
  private _deriveChanges(): void {
    if (this._pendingWrites.size > 0) this._deriveWrites();
    if (this._pendingNames.size === 0) return;
    const attributes = this._attrs;
    const pending = this._pendingNames;
    this._pendingNames = new Set();
    if (!attributes) return;
    for (const name of pending) {
      if (this._changedAttributes.has(name)) continue;
      if (!attributes.has(name)) continue;
      const attr = attributes.getAttribute(name);
      if (attr.isChanged()) {
        const wasValue = attr.originalValue ?? null;
        this._originalAttributes.set(name, wasValue);
        this._originalHas.add(name);
        this._changedAttributes.set(name, [wasValue, attr.value ?? null]);
      }
    }
  }

  /**
   * Drain the write queue. Same comparison the write used to make inline —
   * `type.changed?` against the snapshot original — now reached where Rails
   * reaches it, from `Attribute#changed?` (attribute.rb:155-160) at ask time,
   * with the cast value read off the `Attribute` instead of computed early.
   */
  private _deriveWrites(): void {
    const pending = this._pendingWrites;
    this._pendingWrites = new Set();
    const attributes = this._attrs;
    for (const name of pending) {
      if (!attributes?.has(name)) {
        this._changedAttributes.delete(name);
        continue;
      }
      const attr = attributes.getAttribute(name);
      const newValue = attr.value;
      if (!this._originalHas.has(name)) {
        this._changedAttributes.set(name, [undefined, newValue]);
        continue;
      }
      const original = resolveValue(this._originalAttributes.get(name));
      if (
        attr.type.isChanged(original, newValue, attr.valueBeforeTypeCast) ||
        this._forcedNames.has(name)
      ) {
        const existingFrom = this._forcedNames.has(name)
          ? this._changedAttributes.get(name)?.[0]
          : undefined;
        this._changedAttributes.set(name, [
          existingFrom !== undefined ? existingFrom : original,
          newValue,
        ]);
      } else {
        this._changedAttributes.delete(name);
      }
    }
  }

  /**
   * Write notification. Queues the name for derivation instead of answering
   * now: the comparison Rails makes is `type.changed?` reached through
   * `Attribute#changed?` (attribute.rb:155-160), and reaching it here would
   * cast — and mark the attribute read — at write time.
   *
   * @internal
   */
  attributeWritten(name: string): void {
    this._pendingWrites.add(name);
  }

  /**
   * Walk `currentAttributes` (post-TX) and populate `_changedAttributes` for
   * any attribute whose current value differs from the pre-TX baseline already
   * stored in `_originalAttributes` (set by a prior `snapshot(preTxAttrs)` call).
   *
   * Mirrors the Rails per-attribute `original_attribute` chain built by
   * `restore_state[:attributes].map { attr.with_value_from_user(current_value) }`:
   * the current (post-TX) value survives in memory as the "now" side, with the
   * pre-TX value as the "was" baseline, so `mutationsFromDatabase` reflects
   * `[preTx, postTx]` for each changed attribute.
   *
   * Call after `snapshot(preTxAttrs)` + `clearChangesInformation()`, which
   * leave the tracker bound to the pre-TX set; this rebinds it to the live one,
   * which is what every later read and derivation has to ask.
   *
   * @internal
   */
  redetectChanges(currentAttributes: AttributeSet): void {
    this._deriveChanges();
    this._attrs = currentAttributes;
    for (const name of currentAttributes.keys()) {
      const attr = currentAttributes.getAttribute(name);
      const currentValue = attr.value;
      if (!this._originalHas.has(name)) {
        this._changedAttributes.set(name, [undefined, currentValue]);
      } else {
        const savedValue = resolveValue(this._originalAttributes.get(name));
        if (attr.type.isChanged(savedValue, currentValue, attr.valueBeforeTypeCast)) {
          this._changedAttributes.set(name, [savedValue, currentValue]);
        }
      }
    }
  }

  restore(attributes: {
    set(name: string, value: unknown): void;
    delete?(name: string): boolean;
  }): void {
    this._deriveChanges();
    for (const [name] of this._changedAttributes) {
      this._restoreOne(attributes, name);
    }
    this._clearChanges();
  }

  /**
   * Restore a single attribute to its pre-change value, matching Rails
   * `ActiveModel::Dirty#restore_attribute!(attr)` (dirty.rb:414-420). The guard
   * is `attribute_changed?`, which is true for an attribute changed *in place*
   * as well as by assignment, and the value written back is `attribute_was`.
   */
  restoreAttribute(
    attributes: { set(name: string, value: unknown): void; delete?(name: string): boolean },
    name: string,
  ): void {
    if (!this.attributeChanged(name)) return;
    this._restoreOne(attributes, name);
    this._deleteChange(name);
  }

  private _restoreOne(
    attributes: { set(name: string, value: unknown): void; delete?(name: string): boolean },
    name: string,
  ): void {
    if (!this._originalHas.has(name)) {
      attributes.delete?.(name);
    } else {
      attributes.set(name, this.attributeWas(name));
    }
  }

  /**
   * Mirrors: attribute_methods.rb:520-522 — surfaces on Dirty via
   * `include AttributeMethods`. Defined as a prototype method (not a
   * class field) so subclass overrides take effect.
   */
  attributeMissing(match: { proxyTarget: string; attrName: string }, ...args: unknown[]): unknown {
    return attributeMissingDispatch.call(
      this as unknown as Record<string, unknown>,
      match,
      ...args,
    );
  }
}

export function initializeDup(
  this: DirtyDupHost,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  super_(other);
  this._dirty = this._dirty.deepDup(this._attributes);
}

function resolveValue(value: unknown): unknown {
  return AttributeSet.resolveSnapshotValue(value);
}
