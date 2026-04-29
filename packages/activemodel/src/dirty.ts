import { AttributeSet } from "./attribute-set.js";
import { attributeMissing as attributeMissingDispatch } from "./attribute-methods.js";

/**
 * Dirty mixin contract — tracks attribute changes on a model.
 *
 * Mirrors: ActiveModel::Dirty
 *
 * Model implements this interface via DirtyTracker delegation.
 */
export interface Dirty {
  readonly changed: boolean;
  readonly changedAttributes: string[];
  readonly changes: Record<string, [unknown, unknown]>;
  readonly previousChanges: Record<string, [unknown, unknown]>;
  readonly mutationsFromDatabase: Record<string, [unknown, unknown]>;
  readonly mutationsBeforeLastSave: Record<string, [unknown, unknown]>;
  attributeChanged(name: string, options?: { from?: unknown; to?: unknown }): boolean;
  attributeWas(name: string): unknown;
  attributePreviouslyChanged(name: string, options?: { from?: unknown; to?: unknown }): boolean;
  attributePreviouslyWas(name: string): unknown;
  restoreAttributes(): void;
  changesApplied(): void;
  clearChangesInformation(): void;
  clearAttributeChanges(attributes: string[]): void;
  attributeChangedInPlace(name: string): boolean;
  forgetAttributeAssignments(): void;
  clearAttributeChange(name: string): void;
}

function resolveValue(value: unknown): unknown {
  return AttributeSet.resolveSnapshotValue(value);
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
   * Take a snapshot of the current attributes as the "clean" state.
   * For AttributeSet, uses snapshotValues() which captures values
   * without forcing lazy evaluation on unread FromDatabase attributes.
   */
  snapshot(attributes: Map<string, unknown> | { snapshotValues(): Map<string, unknown> }): void {
    if (attributes instanceof Map) {
      this._originalAttributes = new Map(attributes);
      this._originalHas = new Set(attributes.keys());
    } else {
      this._originalAttributes = attributes.snapshotValues();
      this._originalHas = new Set(this._originalAttributes.keys());
    }
    this._changedAttributes.clear();
  }

  attributeWillChange(name: string, from: unknown, to: unknown): void {
    if (from === to) {
      this._changedAttributes.delete(name);
    } else {
      if (!this._originalHas.has(name)) {
        // Attribute was absent/uninitialized — any write is a change
        this._changedAttributes.set(name, [undefined, to]);
      } else {
        const original = resolveValue(this._originalAttributes.get(name));
        if (to === original) {
          this._changedAttributes.delete(name);
        } else {
          this._changedAttributes.set(name, [original, to]);
        }
      }
    }
  }

  get changed(): boolean {
    return this._changedAttributes.size > 0;
  }

  get changedAttributes(): string[] {
    return Array.from(this._changedAttributes.keys());
  }

  get changes(): Record<string, [unknown, unknown]> {
    const result: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of this._changedAttributes) {
      result[k] = v;
    }
    return result;
  }

  attributeChanged(name: string): boolean {
    return this._changedAttributes.has(name);
  }

  attributeWas(name: string): unknown {
    const change = this._changedAttributes.get(name);
    return change ? change[0] : resolveValue(this._originalAttributes.get(name));
  }

  /** @internal */
  attributeChange(name: string): [unknown, unknown] | undefined {
    return this._changedAttributes.get(name);
  }

  changesApplied(
    currentAttributes: Map<string, unknown> | { snapshotValues(): Map<string, unknown> },
  ): void {
    this._previousChanges = new Map(this._changedAttributes);
    if (currentAttributes instanceof Map) {
      this._originalAttributes = new Map(currentAttributes);
      this._originalHas = new Set(currentAttributes.keys());
    } else {
      this._originalAttributes = currentAttributes.snapshotValues();
      this._originalHas = new Set(this._originalAttributes.keys());
    }
    this._changedAttributes.clear();
  }

  get previousChanges(): Record<string, [unknown, unknown]> {
    const result: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of this._previousChanges) {
      result[k] = v;
    }
    return result;
  }

  clearChangesInformation(): void {
    this._changedAttributes.clear();
    this._previousChanges.clear();
  }

  clearAttributeChanges(attributes: string[]): void {
    for (const attr of attributes) {
      this._changedAttributes.delete(attr);
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
   * Drop a single attribute's pending change and rebind its baseline to
   * the current value, so a later write reports `[current, next]` instead
   * of `[originalFromFirstSnapshot, next]`.
   *
   * Mirrors: ActiveModel::Dirty#clear_attribute_change
   * -> `mutation_tracker.forget_change(name)`.
   *
   * @internal
   */
  clearAttributeChange(
    attributes:
      | Map<string, unknown>
      | { has(name: string): boolean; fetchValue(name: string): unknown }
      | { snapshotValues(): Map<string, unknown> },
    name: string,
  ): void {
    this._changedAttributes.delete(name);
    // Fast path: avoid snapshotting every attribute when only one baseline
    // needs rebinding. AttributeSet exposes has/fetchValue per-attribute;
    // fall back to the full snapshot for plain Maps / other shapes.
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
  }

  initAttributes(
    attributes: Map<string, unknown> | { snapshotValues(): Map<string, unknown> },
  ): void {
    this.snapshot(attributes);
  }

  asJson(): Record<string, [unknown, unknown]> {
    return this.changes;
  }

  restore(attributes: {
    set(name: string, value: unknown): void;
    delete?(name: string): boolean;
  }): void {
    for (const [name] of this._changedAttributes) {
      this._restoreOne(attributes, name);
    }
    this._changedAttributes.clear();
  }

  /**
   * Restore a single attribute to its pre-change value, matching Rails
   * `ActiveModel::Dirty#restore_attribute!(attr)` (activemodel/lib/active_model/dirty.rb).
   */
  restoreAttribute(
    attributes: { set(name: string, value: unknown): void; delete?(name: string): boolean },
    name: string,
  ): void {
    if (!this._changedAttributes.has(name)) return;
    this._restoreOne(attributes, name);
    this._changedAttributes.delete(name);
  }

  private _restoreOne(
    attributes: { set(name: string, value: unknown): void; delete?(name: string): boolean },
    name: string,
  ): void {
    if (!this._originalHas.has(name)) {
      attributes.delete?.(name);
    } else {
      const original = resolveValue(this._originalAttributes.get(name));
      attributes.set(name, original);
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
