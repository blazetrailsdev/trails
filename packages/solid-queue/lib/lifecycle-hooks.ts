import { Concern, extend, mattrReader } from "@blazetrails/activesupport";
import { classModule, fetch } from "@blazetrails/ruby-compat";

type Hooks = Record<"start" | "stop" | "exit", ((process: unknown) => unknown)[]>;

interface LifecycleHooksHost {
  constructor: { lifecycleHooks: Hooks };
  runHooksFor(event: "start" | "stop" | "exit"): Promise<void>;
  handleThreadError(error: unknown): void;
}

export class ClassMethods {
  static onStart(this: { lifecycleHooks: Hooks }, block: (process: unknown) => unknown): void {
    this.lifecycleHooks.start.push(block);
  }

  static onStop(this: { lifecycleHooks: Hooks }, block: (process: unknown) => unknown): void {
    this.lifecycleHooks.stop.push(block);
  }

  static onExit(this: { lifecycleHooks: Hooks }, block: (process: unknown) => unknown): void {
    this.lifecycleHooks.exit.push(block);
  }

  static clearHooks(this: { lifecycleHooks: Hooks }): void {
    this.lifecycleHooks.exit = [];
    this.lifecycleHooks.start = [];
    this.lifecycleHooks.stop = [];
  }
}

export class LifecycleHooks {
  static readonly [classModule] = true;
  declare static ClassMethods: typeof ClassMethods;

  /** @internal */
  async runStartHooks(this: LifecycleHooksHost): Promise<void> {
    await this.runHooksFor("start");
  }

  /** @internal */
  async runStopHooks(this: LifecycleHooksHost): Promise<void> {
    await this.runHooksFor("stop");
  }

  /** @internal */
  async runExitHooks(this: LifecycleHooksHost): Promise<void> {
    await this.runHooksFor("exit");
  }

  /** @internal */
  async runHooksFor(this: LifecycleHooksHost, event: "start" | "stop" | "exit"): Promise<void> {
    for (const block of fetch<((process: unknown) => unknown)[]>(
      this.constructor.lifecycleHooks,
      event,
      [],
    )) {
      try {
        await block(this);
      } catch (exception) {
        this.handleThreadError(exception);
      }
    }
  }
}
extend(LifecycleHooks, Concern);
Object.defineProperty(LifecycleHooks, "ClassMethods", { value: ClassMethods });
(
  LifecycleHooks as unknown as {
    included(base: null, block: (this: object) => void): void;
  }
).included(null, function (this: object) {
  mattrReader.call(this, "lifecycleHooks", { default: { start: [], stop: [], exit: [] } });
});
