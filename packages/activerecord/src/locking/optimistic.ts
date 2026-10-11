import { DelegateClass, type Hash, merge, Module, rtest, union } from "@blazetrails/ruby-compat";
import { classAttribute, included } from "@blazetrails/activesupport";
import type { Base } from "../base.js";
import { StaleObjectError } from "../errors.js";
import { ValueType } from "@blazetrails/activemodel";
import { isWillSaveChangeToAttribute } from "../attribute-methods/dirty.js";
import type { incrementBang as persistenceIncrementBang } from "../persistence.js";
import { attributesWithValues } from "../attribute-methods.js";
import type { CounterCacheCounters } from "../counter-cache.js";
import { Locking } from "../namespaces.js";

export class LockingType extends DelegateClass(ValueType) {
  constructor(subtype: ValueType) {
    if (subtype instanceof LockingType) return subtype;
    super(subtype);
  }

  override deserialize(value: unknown): number {
    return toInt(super.deserialize(value));
  }

  override serialize(value: unknown): number {
    return toInt(super.serialize(value));
  }

  initWith(coder: Record<string, unknown>): void {
    this.__setobj__(coder["subtype"]);
  }

  encodeWith(coder: Record<string, unknown>): void {
    coder["subtype"] = this.__getobj__();
  }
}

function toInt(value: unknown): number {
  if (value === null || value === undefined) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? Math.trunc(n) : 0;
}

const DEFAULT_LOCKING_COLUMN = "lock_version";

export interface Optimistic {
  readonly lockOptimistically: boolean;
}

export const Optimistic = Object.assign(new Module(), {
  [included](base: object): void {
    classAttribute.call(base, "lockOptimistically", { instanceWriter: false, default: true });
  },
});

interface LockingRecord {
  constructor: { lockingEnabled: boolean; lockingColumn: string };
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
  clearAttributeChange(name: string): void;
}

export function lockingEnabled(this: LockingRecord): boolean {
  return this.constructor.lockingEnabled;
}

interface LockingHost {
  lockingColumn: string;
  lockOptimistically?: boolean;
  _updateRecord?(
    values: Hash<string, unknown>,
    constraints: Record<string, unknown>,
  ): Promise<number>;
}

export async function incrementBang(
  this: LockingRecord & { lockingEnabled(): boolean },
  ...args: Parameters<typeof persistenceIncrementBang>
): Promise<unknown> {
  const result = await Optimistic.superMethod(this, "incrementBang")!(...args);
  if (this.lockingEnabled()) {
    const lockingColumn = this.constructor.lockingColumn;
    this.writeAttribute(lockingColumn, Number(this.readAttribute(lockingColumn)) + 1);
    this.clearAttributeChange(lockingColumn);
  }
  return result;
}

export function resetLockingColumn(this: LockingHost): void {
  (this as unknown as typeof Base).lockingColumn = DEFAULT_LOCKING_COLUMN;
}

export class ClassMethods {
  static get lockingColumn(): string {
    return Object.hasOwn(this, "_lockingColumn")
      ? (this as any)._lockingColumn
      : DEFAULT_LOCKING_COLUMN;
  }

  static set lockingColumn(column: string) {
    (this as any).reloadSchemaFromCache();
    (this as any)._lockingColumn = column == null ? "" : String(column);
  }

  static get lockingEnabled(): boolean {
    const self = this as unknown as typeof Base;
    return self.lockOptimistically && self.columnsHash()[self.lockingColumn] != null;
  }
}

export async function updateCounters(
  this: typeof Base,
  superFn: (id: unknown, counters: CounterCacheCounters) => Promise<number>,
  id: unknown,
  counters: CounterCacheCounters,
): Promise<number> {
  if (this.lockingEnabled) {
    counters = { ...counters, [this.lockingColumn]: 1 };
  }
  return superFn.call(this, id, counters);
}

type InstanceLockingHost = {
  constructor: typeof Base & LockingHost;
  _attributes: {
    getAttribute(name: string): {
      value: unknown;
      valueBeforeTypeCast: unknown;
      type: unknown;
      valueForDatabase: unknown;
      originalValueForDatabase(): unknown;
    };
    set(name: string, attribute: unknown): void;
  };
  readAttribute(name: string): unknown;
  writeAttribute(name: string, value: unknown): void;
  clearAttributeChange(name: string): void;
  changes: Record<string, [unknown, unknown]>;
};

