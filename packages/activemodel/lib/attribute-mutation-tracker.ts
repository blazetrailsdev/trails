import { HashWithIndifferentAccess, isDuplicable } from "@blazetrails/activesupport";
import { NoMethodError, rbEqual, rbObjClone, TypeError } from "@blazetrails/ruby-compat";
import { AttributeSet } from "./attribute-set.js";

/** @internal */
export class AttributeMutationTracker {
  static readonly OPTION_NOT_GIVEN: unknown = Object.freeze({});

  protected attributes: AttributeSet;
  protected forcedChanges: Map<string, unknown> = new Map();

  constructor(attributes: AttributeSet) {
    this.attributes = attributes;
  }

  changedAttributeNames(): string[] {
    return this.attrNames().filter((attrName) => this.isChanged(attrName));
  }

  changedValues(): HashWithIndifferentAccess<unknown> {
    const result = new HashWithIndifferentAccess<unknown>();
    for (const attrName of this.attrNames()) {
      if (this.isChanged(attrName)) {
        result.set(attrName, this.originalValue(attrName));
      }
    }
    return result;
  }

  changes(): HashWithIndifferentAccess<[unknown, unknown]> {
    const result = new HashWithIndifferentAccess<[unknown, unknown]>();
    for (const attrName of this.attrNames()) {
      const change = this.changeToAttribute(attrName);
      if (change) {
        result.mergeBang({ [attrName]: change });
      }
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

  isChanged(attrName: string, options: { from?: unknown; to?: unknown } = {}): boolean | undefined {
    const { OPTION_NOT_GIVEN } = AttributeMutationTracker;
    const { from, to } = { from: OPTION_NOT_GIVEN, to: OPTION_NOT_GIVEN, ...options };
    return (
      this.attributeChanged(attrName) &&
      (OPTION_NOT_GIVEN === from ||
        rbEqual(this.originalValue(attrName), this.typeCast(attrName, from))) &&
      (OPTION_NOT_GIVEN === to || rbEqual(this.fetchValue(attrName), this.typeCast(attrName, to)))
    );
  }

  changedInPlace(attrName: string): boolean | undefined {
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

  protected attributeChanged(attrName: string): boolean | undefined {
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
  private finalizedChanges: HashWithIndifferentAccess<[unknown, unknown]> | null = null;

  constructor(attributes: ForcedMutationTrackerHost) {
    super(attributes as unknown as AttributeSet);
  }

  changedInPlace(_attrName: string): boolean {
    return false;
  }

  changeToAttribute(attrName: string): [unknown, unknown] | null {
    if (this.finalizedChanges?.include(attrName)) {
      return [...this.finalizedChanges.get(attrName)!];
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
    const value = this.cloneValue(attrName);
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

  private cloneValue(attrName: string): unknown {
    let value: unknown;
    try {
      value = this.fetchValue(attrName);
      return isDuplicable(value) ? rbObjClone(value) : value;
    } catch (e) {
      if (e instanceof TypeError || e instanceof NoMethodError) return value;
      throw e;
    }
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
