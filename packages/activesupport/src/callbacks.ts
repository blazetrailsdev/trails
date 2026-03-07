/**
 * Callback system mirroring Rails ActiveSupport::Callbacks.
 *
 * Provides defineCallbacks, setCallback, skipCallback, resetCallbacks,
 * and runCallbacks for before/after/around lifecycle hooks.
 *
 * Also provides a class-based mixin pattern via CallbacksMixin for Rails-style
 * `include ActiveSupport::Callbacks` usage.
 */

export type CallbackKind = "before" | "after" | "around";

export type CallbackCondition = (target: any) => boolean;

export interface CallbackOptions {
  if?: CallbackCondition | CallbackCondition[];
  unless?: CallbackCondition | CallbackCondition[];
  prepend?: boolean;
}

export interface DefineCallbacksOptions {
  /**
   * When true (default), a before callback returning `false` halts the chain.
   */
  terminator?: boolean;
}

export type BeforeCallback = (target: any) => any;
export type AfterCallback = (target: any) => void;
export type AroundCallback = (target: any, next: () => void) => void;

export type AnyCallback = BeforeCallback | AfterCallback | AroundCallback;

interface CallbackEntry {
  kind: CallbackKind;
  callback: AnyCallback;
  options: CallbackOptions;
}

interface CallbackChain {
  entries: CallbackEntry[];
  chainOptions: DefineCallbacksOptions;
}

const CALLBACKS = Symbol("callbacks");

function getCallbackChains(target: any): Map<string, CallbackChain> {
  if (!target[CALLBACKS]) {
    target[CALLBACKS] = new Map<string, CallbackChain>();
  }
  return target[CALLBACKS];
}

/**
 * Register a named callback chain on the target object/class prototype.
 */
export function defineCallbacks(
  target: any,
  name: string,
  options: DefineCallbacksOptions = {}
): void {
  const chains = getCallbackChains(target);
  if (!chains.has(name)) {
    chains.set(name, {
      entries: [],
      chainOptions: { terminator: true, ...options },
    });
  }
}

/**
 * Add a callback to a named chain.
 */
export function setCallback(
  target: any,
  name: string,
  kind: CallbackKind,
  callback: AnyCallback,
  options: CallbackOptions = {}
): void {
  const chains = getCallbackChains(target);
  const chain = chains.get(name);
  if (!chain) {
    throw new Error(
      `No callback chain "${name}" defined. Call defineCallbacks first.`
    );
  }
  const entry: CallbackEntry = { kind, callback, options };
  if (options.prepend) {
    chain.entries.unshift(entry);
  } else {
    chain.entries.push(entry);
  }
}

/**
 * Remove a callback from a named chain.
 */
export function skipCallback(
  target: any,
  name: string,
  kind: CallbackKind,
  callback?: AnyCallback
): void {
  const chains = getCallbackChains(target);
  const chain = chains.get(name);
  if (!chain) return;
  chain.entries = chain.entries.filter(
    (e) => {
      if (e.kind !== kind) return true;
      if (callback && e.callback !== callback) return true;
      return false;
    }
  );
}

/**
 * Remove all callbacks from a named chain.
 */
export function resetCallbacks(target: any, name: string): void {
  const chains = getCallbackChains(target);
  const chain = chains.get(name);
  if (chain) {
    chain.entries = [];
  }
}

function shouldRun(entry: CallbackEntry, target: any): boolean {
  const { options } = entry;
  if (options.if) {
    const conditions = Array.isArray(options.if) ? options.if : [options.if];
    if (!conditions.every((cond) => cond(target))) return false;
  }
  if (options.unless) {
    const conditions = Array.isArray(options.unless)
      ? options.unless
      : [options.unless];
    if (conditions.some((cond) => cond(target))) return false;
  }
  return true;
}

/**
 * Execute the callback chain. Returns false if the chain was halted.
 */
