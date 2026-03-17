// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyRecord = any;

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

  /**
   * Check if a callback's conditions are met.
   */
  private _shouldRun(entry: CallbackEntry, record: AnyRecord): boolean {
    if (entry.conditions?.if && !entry.conditions.if(record)) return false;
    if (entry.conditions?.unless && entry.conditions.unless(record)) return false;
    return true;
  }

  /**
   * Create a copy of this chain (used for subclass inheritance).
   */
  clone(): CallbackChain {
    const copy = new CallbackChain();
    copy.callbacks = [...this.callbacks];
    return copy;
  }

  /**
   * Run callbacks for a given event around a block.
   * Returns false if a before callback returns false (halting the chain).
   */
  run(event: CallbackEvent, record: AnyRecord, block: () => void): boolean {
    if (!this.runBefore(event, record)) return false;

    // Around callbacks wrap the block
    const arounds = this.callbacks.filter(
      (c) => c.timing === "around" && c.event === event && this._shouldRun(c, record),
    );

    let chain = block;
    for (const cb of [...arounds].reverse()) {
      const prev = chain;
      chain = () => (cb.fn as AroundCallbackFn)(record, prev);
    }
    chain();

    this.runAfter(event, record);

    return true;
  }

  /**
   * Run callbacks for a given event around an async block.
   * Same as run() but awaits the block before running after callbacks,
   * ensuring after callbacks see the completed state. Around callbacks
   * receive an async proceed() and can await it.
   * Returns false if a before callback halts the chain.
   */
  async runAsync(
    event: CallbackEvent,
    record: AnyRecord,
    block: () => void | Promise<void>,
  ): Promise<boolean> {
    if (!this.runBefore(event, record)) return false;

    const arounds = this.callbacks.filter(
      (c) => c.timing === "around" && c.event === event && this._shouldRun(c, record),
    );

    let chain: () => void | Promise<void> = block;
    for (const cb of [...arounds].reverse()) {
      const prev = chain;
      chain = async () => {
        let proceedResult: Promise<void> | null = null;
        const wrappedProceed = () => {
          const result = prev();
          proceedResult = result instanceof Promise ? result : null;
          return result;
        };
        let aroundError: unknown;
        try {
          await (cb.fn as AroundCallbackFn)(record, wrappedProceed);
        } catch (e) {
          aroundError = e;
        }

        if (proceedResult) await (proceedResult as unknown as Promise<void>).catch(() => {});
        if (aroundError !== undefined) throw aroundError;
      };
    }
    await chain();

    this.runAfter(event, record);

    return true;
  }

  /**
   * Run only before callbacks for an event.
   * Returns false if a callback halts the chain.
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
   * Run only after callbacks for an event.
   */
  runAfter(event: CallbackEvent, record: AnyRecord): void {
    const afters = this.callbacks.filter((c) => c.timing === "after" && c.event === event);
    for (const cb of afters) {
      if (!this._shouldRun(cb, record)) continue;
      (cb.fn as CallbackFn)(record);
    }
  }
}
