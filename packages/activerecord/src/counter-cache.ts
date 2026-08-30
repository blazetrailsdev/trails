import type { Base } from "./base.js";
import { ArgumentError } from "@blazetrails/activemodel";
import { Nodes, sql as arelSql } from "@blazetrails/arel";
import { pendingCounterCacheColumns } from "./counter-cache-state.js";
import { registerLoadSchemaOverride } from "./load-schema-overrides-slot.js";
import {
  touchAttributesWithTime,
  parseCounterCacheTouch,
  type CounterCacheTouchOption,
} from "./timestamp.js";

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
  const relation = this.unscoped().where(buildPkPredicate(this, id));
  return relation.updateCounters(counters);
}

export type CounterCacheCounters = Record<string, number | CounterCacheTouchOption | undefined>;

function buildPkPredicate(
  modelClass: typeof Base,
  id: unknown | unknown[],
): InstanceType<typeof Nodes.Node> {
  const table = modelClass.arelTable;
  const pk = modelClass.primaryKey;

  if (Array.isArray(pk)) {
    if (!Array.isArray(id)) return arelSql("1=0");
    const ids = id as unknown[];
    if (ids.length === 0) return arelSql("1=0");
    const tuples = Array.isArray(ids[0]) ? (ids as unknown[][]) : [ids];
    const groupings: InstanceType<typeof Nodes.Node>[] = [];
    for (const tuple of tuples) {
      if (!Array.isArray(tuple) || tuple.length !== pk.length) return arelSql("1=0");
      const conditions = pk.map((col, i) =>
        tuple[i] === null || tuple[i] === undefined
          ? table.get(col).eq(null)
          : table.get(col).eq(tuple[i]),
      );
      groupings.push(new Nodes.Grouping(new Nodes.And(conditions)));
    }
    if (groupings.length === 1) return groupings[0];
    return new Nodes.Grouping(groupings.reduce((left, right) => new Nodes.Or([left, right])));
  }

  const attr = table.get(pk);
  if (Array.isArray(id)) {
    if (id.length === 0) return arelSql("1=0");
    if (id.some((value) => value === null || value === undefined)) return arelSql("1=0");
    return attr.in(id);
  }
  if (id === null || id === undefined) return arelSql("1=0");
  return attr.eq(id);
}

type ResetCountersOptions = { touch?: CounterCacheTouchOption };

export async function resetCounters(
  this: typeof Base,
  id: unknown,
  ...args: [...counterNames: string[], options: ResetCountersOptions] | [...counterNames: string[]]
): Promise<void> {
  let options: ResetCountersOptions = {};
  const counterNames: string[] = [];
  for (const arg of args) {
    if (typeof arg === "string") {
      counterNames.push(arg);
    } else {
      options = arg;
    }
  }

  const object = await this.find(id);
  const { association } = await import("./associations.js");
  const { reflectOnAllAssociations } = await import("./reflection.js");

  const updates: Record<string, unknown> = {};
  for (const counter of counterNames) {
    let counterAssociation = counter;
    let hasManyAssociation: any = (this as any)._reflectOnAssociation?.(counterAssociation) ?? null;
    if (!hasManyAssociation) {
      const hasMany = reflectOnAllAssociations(this, "hasMany");
      hasManyAssociation =
        hasMany.find(
          (association: any) =>
            association.counterCacheColumn() &&
            association.counterCacheColumn() === counterAssociation,
        ) ?? null;
      if (hasManyAssociation) counterAssociation = hasManyAssociation.pluralName;
    }
    if (!hasManyAssociation) {
      throw new ArgumentError(`'${this.name}' has no association called '${counterAssociation}'`);
    }

    const countReflection = hasManyAssociation;
    if (hasManyAssociation.isThroughReflection?.()) {
      hasManyAssociation = hasManyAssociation.throughReflection;
    }

    const foreignKey = String(hasManyAssociation.foreignKey);
    const childClass = hasManyAssociation.klass;
    const reflection = reflectOnAllAssociations(childClass, "belongsTo").find(
      (e: any) => String(e.foreignKey) === foreignKey && !!e.options?.counterCache,
    ) as any;
    const counterName = reflection.counterCacheColumn();

    const count = (await association(object, countReflection.name).count("all")) as number;
    const countWas = (object as any).readAttribute?.(counterName) ?? (object as any)[counterName];
    const sameCount =
      typeof countWas === "bigint" ? countWas === BigInt(count) : count === countWas;
    if (!sameCount) {
      updates[counterName] = typeof countWas === "bigint" ? BigInt(count) : count;
    }
  }

  if (options.touch) {
    const { names, time } = parseCounterCacheTouch(options.touch);
    const touchUpdates = touchAttributesWithTime.call(this, ...names, time);
    Object.assign(updates, touchUpdates);
  }

  if (Object.keys(updates).length > 0) {
    await this.unscoped().where(buildPkPredicate(this, object.id)).updateAll(updates);
  }
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

/** @noRailsEquivalent PERMANENT */
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
        foreignKey: unknown;
      } | null;
      if (
        !destroyedByAssociation ||
        !_foreignKeysEqual(destroyedByAssociation.foreignKey, association.reflection.foreignKey)
      ) {
        await association.decrementCounters();
      }
    }
  }
  return affectedRows;
}

/** @internal */
export function _foreignKeysEqual(fkey1: unknown, fkey2: unknown): boolean {
  if (fkey1 === fkey2) return true;
  const arr1 = (Array.isArray(fkey1) ? fkey1 : [fkey1]).map((k) =>
    typeof k === "string" ? k : String(k),
  );
  const arr2 = (Array.isArray(fkey2) ? fkey2 : [fkey2]).map((k) =>
    typeof k === "string" ? k : String(k),
  );
  return arr1.length === arr2.length && arr1.every((k, i) => k === arr2[i]);
}

registerLoadSchemaOverride(309, loadSchemaBang as never);
