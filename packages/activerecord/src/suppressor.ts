import { IsolatedExecutionState } from "@blazetrails/activesupport";
import type { Base } from "./base.js";

const SUPPRESSOR_REGISTRY_KEY = Symbol.for("ar_suppressor_registry");

export function registry(): Record<string, true | undefined> {
  return (
    IsolatedExecutionState.get<Record<string, true | undefined>>(SUPPRESSOR_REGISTRY_KEY) ??
    IsolatedExecutionState.set(
      SUPPRESSOR_REGISTRY_KEY,
      Object.create(null) as Record<string, true | undefined>,
    )
  );
}

export async function suppress<R>(modelClass: typeof Base, fn: () => R | Promise<R>): Promise<R> {
  const name = modelClass.name;
  const previousState = registry()[name];
  registry()[name] = true;
  try {
    return await fn();
  } finally {
    registry()[name] = previousState;
  }
}

export async function save<T>(this: Base, superFn: () => Promise<T>): Promise<T | true> {
  return registry()[this.constructor.name] ? true : superFn();
}

export async function saveBang<T>(this: Base, superFn: () => Promise<T>): Promise<T | true> {
  return registry()[this.constructor.name] ? true : superFn();
}
