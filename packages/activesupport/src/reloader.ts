/**
 * Port of `ActiveSupport::Reloader` from
 * `activesupport/lib/active_support/reloader.rb`.
 *
 * = Active Support \Reloader
 *
 * This class defines several callbacks:
 *
 *   to_prepare -- Run once at application startup, and also from
 *   +to_run+.
 *
 *   to_run -- Run before a work run that is reloading. If
 *   +reload_classes_only_on_change+ is true (the default), the class
 *   unload will have already occurred.
 *
 *   to_complete -- Run after a work run that has reloaded. If
 *   +reload_classes_only_on_change+ is false, the class unload will
 *   have occurred after the work run, but before this callback.
 *
 *   before_class_unload -- Run immediately before the classes are
 *   unloaded.
 *
 *   after_class_unload -- Run immediately after the classes are
 *   unloaded.
 */
import { classAttribute } from "./class-attribute.js";
import { defineCallbacks, runCallbacks, setCallback } from "./callbacks.js";
import type { FilterListEntry } from "./callbacks.js";
import { ExecutionWrapper } from "./execution-wrapper.js";
import type { CompletableExecution } from "./execution-wrapper.js";
import { Executor } from "./executor.js";

export class Reloader extends ExecutionWrapper {
  /** `class_attribute :executor, default: Executor` (reloader.rb:81). */
  declare static executor: typeof ExecutionWrapper;

  /** `class_attribute :check, default: lambda { false }` (reloader.rb:82). */
  declare static check: () => boolean;

  /** Backs {@link Reloader.checkBang} / {@link Reloader.reloadedBang}: Ruby's `@should_reload`. */
  static _shouldReload?: boolean;

  static {
    defineCallbacks(this.prototype, "prepare");
    defineCallbacks(this.prototype, "class_unload");
  }

  #locked = false;

  /** Registers a callback that will run once at application startup and every time the code is reloaded. */
  static toPrepare(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "prepare", ...args);
  }

  /** Registers a callback that will run immediately before the classes are unloaded. */
  static beforeClassUnload(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "class_unload", ...args);
  }

  /** Registers a callback that will run immediately after the classes are unloaded. */
  static afterClassUnload(...args: FilterListEntry[]): void {
    setCallback(this.prototype, "class_unload", "after", ...args);
  }

  static {
    this.toRun("after", function (this: Reloader) {
      (this.constructor as typeof Reloader).prepareBang();
    });
  }

  /** Initiate a manual reload */
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

  /** Run the supplied block as a work unit, reloading code as needed */
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

  /**
   * Mirrors: Reloader.check! (reloader.rb:87-89). `@should_reload` is a per-class
   * ivar in Ruby, so a subclass never reads its parent's — hence the own-property
   * guard (as in `activeKey`).
   */
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

  /**
   * Acquire the ActiveSupport::Dependencies::Interlock unload lock,
   * ensuring it will be released automatically
   *
   * `ActiveSupport::Dependencies.interlock.start_unloading` (reloader.rb:104) is
   * not called: ESM has no autoload, so there is no interlock to hold loads off across an
   * unload (same reason `Concurrency::LoadInterlockAwareMonitor` is a bare
   * `Monitor`). The `@locked` bookkeeping is ported so the pairing with
   * {@link releaseUnloadLockBang} still holds.
   */
  requireUnloadLockBang(): void {
    if (!this.#locked) {
      this.#locked = true;
    }
  }

  /**
   * Release the unload lock if it has been previously obtained
   *
   * `ActiveSupport::Dependencies.interlock.done_unloading` (reloader.rb:113) is
   * not called — see {@link requireUnloadLockBang}.
   */
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
