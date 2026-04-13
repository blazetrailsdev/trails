// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

import { ArgumentError } from "./attribute-assignment.js";

/**
 * Callbacks mixin contract — defines model callback registration.
 *
 * Mirrors: ActiveModel::Callbacks
 *
 * In Rails, including ActiveModel::Callbacks gives the class
 * define_model_callbacks which creates before/after/around hooks.
 * Model already implements this via defineModelCallbacks().
 */
export interface DefineModelCallbacksOptions {
  only?: CallbackTiming[];
}

export interface CallbacksClassMethods {
  defineModelCallbacks(
    ...args: [string, ...string[]] | [string, ...string[], DefineModelCallbacksOptions]
  ): void;
}

export type Callbacks = CallbacksClassMethods;

/**
 * Core implementation of define_model_callbacks.
 * Creates beforeX(), afterX(), and/or aroundX() class methods for each event
 * name. Pass `{ only: ["before"] }` as the last argument to limit which
 * timing types are created (defaults to all three).
 *
 * Mirrors: ActiveModel::Callbacks.define_model_callbacks
 */
/* eslint-disable @typescript-eslint/no-explicit-any -- mixin `this` must accept any class constructor */
export function defineModelCallbacks(this: any, event: string, ...rest: string[]): void;
export function defineModelCallbacks(
  this: any,
  event: string,
  ...rest: [...string[], DefineModelCallbacksOptions]
): void;
export function defineModelCallbacks(this: any, ...args: unknown[]): void {
  /* eslint-enable @typescript-eslint/no-explicit-any */
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
        if (!knownKeys.has(key)) {
          throw new ArgumentError(`Unknown option: ${key}`);
        }
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

  for (const event of eventNames) {
    const capitalizedEvent = event.charAt(0).toUpperCase() + event.slice(1);

    if (timings.includes("before")) {
      const methodName = `before${capitalizedEvent}`;
      Object.defineProperty(this, methodName, {
        value: function (fnOrObject: CallbackFn | CallbackObject, conditions?: CallbackConditions) {
          if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
            this._callbackChain = this._callbackChain.clone();
          }
          const fn = resolveCallback(fnOrObject, "before", event);
          this._callbackChain.register("before", event, fn, conditions);
        },
        writable: true,
        configurable: true,
      });
    }

    if (timings.includes("after")) {
      const methodName = `after${capitalizedEvent}`;
      Object.defineProperty(this, methodName, {
        value: function (fnOrObject: CallbackFn | CallbackObject, conditions?: CallbackConditions) {
          if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
            this._callbackChain = this._callbackChain.clone();
          }
          const fn = resolveCallback(fnOrObject, "after", event);
          this._callbackChain.register("after", event, fn, conditions);
        },
        writable: true,
        configurable: true,
      });
    }

    if (timings.includes("around")) {
      const methodName = `around${capitalizedEvent}`;
      Object.defineProperty(this, methodName, {
        value: function (
          fnOrObject: AroundCallbackFn | CallbackObject,
          conditions?: CallbackConditions,
        ) {
          if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
            this._callbackChain = this._callbackChain.clone();
          }
          const fn = resolveCallback(fnOrObject, "around", event);
          this._callbackChain.register("around", event, fn as AroundCallbackFn, conditions);
        },
        writable: true,
        configurable: true,
      });
    }
  }
}

/**
 * Class-based callback object. Rails supports passing an object with
 * a method matching the callback (e.g., `beforeSave(record)`).
 */
export type CallbackObject = object;

function resolveCallback(
  fnOrObject: CallbackFn | AroundCallbackFn | CallbackObject,
  timing: CallbackTiming,
  event: string,
): CallbackFn | AroundCallbackFn {
  if (typeof fnOrObject === "function") return fnOrObject as CallbackFn | AroundCallbackFn;
  const obj = fnOrObject as Record<string, unknown>;
  const methodName = `${timing}_${event}`;
  const camelMethod = `${timing}${event.charAt(0).toUpperCase()}${event.slice(1)}`;
  const method = obj[methodName] ?? obj[camelMethod];
  if (typeof method !== "function") {
    throw new ArgumentError(`Callback object must implement ${methodName} or ${camelMethod}`);
  }
  if (timing === "around") {
    return ((record: AnyRecord, proceed: () => void | Promise<void>) =>
      method.call(fnOrObject, record, proceed)) as AroundCallbackFn;
  }
  return ((record: AnyRecord) => method.call(fnOrObject, record)) as CallbackFn;
}

