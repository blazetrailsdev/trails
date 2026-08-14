/**
 * Lazy load hooks — mirroring Rails' ActiveSupport lazy load hooks.
 * Allows registering callbacks that run when a component is loaded.
 */

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

/**
 * Register a callback to run when `name` is loaded.
 * If `name` was already loaded, runs immediately.
 *
 * `lazy_load_hooks.rb:59`.
 */
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

/**
 * Run all registered hooks for `name` with `base`.
 *
 * `lazy_load_hooks.rb:70`.
 */
export function runLoadHooks(name: string, base: any): void {
  bucket(loaded, name).push(base);
  for (const [hook, options] of bucket(loadHooks, name)) {
    executeHook(name, base, options, hook);
  }
}

/**
 * `lazy_load_hooks.rb:83` — private.
 *
 * @internal
 */
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

/**
 * `lazy_load_hooks.rb:91` — private.
 *
 * Rails' `options[:yield]` arm exists only to distinguish yielding `base` from
 * `class_eval`ing the block against it; JS has no `class_eval`, so every hook
 * takes `base` as its argument and the two arms collapse into one call.
 *
 * @internal
 */
function executeHook(name: string, base: any, options: HookOptions, block: Hook): void {
  withExecutionControl(name, block, options.runOnce, () => {
    block(base);
  });
}

/**
 * Reset all hook registrations (for testing).
 *
 * @noRailsEquivalent PERMANENT — Rails' hook registries live on the ActiveSupport module
 * and are reset by re-loading it; a TS module's state outlives the suite, so
 * tests need an explicit reset.
 */
export function resetLoadHooks(): void {
  loadHooks.clear();
  loaded.clear();
  runOnce.clear();
}