export function runCallbacks(
  target: any,
  name: string,
  block?: () => void
): boolean {
  const chains = getCallbackChains(target);
  const chain = chains.get(name);
  if (!chain) {
    block?.();
    return true;
  }

  const befores = chain.entries.filter((e) => e.kind === "before");
  const afters = chain.entries.filter((e) => e.kind === "after");
  const arounds = chain.entries.filter((e) => e.kind === "around");
  const terminator = chain.chainOptions.terminator !== false;

  // Run before callbacks
  for (const entry of befores) {
    if (!shouldRun(entry, target)) continue;
    const result = (entry.callback as BeforeCallback)(target);
    if (terminator && result === false) {
      return false;
    }
  }

  // Build the around chain wrapping the block
  let core = () => {
    block?.();
  };

  // Wrap arounds from outside-in (last registered wraps outermost)
  for (let i = arounds.length - 1; i >= 0; i--) {
    const entry = arounds[i];
    const inner = core;
    if (!shouldRun(entry, target)) continue;
    core = () => {
      (entry.callback as AroundCallback)(target, inner);
    };
  }

  core();

  // Run after callbacks (in reverse order, matching Rails)
  for (let i = afters.length - 1; i >= 0; i--) {
    const entry = afters[i];
    if (!shouldRun(entry, target)) continue;
    (entry.callback as AfterCallback)(target);
  }

  return true;
}

// ---------------------------------------------------------------------------
// Class-based mixin — Rails-style `include ActiveSupport::Callbacks`
// ---------------------------------------------------------------------------

/**
 * CallbacksMixin provides a class-based API mirroring Rails' include of
 * ActiveSupport::Callbacks. Extend a class with this to get instance methods
 * `runCallbacks` and class methods `defineCallbacks`, `beforeCallback`, etc.
 *
 * Usage:
 *   class MyModel extends CallbacksMixin() {
 *     static {
 *       this.defineCallbacks("save");
 *       this.beforeCallback("save", (self: MyModel) => self.validate());
 *     }
 *
 *     save() {
 *       return this.runCallbacks("save", () => { ... });
 *     }
 *   }
 */
export function CallbacksMixin<TBase extends new (...args: any[]) => object>(Base?: TBase) {
  const ActualBase = (Base ?? class {}) as TBase;

  class WithCallbacks extends ActualBase {
    /**
     * Define a named callback chain on this class.
     */
    static defineCallbacks(name: string, options: DefineCallbacksOptions = {}): void {
      defineCallbacks(this.prototype, name, options);
    }

    /**
     * Register a before callback on this class.
     */
    static beforeCallback(
      name: string,
      callback: BeforeCallback,
      options: CallbackOptions = {},
    ): void {
      setCallback(this.prototype, name, "before", callback, options);
    }

    /**
     * Register an after callback on this class.
     */
    static afterCallback(
      name: string,
      callback: AfterCallback,
      options: CallbackOptions = {},
    ): void {
      setCallback(this.prototype, name, "after", callback, options);
    }

    /**
     * Register an around callback on this class.
     */
    static aroundCallback(
      name: string,
      callback: AroundCallback,
      options: CallbackOptions = {},
    ): void {
      setCallback(this.prototype, name, "around", callback, options);
    }

    /**
     * Skip (remove) a callback from this class's chain.
     */
    static skipCallback(name: string, kind: CallbackKind, callback?: AnyCallback): void {
      skipCallback(this.prototype, name, kind, callback);
    }

    /**
     * Reset all callbacks on a named chain.
     */
    static resetCallbacks(name: string): void {
      resetCallbacks(this.prototype, name);
    }

    /**
     * Run the named callback chain, optionally wrapping a block.
     * Returns false if the chain was halted, true otherwise.
     */
    runCallbacks(name: string, block?: () => void): boolean {
      return runCallbacks(this, name, block);
    }
  }

  return WithCallbacks;
}