/**
 * Callback types.
 *
 * CallbackFn allows Promise returns because the same callback chain serves
 * both sync events (validation, initialize) and async events (save, destroy).
 * The sync API (runCallbacks/runBefore/runAfter) ignores Promise returns —
 * only use sync callbacks on sync events. The async API
 * (runCallbacksAsync/runBeforeAsync/runAfterAsync) properly awaits Promises.
 *
 * AroundCallbackFn's proceed() returns void | Promise<void> because the
 * wrapped block may be async (e.g., DB operations in persistence). Around
 * callbacks that wrap async blocks should await proceed().
 */
export type CallbackFn = (record: AnyRecord) => void | boolean | Promise<void | boolean>;
export type AroundCallbackFn = (
  record: AnyRecord,
  proceed: () => void | Promise<void>,
) => void | Promise<void>;

export type CallbackTiming = "before" | "after" | "around";
export type CallbackEvent = string;

export interface CallbackConditions {
  if?: (record: AnyRecord) => boolean;
  unless?: (record: AnyRecord) => boolean;
  prepend?: boolean;
  on?: string | string[];
}

interface CallbackEntry {
  timing: CallbackTiming;
  event: CallbackEvent;
  fn: CallbackFn | AroundCallbackFn;
  conditions?: CallbackConditions;
}

/**
 * Callbacks — lifecycle hooks on models.
 *
 * Mirrors: ActiveModel::Callbacks
 *
 * The primary API is synchronous, matching Rails where callbacks are
 * synchronous Ruby methods. runCallbacks/runBefore/runAfter execute
 * callbacks in registration order and do not await returned Promises.
 * For persistence events where callbacks or blocks are asynchronous,
 * use the async variants (runCallbacksAsync/runBeforeAsync/runAfterAsync).
 */
export class CallbackChain {
  private callbacks: CallbackEntry[] = [];

  register(
    timing: CallbackTiming,
    event: CallbackEvent,
    fn: CallbackFn | AroundCallbackFn | CallbackObject,
    conditions?: CallbackConditions,
  ): void {
    const resolved: CallbackFn | AroundCallbackFn =
      typeof fn === "function"
        ? (fn as CallbackFn | AroundCallbackFn)
        : resolveCallback(fn, timing, event);
    const entry = { timing, event, fn: resolved, conditions };
    if (conditions?.prepend) {
      this.callbacks.unshift(entry);
    } else {
      this.callbacks.push(entry);
    }
  }

  private _shouldRun(entry: CallbackEntry, record: AnyRecord): boolean {
    if (entry.conditions?.if && !entry.conditions.if(record)) return false;
    if (entry.conditions?.unless && entry.conditions.unless(record)) return false;
    if (
      entry.conditions?.on !== undefined &&
      (entry.event === "commit" || entry.event === "rollback")
    ) {
      const allowed = Array.isArray(entry.conditions.on)
        ? entry.conditions.on
        : [entry.conditions.on];
      const action: string | undefined = record._transactionAction;
      if (!action || !allowed.includes(action)) return false;
    }
    return true;
  }

  clearEvent(event: CallbackEvent): void {
    this.callbacks = this.callbacks.filter((c) => c.event !== event);
  }

  clone(): CallbackChain {
    const copy = new CallbackChain();
    copy.callbacks = [...this.callbacks];
    return copy;
  }

