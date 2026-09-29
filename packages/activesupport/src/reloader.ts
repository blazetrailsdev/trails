import { classAttribute } from "./class-attribute.js";
import { defineCallbacks, runCallbacks, setCallback } from "./callbacks.js";
import type { FilterListEntry } from "./callbacks.js";
import { ExecutionWrapper } from "./execution-wrapper.js";
import type { CompletableExecution } from "./execution-wrapper.js";
import { Executor } from "./executor.js";

function isThenable(value: unknown): value is PromiseLike<unknown> {
  return (
    value != null &&
    (typeof value === "object" || typeof value === "function") &&
    typeof (value as PromiseLike<unknown>).then === "function"
  );
}

export class Reloader extends ExecutionWrapper {
  declare static executor: typeof ExecutionWrapper;

  declare static check: () => boolean;

  static _shouldReload?: boolean;

  static {
    defineCallbacks(this.prototype, "prepare");
    defineCallbacks(this.prototype, "class_unload");
  }

  #locked = false;

  static toPrepare(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "prepare", ...args);
  }

  static beforeClassUnload(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "class_unload", ...args);
  }

  static afterClassUnload(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "class_unload", "after", ...args);
  }

  static {
    this.toRun("after", function (this: Reloader) {
      (this.constructor as typeof Reloader).prepareBang();
    });
  }

  static reloadBang(): void | Promise<void> {
    const wrapped = this.executor.wrap(() => {
      const instance = new this();
      let ran: unknown;
      try {
        ran = instance.runBang();
      } finally {
        if (!isThenable(ran)) instance.completeBang();
      }
      if (isThenable(ran)) return Promise.resolve(ran).finally(() => instance.completeBang());
    });
    if (isThenable(wrapped)) return Promise.resolve(wrapped).then(() => this.prepareBang());
    this.prepareBang();
  }

  static runBang({ reset = false }: { reset?: boolean } = {}):
    | CompletableExecution
    | Promise<CompletableExecution> {
    if (this.checkBang()) {
      return super.runBang({ reset });
    } else {
      return this.Null;
    }
  }

  static wrap<T>(block: () => T, kwargs: { source?: string } = {}): T {
    if (this.active()) return block();

    return this.executor.wrap(() => {
      const instance = this.runBang();
      if (isThenable(instance)) {
        return (async () => {
          const ran = await instance;
          try {
            return await block();
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
          return Promise.resolve(result).finally(() => instance.completeBang()) as T;
        }
        return result;
      } finally {
        if (!deferred) instance.completeBang();
      }
    }, kwargs);
  }

  static checkBang(): boolean {
    if (!Object.prototype.hasOwnProperty.call(this, "_shouldReload")) {
      this._shouldReload = false;
    }
    return (this._shouldReload ||= this.check());
  }

  static reloadedBang(): void {
    this._shouldReload = false;
  }

  static prepareBang(): void {
    runCallbacks(new this(), "prepare", () => undefined);
  }

  requireUnloadLockBang(): void {
    if (!this.#locked) {
      this.#locked = true;
    }
  }

  releaseUnloadLockBang(): void {
    if (this.#locked) {
      this.#locked = false;
    }
  }

  runBang(): unknown {
    const ran = super.runBang();
    if (isThenable(ran)) return Promise.resolve(ran).then(() => this.releaseUnloadLockBang());
    this.releaseUnloadLockBang();
  }

  classUnloadBang(block?: () => unknown): unknown {
    this.requireUnloadLockBang();
    return runCallbacks(this, "class_unload", block);
  }

  completeBang(): unknown {
    let completed: unknown;
    try {
      completed = super.completeBang();
      if (isThenable(completed)) {
        return Promise.resolve(completed)
          .then(() => (this.constructor as typeof Reloader).reloadedBang())
          .finally(() => this.releaseUnloadLockBang());
      }
      (this.constructor as typeof Reloader).reloadedBang();
    } finally {
      if (!isThenable(completed)) this.releaseUnloadLockBang();
    }
  }
}

classAttribute.call(Reloader, "executor", { default: Executor });
classAttribute.call(Reloader, "check", { default: () => false });
