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
} from "@blazetrails/activesupport";

type AnyCallback = BeforeCallback | AfterCallback | AroundCallback;

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

  for (const event of eventNames) {
    // Register the chain on the prototype for activesupport API surface parity.
    // Mirrors: ActiveModel::Callbacks → define_callbacks (activesupport)
    if (klass.prototype) asDefineCallbacks(klass.prototype, event);
    if (timings.includes("before")) _defineBeforeModelCallback(this, event);
    if (timings.includes("after")) _defineAfterModelCallback(this, event);
    if (timings.includes("around")) _defineAroundModelCallback(this, event);
  }
}

type CallbackHost = object;

/**
 * @internal Rails-private helper.
 */
export function _defineBeforeModelCallback(klass: CallbackHost, event: string): void {
  const capitalizedEvent = event.charAt(0).toUpperCase() + event.slice(1);
  Object.defineProperty(klass, `before${capitalizedEvent}`, {
    value: function (fnOrObject: CallbackFn | CallbackObject, conditions?: CallbackConditions) {
      if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
        this._callbackChain = this._callbackChain.clone();
      }
      this._callbackChain.register("before", event, fnOrObject, conditions);
    },
    writable: true,
    configurable: true,
  });
}

/**
 * @internal Rails-private helper.
 */
export function _defineAroundModelCallback(klass: CallbackHost, event: string): void {
  const capitalizedEvent = event.charAt(0).toUpperCase() + event.slice(1);
  Object.defineProperty(klass, `around${capitalizedEvent}`, {
    value: function (
      fnOrObject: AroundCallbackFn | CallbackObject,
      conditions?: CallbackConditions,
    ) {
      if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
        this._callbackChain = this._callbackChain.clone();
      }
      this._callbackChain.register("around", event, fnOrObject, conditions);
    },
    writable: true,
    configurable: true,
  });
}

/**
 * @internal Rails-private helper.
 */
export function _defineAfterModelCallback(klass: CallbackHost, event: string): void {
  const capitalizedEvent = event.charAt(0).toUpperCase() + event.slice(1);
  Object.defineProperty(klass, `after${capitalizedEvent}`, {
    value: function (fnOrObject: CallbackFn | CallbackObject, conditions?: CallbackConditions) {
      if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
        this._callbackChain = this._callbackChain.clone();
      }
      this._callbackChain.register("after", event, fnOrObject, conditions);
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
 * Lifecycle callback chain backed by activesupport's Callback engine.
 *
 * Mirrors: ActiveModel::Callbacks / ActiveSupport::Callbacks
 */
export class CallbackChain {
  /** Map from event name to an activesupport CallbackChain for that event. */
  private readonly _chains = new Map<string, ASCallbackChain>();

  private _chain(event: string): ASCallbackChain {
    let chain = this._chains.get(event);
    if (!chain) {
      chain = new ASCallbackChain(event, { skipAfterCallbacksIfTerminated: true });
      this._chains.set(event, chain);
    }
    return chain;
  }

  register(
    timing: CallbackTiming,
    event: string,
    fn: CallbackFn | AroundCallbackFn | CallbackObject,
    conditions?: CallbackConditions,
  ): void {
    // `on:` is synthesized into `if:` by the AR layer (transactions.ts)
    // before reaching this chain. Reject it here for non-commit/rollback events.
    if (conditions && "on" in conditions) {
      if (event !== "commit" && event !== "rollback") {
        throw new ArgumentError(
          `Unknown key: :on. The :on option is only supported for :commit and :rollback callbacks (got :${event})`,
        );
      }
    }
    const chain = this._chain(event);
    const isObj = typeof fn === "object" && fn !== null;
    const asObj = isObj ? (fn as unknown as ASCallbackObject) : undefined;
    const resolved: AnyCallback = isObj
      ? _resolveCallbackObject(asObj!, timing, event)
      : (fn as AnyCallback);
    const entry = new Callback(
      event,
      resolved,
      timing as CallbackKind,
      { if: conditions?.if, unless: conditions?.unless } as {
        if?: (t: object) => boolean;
        unless?: (t: object) => boolean;
      },
      chain.config,
      asObj,
    );
    // After callbacks are stored with prepend so that activesupport's reverse
    // iteration in _runAfters (LIFO) produces FIFO execution order — the same
    // as Rails' _define_after_model_callback which passes prepend: true.
    const usePrepend = conditions?.prepend || timing === "after";
    if (usePrepend) chain.prepend(entry);
    else chain.append(entry);
  }

  skip(
    event: string,
    timing: CallbackTiming,
    filter: CallbackFn | AroundCallbackFn | CallbackObject,
  ): boolean {
    const chain = this._chains.get(event);
    if (!chain) return false;
    const asFilter = filter as unknown as AnyCallback | ASCallbackObject;
    const entry = chain.entries.find((e) => e.matches(timing as CallbackKind, asFilter));
    if (!entry) return false;
    chain.delete(entry);
    return true;
  }

  has(
    event: string,
    timing: CallbackTiming,
    filter: CallbackFn | AroundCallbackFn | CallbackObject,
  ): boolean {
    const asFilter = filter as unknown as AnyCallback | ASCallbackObject;
    return (
      this._chains.get(event)?.entries.some((e) => e.matches(timing as CallbackKind, asFilter)) ??
      false
    );
  }

  clearEvent(event: string): void {
    this._chains.delete(event);
  }

  clone(): CallbackChain {
    const copy = new CallbackChain();
    for (const [ev, ch] of this._chains) {
      const dup = new ASCallbackChain(ch.name, ch.config);
      for (const e of ch.entries) {
        dup.append(
          new Callback(
            e.name,
            e.filter as AnyCallback,
            e.kind,
            e.options,
            ch.config,
            e.originalObject,
          ),
        );
      }
      copy._chains.set(ev, dup);
    }
    return copy;
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
    const chain = this._chains.get(event);
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
    const chain = this._chains.get(event);
    if (!chain) return;
    const tmp = new ASCallbackChain(event, chain.config);
    for (const e of chain.entries) {
      if (e.kind === "after") tmp.append(e);
    }
    const result = tmp.compile().invoke(record, undefined, opts as ASRunCallbacksOptions);
    if (result instanceof Promise) return result.then(() => undefined);
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
    const chain = this._chains.get(event);
    if (!chain) {
      const r = block?.();
      if (r instanceof Promise) return r.then(() => true);
      return true;
    }
    return chain.compile().invoke(record, block, opts as ASRunCallbacksOptions);
  }
}
