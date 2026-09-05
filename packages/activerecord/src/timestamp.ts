import { Temporal, Time as RubyTime } from "@blazetrails/date";
import { Rational } from "@blazetrails/ruby-compat";
import { currentTimeInstant } from "@blazetrails/activesupport";
import type { Base } from "./base.js";
import { ActiveRecordError, ReadOnlyRecord, StaleObjectError } from "./errors.js";
import { UpdateManager, Nodes } from "@blazetrails/arel";
import { isAppliedTo as isNoTouchingApplied } from "./no-touching.js";
import { runCallbacks } from "@blazetrails/activesupport";
import { withTransactionReturningStatus } from "./transactions.js";
import { reloadSchemaFromCache as attributesReloadSchemaFromCache } from "./attributes.js";
import { isUtc } from "./type/internal/timezone.js";

export interface TouchOptions {
  time?: Date | RubyTime | null;
}

export type TouchArgs = string[] | [...names: string[], options: TouchOptions];

export async function touch(this: Base, ...args: TouchArgs): Promise<boolean> {
  const ctor = this.constructor as typeof Base;
  if (isNoTouchingApplied(ctor)) return false;

  if (!this.isPersisted()) raiseRecordNotTouchedError();
  if (this.isReadonly()) {
    throw new ReadOnlyRecord(`${this.constructor.name} is marked as readonly`);
  }

  const { names, time: t } = parseTouchArgs(args);
  const now =
    t == null
      ? currentTimeFromProperTimezone()
      : t instanceof RubyTime
        ? t
        : RubyTime.at(new Rational(t.getTime(), 1000)); // boundary: accepts JS Date from touch(time:) callers
  const aliases: Record<string, string> = (ctor as any).attributeAliases ?? {};
  const resolvedNames = names.map((name) => aliases[name] ?? name);

  const updateTimestampAttrs = timestampAttributesForUpdateInModel.call(
    ctor as unknown as TimestampHost,
  );
  for (const name of new Set([...updateTimestampAttrs, ...resolvedNames])) {
    if (ctor.readonlyAttributeQ(name)) {
      throw new ActiveRecordError(`${name} is marked as readonly`);
    }
  }

  const touchColSet = new Set<string>([...updateTimestampAttrs, ...resolvedNames]);
  const touchCols = Array.from(touchColSet);

  return withTransactionReturningStatus.call(this, async () => {
    return touchRow.call(this, touchCols, now);
  }) as Promise<boolean>;
}

export function parseTouchArgs(args: TouchArgs): {
  names: string[];
  time: Date | RubyTime | null | undefined;
} {
  const last = args[args.length - 1];
  if (last !== undefined && typeof last !== "string") {
    return { names: args.slice(0, -1) as string[], time: last.time };
  }
  return { names: args as string[], time: undefined };
}

function raiseRecordNotTouchedError(): never {
  throw new ActiveRecordError(
    "Cannot touch on a new or destroyed record object. Consider using " +
      "persisted?, new_record?, or destroyed? before touching.",
  );
}

