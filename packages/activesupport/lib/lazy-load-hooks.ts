import { ActiveSupport } from "./namespaces.js";
import * as LazyLoadHooks from "./lazy-load-hooks.js";
type Hook = (this: any, base: any) => unknown;

interface HookOptions {
  yield?: boolean;
  runOnce?: boolean;
}

const loadHooks = new Map<string, [Hook, HookOptions][]>();
const loaded = new Map<string, any[]>();
const runOnce = new Map<string, Hook[]>();

function bucket<T>(registry: Map<string, T[]>, name: string): T[] {
  let entries = registry.get(name);
  if (!entries) {
    entries = [];
    registry.set(name, entries);
  }
  return entries;
}

export function onLoad(name: string, options: HookOptions | Hook, callback?: Hook): void {
  let block: Hook;
  if (typeof options === "function") {
    block = options;
    options = {};
  } else {
    block = callback!;
  }

  for (const base of bucket(loaded, name)) {
    executeHook(name, base, options, block);
  }

  bucket(loadHooks, name).push([block, options]);
}

/** @inventedArm map — PERMANENT */
export function runLoadHooks(name: string, base: any): unknown[] {
  bucket(loaded, name).push(base);
  return bucket(loadHooks, name).map(([hook, options]) => executeHook(name, base, options, hook));
}

/** @internal */
function withExecutionControl(
  name: string,
  block: Hook,
  once: boolean | undefined,
  fn: () => unknown,
): unknown {
  if (!bucket(runOnce, name).includes(block)) {
    if (once === true) bucket(runOnce, name).push(block);

    return fn();
  }
  return undefined;
}

/** @internal */
function executeHook(name: string, base: any, options: HookOptions, block: Hook): unknown {
  return withExecutionControl(name, block, options.runOnce, () => {
    if (options.yield) {
      return block(base);
    } else {
      return block.call(base, base);
    }
  });
}

/** @noRailsEquivalent PERMANENT */
export function resetLoadHooks(): void {
  loadHooks.clear();
  loaded.clear();
  runOnce.clear();
}

ActiveSupport.LazyLoadHooks = LazyLoadHooks;
