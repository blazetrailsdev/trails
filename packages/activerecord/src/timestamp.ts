import { Time as RubyTime } from "@blazetrails/date";
import { include, Module, Rational, max } from "@blazetrails/ruby-compat";
import {
  classAttribute,
  currentTimeInstant,
  filterMap,
  included,
  indexWith,
} from "@blazetrails/activesupport";
import { reloadSchemaFromCache as attributesReloadSchemaFromCache } from "./attributes.js";

export interface TouchOptions {
  time?: RubyTime | null;
}

export type TouchArgs = string[] | [...names: string[], options: TouchOptions];

const CREATED_ATTRS = ["created_at", "created_on"];
const UPDATED_ATTRS = ["updated_at", "updated_on"];

export interface TimestampHost {
  attributeAliases?: Record<string, string>;
  columnNames(): readonly string[];
  _timestampAttributesForCreateInModel?: readonly string[];
  _timestampAttributesForUpdateInModel?: readonly string[];
  _allTimestampAttributesInModel?: readonly string[];
  timestampAttributesForCreate(): string[];
  timestampAttributesForUpdate(): string[];
  timestampAttributesForCreateInModel(): readonly string[];
  timestampAttributesForUpdateInModel(): readonly string[];
  allTimestampAttributesInModel(): readonly string[];
  currentTimeFromProperTimezone(): Promise<RubyTime>;
  withConnection<T>(fn: (c: { defaultTimezone: string }) => T): Promise<T>;
}

interface TimestampInstanceHost {
  _touchRecord: boolean | null;
  readAttribute(name: string): unknown;
  _readAttribute?(name: string): unknown;
  _writeAttribute?(name: string, val: unknown): void;
  isWillSaveChangeToAttribute?(name: string): boolean;
  clearAttributeChange?(name: string): void;
  hasChangesToSave?: boolean;
  id?: unknown;
  recordTimestamps: boolean;
  timestampAttributesForUpdateInModel(): readonly string[];
  allTimestampAttributesInModel(): readonly string[];
  currentTimeFromProperTimezone(): Promise<RubyTime>;
  constructor: TimestampHost & { recordTimestamps: boolean; partialUpdates?: boolean };
}

export type TouchAllOptions = { time?: RubyTime };

export type TouchAllArgs = string[] | [...names: string[], options: TouchAllOptions];

export async function touchAttributesWithTime(
  this: TimestampHost,
  ...args: [...names: string[], time: RubyTime | undefined]
): Promise<Record<string, RubyTime>> {
  let names = args.slice(0, -1) as string[];
  const time = args[args.length - 1] as RubyTime | undefined;
  names = names.map((name) => this.attributeAliases?.[name] ?? name);
  let attributeNames = this.timestampAttributesForUpdateInModel();
  attributeNames = [...new Set([...attributeNames, ...names])];
  return Object.fromEntries(
    indexWith(attributeNames, time ?? (await this.currentTimeFromProperTimezone())),
  );
}

export type CounterCacheTouchOption =
  | boolean
  | string
  | Array<string | { time?: RubyTime }>
  | { time?: RubyTime };

export function timestampAttributesForCreateInModel(this: TimestampHost): readonly string[] {
  return (this._timestampAttributesForCreateInModel ??= Object.freeze(
    this.timestampAttributesForCreate().filter((name) => this.columnNames().includes(name)),
  ));
}

export function timestampAttributesForUpdateInModel(this: TimestampHost): readonly string[] {
  return (this._timestampAttributesForUpdateInModel ??= Object.freeze(
    this.timestampAttributesForUpdate().filter((name) => this.columnNames().includes(name)),
  ));
}

export function allTimestampAttributesInModel(this: TimestampHost): readonly string[] {
  return (this._allTimestampAttributesInModel ??= Object.freeze([
    ...this.timestampAttributesForCreateInModel(),
    ...this.timestampAttributesForUpdateInModel(),
  ]));
}

export function currentTimeFromProperTimezone(this: TimestampHost): Promise<RubyTime> {
  return this.withConnection((c) => {
    const now = RubyTime.at(new Rational(currentTimeInstant().epochNanoseconds, 1_000_000_000n));
    return c.defaultTimezone === "utc" ? now.getutc() : now.getlocal();
  });
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
export function initInternals(this: TimestampInstanceHost): void {
  SuperMethods.superMethod(this, "initInternals")!();
  this._touchRecord = null;
}

export function initializeDup(this: TimestampInstanceHost, other: unknown): void {
  SuperMethods.superMethod(this, "initializeDup")!(other);
  clearTimestampAttributes.call(this);
}

/** @internal */
export async function _createRecord(
  this: TimestampInstanceHost,
  superFn: () => Promise<unknown>,
): Promise<unknown> {
  if (this.recordTimestamps) {
    const currentTime = await this.currentTimeFromProperTimezone();

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
    const currentTime = await this.currentTimeFromProperTimezone();

    for (const column of this.timestampAttributesForUpdateInModel()) {
      if (this.isWillSaveChangeToAttribute?.(column)) continue;
      this._writeAttribute?.(column, currentTime);
    }
  }

  if (block) return block();
}

/** @internal */
export function shouldRecordTimestamps(this: TimestampInstanceHost): boolean {
  return (
    this.recordTimestamps && (!this.constructor.partialUpdates || this.hasChangesToSave !== false)
  );
}

/** @internal */
export function maxUpdatedColumnTimestamp(this: TimestampInstanceHost): RubyTime | null {
  return max(
    filterMap(this.timestampAttributesForUpdateInModel(), (attr) => {
      const v = this.readAttribute(attr) as RubyTime | { toTime(): RubyTime } | null | false;
      return v != null && v !== false && (v instanceof RubyTime ? v : v.toTime());
    }),
  );
}

/** @internal */
export function clearTimestampAttributes(this: TimestampInstanceHost): void {
  for (const attributeName of this.allTimestampAttributesInModel()) {
    (this as unknown as Record<string, unknown>)[attributeName] = null;
    this.clearAttributeChange?.(attributeName);
  }
}

const SuperMethods = new Module((mod) => {
  mod.defineMethod("initInternals", initInternals);
  mod.defineMethod("initializeDup", initializeDup);
});

export const Timestamp = {
  [included](base: object): void {
    include(base as new () => object, SuperMethods);
    classAttribute.call(base, "recordTimestamps", { default: true });
  },
  recordUpdateTimestamps,
  shouldRecordTimestamps,
  timestampAttributesForCreateInModel(this: { constructor: TimestampHost }): readonly string[] {
    return this.constructor.timestampAttributesForCreateInModel();
  },
  timestampAttributesForUpdateInModel(this: { constructor: TimestampHost }): readonly string[] {
    return this.constructor.timestampAttributesForUpdateInModel();
  },
  allTimestampAttributesInModel(this: { constructor: TimestampHost }): readonly string[] {
    return this.constructor.allTimestampAttributesInModel();
  },
  currentTimeFromProperTimezone(this: { constructor: TimestampHost }): Promise<RubyTime> {
    return this.constructor.currentTimeFromProperTimezone();
  },
  maxUpdatedColumnTimestamp,
  clearTimestampAttributes,
};
