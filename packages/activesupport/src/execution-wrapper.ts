/** @internal */

import { currentErrorReporter } from "./error-reporter.js";
import type { ErrorReporter } from "./error-reporter.js";
import { defineCallbacks, runCallbacks, setCallback } from "./callbacks.js";
import type { FilterListEntry } from "./callbacks.js";
import { IsolatedExecutionState } from "./isolated-execution-state.js";

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

export interface ExecutionHook {
  run(): unknown;
  complete(state: unknown): void;
}

export interface CompletableExecution {
  completeBang(): void;
}

export class ExecutionWrapper {
  static RunHook: typeof RunHook;

  static CompleteHook: typeof CompleteHook;

  static Null: CompletableExecution = {
    completeBang(): void {},
  };

  static {
    defineCallbacks(this.prototype, "run");
    defineCallbacks(this.prototype, "complete");
  }

  static _activeKey?: symbol;

  #_hookState?: Map<ExecutionHook, unknown>;

  static toRun(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "run", ...args);
  }

  static toComplete(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "complete", ...args);
  }

  static registerHook(hook: ExecutionHook, { outer = false }: { outer?: boolean } = {}): void {
    if (outer) {
      this.toRun(new RunHook(hook), { prepend: true });
      this.toComplete("after", new CompleteHook(hook));
    } else {
      this.toRun(new RunHook(hook));
      this.toComplete(new CompleteHook(hook));
    }
  }

  static runBang({ reset = false }: { reset?: boolean } = {}): CompletableExecution {
    if (reset) {
      const lostInstance = IsolatedExecutionState.delete<CompletableExecution>(this.activeKey());
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

  static wrap<T>(block: () => T, { source = "application.active_support" } = {}): T {
    if (this.active()) return block();

    const instance = this.runBang();
    let deferred = false;
    try {
      const result = block();
      if (isThenable(result)) {
        deferred = true;
        return Promise.resolve(result).then(
          (value) => {
            instance.completeBang();
            return value;
          },
          (error: unknown) => {
            this.errorReporter().report(error as Error, { handled: false, source });
            instance.completeBang();
            throw error;
          },
        ) as T;
      }
      return result;
    } catch (error) {
      this.errorReporter().report(error as Error, { handled: false, source });
      throw error;
    } finally {
      if (!deferred) instance.completeBang();
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

  /** @internal */
  hookState(): Map<ExecutionHook, unknown> {
    return (this.#_hookState ??= new Map());
  }
}

export class RunHook {
  [key: string]: unknown;

  constructor(readonly hook: ExecutionHook) {}

  before(target: ExecutionWrapper): void {
    const hookState = target.hookState();
    hookState.set(this.hook, this.hook.run());
  }
}

export class CompleteHook {
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

ExecutionWrapper.RunHook = RunHook;
ExecutionWrapper.CompleteHook = CompleteHook;