  /**
   * Run callbacks for a given event around a block.
   * Returns false if a before callback returns false (halting)
   * or if an around callback does not call proceed().
   *
   * Mirrors: ActiveSupport::Callbacks#run_callbacks
   */
  runCallbacks(event: CallbackEvent, record: AnyRecord, block: () => void): boolean {
    if (!this.runBefore(event, record)) return false;

    const arounds = this.callbacks.filter(
      (c) => c.timing === "around" && c.event === event && this._shouldRun(c, record),
    );

    let blockExecuted = false;
    const trackedBlock = () => {
      block();
      blockExecuted = true;
    };

    let chain: () => void = trackedBlock;
    for (const cb of [...arounds].reverse()) {
      const prev = chain;
      chain = () => (cb.fn as AroundCallbackFn)(record, prev);
    }
    chain();

    if (!blockExecuted) return false;

    this.runAfter(event, record);

    return true;
  }

  /**
   * Run before callbacks for a given event.
   * Returns false if any callback returns false (halting the chain).
   *
   * Mirrors: ActiveSupport::Callbacks — before filter chain
   */
  runBefore(event: CallbackEvent, record: AnyRecord): boolean {
    const befores = this.callbacks.filter((c) => c.timing === "before" && c.event === event);
    for (const cb of befores) {
      if (!this._shouldRun(cb, record)) continue;
      const result = (cb.fn as CallbackFn)(record);
      if (result === false) return false;
    }
    return true;
  }

  /**
   * Run after callbacks for a given event.
   *
   * Mirrors: ActiveSupport::Callbacks — after filter chain
   */
  runAfter(event: CallbackEvent, record: AnyRecord): void {
    const afters = this.callbacks.filter((c) => c.timing === "after" && c.event === event);
    for (const cb of afters) {
      if (!this._shouldRun(cb, record)) continue;
      (cb.fn as CallbackFn)(record);
    }
  }

  // -- Async variants for persistence lifecycle (save/create/update/destroy) --
  // These exist because activerecord's before_destroy/before_save callbacks
  // can trigger cascading DB operations (dependent: :destroy) which are
  // inherently async in Node.js. Validation callbacks use the sync API above.

  async runCallbacksAsync(
    event: CallbackEvent,
    record: AnyRecord,
    block: () => void | Promise<void>,
  ): Promise<boolean> {
    if (!(await this.runBeforeAsync(event, record))) return false;

    const arounds = this.callbacks.filter(
      (c) => c.timing === "around" && c.event === event && this._shouldRun(c, record),
    );

    let blockExecuted = false;
    const trackedBlock = async () => {
      await block();
      blockExecuted = true;
    };

    // Build the around chain. Each around callback wraps the previous.
    // The pendingProceed pattern ensures that even if a sync around callback
    // calls proceed() without awaiting it, the async block's Promise is
    // still awaited before moving on.
    let chain: () => void | Promise<void> = trackedBlock;
    for (const cb of [...arounds].reverse()) {
      const prev = chain;
      chain = async () => {
        let pendingProceed: Promise<void> | undefined;
        const wrappedProceed = () => {
          const result = prev();
          if (result && typeof (result as Promise<void>).then === "function") {
            pendingProceed = result as Promise<void>;
          }
          return result;
        };
        try {
          await (cb.fn as AroundCallbackFn)(record, wrappedProceed);
          if (pendingProceed) await pendingProceed;
        } catch (aroundError) {
          if (pendingProceed) await pendingProceed.catch(() => {});
          throw aroundError;
        }
      };
    }
    await chain();

    if (!blockExecuted) return false;

    await this.runAfterAsync(event, record);

    return true;
  }

  async runBeforeAsync(event: CallbackEvent, record: AnyRecord): Promise<boolean> {
    const befores = this.callbacks.filter((c) => c.timing === "before" && c.event === event);
    for (const cb of befores) {
      if (!this._shouldRun(cb, record)) continue;
      const result = await (cb.fn as CallbackFn)(record);
      if (result === false) return false;
    }
    return true;
  }

  async runAfterAsync(event: CallbackEvent, record: AnyRecord): Promise<void> {
    const afters = this.callbacks.filter((c) => c.timing === "after" && c.event === event);
    for (const cb of afters) {
      if (!this._shouldRun(cb, record)) continue;
      await (cb.fn as CallbackFn)(record);
    }
  }
}
