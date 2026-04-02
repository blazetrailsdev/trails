import { AttributeSet } from "./attribute-set.js";

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
  attributeChanged(name: string, options?: { from?: unknown; to?: unknown }): boolean;
  attributeWas(name: string): unknown;
  attributePreviouslyChanged(name: string, options?: { from?: unknown; to?: unknown }): boolean;
  attributePreviouslyWas(name: string): unknown;
  restoreAttributes(): void;
  changesApplied(): void;
  clearChangesInformation(): void;
  clearAttributeChanges(attributes: string[]): void;
  attributeChangedInPlace(name: string): boolean;
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
      if (!this._originalHas.has(name)) {
        // Attribute was absent — remove it rather than setting undefined
        attributes.delete?.(name);
      } else {
        const original = resolveValue(this._originalAttributes.get(name));
        attributes.set(name, original);
      }
    }
    this._changedAttributes.clear();
  }
}
