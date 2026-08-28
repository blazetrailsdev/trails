import { included, kernelArray, prepend } from "@blazetrails/activesupport";

import { AttributeSet } from "./attribute-set.js";
import {
  AttributeMutationTracker,
  ForcedMutationTracker,
  NullMutationTracker,
} from "./attribute-mutation-tracker.js";

export interface DirtyOptions {
  from?: unknown;
  to?: unknown;
}

interface DirtyIncludeHost {
  prototype: object;
  attributeMethodSuffix(...suffixes: Array<string | { parameters?: string | null | false }>): void;
  attributeMethodAffix(
    ...affixes: Array<{ prefix?: string; suffix?: string; parameters?: string | null | false }>
  ): void;
}

export class Dirty {
  static [included](base: DirtyIncludeHost): void {
    base.attributeMethodSuffix("PreviouslyChanged", "Changed", { parameters: "**options" });
    base.attributeMethodSuffix("Change", "WillChange!", "Was", { parameters: false });
    base.attributeMethodSuffix("PreviousChange", "PreviouslyWas", { parameters: false });
    base.attributeMethodAffix({ prefix: "restore", suffix: "!", parameters: false });
    base.attributeMethodAffix({ prefix: "clear", suffix: "Change", parameters: false });
    prepend(base.prototype, { initInternals, initializeDup });
  }

  declare _attributes: AttributeSet;
  /** @internal */
  declare _readAttribute: (attrName: string) => unknown;
  /** @internal */
  declare _mutationsFromDatabase: AttributeMutationTracker | null;
  /** @internal */
  declare _mutationsBeforeLastSave: AttributeMutationTracker | NullMutationTracker | null;

  changesApplied(): void {
    if (this._attributes == null) {
      (this.mutationsFromDatabase as ForcedMutationTracker).finalizeChanges();
    }
    this._mutationsBeforeLastSave = this.mutationsFromDatabase;
    this.forgetAttributeAssignments();
    this._mutationsFromDatabase = null;
  }

  get isChanged(): boolean {
    return this.mutationsFromDatabase.anyChanges();
  }

  get changed(): string[] {
    return this.mutationsFromDatabase.changedAttributeNames();
  }

  attributeChanged(attrName: string, options?: DirtyOptions): boolean {
    return this.mutationsFromDatabase.isChanged(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName),
      options,
    );
  }

  attributeWas(attrName: string): unknown {
    return this.mutationsFromDatabase.originalValue(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName),
    );
  }

  attributePreviouslyChanged(attrName: string, options?: DirtyOptions): boolean {
    return this.mutationsBeforeLastSave.isChanged(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName),
      options,
    );
  }

  attributePreviouslyWas(attrName: string): unknown {
    return this.mutationsBeforeLastSave.originalValue(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName),
    );
  }

  restoreAttributes(attrNames: string[] = this.changed): void {
    attrNames.forEach((attrName) => this.restoreAttributeBang(attrName));
  }

  clearChangesInformation(): void {
    this._mutationsBeforeLastSave = null;
    this.forgetAttributeAssignments();
    this._mutationsFromDatabase = null;
  }

  clearAttributeChanges(attrNames: string[]): void {
    attrNames.forEach((attrName) => this.clearAttributeChange(attrName));
  }

  get changedAttributes(): Record<string, unknown> {
    return this.mutationsFromDatabase.changedValues();
  }

  get changes(): Record<string, [unknown, unknown]> {
    return this.mutationsFromDatabase.changes();
  }

  get previousChanges(): Record<string, [unknown, unknown]> {
    return this.mutationsBeforeLastSave.changes();
  }

  attributeChangedInPlace(attrName: string): boolean {
    return this.mutationsFromDatabase.changedInPlace(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName),
    );
  }

  /** @internal */
  clearAttributeChange(attrName: string): void {
    this.mutationsFromDatabase.forgetChange(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName),
    );
  }

  /** @internal */
  get mutationsFromDatabase(): AttributeMutationTracker {
    return (this._mutationsFromDatabase ??=
      this._attributes != null
        ? new AttributeMutationTracker(this._attributes)
        : new ForcedMutationTracker(this));
  }

  /** @internal */
  forgetAttributeAssignments(): void {
    if (this._attributes != null) {
      this._attributes = this._attributes.map((attr) => attr.forgettingAssignment());
    }
  }

  /** @internal */
  get mutationsBeforeLastSave(): AttributeMutationTracker | NullMutationTracker {
    return (this._mutationsBeforeLastSave ??= NullMutationTracker.instance);
  }

  /** @internal */
  attributeChange(attrName: string): [unknown, unknown] | null {
    return this.mutationsFromDatabase.changeToAttribute(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName),
    );
  }

  /** @internal */
  attributePreviousChange(attrName: string): [unknown, unknown] | null {
    return this.mutationsBeforeLastSave.changeToAttribute(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName),
    );
  }

  /** @internal */
  attributeWillChangeBang(attrName: string): unknown {
    return this.mutationsFromDatabase.forceChange(
      (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName),
    );
  }

  /** @internal */
  restoreAttributeBang(attrName: string): void {
    attrName = (this.constructor as unknown as DirtyClass).resolveAttributeName(attrName);
    if (this.attributeChanged(attrName)) {
      (this as unknown as Record<string, unknown>)[attrName] = this.attributeWas(attrName);
      this.clearAttributeChange(attrName);
    }
  }
}

type DirtyClass = { resolveAttributeName(name: string): string };

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

export interface DirtyInternalsHost {
  _mutationsBeforeLastSave: AttributeMutationTracker | NullMutationTracker | null;
  _mutationsFromDatabase: AttributeMutationTracker | null;
}

export interface DirtyDupHost extends DirtyInternalsHost {
  _attributes: AttributeSet;
}

/** @internal */
export function initInternals(this: DirtyInternalsHost, super_: () => void): void {
  super_();
  this._mutationsBeforeLastSave = null;
  this._mutationsFromDatabase = null;
}

export function initializeDup(
  this: DirtyDupHost,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  super_(other);
  this._mutationsFromDatabase = null;
}
