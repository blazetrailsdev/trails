import { defineModule, slice } from "@blazetrails/activesupport";
import { except as exceptValues } from "@blazetrails/ruby-compat";
import { Merger, HashMerger } from "./merger.js";
import { argumentError, setValues } from "./query-methods.js";
import type { ExceptSkip } from "./query-methods.js";

interface SpawnRelation<T = unknown> {
  clone(): T;
  isAlreadyInScope(registry: unknown): boolean;
  values(): Record<string, unknown>;
  /** @internal */
  relationWith(values: Record<string, unknown>): T;
  _model: { all(): T; scopeRegistry(): unknown };
}

export function performSpawn<T extends SpawnRelation<T>>(this: T): T {
  return this.isAlreadyInScope(this._model.scopeRegistry()) ? this._model.all() : this.clone();
}

export function performMerge<T extends SpawnRelation<T>>(this: T, other: any): T {
  if (Array.isArray(other)) {
    return recordsIntersection(this, other) as unknown as T;
  }
  if (other === null || other === undefined || other === false) {
    throw argumentError(`invalid argument: ${other === false ? "false" : "nil"}.`);
  }
  return (this as any).spawn().mergeBang(other) as T;
}

async function recordsIntersection(rel: any, other: readonly unknown[]): Promise<unknown[]> {
  const records: any[] = await rel.toArray();
  const eq = (a: any, o: unknown): boolean =>
    typeof a?.equals === "function" ? a.equals(o) : a === o;
  const result: unknown[] = [];
  for (const r of records) {
    if (!other.some((o) => eq(r, o))) continue;
    if (result.some((seen) => eq(r, seen))) continue;
    result.push(r);
  }
  return result;
}

export function mergeBang(this: any, other: any): any {
  if (other && typeof other === "object" && "whereClause" in other) {
    return new Merger(this, other).merge();
  }
  if (other && typeof other === "object" && !Array.isArray(other)) {
    return new HashMerger(this, other).merge();
  }
  if (typeof other === "function") {
    return other.call(this);
  }
  throw argumentError(`${String(other)} is not an ActiveRecord::Relation`);
}

export function except<T extends SpawnRelation<T>>(this: T, ...skips: Array<ExceptSkip>): T {
  return this.relationWith(exceptValues(this.values(), ...skips));
}

export function only<T extends SpawnRelation<T>>(this: T, ...onlies: Array<ExceptSkip>): T {
  return this.relationWith(slice(this.values(), ...onlies));
}

/** @internal */
export const SpawnMethodsPublicInstanceMethods = {
  spawn: performSpawn,
  merge: performMerge,
  mergeBang,
  except,
  only,
} as const;

/** @internal */
export const SpawnMethodsPrivateInstanceMethods = {
  relationWith,
} as const;

export const SpawnMethods = defineModule(
  SpawnMethodsPublicInstanceMethods,
  undefined,
  SpawnMethodsPrivateInstanceMethods,
);

/** @internal */
export function relationWith<T extends SpawnRelation<T>>(
  this: T,
  values: Record<string, unknown>,
): T {
  const result = (this as any).spawn();
  setValues(result, values);
  return result;
}
