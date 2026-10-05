import type { Base } from "./base.js";
import { ArgumentError } from "@blazetrails/activemodel";
import {
  classAttribute,
  extractOptionsBang,
  included,
  isPresent,
  kernelArray,
  wrap,
} from "@blazetrails/activesupport";
import { rbEqual, rbFSend, rtest, toSym } from "@blazetrails/ruby-compat";
import { ThroughReflection } from "./reflection.js";
import { pendingCounterCacheColumns } from "./counter-cache-state.js";
import { type CounterCacheTouchOption, type TouchAllOptions } from "./timestamp.js";

export const CounterCache = {
  [included](base: object): void {
    classAttribute.call(base, "_counterCacheColumns", { instanceAccessor: false, default: [] });
    classAttribute.call(base, "counterCachedAssociationNames", {
      instanceWriter: false,
      default: [],
    });
  },
};

export async function incrementCounter(
  this: typeof Base,
  counterName: string,
  id: unknown,
  { by = 1, touch }: { by?: number; touch?: CounterCacheTouchOption } = {},
): Promise<number> {
  return this.updateCounters(id, { [counterName]: by, touch });
}

export async function decrementCounter(
  this: typeof Base,
  counterName: string,
  id: unknown,
  { by = 1, touch }: { by?: number; touch?: CounterCacheTouchOption } = {},
): Promise<number> {
  return this.updateCounters(id, { [counterName]: -by, touch });
}

export async function updateCounters(
  this: typeof Base,
  id: unknown | unknown[],
  counters: CounterCacheCounters,
): Promise<number> {
  if (this.compositePrimaryKey && Array.isArray(id) && !Array.isArray(id[0])) id = [id];
  return this.unscoped()
    .whereBang(new Map([[this.primaryKey, id]]))
    .updateCounters(counters);
}

export type CounterCacheCounters = Record<string, number | CounterCacheTouchOption | undefined>;

export async function resetCounters(
  this: typeof Base,
  id: unknown,
  ...counters: [...counters: string[], options: { touch?: CounterCacheTouchOption }] | string[]
): Promise<true> {
  const { touch = null } = extractOptionsBang(counters) as { touch?: CounterCacheTouchOption };
  const object = await this.find(id);

  const updates: Record<string, unknown> = {};
  for (let counterAssociation of counters as string[]) {
    let hasManyAssociation: any = this._reflectOnAssociation(counterAssociation);
    if (!rtest(hasManyAssociation)) {
      const hasMany = this.reflectOnAllAssociations("hasMany");
      hasManyAssociation = hasMany.find(
        (association) =>
          rtest(association.counterCacheColumn()) &&
          toSym(association.counterCacheColumn()) === toSym(counterAssociation),
      );
      if (rtest(hasManyAssociation)) counterAssociation = hasManyAssociation.pluralName;
    }
    if (!rtest(hasManyAssociation)) {
      throw new ArgumentError(`'${this.name}' has no association called '${counterAssociation}'`);
    }

    if (hasManyAssociation instanceof ThroughReflection) {
      hasManyAssociation = hasManyAssociation.throughReflection;
    }

    const foreignKey = String(hasManyAssociation.foreignKey());
    const childClass = hasManyAssociation.klass as typeof Base;
    const reflection = Object.values(childClass._reflections).find(
      (e) =>
        e.isBelongsTo() &&
        String(e.foreignKey()) === foreignKey &&
        isPresent(e.options.counterCache),
    )!;
    const counterName = reflection.counterCacheColumn()!;

    const countWas = rbFSend(object, counterName);
    const count = await (rbFSend(object, counterAssociation) as any).count(":all");
    if (!rbEqual(count, countWas)) updates[counterName] = count;
  }

  if (rtest(touch)) {
    let names: unknown;
    if (touch !== true) names = touch;
    names = wrap(names);
    const options = extractOptionsBang(names as unknown[]) as TouchAllOptions;
    const touchUpdates = this.touchAttributesWithTime(...(names as string[]), options.time);
    Object.assign(updates, touchUpdates);
  }

  if (Object.keys(updates).length > 0) {
    await this.unscoped()
      .where(new Map([[this.primaryKey, [object.id]]]))
      .updateAll(updates);
  }

  return true;
}

export function isCounterCacheColumn(this: typeof Base, name: string): boolean {
  return this._counterCacheColumns.includes(name);
}

export function loadSchemaBang(this: typeof Base, superFn: () => void): void {
  superFn();

  const associationNames: string[] = [];
  for (const [name, reflection] of Object.entries(this._reflections)) {
    if (!reflection.belongsTo?.() || !reflection.counterCacheColumn?.()) continue;
    associationNames.push(name);
  }
  let names = this.counterCachedAssociationNames;
  for (const name of associationNames) {
    if (!names.includes(name)) names = [...names, name];
  }
  this.counterCachedAssociationNames = names;
}

/** @noRailsEquivalent CONVERGEABLE eliminate-pending-counter-cache-deferral-via-lazy-target-resolution */
export function flushPendingCounterCacheColumns(modelClass: typeof Base, key: string): void {
  for (const cacheColumn of pendingCounterCacheColumns.get(key) ?? []) {
    const column = cacheColumn();
    if (!modelClass._counterCacheColumns.includes(column)) {
      modelClass._counterCacheColumns = [...modelClass._counterCacheColumns, column];
    }
  }
}

export const ClassMethods = {
  incrementCounter,
  decrementCounter,
  updateCounters,
  resetCounters,
  isCounterCacheColumn,
};

type InstanceCounterHost = {
  constructor: typeof Base;
  destroyedByAssociation: unknown;
  association(name: string): any;
  attributeNames(): string[];
};

/** @internal */
export async function _createRecord(
  this: InstanceCounterHost,
  attributeNames: string[] | undefined,
  superFn: (attributeNames: string[]) => Promise<unknown>,
): Promise<unknown> {
  attributeNames ??= this.attributeNames();
  const id = await superFn(attributeNames);
  for (const associationName of this.constructor.counterCachedAssociationNames) {
    await this.association(associationName).incrementCounters();
  }
  return id;
}

/** @internal */
export async function destroyRow(
  this: InstanceCounterHost,
  superFn: () => Promise<number>,
): Promise<number> {
  const affectedRows = await superFn();
  if (affectedRows > 0) {
    for (const associationName of this.constructor.counterCachedAssociationNames) {
      const association = this.association(associationName);
      const destroyedByAssociation = this.destroyedByAssociation as {
        foreignKey: () => unknown;
      } | null;
      if (
        !destroyedByAssociation ||
        !_foreignKeysEqual(destroyedByAssociation.foreignKey(), association.reflection.foreignKey())
      ) {
        await association.decrementCounters();
      }
    }
  }
  return affectedRows;
}

/** @internal */
export function _foreignKeysEqual(fkey1: unknown, fkey2: unknown): boolean {
  return (
    rbEqual(fkey1, fkey2) || rbEqual(kernelArray(fkey1).map(toSym), kernelArray(fkey2).map(toSym))
  );
}
