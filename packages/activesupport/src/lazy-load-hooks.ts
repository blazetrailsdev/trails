/**
 * Lazy load hooks — mirroring Rails' ActiveSupport lazy load hooks.
 * Allows registering callbacks that run when a component is loaded.
 */

interface HookEntry {
  callback: (base: any) => void;
  options: { once?: boolean };
}

const hookRegistry = new Map<string, HookEntry[]>();
const loadedBases = new Map<string, any[]>();

/**
 * Register a callback to run when `name` is loaded.
 * If `name` was already loaded, runs immediately.
 */
export function onLoad(
  name: string,
  options: { once?: boolean } | ((base: any) => void),
  callback?: (base: any) => void
): void {
  let opts: { once?: boolean };
  let cb: (base: any) => void;

  if (typeof options === "function") {
    cb = options;
    opts = {};
  } else {
    cb = callback!;
    opts = options;
  }

  const hooks = hookRegistry.get(name) ?? [];

  if (opts.once) {
    // Don't register again if already registered with same callback
    if (hooks.some((h) => h.callback === cb)) return;
  }

  hooks.push({ callback: cb, options: opts });
  hookRegistry.set(name, hooks);

  // Run immediately if already loaded
  const bases = loadedBases.get(name);
  if (bases) {
    for (const base of bases) {
      cb(base);
    }
  }
}

/**
 * Run all registered hooks for `name` with `base`.
 */
export function runLoadHooks(name: string, base: any): void {
  const bases = loadedBases.get(name) ?? [];
  bases.push(base);
  loadedBases.set(name, bases);

  const hooks = hookRegistry.get(name) ?? [];
  for (const { callback } of hooks) {
    callback(base);
  }
}

/**
 * Reset all hook registrations (for testing).
 */
export function resetLoadHooks(): void {
  hookRegistry.clear();
  loadedBases.clear();
}
