/**
 * Thin wrapper over @blazetrails/activesupport's callback engine.
 *
 * Mirrors: ActiveModel::Callbacks
 * (activemodel/lib/active_model/callbacks.rb)
 */

import { ArgumentError } from "./attribute-assignment.js";
import {
  Callback,
  CallbackChain as ASCallbackChain,
  type BeforeCallback,
  type AfterCallback,
  type AroundCallback,
  type CallbackKind,
  type CallbackObject as ASCallbackObject,
  type RunCallbacksOptions as ASRunCallbacksOptions,
  defineCallbacks as asDefineCallbacks,
  skipCallback as asSkipCallback,
  resetCallbacks as asResetCallbacks,
  getCallbackChains as asGetCallbackChains,
  peekCallbackChain as asPeekCallbackChain,
} from "@blazetrails/activesupport";

type AnyCallback = BeforeCallback | AfterCallback | AroundCallback;

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null &&
    (typeof v === "object" || typeof v === "function") &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

/** Minimum shape required of a record object threaded through a callback chain. */
export type CallbackRecord = object;

export interface DefineModelCallbacksOptions {
  only?: CallbackTiming[];
}

export interface CallbacksClassMethods {
  defineModelCallbacks(
    ...args: [string, ...string[]] | [string, ...string[], DefineModelCallbacksOptions]
  ): void;
}

export type Callbacks = CallbacksClassMethods;

export type CallbackTiming = CallbackKind;
export type CallbackFn = (record: CallbackRecord) => void | boolean | Promise<void | boolean>;
export type AroundCallbackFn = (
  record: CallbackRecord,
  proceed: () => void | Promise<void>,
) => void | Promise<void>;
/** Rails supports passing an object with callback-named methods. */
export type CallbackObject = object;
export interface RunCallbacksOptions {
  strict?: "sync";
}
export interface CallbackConditions<TRecord = CallbackRecord> {
  if?(record: TRecord): boolean;
  unless?(record: TRecord): boolean;
  prepend?: boolean;
  on?: string | string[];
}

/**
 * Core implementation of define_model_callbacks.
 * Creates beforeX(), afterX(), and/or aroundX() class methods for each event
 * name. Pass `{ only: ["before"] }` as the last argument to limit which
 * timing types are created (defaults to all three).
 *
 * Mirrors: ActiveModel::Callbacks.define_model_callbacks
 */
export function defineModelCallbacks(this: object, event: string, ...rest: string[]): void;
export function defineModelCallbacks(
  this: object,
  event: string,
  ...rest: [...string[], DefineModelCallbacksOptions]
): void;
export function defineModelCallbacks(this: object, ...args: unknown[]): void {
  let options: DefineModelCallbacksOptions = {};
  const eventNames: string[] = [];

  const validTimings: CallbackTiming[] = ["before", "after", "around"];
  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (typeof arg === "string") {
      eventNames.push(arg);
    } else if (
      i === args.length - 1 &&
      arg !== undefined &&
      arg !== null &&
      typeof arg === "object" &&
      !Array.isArray(arg)
    ) {
      options = arg as DefineModelCallbacksOptions;
      const knownKeys = new Set(["only"]);
      for (const key of Object.keys(options)) {
        if (!knownKeys.has(key)) throw new ArgumentError(`Unknown option: ${key}`);
      }
      if (options.only) {
        for (const t of options.only) {
          if (!validTimings.includes(t)) {
            throw new ArgumentError(
              `Invalid callback type: ${t}. Must be one of: ${validTimings.join(", ")}`,
            );
          }
        }
      }
    } else if (typeof arg !== "string") {
      throw new ArgumentError(`Expected event name (string), got ${typeof arg}`);
    }
  }

  if (eventNames.length === 0) {
    throw new ArgumentError("At least one event name must be provided to defineModelCallbacks");
  }

  const timings: CallbackTiming[] = options.only ?? ["before", "after", "around"];
  const klass = this as { prototype?: object } & Record<string, unknown>;

  // NB: each `_defineXxxModelCallback` passes `fnOrObject` directly to
  // `register`; `register` handles object dispatch internally AND stores
  // the original filter for identity-based removal via `skip()`. Pre-resolving
  // here would make the stored filter the wrapper function, breaking
  // `Model.skipCallback(event, timing, originalObject)` for entries registered
  // through the generated `beforeX`/`afterX`/`aroundX` helpers.
  for (const event of eventNames) {
    // Register the chain on the prototype with the same config used by
    // _registerCallbackOnProto so skipAfterCallbacksIfTerminated is consistent
    // regardless of which call runs first.
    // Mirrors: ActiveModel::Callbacks → define_callbacks (activesupport)
    if (klass.prototype)
      asDefineCallbacks(klass.prototype, event, { skipAfterCallbacksIfTerminated: true });
    if (timings.includes("before")) _defineBeforeModelCallback(this, event);
    if (timings.includes("after")) _defineAfterModelCallback(this, event);
    if (timings.includes("around")) _defineAroundModelCallback(this, event);
  }
}

type CallbackHost = object;