async function touchRow(this: Base, touchCols: string[], now: RubyTime): Promise<boolean> {
  const ctor = this.constructor as typeof Base;

  if (touchCols.length === 0) {
    await runCallbacks(this, "touch");
    return true;
  }

  for (const col of touchCols) {
    this.writeAttribute(col, now);
  }

  const dbValues = (this as any)._attributes.valuesForDatabase();
  const table = ctor.arelTable;
  const setPairs: [InstanceType<typeof Nodes.Node>, unknown][] = touchCols.map((col) => [
    table.get(col) as InstanceType<typeof Nodes.Node>,
    new Nodes.Quoted(dbValues[col]),
  ]);

  const lockCol = ctor.lockingColumn;
  let rawDbVersion: unknown;
  let lockAttributeWas: import("@blazetrails/activemodel").Attribute | null = null;
  if (ctor.lockingEnabled) {
    const rawVersion = this.readAttribute(lockCol);
    rawDbVersion = this.readAttributeBeforeTypeCast(lockCol);
    lockAttributeWas = (this as any)._attributes.getAttribute(lockCol);
    const current = rawVersion == null ? 0 : Number(rawVersion) || 0;
    const next = current + 1;
    setPairs.push([table.get(lockCol) as InstanceType<typeof Nodes.Node>, new Nodes.Quoted(next)]);
    this.writeAttribute(lockCol, next);
  }

  const um = new UpdateManager()
    .table(table)
    .set(setPairs)
    .where((ctor as any)._buildPkWhereNode((this as any).idInDatabase));

  if (ctor.lockingEnabled) {
    if (rawDbVersion == null) {
      um.where(table.get(lockCol).eq(null));
    } else {
      um.where(table.get(lockCol).eq(Number(rawDbVersion) || 0));
    }
  }

  const adapter = ctor.connection as any;
  const affected: number = await adapter.update(um, `${ctor.name} Touch`);
  if (ctor.lockingEnabled && affected === 0) {
    if (lockAttributeWas !== null) {
      (this as any)._attributes.set(lockCol, lockAttributeWas);
    }
    throw new StaleObjectError(this, "touch");
  }

  (this as any)._triggerUpdateCallback = affected === 1;

  const touched = new Set(touchCols);
  if (ctor.lockingEnabled) touched.add(lockCol);

  const self = this as any;
  try {
    if (self._skipDirtyTracking) {
      self.clearAttributeChanges(touched);
    } else {
      const restores: Array<[string, unknown]> = [];
      for (const attrName of self._attributes.keys()) {
        if (touched.has(attrName)) continue;
        if (self.attributeChanged(attrName)) {
          restores.push([attrName, self._readAttribute(attrName)]);
          self._writeAttribute(attrName, self.attributeWas(attrName));
          self.clearAttributeChange(attrName);
        }
      }
      self.changesApplied();
      for (const [attrName, value] of restores) {
        self._writeAttribute(attrName, value);
      }
    }
  } finally {
    self._skipDirtyTracking = null;
  }

  await runCallbacks(this, "touch");
  return true;
}

export async function touchAll(this: typeof Base, ...args: TouchAllArgs): Promise<number> {
  return this.all().touchAll(...args);
}

const CREATED_ATTRS = ["created_at", "created_on"];
const UPDATED_ATTRS = ["updated_at", "updated_on"];

interface TimestampHost {
  attributeAliases?: Record<string, string>;
  columnNames?: string[] | (() => string[]);
  _timestampAttributesForCreateInModel?: string[];
  _timestampAttributesForUpdateInModel?: string[];
  _allTimestampAttributesInModel?: string[];
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
  constructor: TimestampHost & { recordTimestamps: boolean; partialUpdates?: boolean };
}

export type TouchAllOptions = { time?: RubyTime };

export type TouchAllArgs = string[] | [...names: string[], options: TouchAllOptions];

export function parseTouchAllArgs(args: TouchAllArgs): {
  names: string[];
  time: RubyTime | undefined;
} {
  const last = args[args.length - 1];
  if (last !== undefined && typeof last !== "string") {
    return { names: args.slice(0, -1) as string[], time: last.time };
  }
  return { names: args as string[], time: undefined };
}

export function touchAttributesWithTime(
  this: TimestampHost,
  ...args: [...names: string[], time: RubyTime | undefined]
): Record<string, RubyTime> {
  const names = args.slice(0, -1) as string[];
  const time = args[args.length - 1] as RubyTime | undefined;
  const resolvedTime = time ?? currentTimeFromProperTimezone();
  const resolved = names.map((n) => this.attributeAliases?.[n] ?? n);
  const updateAttrs = timestampAttributesForUpdateInModel.call(this);
  const allNames = [...new Set([...updateAttrs, ...resolved])];
  const result: Record<string, RubyTime> = {};
  for (const name of allNames) result[name] = resolvedTime;
  return result;
}

