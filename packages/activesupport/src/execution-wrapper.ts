/** @internal */

import { currentErrorReporter } from "./error-reporter.js";
import type { ErrorReporter } from "./error-reporter.js";
import { Callbacks } from "./callbacks.js";
import type { FilterListEntry } from "./callbacks.js";
import { include, type Extended, type Included } from "@blazetrails/ruby-compat/include";
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
  completeBang(): unknown;
}

/* eslint-disable-next-line @typescript-eslint/no-empty-object-type, @typescript-eslint/no-unsafe-declaration-merging -- Ruby `include ActiveSupport::Callbacks` (`execution_wrapper.rb:8`); the class/interface merge is how a mixin surfaces on the type side. */
export interface ExecutionWrapper extends Included<typeof Callbacks> {}

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
export class ExecutionWrapper {
  static RunHook: typeof RunHook;

  static CompleteHook: typeof CompleteHook;

  static Null: CompletableExecution = {
    completeBang(): unknown {
      return undefined;
    },
  };

  declare static defineCallbacks: Extended<typeof Callbacks.ClassMethods>["defineCallbacks"];
  declare static setCallback: Extended<typeof Callbacks.ClassMethods>["setCallback"];

  static {
    include(this, Callbacks);

    this.defineCallbacks("run");
    this.defineCallbacks("complete");
  }

  static _activeKey?: symbol;

  #_hookState?: Map<ExecutionHook, unknown>;

  static toRun(...args: FilterListEntry[]): void {
    this.setCallback("run", ...args);
  }

  static toComplete(...args: FilterListEntry[]): void {
    this.setCallback("complete", ...args);
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

  static runBang({ reset = false }: { reset?: boolean } = {}):
    | CompletableExecution
    | Promise<CompletableExecution> {
    if (reset) {
      const lostInstance = IsolatedExecutionState.delete<CompletableExecution>(this.activeKey());
      const lostCompleted = lostInstance?.completeBang();
      if (isThenable(lostCompleted)) {
        return Promise.resolve(lostCompleted).then(() => this.runBang({ reset }));
      }
    } else {
      if (this.active()) return this.Null;
    }

    const instance = new this();
    let success = null;
    let deferred = false;
    try {
      const ran = instance.runBang();
      if (isThenable(ran)) {
        deferred = true;
        return Promise.resolve(ran).then(
          () => instance,
          async (error: unknown) => {
            await instance.completeBang();
            throw error;
          },
        );
      }
      success = true;
    } finally {
      if (success == null && !deferred) instance.completeBang();
    }
    return instance;
  }

  static wrap<T>(block: () => T, { source = "application.active_support" } = {}): T {
    if (this.active()) return block();

    const instance = this.runBang();
    if (isThenable(instance)) {
      return (async () => {
        const ran = await instance;
        try {
          return await block();
        } catch (error) {
          this.errorReporter().report(error as Error, { handled: false, source });
          throw error;
        } finally {
          await ran.completeBang();
        }
      })() as T;
    }
    let deferred = false;
    try {
      const result = block();
      if (isThenable(result)) {
        deferred = true;
        return Promise.resolve(result).then(
          async (value) => {
            await instance.completeBang();
            return value;
          },
          async (error: unknown) => {
            this.errorReporter().report(error as Error, { handled: false, source });
            await instance.completeBang();
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
    const ran = instance.run();
    if (isThenable(ran)) {
      return (async () => {
        await ran;
        try {
          return await block();
        } finally {
          await instance.complete();
        }
      })() as T;
    }
    let deferred = false;
    try {
      const result = block();
      if (isThenable(result)) {
        deferred = true;
        return Promise.resolve(result).finally(() => instance.complete()) as T;
      }
      return result;
    } finally {
      if (!deferred) instance.complete();
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
    return IsolatedExecutionState.isKey(this.activeKey());
  }

  runBang(): unknown {
    const klass = this.constructor as typeof ExecutionWrapper;
    IsolatedExecutionState.set(klass.activeKey(), this);
    return this.run();
  }

  run(): unknown {
    return this.runCallbacks("run");
  }

  completeBang(): unknown {
    const activeKey = (this.constructor as typeof ExecutionWrapper).activeKey();
    let completed: unknown;
    try {
      completed = this.complete();
      if (isThenable(completed)) {
        return Promise.resolve(completed).finally(() => IsolatedExecutionState.delete(activeKey));
      }
      return completed;
    } finally {
      if (!isThenable(completed)) IsolatedExecutionState.delete(activeKey);
    }
  }

  complete(): unknown {
    return this.runCallbacks("complete");
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