/**
 * Mirrors: ActiveModel::Callbacks#_define_before_model_callback
 * @internal Rails-private helper.
 */
export function _defineBeforeModelCallback(klass: CallbackHost, event: string): void {
  const capitalizedEvent = event.charAt(0).toUpperCase() + event.slice(1);
  Object.defineProperty(klass, `before${capitalizedEvent}`, {
    value: function (fnOrObject: CallbackFn | CallbackObject, conditions?: CallbackConditions) {
      _registerCallbackOnProto(this.prototype, "before", event, fnOrObject, conditions);
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Mirrors: ActiveModel::Callbacks#_define_around_model_callback
 * @internal Rails-private helper.
 */
export function _defineAroundModelCallback(klass: CallbackHost, event: string): void {
  const capitalizedEvent = event.charAt(0).toUpperCase() + event.slice(1);
  Object.defineProperty(klass, `around${capitalizedEvent}`, {
    value: function (
      fnOrObject: AroundCallbackFn | CallbackObject,
      conditions?: CallbackConditions,
    ) {
      _registerCallbackOnProto(this.prototype, "around", event, fnOrObject, conditions);
    },
    writable: true,
    configurable: true,
  });
}

/**
 * Mirrors: ActiveModel::Callbacks#_define_after_model_callback
 * @internal Rails-private helper.
 */
export function _defineAfterModelCallback(klass: CallbackHost, event: string): void {
  const capitalizedEvent = event.charAt(0).toUpperCase() + event.slice(1);
  Object.defineProperty(klass, `after${capitalizedEvent}`, {
    value: function (fnOrObject: CallbackFn | CallbackObject, conditions?: CallbackConditions) {
      _registerCallbackOnProto(this.prototype, "after", event, fnOrObject, conditions);
    },
    writable: true,
    configurable: true,
  });
}

function _resolveCallbackObject(
  obj: ASCallbackObject,
  timing: CallbackTiming,
  event: string,
): AnyCallback {
  const rec = obj as Record<string, unknown>;
  const camelMethod = `${timing}${event.charAt(0).toUpperCase()}${event.slice(1)}`;
  const snakeMethod = `${timing}_${event}`;
  const method = rec[camelMethod] ?? rec[snakeMethod];
  if (typeof method !== "function") {
    throw new ArgumentError(`Callback object must implement ${camelMethod} or ${snakeMethod}`);
  }
  if (timing === "around") {
    return ((record: CallbackRecord, proceed: () => void | Promise<void>) =>
      (method as (r: CallbackRecord, p: () => void | Promise<void>) => void).call(
        obj,
        record,
        proceed,
      )) as AnyCallback;
  }
  return ((record: CallbackRecord) =>
    (method as (r: CallbackRecord) => unknown).call(obj, record)) as AnyCallback;
}

/**
 * Register a callback directly in activesupport's Symbol-keyed chain storage
 * on `proto`. Called by the generated `beforeX`/`afterX`/`aroundX` methods
 * from `defineModelCallbacks` and by `CallbackChain.register`.
 *
 * Resolves `CallbackObject` instances using our own resolver (which supports
 * both camelCase and snake_case method names) before inserting into the chain,
 * while still storing the original object as `originalObject` so
 * `skip`-by-reference works.
 *
 * After callbacks are stored with `prepend: true` so activesupport's LIFO
 * reverse-iteration in `_runAfters` produces FIFO execution order — same as
 * Rails' `_define_after_model_callback prepend: true`.
 */
function _registerCallbackOnProto(
  proto: object,
  timing: CallbackTiming,
  event: string,
  fn: CallbackFn | AroundCallbackFn | CallbackObject,
  conditions?: CallbackConditions,
): void {
  if (conditions && "on" in conditions) {
    if (event !== "commit" && event !== "rollback") {
      throw new ArgumentError(
        `Unknown key: :on. The :on option is only supported for :commit and :rollback callbacks (got :${event})`,
      );
    }
  }
  // Two-step: defineCallbacks creates the chain with the right config (COW if
  // needed); getCallbackChains re-reads the now-own Map (cheap: hasOwnProperty
  // true on second call).
  asDefineCallbacks(proto, event, { skipAfterCallbacksIfTerminated: true });
  const chains = asGetCallbackChains(proto);
  const chain = chains.get(event)!;
  const isObj = typeof fn === "object" && fn !== null;
  const resolved: AnyCallback = isObj
    ? _resolveCallbackObject(fn as unknown as ASCallbackObject, timing, event)
    : (fn as AnyCallback);
  const entry = new Callback(
    event,
    resolved,
    timing as CallbackKind,
    {
      if: conditions?.if as ((t: object) => boolean) | undefined,
      unless: conditions?.unless as ((t: object) => boolean) | undefined,
    },
    chain.config,
    isObj ? (fn as unknown as ASCallbackObject) : undefined,
  );
  const prepend = !!conditions?.prepend || timing === "after";
  if (prepend) chain.prepend(entry);
  else chain.append(entry);
}

/**
 * Read-only chain lookup for run paths — no COW. The chain may live on an
 * ancestor prototype; `invoke(record, ...)` still receives the instance as its
 * target, so callbacks fire correctly without requiring a local copy.
 * Avoiding COW here means a subclass that never registers its own callbacks
 * stays transparent to future parent registrations even after its first run.
 */
function _getChain(proto: object, event: string): ASCallbackChain | null {
  return asPeekCallbackChain(proto, event) ?? null;
}

/**
 * Lifecycle callback chain backed by activesupport's Symbol-keyed chain storage.
 *
 * Rather than maintaining its own `Map<string, ASCallbackChain>`, this bridge
 * stores all chains in activesupport's per-prototype storage (same storage
 * accessed by `setCallback` / `runCallbacks`). Subclass isolation is handled
 * automatically by activesupport's copy-on-write in `getCallbackChains`.
 *
 * Mirrors: ActiveModel::Callbacks / ActiveSupport::Callbacks
 */
export class CallbackChain {
  constructor(private readonly _proto: object = Object.create(null)) {}

  register(
    timing: CallbackTiming,
    event: string,
    fn: CallbackFn | AroundCallbackFn | CallbackObject,
    conditions?: CallbackConditions,
  ): void {
    _registerCallbackOnProto(this._proto, timing, event, fn, conditions);
  }

  skip(
    event: string,
    timing: CallbackTiming,
    filter: CallbackFn | AroundCallbackFn | CallbackObject,
  ): boolean {
    // Peek first (no COW) to avoid isolating a subclass on a miss.
    const chain = asPeekCallbackChain(this._proto, event);
    if (!chain) return false;
    const asFilter = filter as unknown as AnyCallback | ASCallbackObject;
    const found = chain.entries.some((e) => e.matches(timing as CallbackKind, asFilter));
    if (!found) return false;
    // Found — now trigger COW (via asGetCallbackChains) to get the mutable own chain.
    asSkipCallback(this._proto, event, timing as CallbackKind, asFilter);
    return true;
  }

  has(
    event: string,
    timing: CallbackTiming,
    filter: CallbackFn | AroundCallbackFn | CallbackObject,
  ): boolean {
    // Peek without COW — a miss must not isolate this proto from future parent registrations.
    const chain = asPeekCallbackChain(this._proto, event);
    if (!chain) return false;
    const asFilter = filter as unknown as AnyCallback | ASCallbackObject;
    return chain.entries.some((e) => e.matches(timing as CallbackKind, asFilter));
  }

  clearEvent(event: string): void {
    asResetCallbacks(this._proto, event);
  }

  /**
   * Returns a new bridge that points at the same underlying `_proto` — it is
   * NOT a deep copy of the callback entries. Independence between a class and
   * its parent is guaranteed by activesupport's copy-on-write in
   * `getCallbackChains`: the first call to `register` on a subclass proto
   * creates its own Map by copying the parent's. Callers (e.g. AR's
   * `_callbackChain = _callbackChain.clone()`) rely on this automatic COW
   * rather than on the clone itself carrying a fresh snapshot.
   */
  clone(): CallbackChain {
    return new CallbackChain(this._proto);
  }

  runBefore(
    event: string,
    record: CallbackRecord,
    opts: RunCallbacksOptions & { strict: "sync" },
  ): boolean;
  runBefore(
    event: string,
    record: CallbackRecord,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean>;
  runBefore(
    event: string,
    record: CallbackRecord,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    const chain = _getChain(this._proto, event);
    if (!chain) return true;
    const tmp = new ASCallbackChain(event, chain.config);
    for (const e of chain.entries) {
      if (e.kind === "before") tmp.append(e);
    }
    return tmp.compile().invoke(record, undefined, opts as ASRunCallbacksOptions);
  }

  runAfter(
    event: string,
    record: CallbackRecord,
    opts: RunCallbacksOptions & { strict: "sync" },
  ): void;
  runAfter(event: string, record: CallbackRecord, opts?: RunCallbacksOptions): void | Promise<void>;
  runAfter(
    event: string,
    record: CallbackRecord,
    opts?: RunCallbacksOptions,
  ): void | Promise<void> {
    const chain = _getChain(this._proto, event);
    if (!chain) return;
    const tmp = new ASCallbackChain(event, chain.config);
    for (const e of chain.entries) {
      if (e.kind === "after") tmp.append(e);
    }
    const result = tmp.compile().invoke(record, undefined, opts as ASRunCallbacksOptions);
    if (isThenable(result)) return Promise.resolve(result).then(() => undefined);
  }

  runCallbacks(
    event: string,
    record: CallbackRecord,
    block: () => unknown,
    opts: RunCallbacksOptions & { strict: "sync" },
  ): boolean;
  runCallbacks(
    event: string,
    record: CallbackRecord,
    block: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean>;
  runCallbacks(
    event: string,
    record: CallbackRecord,
    block: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    const chain = _getChain(this._proto, event);
    if (!chain) {
      const r = block?.();
      if (isThenable(r)) return Promise.resolve(r).then(() => true);
      return true;
    }
    return chain.compile().invoke(record, block, opts as ASRunCallbacksOptions);
  }
}
