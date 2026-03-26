import { AttributeSet } from "./attribute-set.js";

function cloneValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  if (value instanceof Date) return new Date(value.getTime());
  if (Array.isArray(value)) return value.map(cloneValue);
  // Only deep-clone plain objects; preserve class instances as-is
  const proto = Object.getPrototypeOf(value);
  if (proto !== Object.prototype && proto !== null) return value;
  const result: Record<string, unknown> = proto === null ? Object.create(null) : {};
  for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
    result[k] = cloneValue(v);
  }
  return result;
}

function valuesEqual(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (typeof a === "number" && typeof b === "number" && Number.isNaN(a) && Number.isNaN(b))
    return true;
  return false;
}

/**
 * Tracks attribute mutations by comparing current Attribute state
 * against original values.
 *
 * Mirrors: ActiveModel::AttributeMutationTracker
 */
export class AttributeMutationTracker {
  protected attributes: AttributeSet;
  protected forcedChanges: Map<string, unknown> = new Map();

  constructor(attributes: AttributeSet) {
    this.attributes = attributes;
  }

  changedAttributeNames(): string[] {
    return this.attrNames().filter((name) => this.isChanged(name));
  }

  changedValues(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const name of this.attrNames()) {
      if (this.isChanged(name)) {
        result[name] = this.originalValue(name);
      }
    }
    return result;
  }

  changes(): Record<string, [unknown, unknown]> {
    const result: Record<string, [unknown, unknown]> = {};
    for (const name of this.attrNames()) {
      const change = this.changeToAttribute(name);
      if (change) result[name] = change;
    }
    return result;
  }

  changeToAttribute(name: string): [unknown, unknown] | undefined {
    if (this.isChanged(name)) {
      return [this.originalValue(name), this.attributes.fetchValue(name)];
    }
    return undefined;
  }

  anyChanges(): boolean {
    return this.attrNames().some((name) => this.isChanged(name));
  }

  isChanged(name: string, options?: { from?: unknown; to?: unknown }): boolean {
    if (!this.attributeChanged(name)) return false;
    if (options && "from" in options && !valuesEqual(this.originalValue(name), options.from))
      return false;
    if (options && "to" in options && !valuesEqual(this.attributes.fetchValue(name), options.to))
      return false;
    return true;
  }

  changedInPlace(name: string): boolean {
    return this.attributes.getAttribute(name).changedInPlace();
  }

  forgetChange(name: string): void {
    this.forcedChanges.delete(name);
    if (this.attributes.has(name)) {
      const attr = this.attributes.getAttribute(name);
      this.attributes.set(name, attr.forgettingAssignment());
    }
  }

  originalValue(name: string): unknown {
    if (this.forcedChanges.has(name)) {
      return this.forcedChanges.get(name);
    }
    return this.attributes.getAttribute(name).originalValue;
  }

  forceChange(name: string): void {
    if (this.forcedChanges.has(name)) return;
    const value = this.attributes.fetchValue(name);
    this.forcedChanges.set(name, cloneValue(value));
  }

  protected attributeChanged(name: string): boolean {
    return this.forcedChanges.has(name) || this.attributes.getAttribute(name).isChanged();
  }

  protected attrNames(): string[] {
    const keys = new Set(this.attributes.keys());
    for (const name of this.forcedChanges.keys()) keys.add(name);
    return [...keys];
  }
}

/**
 * Tracks forced mutations only — used during persistence callbacks.
 *
 * Mirrors: ActiveModel::ForcedMutationTracker
 */
export class ForcedMutationTracker extends AttributeMutationTracker {
  private finalizedChanges: Record<string, [unknown, unknown]> | null = null;

  protected override attributeChanged(name: string): boolean {
    return this.forcedChanges.has(name);
  }

  protected override attrNames(): string[] {
    return Array.from(this.forcedChanges.keys());
  }

  changedInPlace(_name: string): boolean {
    return false;
  }

  changeToAttribute(name: string): [unknown, unknown] | undefined {
    if (
      this.finalizedChanges &&
      Object.prototype.hasOwnProperty.call(this.finalizedChanges, name)
    ) {
      return [...this.finalizedChanges[name]];
    }
    return super.changeToAttribute(name);
  }

  forgetChange(name: string): void {
    this.forcedChanges.delete(name);
  }

  originalValue(name: string): unknown {
    if (this.isChanged(name)) {
      return this.forcedChanges.get(name);
    }
    return this.attributes.fetchValue(name);
  }

  forceChange(name: string): void {
    if (this.forcedChanges.has(name)) return;
    const value = this.attributes.fetchValue(name);
    this.forcedChanges.set(name, cloneValue(value));
  }

  finalizeChanges(): void {
    this.finalizedChanges = this.changes();
  }
}

/**
 * Null object pattern — always reports no changes.
 *
 * Mirrors: ActiveModel::NullMutationTracker
 */
export class NullMutationTracker {
  changedAttributeNames(): string[] {
    return [];
  }

  changedValues(): Record<string, unknown> {
    return {};
  }

  changes(): Record<string, [unknown, unknown]> {
    return {};
  }

  changeToAttribute(_name: string): [unknown, unknown] | undefined {
    return undefined;
  }

  anyChanges(): boolean {
    return false;
  }

  isChanged(_name: string, _options?: { from?: unknown; to?: unknown }): boolean {
    return false;
  }

  changedInPlace(_name: string): boolean {
    return false;
  }

  originalValue(_name: string): unknown {
    return undefined;
  }

  forceChange(_name: string): void {}
  forgetChange(_name: string): void {}
  finalizeChanges(): void {}
}
