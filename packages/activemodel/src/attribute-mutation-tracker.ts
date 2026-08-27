import { Temporal } from "@blazetrails/date";
import { AttributeSet } from "./attribute-set.js";

/** @internal */
function cloneValue(value: unknown): unknown {
  if (value === null || typeof value !== "object") return value;
  // boundary: Date is mutable — clone to protect dirty tracking when a legacy
  if (value instanceof Date) return new Date(value.getTime());
  if (
    value instanceof Temporal.Instant ||
    value instanceof Temporal.PlainDateTime ||
    value instanceof Temporal.PlainDate ||
    value instanceof Temporal.PlainTime ||
    value instanceof Temporal.ZonedDateTime
  )
    return value;
  if (Array.isArray(value)) return value.map(cloneValue);
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

export class AttributeMutationTracker {
  protected attributes: AttributeSet;
  protected forcedChanges: Map<string, unknown> = new Map();

  constructor(attributes: AttributeSet) {
    this.attributes = attributes;
  }

  changedAttributeNames(): string[] {
    return this.attrNames().filter((attrName) => this.isChanged(attrName));
  }

  changedValues(): Record<string, unknown> {
    const result: Record<string, unknown> = {};
    for (const attrName of this.attrNames()) {
      if (this.isChanged(attrName)) {
        result[attrName] = this.originalValue(attrName);
      }
    }
    return result;
  }

  changes(): Record<string, [unknown, unknown]> {
    const result: Record<string, [unknown, unknown]> = {};
    for (const attrName of this.attrNames()) {
      const change = this.changeToAttribute(attrName);
      if (change) result[attrName] = change;
    }
    return result;
  }

  changeToAttribute(attrName: string): [unknown, unknown] | null {
    if (this.isChanged(attrName)) {
      return [this.originalValue(attrName), this.fetchValue(attrName)];
    }
    return null;
  }

  anyChanges(): boolean {
    return this.attrNames().some((attr) => this.isChanged(attr));
  }

  isChanged(attrName: string, options?: { from?: unknown; to?: unknown }): boolean {
    if (!this.attributeChanged(attrName)) return false;
    if (
      options &&
      "from" in options &&
      !valuesEqual(this.originalValue(attrName), this.typeCast(attrName, options.from))
    )
      return false;
    if (
      options &&
      "to" in options &&
      !valuesEqual(this.fetchValue(attrName), this.typeCast(attrName, options.to))
    )
      return false;
    return true;
  }

  changedInPlace(attrName: string): boolean {
    return this.attributes.getAttribute(attrName).changedInPlace();
  }

  forgetChange(attrName: string): void {
    this.attributes.set(attrName, this.attributes.getAttribute(attrName).forgettingAssignment());
    this.forcedChanges.delete(attrName);
  }

  originalValue(attrName: string): unknown {
    return this.attributes.getAttribute(attrName).originalValue;
  }

  forceChange(attrName: string): unknown {
    const value = this.fetchValue(attrName);
    this.forcedChanges.set(attrName, value);
    return value;
  }

  protected attrNames(): string[] {
    return this.attributes.keys();
  }

  protected attributeChanged(attrName: string): boolean {
    return this.forcedChanges.has(attrName) || this.attributes.getAttribute(attrName).isChanged();
  }

  /** @internal */
  protected fetchValue(attrName: string): unknown {
    return this.attributes.fetchValue(attrName);
  }

  /** @internal */
  protected typeCast(attrName: string, value: unknown): unknown {
    return this.attributes.getAttribute(attrName).typeCast(value);
  }
}

export interface ForcedMutationTrackerHost {
  /** @internal */
  _readAttribute(attrName: string): unknown;
}

export class ForcedMutationTracker extends AttributeMutationTracker {
  private finalizedChanges: Record<string, [unknown, unknown]> | null = null;

  constructor(attributes: ForcedMutationTrackerHost) {
    super(attributes as unknown as AttributeSet);
  }

  changedInPlace(_attrName: string): boolean {
    return false;
  }

  changeToAttribute(attrName: string): [unknown, unknown] | null {
    if (this.finalizedChanges && Object.hasOwn(this.finalizedChanges, attrName)) {
      return [...this.finalizedChanges[attrName]];
    }
    return super.changeToAttribute(attrName);
  }

  forgetChange(attrName: string): void {
    this.forcedChanges.delete(attrName);
  }

  originalValue(attrName: string): unknown {
    if (this.isChanged(attrName)) {
      return this.forcedChanges.get(attrName);
    }
    return this.fetchValue(attrName);
  }

  forceChange(attrName: string): unknown {
    if (this.attributeChanged(attrName)) return undefined;
    const value = cloneValue(this.fetchValue(attrName));
    this.forcedChanges.set(attrName, value);
    return value;
  }

  finalizeChanges(): void {
    this.finalizedChanges = this.changes();
  }

  protected override attrNames(): string[] {
    return Array.from(this.forcedChanges.keys());
  }

  protected override attributeChanged(attrName: string): boolean {
    return this.forcedChanges.has(attrName);
  }

  /** @internal */
  protected override fetchValue(attrName: string): unknown {
    return (this.attributes as unknown as ForcedMutationTrackerHost)._readAttribute(attrName);
  }

  /** @internal */
  protected override typeCast(_attrName: string, value: unknown): unknown {
    return value;
  }
}

export class NullMutationTracker {
  static readonly instance = new NullMutationTracker();

  changedAttributeNames(): string[] {
    return [];
  }

  changedValues(): Record<string, unknown> {
    return {};
  }

  changes(): Record<string, [unknown, unknown]> {
    return {};
  }

  changeToAttribute(_attrName: string): [unknown, unknown] | null {
    return null;
  }

  anyChanges(): boolean {
    return false;
  }

  isChanged(_attrName: string, _options?: { from?: unknown; to?: unknown }): boolean {
    return false;
  }

  changedInPlace(_attrName: string): boolean {
    return false;
  }

  originalValue(_attrName: string): unknown {
    return undefined;
  }
}
