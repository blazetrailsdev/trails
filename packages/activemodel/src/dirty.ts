import { kernelArray } from "@blazetrails/activesupport";

import { AttributeSet } from "./attribute-set.js";
import {
  AttributeMutationTracker,
  ForcedMutationTracker,
  NullMutationTracker,
} from "./attribute-mutation-tracker.js";

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
  declare _attributes: AttributeSet;
  /**
   * Rails' `_read_attribute`, the one member `ForcedMutationTracker` reads its
   * host through (attribute_mutation_tracker.rb:140-142). @internal
   */
  declare _readAttribute: (attrName: string) => unknown;
  /** Rails' `@mutations_from_database` (dirty.rb:374). @internal */
  declare _mutationsFromDatabase: AttributeMutationTracker | null;
  /** Rails' `@mutations_before_last_save` (dirty.rb:373). @internal */
  declare _mutationsBeforeLastSave: AttributeMutationTracker | NullMutationTracker | null;

  /**
   * Mirrors: ActiveModel::Dirty#changes_applied (dirty.rb:271-278)
   */
  changesApplied(): void {
    if (this._attributes == null) {
      (this.mutationsFromDatabase as ForcedMutationTracker).finalizeChanges();
    }
    this._mutationsBeforeLastSave = this.mutationsFromDatabase;
    this.forgetAttributeAssignments();
    this._mutationsFromDatabase = null;
  }

  /**
   * Returns `true` if any of the attributes has unsaved changes.
   *
   * Mirrors: ActiveModel::Dirty#changed? (dirty.rb:286-288)
   */
  get isChanged(): boolean {
    return this.mutationsFromDatabase.anyChanges();
  }

  /**
   * Returns an array with the name of the attributes with unsaved changes.
   *
   * Mirrors: ActiveModel::Dirty#changed (dirty.rb:295-297)
   */
  get changed(): string[] {
    return this.mutationsFromDatabase.changedAttributeNames();
  }

  /**
   * Mirrors: ActiveModel::Dirty#attribute_changed? (dirty.rb:300-302)
   */
  attributeChanged(name: string, options?: DirtyOptions): boolean {
    return this.mutationsFromDatabase.isChanged(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
      options,
    );
  }

  /**
   * Mirrors: ActiveModel::Dirty#attribute_was (dirty.rb:305-307)
   */
  attributeWas(name: string): unknown {
    return this.mutationsFromDatabase.originalValue(
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
    return this.mutationsBeforeLastSave.isChanged(
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
    return this.mutationsBeforeLastSave.originalValue(
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
    this._mutationsBeforeLastSave = null;
    this.forgetAttributeAssignments();
    this._mutationsFromDatabase = null;
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
    return this.mutationsFromDatabase.changedValues();
  }

  /**
   * Mirrors: ActiveModel::Dirty#changes (dirty.rb:353-355)
   */
  get changes(): Record<string, [unknown, unknown]> {
    return this.mutationsFromDatabase.changes();
  }

  /**
   * Mirrors: ActiveModel::Dirty#previous_changes (dirty.rb:363-365)
   */
  get previousChanges(): Record<string, [unknown, unknown]> {
    return this.mutationsBeforeLastSave.changes();
  }

  /**
   * Check if an attribute value has changed in-place (by identity).
   *
   * Mirrors: ActiveModel::Dirty#attribute_changed_in_place? (dirty.rb:367-369)
   */
  attributeChangedInPlace(name: string): boolean {
    return this.mutationsFromDatabase.changedInPlace(
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
    this.mutationsFromDatabase.forgetChange(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
    );
  }

  /**
   * Pending changes diff against the values loaded from the database.
   *
   * Mirrors: ActiveModel::Dirty#mutations_from_database (dirty.rb:382-388).
   * Ruby's second arm hands the tracker `self` (dirty.rb:385) where the first
   * hands it an `AttributeSet`; `Model` always has `_attributes`, so only the
   * first arm is reachable from trails.
   *
   * @internal
   */
  get mutationsFromDatabase(): AttributeMutationTracker {
    return (this._mutationsFromDatabase ??=
      this._attributes != null
        ? new AttributeMutationTracker(this._attributes)
        : new ForcedMutationTracker(this));
  }

  /**
   * Drop all pending assignment tracking without reverting values.
   *
   * Mirrors: ActiveModel::Dirty#forget_attribute_assignments (dirty.rb:390-392)
   *
   * @internal
   */
  forgetAttributeAssignments(): void {
    if (this._attributes != null) {
      this._attributes = this._attributes.map((attr) => attr.forgettingAssignment());
    }
  }

  /**
   * Snapshot of the pending changes at the moment of the last save.
   *
   * Mirrors: ActiveModel::Dirty#mutations_before_last_save (dirty.rb:394-396)
   *
   * @internal
   */
  get mutationsBeforeLastSave(): AttributeMutationTracker | NullMutationTracker {
    return (this._mutationsBeforeLastSave ??= NullMutationTracker.instance);
  }

  /**
   * Dispatch target for `*_change` per-attribute methods.
   *
   * Mirrors: ActiveModel::Dirty#attribute_change (dirty.rb:399-401)
   *
   * @internal
   */
  attributeChange(name: string): [unknown, unknown] | null {
    return this.mutationsFromDatabase.changeToAttribute(
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
  attributePreviousChange(name: string): [unknown, unknown] | null {
    return this.mutationsBeforeLastSave.changeToAttribute(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(name),
    );
  }

  /**
   * Dispatch target for `*_will_change!` per-attribute methods. Force-marks an
   * attribute as changed for in-place mutations (e.g. array push) where the
   * object reference stays the same but the content has changed.
   *
   * Mirrors: ActiveModel::Dirty#attribute_will_change! (dirty.rb:409-411)
   *
   * @internal
   */
  attributeWillChangeBang(name: string): unknown {
    return this.mutationsFromDatabase.forceChange(
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
    const attrName = (this.constructor as unknown as DirtyClass).resolveAttributeName(name);
    if (this.attributeChanged(attrName)) {
      (this as unknown as Record<string, unknown>)[attrName] = this.attributeWas(attrName);
      this.clearAttributeChange(attrName);
    }
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
 * Mirrors `ActiveModel::Dirty#init_attributes` (dirty.rb:253-262): rebuild a
 * persisted source's duped attributes as `FromUser`-over-default, so the copy
 * is dirty against the class defaults the way a freshly assigned record is.
 * An unsaved source keeps what `super` returned. Ruby's `super` is `super_()`,
 * the receiver-bound link `prepend()` hands the module — here the real
 * `ActiveRecord::Core#init_attributes` (core.rb:563-573), which sits below this
 * module in the ancestors.
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
 * Mirrors `ActiveModel::Dirty#as_json` (dirty.rb:264-268): hide the two
 * mutation-tracker ivars from `Object#as_json`, which serializes every ivar
 * (`instance_values`, core_ext/object/json.rb:58-66). Ruby names them
 * `"mutations_from_database"` / `"mutations_before_last_save"` — the ivars
 * stripped of their `@`; trails' are `_mutationsFromDatabase` /
 * `_mutationsBeforeLastSave` (dirty.rb:373-374), so those are the names to
 * except. Ruby's `super` is `super_()`, the receiver-bound link `prepend()`
 * hands the module.
 */
export function asJson(
  this: unknown,
  super_: (options: Record<string, unknown>) => unknown,
  options: Record<string, unknown> = {},
): unknown {
  const except = [
    ...kernelArray(options["except"]),
    "_mutationsFromDatabase",
    "_mutationsBeforeLastSave",
  ];
  options = { ...options, except };
  return super_(options);
}

/**
 * Host shape consumed by `initInternals`.
 */
export interface DirtyInternalsHost {
  _mutationsBeforeLastSave: AttributeMutationTracker | NullMutationTracker | null;
  _mutationsFromDatabase: AttributeMutationTracker | null;
}

/** Host shape consumed by `initializeDup` — the duplicate, mid-`dup()`. */
export interface DirtyDupHost extends DirtyInternalsHost {
  _attributes: AttributeSet;
}

/**
 * Per-instance reset hook for dirty-tracking state. Mirrors Rails
 * `ActiveModel::Dirty#init_internals` (dirty.rb:372-376). Ruby's `super` is
 * `super_()`, the receiver-bound link `prepend()` hands the module (model.ts
 * wires the chain in include order); the Model constructor enters it.
 *
 * @internal Rails-private helper.
 */
export function initInternals(this: DirtyInternalsHost, super_: () => void): void {
  super_();
  this._mutationsBeforeLastSave = null;
  this._mutationsFromDatabase = null;
}

/**
 * Mirrors `ActiveModel::Dirty#initialize_dup` (dirty.rb:248-251): nil the
 * tracker so `mutations_from_database` rebuilds it against the copy's own,
 * deep-duped `@attributes`. Ruby's `super` is `super_()`, the receiver-bound
 * link `prepend()` hands the module.
 */
export function initializeDup(
  this: DirtyDupHost,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  super_(other);
  this._mutationsFromDatabase = null;
}
