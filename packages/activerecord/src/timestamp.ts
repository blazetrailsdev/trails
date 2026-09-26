import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { currentTimeInstant, indexWith } from "@blazetrails/activesupport";
import { reloadSchemaFromCache as attributesReloadSchemaFromCache } from "./attributes.js";
import { defaultTimezone } from "./active-record.js";

export interface TouchOptions {
  time?: Date | RubyTime | null;
}

export type TouchArgs = string[] | [...names: string[], options: TouchOptions];

const CREATED_ATTRS = ["created_at", "created_on"];
const UPDATED_ATTRS = ["updated_at", "updated_on"];

export interface TimestampHost {
  attributeAliases?: Record<string, string>;
  columnNames?: string[] | (() => string[]);
  _timestampAttributesForCreateInModel?: string[];
  _timestampAttributesForUpdateInModel?: string[];
  _allTimestampAttributesInModel?: string[];
  timestampAttributesForCreate(): string[];
  timestampAttributesForUpdate(): string[];
  timestampAttributesForCreateInModel(): string[];
  timestampAttributesForUpdateInModel(): string[];
  allTimestampAttributesInModel(): string[];
  currentTimeFromProperTimezone(): RubyTime;
}

interface TimestampInstanceHost {
  _touchRecord: boolean | null;
  readAttribute?(name: string): unknown;
  _readAttribute?(name: string): unknown;
  _writeAttribute?(name: string, val: unknown): void;
  isWillSaveChangeToAttribute?(name: string): boolean;
  clearAttributeChange?(name: string): void;
  hasChangesToSave?: boolean;
  id?: unknown;
  recordTimestamps?: boolean;
  timestampAttributesForUpdateInModel(): string[];
  allTimestampAttributesInModel(): string[];
  currentTimeFromProperTimezone(): RubyTime;
  constructor: TimestampHost & { recordTimestamps: boolean; partialUpdates?: boolean };
}

export type TouchAllOptions = { time?: RubyTime };

export type TouchAllArgs = string[] | [...names: string[], options: TouchAllOptions];

export function touchAttributesWithTime(
  this: TimestampHost,
  ...args: [...names: string[], time: RubyTime | undefined]
): Record<string, RubyTime> {
  let names = args.slice(0, -1) as string[];
  const time = args[args.length - 1] as RubyTime | undefined;
  names = names.map((name) => this.attributeAliases?.[name] ?? name);
  let attributeNames = this.timestampAttributesForUpdateInModel();
  attributeNames = [...new Set([...attributeNames, ...names])];
  return Object.fromEntries(
    indexWith(attributeNames, time ?? this.currentTimeFromProperTimezone()),
  );
}

export type CounterCacheTouchOption =
  | boolean
  | string
  | Array<string | { time?: RubyTime }>
  | { time?: RubyTime };

export function timestampAttributesForCreateInModel(this: TimestampHost): string[] {
  if (this._timestampAttributesForCreateInModel) return this._timestampAttributesForCreateInModel;
  const names =
    typeof this.columnNames === "function" ? this.columnNames() : (this.columnNames ?? []);
  const cols = new Set(names);
  this._timestampAttributesForCreateInModel = this.timestampAttributesForCreate().filter((a) =>
    cols.has(a),
  );
  return this._timestampAttributesForCreateInModel;
}

export function timestampAttributesForUpdateInModel(this: TimestampHost): string[] {
  if (this._timestampAttributesForUpdateInModel) return this._timestampAttributesForUpdateInModel;
  const names =
    typeof this.columnNames === "function" ? this.columnNames() : (this.columnNames ?? []);
  const cols = new Set(names);
  this._timestampAttributesForUpdateInModel = this.timestampAttributesForUpdate().filter((a) =>
    cols.has(a),
  );
  return this._timestampAttributesForUpdateInModel;
}

export function allTimestampAttributesInModel(this: TimestampHost): string[] {
  if (this._allTimestampAttributesInModel) return this._allTimestampAttributesInModel;
  this._allTimestampAttributesInModel = [
    ...this.timestampAttributesForCreateInModel(),
    ...this.timestampAttributesForUpdateInModel(),
  ];
  return this._allTimestampAttributesInModel;
}

/** @missingRailsCall with_connection — PERMANENT */
export function currentTimeFromProperTimezone(): RubyTime {
  const now = RubyTime.at(new Rational(currentTimeInstant().epochNanoseconds, 1_000_000_000n));
  return defaultTimezone() === "utc" ? now.getutc() : now.getlocal();
}

