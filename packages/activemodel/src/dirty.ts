import { HashWithIndifferentAccess, included, kernelArray } from "@blazetrails/activesupport";
import { include, Module } from "@blazetrails/ruby-compat";
import type { Hash } from "@blazetrails/ruby-compat";

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
    include(base, SuperMethods);
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

  attributeChanged(attrName: string, options?: DirtyOptions): boolean | undefined {
    return this.mutationsFromDatabase.isChanged(attrName, options);
  }

  attributeWas(attrName: string): unknown {
    return this.mutationsFromDatabase.originalValue(attrName);
  }

  attributePreviouslyChanged(attrName: string, options?: DirtyOptions): boolean | undefined {
    return this.mutationsBeforeLastSave.isChanged(attrName, options);
  }

  attributePreviouslyWas(attrName: string): unknown {
    return this.mutationsBeforeLastSave.originalValue(attrName);
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

  get changedAttributes(): HashWithIndifferentAccess<unknown> {
    return this.mutationsFromDatabase.changedValues();
  }

  get changes(): HashWithIndifferentAccess<[unknown, unknown]> {
    return this.mutationsFromDatabase.changes();
  }

  get previousChanges(): Hash<string, [unknown, unknown]> {
    return this.mutationsBeforeLastSave.changes();
  }

  attributeChangedInPlace(attrName: string): boolean | undefined {
    return this.mutationsFromDatabase.changedInPlace(attrName);
  }

  /** @internal */
  clearAttributeChange(attrName: string): void {
    this.mutationsFromDatabase.forgetChange(attrName);
  }

  /**
   * @internal
   * @missingRailsName attributes — PERMANENT
   */
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
    return this.mutationsFromDatabase.changeToAttribute(attrName);
  }

  /** @internal */
  attributePreviousChange(attrName: string): [unknown, unknown] | null {
    return this.mutationsBeforeLastSave.changeToAttribute(attrName);
  }

  /** @internal */
  attributeWillChangeBang(attrName: string): unknown {
    return this.mutationsFromDatabase.forceChange(attrName);
  }

  /** @internal */
  restoreAttributeBang(attrName: string): void {
    if (this.attributeChanged(attrName)) {
      (this as unknown as Record<string, unknown>)[attrName] = this.attributeWas(attrName);
      this.clearAttributeChange(attrName);
    }
  }
}

export function initializeDup(this: DirtyDupHost, other: unknown): void {
  SuperMethods.superMethod(this, "initializeDup")!(other);
  this._mutationsFromDatabase = null;
}

export function initAttributes(
  this: { constructor: { _defaultAttributes?: () => AttributeSet } },
  other: unknown,
): AttributeSet {
  const attrs = SuperMethods.superMethod(this, "initAttributes")!(other) as AttributeSet;
  const klass = this.constructor;
  if ((other as { isPersisted(): boolean }).isPersisted() && klass._defaultAttributes) {
    return klass
      ._defaultAttributes()
      .map((attr) => attr.withValueFromUser(attrs.fetchValue(attr.name!)));
  }
  return attrs;
}

export interface DirtyInternalsHost {
  _mutationsBeforeLastSave: AttributeMutationTracker | NullMutationTracker | null;
  _mutationsFromDatabase: AttributeMutationTracker | null;
}

export interface DirtyDupHost extends DirtyInternalsHost {
  _attributes: AttributeSet;
}

export function asJson(this: object, options: Record<string, unknown> = {}): unknown {
  const except = [
    ...kernelArray(options["except"]),
    "_mutationsFromDatabase",
    "_mutationsBeforeLastSave",
  ];
  options = { ...options, except };
  return SuperMethods.superMethod(this, "asJson")!(options);
}

/** @internal */
export function initInternals(this: DirtyInternalsHost): void {
  SuperMethods.superMethod(this, "initInternals")!();
  this._mutationsBeforeLastSave = null;
  this._mutationsFromDatabase = null;
}

const SuperMethods = new Module((mod) => {
  mod.defineMethod("initializeDup", initializeDup);
  mod.defineMethod("initAttributes", initAttributes);
  mod.defineMethod("asJson", asJson);
  mod.defineMethod("initInternals", initInternals);
});
