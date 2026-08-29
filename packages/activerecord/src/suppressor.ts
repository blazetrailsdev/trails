import { IsolatedExecutionState } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

const SUPPRESSOR_REGISTRY_KEY = Symbol.for("ar_suppressor_registry");

export function registry(): Record<string, true | undefined> {
  return IsolatedExecutionState.fetch(
    SUPPRESSOR_REGISTRY_KEY,
    () => Object.create(null) as Record<string, true | undefined>,
  );
}

export async function suppress<R>(modelClass: typeof Base, fn: () => R | Promise<R>): Promise<R> {
  const name = modelClass.name;
  if (!name) {
    return await fn();
  }
  const parent = registry();
  const child: Record<string, true | undefined> = Object.create(null);
  Object.assign(child, parent);
  child[name] = true;
  return await IsolatedExecutionState.scope(SUPPRESSOR_REGISTRY_KEY, child, fn);
}

export function isSuppressed(modelClass: typeof Base): boolean {
  return !!registry()[modelClass.name];
}