/** @internal */
export function reloadSchemaFromCache(this: TimestampHost, recursive = true): void {
  this._timestampAttributesForCreateInModel = undefined;
  this._timestampAttributesForUpdateInModel = undefined;
  this._allTimestampAttributesInModel = undefined;
  attributesReloadSchemaFromCache.call(this, recursive);
}

/** @internal */
export function timestampAttributesForCreate(this: TimestampHost): string[] {
  const aliases = this.attributeAliases ?? {};
  return CREATED_ATTRS.map((name) => aliases[name] ?? name);
}

/** @internal */
export function timestampAttributesForUpdate(this: TimestampHost): string[] {
  const aliases = this.attributeAliases ?? {};
  return UPDATED_ATTRS.map((name) => aliases[name] ?? name);
}

/** @internal */
export function initInternals(this: TimestampInstanceHost, super_: () => void): void {
  super_();
  this._touchRecord = null;
}

export function initializeDup(
  this: TimestampInstanceHost,
  super_: (other: unknown) => void,
  other: unknown,
): void {
  super_(other);
  clearTimestampAttributes.call(this);
}

/** @internal */
export async function _createRecord(
  this: TimestampInstanceHost,
  superFn: () => Promise<unknown>,
): Promise<unknown> {
  if ((this.recordTimestamps ?? this.constructor.recordTimestamps) !== false) {
    const currentTime = this.currentTimeFromProperTimezone();

    for (const column of this.allTimestampAttributesInModel()) {
      if (this._readAttribute?.(column) == null) {
        this._writeAttribute?.(column, currentTime);
      }
    }
  }

  return superFn();
}

/** @internal */
export async function _updateRecord(
  this: TimestampInstanceHost,
  superFn: () => Promise<unknown>,
): Promise<unknown> {
  await recordUpdateTimestamps.call(this);

  return superFn();
}

/** @internal */
export function createOrUpdate(
  this: TimestampInstanceHost,
  touch = true,
  superFn: () => Promise<boolean>,
): Promise<boolean> {
  this._touchRecord = touch;
  return superFn();
}

/** @internal */
export async function recordUpdateTimestamps<T>(
  this: TimestampInstanceHost,
  block?: () => Promise<T>,
): Promise<T | undefined> {
  if (this._touchRecord && shouldRecordTimestamps.call(this)) {
    const currentTime = this.currentTimeFromProperTimezone();
    for (const column of this.timestampAttributesForUpdateInModel()) {
      if (!this.isWillSaveChangeToAttribute?.(column)) {
        this._writeAttribute?.(column, currentTime);
      }
    }
  }

  return block?.();
}

/** @internal */
export function shouldRecordTimestamps(this: TimestampInstanceHost): boolean {
  const recordTs = this.recordTimestamps ?? this.constructor.recordTimestamps;
  return (
    recordTs !== false && (!this.constructor.partialUpdates || this.hasChangesToSave !== false)
  );
}

/** @internal */
export function maxUpdatedColumnTimestamp(this: TimestampInstanceHost): RubyTime | null {
  const attrs = this.timestampAttributesForUpdateInModel();
  let max: RubyTime | null = null;
  for (const attr of attrs) {
    const v = this.readAttribute?.(attr);
    if (v == null) continue;
    const inst: RubyTime =
      v instanceof RubyTime
        ? v
        : RubyTime.at(
            new Rational(Temporal.Instant.from(String(v)).epochNanoseconds, 1_000_000_000n),
          );
    if (max === null || inst.toR().cmp(max.toR()) > 0) max = inst;
  }
  return max;
}

/** @internal */
export function clearTimestampAttributes(this: TimestampInstanceHost): void {
  for (const attributeName of this.allTimestampAttributesInModel()) {
    (this as unknown as Record<string, unknown>)[attributeName] = null;
    this.clearAttributeChange?.(attributeName);
  }
}

/** @noRailsEquivalent PERMANENT */
export const InstanceMethods = {
  recordUpdateTimestamps,
  shouldRecordTimestamps,
  timestampAttributesForCreateInModel(this: { constructor: TimestampHost }): string[] {
    return this.constructor.timestampAttributesForCreateInModel();
  },
  timestampAttributesForUpdateInModel(this: { constructor: TimestampHost }): string[] {
    return this.constructor.timestampAttributesForUpdateInModel();
  },
  allTimestampAttributesInModel(this: { constructor: TimestampHost }): string[] {
    return this.constructor.allTimestampAttributesInModel();
  },
  currentTimeFromProperTimezone(this: { constructor: TimestampHost }): RubyTime {
    return this.constructor.currentTimeFromProperTimezone();
  },
  maxUpdatedColumnTimestamp,
  clearTimestampAttributes,
};
