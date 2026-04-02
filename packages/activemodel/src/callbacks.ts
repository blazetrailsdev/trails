// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

/**
 * Callbacks mixin contract — defines model callback registration.
 *
 * Mirrors: ActiveModel::Callbacks
 *
 * In Rails, including ActiveModel::Callbacks gives the class
 * define_model_callbacks which creates before/after/around hooks.
 * Model already implements this via defineModelCallbacks().
 */
export interface CallbacksClassMethods {
  defineModelCallbacks(...eventNames: string[]): void;
}

export type Callbacks = CallbacksClassMethods;

/**
 * Core implementation of define_model_callbacks.
 * Creates beforeX(), afterX(), and aroundX() class methods for each event name.
 *
 * Mirrors: ActiveModel::Callbacks.define_model_callbacks
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function defineModelCallbacks(this: any, ...eventNames: string[]): void {
  for (const event of eventNames) {
    const capitalizedEvent = event.charAt(0).toUpperCase() + event.slice(1);

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
