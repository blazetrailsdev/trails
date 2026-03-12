/**
 * Dirty tracking mixin — tracks attribute changes on a model.
 *
 * Mirrors: ActiveModel::Dirty
 */
export class DirtyTracker {
  private _originalAttributes: Map<string, unknown> = new Map();
  private _changedAttributes: Map<string, [unknown, unknown]> = new Map();
  private _previousChanges: Map<string, [unknown, unknown]> = new Map();

  /**
   * Take a snapshot of the current attributes as the "clean" state.
   */
  snapshot(attributes: Map<string, unknown>): void {
    this._originalAttributes = new Map(attributes);
    this._changedAttributes.clear();
  }

  /**
   * Record an attribute change.
   */
  attributeWillChange(name: string, from: unknown, to: unknown): void {
    if (from === to) {
      this._changedAttributes.delete(name);
    } else {
      const original = this._originalAttributes.get(name);
      if (to === original) {
        this._changedAttributes.delete(name);
      } else {
        this._changedAttributes.set(name, [this._originalAttributes.get(name), to]);
      }
    }
  }

  /**
   * Has any attribute changed?
   */
  get changed(): boolean {
    return this._changedAttributes.size > 0;
  }

  /**
   * List of changed attribute names.
   */
  get changedAttributes(): string[] {
    return Array.from(this._changedAttributes.keys());
  }

  /**
   * Map of attribute => [old, new].
   */
  get changes(): Record<string, [unknown, unknown]> {
    const result: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of this._changedAttributes) {
      result[k] = v;
    }
    return result;
  }

  /**
   * Was this specific attribute changed?
   */
  attributeChanged(name: string): boolean {
    return this._changedAttributes.has(name);
  }

  /**
   * The previous value of an attribute (before the change).
   */
  attributeWas(name: string): unknown {
    const change = this._changedAttributes.get(name);
    return change ? change[0] : this._originalAttributes.get(name);
  }

  /**
   * The change for a specific attribute: [old, new] or undefined.
   */
  attributeChange(name: string): [unknown, unknown] | undefined {
    return this._changedAttributes.get(name);
  }

  /**
   * Commit changes — the current state becomes the "clean" state.
   */
  changesApplied(currentAttributes: Map<string, unknown>): void {
    this._previousChanges = new Map(this._changedAttributes);
    this._originalAttributes = new Map(currentAttributes);
    this._changedAttributes.clear();
  }

  /**
   * Changes from the last save/commit.
   */
  get previousChanges(): Record<string, [unknown, unknown]> {
    const result: Record<string, [unknown, unknown]> = {};
    for (const [k, v] of this._previousChanges) {
      result[k] = v;
    }
    return result;
  }

  /**
   * Clear all dirty tracking information (changes + previous changes).
   *
   * Mirrors: ActiveModel::Dirty#clear_changes_information
   */
  clearChangesInformation(): void {
    this._changedAttributes.clear();
    this._previousChanges.clear();
  }

  /**
   * Clear dirty tracking for specific attributes.
   *
   * Mirrors: ActiveModel::Dirty#clear_attribute_changes
   */
  clearAttributeChanges(attributes: string[]): void {
    for (const attr of attributes) {
      this._changedAttributes.delete(attr);
    }
  }

  /**
   * Restore attributes to their original values.
   */
  restore(attributes: Map<string, unknown>): void {
    for (const [name] of this._changedAttributes) {
      const original = this._originalAttributes.get(name);
      attributes.set(name, original);
    }
    this._changedAttributes.clear();
  }
}
