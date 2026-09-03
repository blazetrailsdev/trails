import { classAttribute } from "./class-attribute.js";
import { defineCallbacks, runCallbacks, setCallback } from "./callbacks.js";
import type { FilterListEntry } from "./callbacks.js";
import { ExecutionWrapper } from "./execution-wrapper.js";
import type { CompletableExecution } from "./execution-wrapper.js";
import { Executor } from "./executor.js";

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

  static reloadBang(): void {
    this.executor.wrap(() => {
      const instance = new this();
      try {
        instance.runBang();
      } finally {
        instance.completeBang();
      }
    });
    this.prepareBang();
  }

  static runBang({ reset = false }: { reset?: boolean } = {}): CompletableExecution {
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
      try {
        return block();
      } finally {
        instance.completeBang();
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

  runBang(): void {
    super.runBang();
    this.releaseUnloadLockBang();
  }

  classUnloadBang(block?: () => unknown): void {
    this.requireUnloadLockBang();
    runCallbacks(this, "class_unload", block);
  }

  completeBang(): void {
    try {
      super.completeBang();
      (this.constructor as typeof Reloader).reloadedBang();
    } finally {
      this.releaseUnloadLockBang();
    }
  }
}

classAttribute.call(Reloader, "executor", { default: Executor });
classAttribute.call(Reloader, "check", { default: () => false });
