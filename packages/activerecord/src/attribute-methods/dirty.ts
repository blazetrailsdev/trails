import { RuntimeError } from "@blazetrails/ruby-compat";
import { classAttribute, included, isModuleIncluded } from "@blazetrails/activesupport";
import { Temporal } from "@blazetrails/date";
import type {
  AttributeMutationTracker,
  DirtyOptions,
  NullMutationTracker,
} from "@blazetrails/activemodel";
import * as Timestamp from "../timestamp.js";

interface DirtyRecord {
  mutationsFromDatabase: AttributeMutationTracker;
  mutationsBeforeLastSave: AttributeMutationTracker | NullMutationTracker;
}

export function isSavedChangeToAttribute(
  record: DirtyRecord,
  attrName: string,
  options?: DirtyOptions,
): boolean {
  return record.mutationsBeforeLastSave.isChanged(attrName, options);
}

export function savedChangeToAttribute(
  record: DirtyRecord,
  attrName: string,
): [unknown, unknown] | null {
  return record.mutationsBeforeLastSave.changeToAttribute(attrName);
}

export function attributeBeforeLastSave(record: DirtyRecord, attrName: string): unknown {
  return record.mutationsBeforeLastSave.originalValue(attrName);
}

export function isSavedChanges(record: DirtyRecord): boolean {
  return record.mutationsBeforeLastSave.anyChanges();
}

export function isWillSaveChangeToAttribute(
  record: DirtyRecord,
  attrName: string,
  options?: DirtyOptions,
): boolean {
  return record.mutationsFromDatabase.isChanged(attrName, options);
}

export function attributeChangeToBeSaved(
  record: DirtyRecord,
  attrName: string,
): [unknown, unknown] | null {
  return record.mutationsFromDatabase.changeToAttribute(attrName);
}

export function attributeInDatabase(record: DirtyRecord, attrName: string): unknown {
  return record.mutationsFromDatabase.originalValue(attrName);
}

interface DirtyIncludeHost {
  prototype: object;
  attributeMethodPrefix(...prefixes: Array<string | { parameters?: string | null | false }>): void;
  attributeMethodSuffix(...suffixes: Array<string | { parameters?: string | null | false }>): void;
  attributeMethodAffix(
    ...affixes: Array<{ prefix?: string; suffix?: string; parameters?: string | null | false }>
  ): void;
}

export class Dirty {
  static [included](base: DirtyIncludeHost): void {
    if (isModuleIncluded(base, Timestamp.InstanceMethods)) {
      throw new RuntimeError("You cannot include Dirty after Timestamp");
    }

    classAttribute.call(base, "partialUpdates", { instanceWriter: false, default: true });
    classAttribute.call(base, "partialInserts", { instanceWriter: false, default: true });

    base.attributeMethodAffix({ prefix: "isSavedChangeTo", parameters: "**options" });
    base.attributeMethodPrefix("savedChangeTo", { parameters: false });
    base.attributeMethodSuffix("BeforeLastSave", { parameters: false });

    base.attributeMethodAffix({ prefix: "isWillSaveChangeTo", parameters: "**options" });
    base.attributeMethodSuffix("ChangeToBeSaved", "InDatabase", { parameters: false });
  }

  get savedChanges(): Record<string, [unknown, unknown]> {
    return (this as unknown as DirtyRecord).mutationsBeforeLastSave.changes();
  }

  get hasChangesToSave(): boolean {
    return (this as unknown as DirtyRecord).mutationsFromDatabase.anyChanges();
  }

  get changesToSave(): Record<string, [unknown, unknown]> {
    return (this as unknown as DirtyRecord).mutationsFromDatabase.changes();
  }

  get changedAttributeNamesToSave(): string[] {
    return (this as unknown as DirtyRecord).mutationsFromDatabase.changedAttributeNames();
  }

  get attributesInDatabase(): Record<string, unknown> {
    return (this as unknown as DirtyRecord).mutationsFromDatabase.changedValues();
  }
}

