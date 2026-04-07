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
      Object.defineProperty(this, `before${capitalizedEvent}`, {
        value: function (fn: CallbackFn, conditions?: CallbackConditions) {
          if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
            this._callbackChain = this._callbackChain.clone();
          }
          this._callbackChain.register("before", event, fn, conditions);
        },
        writable: true,
        configurable: true,
      });
    }

    if (timings.includes("after")) {
      Object.defineProperty(this, `after${capitalizedEvent}`, {
        value: function (fn: CallbackFn, conditions?: CallbackConditions) {
          if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
            this._callbackChain = this._callbackChain.clone();
          }
          this._callbackChain.register("after", event, fn, conditions);
        },
        writable: true,
        configurable: true,
      });
    }

    if (timings.includes("around")) {
      Object.defineProperty(this, `around${capitalizedEvent}`, {
        value: function (fn: AroundCallbackFn, conditions?: CallbackConditions) {
          if (!Object.prototype.hasOwnProperty.call(this, "_callbackChain")) {
            this._callbackChain = this._callbackChain.clone();
          }
          this._callbackChain.register("around", event, fn, conditions);
        },
        writable: true,
        configurable: true,
      });
    }
  }
}

/**
 * Callback types.
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
 * Callbacks mixin — lifecycle hooks on models.
 *
 * Mirrors: ActiveModel::Callbacks
 *
 * The primary API is async (run/runBefore/runAfter) which properly
 * awaits promise-returning callbacks. Sync variants (runSync/
 * runBeforeSync/runAfterSync) exist for contexts that can't be async
 * (constructors, synchronous validation).
 */
export class CallbackChain {
  private callbacks: CallbackEntry[] = [];

  register(
    timing: CallbackTiming,
    event: CallbackEvent,
    fn: CallbackFn | AroundCallbackFn,
    conditions?: CallbackConditions,
  ): void {
    const entry = { timing, event, fn, conditions };
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

  clone(): CallbackChain {
    const copy = new CallbackChain();
    copy.callbacks = [...this.callbacks];
    return copy;
  }

  /**
   * Run callbacks for a given event around an async block.
   * Awaits the block and all callbacks. Returns false if a before
   * callback resolves to false or if an around callback does not
   * call proceed().
   */
  async run(
    event: CallbackEvent,
    record: AnyRecord,
    block: () => void | Promise<void>,
  ): Promise<boolean> {
    if (!(await this.runBefore(event, record))) return false;

    const arounds = this.callbacks.filter(
      (c) => c.timing === "around" && c.event === event && this._shouldRun(c, record),
    );

    let blockExecuted = false;
    const trackedBlock = async () => {
      await block();
      blockExecuted = true;
    };

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

    await this.runAfter(event, record);

    return true;
  }

  /**
   * Synchronous variant of run() for contexts that can't be async
   * (constructors, synchronous validation). Does not await promises.
   */
  runSync(event: CallbackEvent, record: AnyRecord, block: () => void): boolean {
    if (!this.runBeforeSync(event, record)) return false;

    const arounds = this.callbacks.filter(
      (c) => c.timing === "around" && c.event === event && this._shouldRun(c, record),
    );

    let chain = block;
    for (const cb of [...arounds].reverse()) {
      const prev = chain;
      chain = () => (cb.fn as AroundCallbackFn)(record, prev);
    }
    chain();

    this.runAfterSync(event, record);

    return true;
  }

  /**
   * Run before callbacks, awaiting async callbacks.
   * Returns false if a callback resolves to false (halting the chain).
   */
  async runBefore(event: CallbackEvent, record: AnyRecord): Promise<boolean> {
    const befores = this.callbacks.filter((c) => c.timing === "before" && c.event === event);
    for (const cb of befores) {
      if (!this._shouldRun(cb, record)) continue;
      const result = await (cb.fn as CallbackFn)(record);
      if (result === false) return false;
    }
    return true;
  }

  /**
   * Synchronous before callbacks. Does not await promises.
   */
  runBeforeSync(event: CallbackEvent, record: AnyRecord): boolean {
    const befores = this.callbacks.filter((c) => c.timing === "before" && c.event === event);
    for (const cb of befores) {
      if (!this._shouldRun(cb, record)) continue;
      const result = (cb.fn as CallbackFn)(record);
      if (result === false) return false;
    }
    return true;
  }

  /**
   * Run after callbacks, awaiting async callbacks.
   */
  async runAfter(event: CallbackEvent, record: AnyRecord): Promise<void> {
    const afters = this.callbacks.filter((c) => c.timing === "after" && c.event === event);
    for (const cb of afters) {
      if (!this._shouldRun(cb, record)) continue;
      await (cb.fn as CallbackFn)(record);
    }
  }

  /**
   * Synchronous after callbacks. Does not await promises.
   */
  runAfterSync(event: CallbackEvent, record: AnyRecord): void {
    const afters = this.callbacks.filter((c) => c.timing === "after" && c.event === event);
    for (const cb of afters) {
      if (!this._shouldRun(cb, record)) continue;
      (cb.fn as CallbackFn)(record);
    }
  }
}
