/**
 * Port of `ActiveSupport::ExecutionWrapper`
 * (activesupport/lib/active_support/execution_wrapper.rb).
 *
 * @internal
 */

import { currentErrorReporter } from "./error-reporter.js";
import type { ErrorReporter } from "./error-reporter.js";
import { defineCallbacks, runCallbacks, setCallback } from "./callbacks.js";
import type { FilterListEntry } from "./callbacks.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

/**
 * The `run`/`complete` pair `register_hook` threads state between
 * (execution_wrapper.rb:41-48). `complete` is handed whatever `run` returned.
 */
export interface ExecutionHook {
  run(): unknown;
  complete(state: unknown): void;
}

/** What `run!` returns: either an instance or {@link ExecutionWrapper.Null}. */
export interface CompletableExecution {
  completeBang(): void;
}

export class ExecutionWrapper {
  /** Mirrors: `Null = Object.new` / `def Null.complete!` (execution_wrapper.rb:9-11). */
  static Null: CompletableExecution = {
    completeBang(): void {},
  };

  static {
    defineCallbacks(this.prototype, "run");
    defineCallbacks(this.prototype, "complete");
  }

  /**
   * `@active_key ||= :"active_execution_wrapper_#{object_id}"` keys the store
   * per class; a fresh Symbol is the TS spelling of an object-id-derived key.
   */
  static _activeKey?: symbol;

  #_hookState?: Map<ExecutionHook, unknown>;

  static toRun(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "run", ...args);
  }

  static toComplete(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "complete", ...args);
  }

  /**
   * Register an object to be invoked during both the +run+ and
   * +complete+ steps.
   *
   * +hook.complete+ will be passed the value returned from +hook.run+,
   * and will only be invoked if +run+ has previously been called.
   * (Mostly, this means it won't be invoked if an exception occurs in
   * a preceding +to_run+ block; all ordinary +to_complete+ blocks are
   * invoked in that situation.)
   */
  static registerHook(hook: ExecutionHook, { outer = false }: { outer?: boolean } = {}): void {
    if (outer) {
      this.toRun(new RunHook(hook), { prepend: true });
      this.toComplete("after", new CompleteHook(hook));
    } else {
      this.toRun(new RunHook(hook));
      this.toComplete(new CompleteHook(hook));
    }
  }

  /**
   * Run this execution.
   *
   * Returns an instance, whose +complete!+ method *must* be invoked
   * after the work has been performed.
   *
   * Where possible, prefer +wrap+.
   */
  static runBang({ reset = false }: { reset?: boolean } = {}): CompletableExecution {
    if (reset) {
      // Ruby's `Hash#delete` returns the deleted value; trails' returns a
      // boolean, so the read has to precede the delete.
      const lostInstance = IsolatedExecutionState.get<CompletableExecution>(this.activeKey());
      IsolatedExecutionState.delete(this.activeKey());
      lostInstance?.completeBang();
    } else {
      if (this.active()) return this.Null;
    }

    const instance = new this();
    let success = null;
    try {
      instance.runBang();
      success = true;
    } finally {
      if (success == null) instance.completeBang();
    }
    return instance;
  }

  /** Perform the work in the supplied block as an execution. */
  static wrap<T>(block: () => T, { source = "application.active_support" } = {}): T {
    if (this.active()) return block();

    const instance = this.runBang();
    try {
      return block();
    } catch (error) {
      this.errorReporter().report(error as Error, { handled: false, source });
      throw error;
    } finally {
      instance.completeBang();
    }
  }

  static perform<T>(block: () => T): T {
    const instance = new this();
    instance.run();
    try {
      return block();
    } finally {
      instance.complete();
    }
  }

  static errorReporter(): ErrorReporter {
    return currentErrorReporter;
  }

  static activeKey(): symbol {
    if (!Object.prototype.hasOwnProperty.call(this, "_activeKey")) {
      this._activeKey = Symbol("active_execution_wrapper");
    }
    return this._activeKey as symbol;
  }

  static active(): boolean {
    return IsolatedExecutionState.has(this.activeKey());
  }

  runBang(): void {
    const klass = this.constructor as typeof ExecutionWrapper;
    IsolatedExecutionState.set(klass.activeKey(), this);
    this.run();
  }

  run(): void {
    runCallbacks(this, "run");
  }

  /**
   * Complete this in-flight execution. This method *must* be called
   * exactly once on the result of any call to +run!+.
   *
   * Where possible, prefer +wrap+.
   */
  completeBang(): void {
    try {
      this.complete();
    } finally {
      IsolatedExecutionState.delete((this.constructor as typeof ExecutionWrapper).activeKey());
    }
  }

  complete(): void {
    runCallbacks(this, "complete");
  }

  /**
   * Ruby private; reached from the hooks below via `target.send(:hook_state)`.
   *
   * @internal
   */
  hookState(): Map<ExecutionHook, unknown> {
    return (this.#_hookState ??= new Map());
  }
}

/** Mirrors: `RunHook = Struct.new(:hook)` (execution_wrapper.rb:25-30). */
export class RunHook {
  /** Lets an instance satisfy {@link CallbackObject}, the ObjectCall filter shape. */
  [key: string]: unknown;

  constructor(readonly hook: ExecutionHook) {}

  before(target: ExecutionWrapper): void {
    const hookState = target.hookState();
    hookState.set(this.hook, this.hook.run());
  }
}

/** Mirrors: `CompleteHook = Struct.new(:hook)` (execution_wrapper.rb:32-39). */
export class CompleteHook {
  /** Lets an instance satisfy {@link CallbackObject}, the ObjectCall filter shape. */
  [key: string]: unknown;

  constructor(readonly hook: ExecutionHook) {}

  before(target: ExecutionWrapper): void {
    const hookState = target.hookState();
    if (hookState.has(this.hook)) {
      this.hook.complete(hookState.get(this.hook));
    }
  }

  after(target: ExecutionWrapper): void {
    this.before(target);
  }
}
