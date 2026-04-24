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

    // NB: pass `fnOrObject` directly to `register`; `register` already
    // handles `resolveCallback` internally AND stores the original
    // filter for identity-based removal via `skip()`. Pre-resolving here
    // would make the stored filter the wrapper function, breaking
    // `Model.skipCallback(event, timing, originalObject)` for entries
    // registered through the generated `beforeX`/`afterX`/`aroundX`
    // helpers.
    if (timings.includes("before")) {
      const methodName = `before${capitalizedEvent}`;
      Object.defineProperty(this, methodName, {
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

    if (timings.includes("after")) {
      const methodName = `after${capitalizedEvent}`;
      Object.defineProperty(this, methodName, {
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
          this._callbackChain.register("around", event, fnOrObject, conditions);
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
 * CallbackFn allows Promise returns. The unified runner
 * (runCallbacks/runBefore/runAfter) returns synchronously when every
 * registered callback and block is synchronous, and returns a Promise
 * as soon as any callback or block returns a thenable. Pass
 * `{ strict: "sync" }` on events that must remain synchronous
 * (validation, validate, initialize, find); the runner throws if any callback
 * returns a Promise on such events.
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

export interface RunCallbacksOptions {
  /** If "sync", throw when any callback returns a Promise. */
  strict?: "sync";
}

function isThenable(v: unknown): v is PromiseLike<unknown> {
  return (
    v !== null &&
    (typeof v === "object" || typeof v === "function") &&
    typeof (v as { then?: unknown }).then === "function"
  );
}

/**
 * Consume a thenable's rejection before throwing in strict-sync mode,
 * so the error we throw isn't accompanied by an unhandled-rejection
 * warning (or process termination under `--unhandled-rejections=strict`).
 */
function swallowRejection(v: unknown): void {
  if (isThenable(v)) {
    void Promise.resolve(v).catch(() => {});
  }
}

export type CallbackTiming = "before" | "after" | "around";
export type CallbackEvent = string;

export interface CallbackConditions<TRecord = AnyRecord> {
  if?: (record: TRecord) => boolean;
  unless?: (record: TRecord) => boolean;
  prepend?: boolean;
  on?: string | string[];
}

interface CallbackEntry {
  timing: CallbackTiming;
  event: CallbackEvent;
  /** Resolved callable used at run time. */
  fn: CallbackFn | AroundCallbackFn;
  /**
   * Original filter the caller passed — may be a function (same as `fn`
   * after resolution) or a `CallbackObject` (before resolution via
   * `resolveCallback`). `skip(event, timing, filter)` matches on this so
   * removing a `CallbackObject` works with the same reference the caller
   * registered.
   */
  filter: CallbackFn | AroundCallbackFn | CallbackObject;
  conditions?: CallbackConditions;
}

/**
 * Callbacks — lifecycle hooks on models.
 *
 * Mirrors: ActiveModel::Callbacks
 *
 * `runCallbacks`, `runBefore`, and `runAfter` return `T | Promise<T>`:
 * synchronously when every callback and block is synchronous, as a Promise
 * as soon as any callback or block returns a thenable. Async call sites
 * (save/destroy/touch/commit) simply `await` the result. Sync call sites
 * (validation/validate/initialize/find) pass `{ strict: "sync" }` so that a
 * registered async callback throws loudly instead of being silently
 * awaited or dropped.
 */
export class CallbackChain {
  private callbacks: CallbackEntry[] = [];

  register(
    timing: CallbackTiming,
    event: CallbackEvent,
    fn: CallbackFn | AroundCallbackFn | CallbackObject,
    conditions?: CallbackConditions,
  ): void {
    // `on:` is a transactional-only option: Rails' `ActiveRecord::Transactions`
    // uses it to scope `after_commit` / `after_rollback` callbacks to
    // specific actions (`:create` / `:update` / `:destroy`). For every
    // other event it's meaningless — silently accepting it would
    // register a callback whose `on:` filter is never consulted (see
    // `_shouldRun` below, which only applies `on` for commit/rollback).
    // Reject at register-time so the error surfaces immediately rather
    // than at run-time when the callback silently doesn't fire.
    // Key-presence check (not value check) so `{ on: undefined }` also
    // rejects — matches `_rejectOnOption`'s `"on" in conditions` and
    // Rails' "unknown key" semantics. An explicit `on` (even undefined)
    // signals caller intent that doesn't apply here.
    if (conditions && "on" in conditions) {
      if (event !== "commit" && event !== "rollback") {
        throw new ArgumentError(
          `Unknown key: :on. The :on option is only supported for :commit and :rollback callbacks (got :${event})`,
        );
      }
      // Validate the value here too so `defineModelCallbacks` helpers
      // and direct `chain.register` calls surface the same error
      // Rails raises from `after_commit`/`after_rollback`:
      // "on conditions … have to be one of [:create, :destroy, :update]".
      const on = conditions.on;
      const values = Array.isArray(on) ? on : [on];
      for (const v of values) {
        if (v !== "create" && v !== "update" && v !== "destroy") {
          throw new ArgumentError(
            `:on conditions for after_commit and after_rollback callbacks have to be one of [:create, :destroy, :update]`,
          );
        }
      }
    }
    const resolved: CallbackFn | AroundCallbackFn =
      typeof fn === "function"
        ? (fn as CallbackFn | AroundCallbackFn)
        : resolveCallback(fn, timing, event);
    const entry: CallbackEntry = { timing, event, fn: resolved, filter: fn, conditions };
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

  /**
   * Remove the first registered entry matching `event + timing + filter`.
   * Identity-matches on the caller's original filter (function OR
   * `CallbackObject`), not on the resolved runtime `fn` — so an object
   * registered via `register(..., obj)` can be removed with the same
   * object reference even though the chain internally resolves it to
   * a bound method.
   *
   * Mirrors Rails `CallbackChain#delete` used internally by
   * `skip_callback` (activesupport/lib/active_support/callbacks.rb:786-808).
   * Returns `true` if a matching entry was found and removed, `false`
   * otherwise — callers decide whether a miss is an error (Rails'
   * default raises unless `raise: false` is passed).
   */
  skip(
    event: CallbackEvent,
    timing: CallbackTiming,
    filter: CallbackFn | AroundCallbackFn | CallbackObject,
  ): boolean {
    // Identity-match on the original filter the caller registered with
    // (not the resolved `fn`), so `CallbackObject` removals work with
    // the same reference that was passed to `register`.
    const idx = this.callbacks.findIndex(
      (c) => c.event === event && c.timing === timing && c.filter === filter,
    );
    if (idx === -1) return false;
    this.callbacks.splice(idx, 1);
    return true;
  }

  /** Does this chain contain a matching entry? Non-mutating. */
  has(
    event: CallbackEvent,
    timing: CallbackTiming,
    filter: CallbackFn | AroundCallbackFn | CallbackObject,
  ): boolean {
    return this.callbacks.some(
      (c) => c.event === event && c.timing === timing && c.filter === filter,
    );
  }

  clone(): CallbackChain {
    const copy = new CallbackChain();
    copy.callbacks = [...this.callbacks];
    return copy;
  }

  /**
   * Run before callbacks. Returns `false` if any callback returns `false`
   * (halting the chain). Returns a Promise if any callback returns a
   * thenable; otherwise returns synchronously.
   *
   * Mirrors: ActiveSupport::Callbacks — before filter chain
   */
  runBefore(
    event: CallbackEvent,
    record: AnyRecord,
    opts: RunCallbacksOptions & { strict: "sync" },
  ): boolean;
  runBefore(
    event: CallbackEvent,
    record: AnyRecord,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean>;
  runBefore(
    event: CallbackEvent,
    record: AnyRecord,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    const befores = this.callbacks.filter((c) => c.timing === "before" && c.event === event);
    for (let i = 0; i < befores.length; i++) {
      const cb = befores[i];
      if (!this._shouldRun(cb, record)) continue;
      const result = (cb.fn as CallbackFn)(record);
      if (isThenable(result)) {
        if (opts?.strict === "sync") {
          swallowRejection(result);
          throw new Error(
            `Async callback registered on sync event '${event}' — before callback returned a Promise`,
          );
        }
        const rest = befores.slice(i + 1);
        return (async () => {
          const awaited = await result;
          if (awaited === false) return false;
          for (const cb2 of rest) {
            if (!this._shouldRun(cb2, record)) continue;
            const r = await (cb2.fn as CallbackFn)(record);
            if (r === false) return false;
          }
          return true;
        })();
      }
      if (result === false) return false;
    }
    return true;
  }

  /**
   * Run after callbacks. Returns a Promise if any callback returns a
   * thenable; otherwise returns synchronously.
   *
   * Mirrors: ActiveSupport::Callbacks — after filter chain
   */
  runAfter(
    event: CallbackEvent,
    record: AnyRecord,
    opts: RunCallbacksOptions & { strict: "sync" },
  ): void;
  runAfter(
    event: CallbackEvent,
    record: AnyRecord,
    opts?: RunCallbacksOptions,
  ): void | Promise<void>;
  runAfter(
    event: CallbackEvent,
    record: AnyRecord,
    opts?: RunCallbacksOptions,
  ): void | Promise<void> {
    const afters = this.callbacks.filter((c) => c.timing === "after" && c.event === event);
    for (let i = 0; i < afters.length; i++) {
      const cb = afters[i];
      if (!this._shouldRun(cb, record)) continue;
      const result = (cb.fn as CallbackFn)(record);
      if (isThenable(result)) {
        if (opts?.strict === "sync") {
          swallowRejection(result);
          throw new Error(
            `Async callback registered on sync event '${event}' — after callback returned a Promise`,
          );
        }
        const rest = afters.slice(i + 1);
        return (async () => {
          await result;
          for (const cb2 of rest) {
            if (!this._shouldRun(cb2, record)) continue;
            await (cb2.fn as CallbackFn)(record);
          }
        })();
      }
    }
  }

  /**
   * Run callbacks around a block. Returns `false` if a before callback
   * halts the chain or an around callback does not call `proceed()`.
   * Returns a Promise as soon as any callback or the block itself returns
   * a thenable; otherwise returns synchronously.
   *
   * Mirrors: ActiveSupport::Callbacks#run_callbacks
   */
  runCallbacks(
    event: CallbackEvent,
    record: AnyRecord,
    block: () => unknown,
    opts: RunCallbacksOptions & { strict: "sync" },
  ): boolean;
  runCallbacks(
    event: CallbackEvent,
    record: AnyRecord,
    block: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean>;
  runCallbacks(
    event: CallbackEvent,
    record: AnyRecord,
    block: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    const beforeResult = this.runBefore(event, record, opts);
    if (isThenable(beforeResult)) {
      return Promise.resolve(beforeResult).then((ok) =>
        ok ? this._runAroundBlockAndAfter(event, record, block, opts) : false,
      );
    }
    if (!beforeResult) return false;
    return this._runAroundBlockAndAfter(event, record, block, opts);
  }

  private _runAroundBlockAndAfter(
    event: CallbackEvent,
    record: AnyRecord,
    block: () => unknown,
    opts?: RunCallbacksOptions,
  ): boolean | Promise<boolean> {
    const arounds = this.callbacks.filter(
      (c) => c.timing === "around" && c.event === event && this._shouldRun(c, record),
    );

    let blockExecuted = false;
    const trackedBlock = (): void | Promise<void> => {
      const r = block();
      if (isThenable(r)) {
        return Promise.resolve(r).then(() => {
          blockExecuted = true;
        });
      }
      blockExecuted = true;
    };

    let chain: () => void | Promise<void> = trackedBlock;
    for (const cb of [...arounds].reverse()) {
      const prev = chain;
      chain = () => {
        let pendingProceed: Promise<void> | undefined;
        const wrappedProceed = () => {
          const result = prev();
          // Normalize to a real Promise so .catch() below is always safe;
          // `isThenable` accepts any A+ thenable, which may lack `.catch`.
          if (isThenable(result)) pendingProceed = Promise.resolve(result) as Promise<void>;
          return result;
        };
        let cbResult: void | Promise<void>;
        try {
          cbResult = (cb.fn as AroundCallbackFn)(record, wrappedProceed);
        } catch (aroundError) {
          // Sync throw from an around callback after it already kicked off an
          // async proceed(). Consume the pending rejection so the caller sees
          // only the thrown error, not a stray unhandled rejection.
          if (pendingProceed) {
            return (async () => {
              await pendingProceed!.catch(() => {});
              throw aroundError;
            })();
          }
          throw aroundError;
        }
        if (isThenable(cbResult) || pendingProceed) {
          if (opts?.strict === "sync") {
            swallowRejection(cbResult);
            swallowRejection(pendingProceed);
            throw new Error(
              `Async callback registered on sync event '${event}' — around callback or block returned a Promise`,
            );
          }
          return (async () => {
            try {
              await cbResult;
              if (pendingProceed) await pendingProceed;
            } catch (aroundError) {
              if (pendingProceed) await pendingProceed.catch(() => {});
              throw aroundError;
            }
          })();
        }
      };
    }

    const chainResult = chain();

    const finish = (): boolean | Promise<boolean> => {
      if (!blockExecuted) return false;
      const afterResult = this.runAfter(event, record, opts);
      if (isThenable(afterResult)) return Promise.resolve(afterResult).then(() => true);
      return true;
    };

    if (isThenable(chainResult)) {
      if (opts?.strict === "sync") {
        swallowRejection(chainResult);
        throw new Error(
          `Async callback registered on sync event '${event}' — around callback or block returned a Promise`,
        );
      }
      return Promise.resolve(chainResult).then(finish);
    }
    return finish();
  }
}