export type CounterCacheTouchOption =
  | boolean
  | string
  | Array<string | { time?: RubyTime }>
  | { time?: RubyTime };

export function parseCounterCacheTouch(touch: CounterCacheTouchOption): {
  names: string[];
  time?: RubyTime;
} {
  const wrapped: Array<string | { time?: RubyTime }> =
    touch === true || touch === false ? [] : Array.isArray(touch) ? touch : [touch];
  const last = wrapped[wrapped.length - 1];
  if (last !== undefined && typeof last === "object") {
    return { names: wrapped.slice(0, -1) as string[], time: last.time };
  }
  return { names: wrapped as string[] };
}

export function timestampAttributesForCreateInModel(this: TimestampHost): string[] {
  if (this._timestampAttributesForCreateInModel) return this._timestampAttributesForCreateInModel;
  const names =
    typeof this.columnNames === "function" ? this.columnNames() : (this.columnNames ?? []);
  const cols = new Set(names);
  this._timestampAttributesForCreateInModel = timestampAttributesForCreate
    .call(this)
    .filter((a) => cols.has(a));
  return this._timestampAttributesForCreateInModel;
}

export function timestampAttributesForUpdateInModel(this: TimestampHost): string[] {
  if (this._timestampAttributesForUpdateInModel) return this._timestampAttributesForUpdateInModel;
  const names =
    typeof this.columnNames === "function" ? this.columnNames() : (this.columnNames ?? []);
  const cols = new Set(names);
  this._timestampAttributesForUpdateInModel = timestampAttributesForUpdate
    .call(this)
    .filter((a) => cols.has(a));
  return this._timestampAttributesForUpdateInModel;
}

export function allTimestampAttributesInModel(this: TimestampHost): string[] {
  if (this._allTimestampAttributesInModel) return this._allTimestampAttributesInModel;
  this._allTimestampAttributesInModel = [
    ...timestampAttributesForCreateInModel.call(this),
    ...timestampAttributesForUpdateInModel.call(this),
  ];
  return this._allTimestampAttributesInModel;
}

export function currentTimeFromProperTimezone(): RubyTime {
  const now = RubyTime.at(new Rational(currentTimeInstant().epochNanoseconds, 1_000_000_000n));
  return isUtc() ? now.getutc() : now.getlocal();
}

/** @internal */
export function reloadSchemaFromCache(this: TimestampHost): void {
  this._timestampAttributesForCreateInModel = undefined;
  this._timestampAttributesForUpdateInModel = undefined;
  this._allTimestampAttributesInModel = undefined;
  attributesReloadSchemaFromCache.call(this);
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
    const currentTime = currentTimeFromProperTimezone();

    for (const column of allTimestampAttributesInModel.call(this.constructor)) {
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
    const currentTime = currentTimeFromProperTimezone();
    for (const column of timestampAttributesForUpdateInModel.call(this.constructor)) {
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
  const attrs = timestampAttributesForUpdateInModel.call(this.constructor);
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
  for (const attributeName of allTimestampAttributesInModel.call(this.constructor)) {
    (this as unknown as Record<string, unknown>)[attributeName] = null;
    this.clearAttributeChange?.(attributeName);
  }
}

export const ClassMethods = {
  touchAll,
};

export const InstanceMethods = {
  touch,
  recordUpdateTimestamps,
  shouldRecordTimestamps,
  timestampAttributesForCreateInModel(this: { constructor: TimestampHost }): string[] {
    return timestampAttributesForCreateInModel.call(this.constructor);
  },
  timestampAttributesForUpdateInModel(this: { constructor: TimestampHost }): string[] {
    return timestampAttributesForUpdateInModel.call(this.constructor);
  },
  allTimestampAttributesInModel(this: { constructor: TimestampHost }): string[] {
    return allTimestampAttributesInModel.call(this.constructor);
  },
  currentTimeFromProperTimezone,
  maxUpdatedColumnTimestamp,
  clearTimestampAttributes,
};