interface DirtyPrivateHost {
  _attributes: { keys(): Iterable<string> };
  _mutationsBeforeLastSave: unknown;
  _mutationsFromDatabase: unknown;
  _touchAttrNames: Set<string> | null;
  _skipDirtyTracking: boolean | null;
  attributeChanged(name: string): boolean;
  attributeWas(name: string): unknown;
  /** @internal */
  clearAttributeChange(name: string): void;
  clearAttributeChanges(names: Iterable<string>): void;
  changesApplied(): void;
  /** @internal */
  _readAttribute(name: string): unknown;
  _writeAttribute(name: string, value: unknown): void;
  changedAttributeNamesToSave: string[];
  constructor: {
    attributeNames(): string[];
    columnForAttribute(name: string): { isAutoPopulated(): boolean } | undefined;
    partialUpdates: boolean;
    partialInserts: boolean;
  };
}

/** @internal */
export function initInternals(this: DirtyPrivateHost, super_: () => void): void {
  super_();
  this._mutationsBeforeLastSave = null;
  this._mutationsFromDatabase = null;
  this._touchAttrNames = null;
  this._skipDirtyTracking = null;
}

/** @internal */
export function _touchRow(
  this: DirtyPrivateHost,
  attributeNames: string[],
  time?: Temporal.Instant | null,
): Promise<number> {
  this._touchAttrNames = new Set(attributeNames);
  const t = time ?? Temporal.Now.instant();
  for (const attr of this._touchAttrNames) {
    this._writeAttribute(attr, t);
  }
  const affectedRows = (this as any)._updateRow
    ? (this as any)._updateRow(attributeNames, "touch")
    : Promise.resolve(1);

  return affectedRows.then((rows: number) => {
    if (this._skipDirtyTracking) {
      this.clearAttributeChanges(this._touchAttrNames!);
    } else {
      const restores: Array<[string, unknown]> = [];
      for (const attrName of this._attributes.keys()) {
        if (this._touchAttrNames!.has(attrName)) continue;
        if (this.attributeChanged(attrName)) {
          const current = this._readAttribute(attrName);
          this._writeAttribute(attrName, this.attributeWas(attrName));
          this.clearAttributeChange(attrName);
          restores.push([attrName, current]);
        }
      }
      this.changesApplied();
      for (const [attrName, value] of restores) {
        this._writeAttribute(attrName, value);
      }
    }
    this._touchAttrNames = null;
    this._skipDirtyTracking = null;
    return rows;
  });
}

/** @internal */
export async function _updateRecord(
  this: DirtyPrivateHost,
  attributeNames: string[] | undefined,
  superFn: (attributeNames: string[]) => Promise<unknown>,
): Promise<unknown> {
  attributeNames ??= attributeNamesForPartialUpdates.call(this);
  const affectedRows = await superFn(attributeNames);
  this.changesApplied();
  return affectedRows;
}

/** @internal */
export async function _createRecord(
  this: DirtyPrivateHost,
  attributeNames: string[] | undefined,
  superFn: (attributeNames: string[]) => Promise<unknown>,
): Promise<unknown> {
  attributeNames ??= attributeNamesForPartialInserts.call(this);
  const id = await superFn(attributeNames);
  this.changesApplied();
  return id;
}

/** @internal */
export function attributeNamesForPartialUpdates(this: DirtyPrivateHost): string[] {
  return this.constructor.partialUpdates
    ? this.changedAttributeNamesToSave
    : this.constructor.attributeNames();
}

/** @internal */
export function attributeNamesForPartialInserts(this: DirtyPrivateHost): string[] {
  if (this.constructor.partialInserts) {
    return this.changedAttributeNamesToSave;
  }
  return this.constructor.attributeNames().filter((attrName) => {
    const col = this.constructor.columnForAttribute(attrName);
    if (col?.isAutoPopulated()) {
      return this.attributeChanged(attrName);
    }
    return true;
  });
}
