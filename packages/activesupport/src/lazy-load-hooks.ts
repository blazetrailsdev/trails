type Hook = (base: any) => void;

interface HookOptions {
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

export function runLoadHooks(name: string, base: any): void {
  bucket(loaded, name).push(base);
  for (const [hook, options] of bucket(loadHooks, name)) {
    executeHook(name, base, options, hook);
  }
}

/** @internal */
function withExecutionControl(
  name: string,
  block: Hook,
  once: boolean | undefined,
  fn: () => void,
): void {
  if (!bucket(runOnce, name).includes(block)) {
    if (once === true) bucket(runOnce, name).push(block);

    fn();
  }
}

/** @internal */
function executeHook(name: string, base: any, options: HookOptions, block: Hook): void {
  withExecutionControl(name, block, options.runOnce, () => {
    block(base);
  });
}

/** @noRailsEquivalent PERMANENT */
export function resetLoadHooks(): void {
  loadHooks.clear();
  loaded.clear();
  runOnce.clear();
}