/** @internal */
export function _createRecord(
  this: InstanceLockingHost,
  attributeNames: string[],
  superFn: (names: string[]) => unknown,
): unknown {
  const ctor = this.constructor;
  if (ctor.lockingEnabled) {
    attributeNames = union(attributeNames, [ctor.lockingColumn]);
  }
  return superFn(attributeNames);
}

/** @internal */
export function _touchRow(
  this: InstanceLockingHost,
  touchAttrNames: string[],
  time: unknown,
  superFn: (names: string[], time: unknown) => unknown,
): unknown {
  const ctor = this.constructor;
  if (ctor.lockingEnabled) {
    (this as unknown as { _touchAttrNames: Set<string> })._touchAttrNames.add(ctor.lockingColumn);
  }
  return superFn(touchAttrNames, time);
}

/** @internal */
export async function _updateRow(
  this: InstanceLockingHost,
  attributeNames: string[],
  attemptedAction: string,
  superFn: (names: string[], action: string) => Promise<number>,
): Promise<number> {
  const ctor = this.constructor;
  if (!ctor.lockingEnabled) return superFn(attributeNames, attemptedAction);

  const lockingColumn = ctor.lockingColumn;
  const lockAttributeWas = this._attributes.getAttribute(lockingColumn);
  try {
    const updateConstraints = (this as any)._queryConstraintsHash();

    if (Object.isFrozen(attributeNames)) attributeNames = [...attributeNames];
    attributeNames.push(lockingColumn);

    this.writeAttribute(lockingColumn, (Number(this.readAttribute(lockingColumn)) || 0) + 1);

    const affectedRows = await (ctor as any)._updateRecord(
      attributesWithValues.call(this as any, attributeNames),
      updateConstraints,
    );

    if (affectedRows !== 1) throw new StaleObjectError(this, attemptedAction);

    return affectedRows;
  } catch (e) {
    this._attributes.set(lockingColumn, lockAttributeWas);
    throw e;
  }
}

/** @internal */
export async function destroyRow(
  this: InstanceLockingHost,
  superFn: () => number | Promise<number>,
): Promise<number> {
  const affectedRows = await superFn();
  if (this.constructor.lockingEnabled && affectedRows !== 1) {
    throw new StaleObjectError(this, "destroy");
  }
  return affectedRows;
}

/** @internal */
export function _lockValueForDatabase(this: InstanceLockingHost, lockingColumn: string): unknown {
  if (isWillSaveChangeToAttribute(this as any, lockingColumn)) {
    return this._attributes.getAttribute(lockingColumn).valueForDatabase;
  }
  return this._attributes.getAttribute(lockingColumn).originalValueForDatabase();
}

/** @internal */
export function _clearLockingColumn(this: InstanceLockingHost): void {
  const ctor = this.constructor;
  const lockingColumn = ctor.lockingColumn;
  this.writeAttribute(lockingColumn, null);
  this.clearAttributeChange(lockingColumn);
}

export function initializeDup(this: InstanceLockingHost, other: unknown): void {
  Optimistic.superMethod(this, "initializeDup")!(other);
  if (this.constructor.lockingEnabled) _clearLockingColumn.call(this);
}

Optimistic.defineMethod("lockingEnabled", lockingEnabled);
Optimistic.defineMethod("incrementBang", incrementBang);
Optimistic.defineMethod("_lockValueForDatabase", _lockValueForDatabase);
Optimistic.defineMethod("_clearLockingColumn", _clearLockingColumn);
Optimistic.defineMethod("initializeDup", initializeDup);

/** @internal */
export function _queryConstraintsHash(
  this: InstanceLockingHost,
  superFn: () => Record<string, unknown>,
): Record<string, unknown> {
  if (!this.constructor.lockingEnabled) return superFn();

  const lockingColumn = this.constructor.lockingColumn;
  return merge(superFn(), { [lockingColumn]: _lockValueForDatabase.call(this, lockingColumn) });
}

/** @internal */
export function hookAttributeType(
  this: LockingHost,
  superFn: (name: string, castType: ValueType) => ValueType,
  name: string,
  castType: ValueType,
): ValueType {
  if (rtest(this.lockOptimistically) && name === this.lockingColumn) {
    castType = new LockingType(castType);
  }

  return superFn(name, castType);
}

Locking.Optimistic = Optimistic;
