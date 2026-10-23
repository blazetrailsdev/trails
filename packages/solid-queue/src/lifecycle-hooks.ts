import { Concern, extend, mattrReader } from "@blazetrails/activesupport";
import { classModule } from "@blazetrails/ruby-compat";

type Hooks = Record<"start" | "stop", (() => unknown)[]>;

interface LifecycleHooksHost {
  constructor: { lifecycleHooks: Hooks };
  runHooksFor(event: "start" | "stop"): Promise<void>;
  handleThreadError(error: unknown): void;
}

export class ClassMethods {
  static onStart(this: { lifecycleHooks: Hooks }, block: () => unknown): void {
    this.lifecycleHooks.start.push(block);
  }

  static onStop(this: { lifecycleHooks: Hooks }, block: () => unknown): void {
    this.lifecycleHooks.stop.push(block);
  }

  static clearHooks(this: { lifecycleHooks: Hooks }): void {
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
  async runHooksFor(this: LifecycleHooksHost, event: "start" | "stop"): Promise<void> {
    for (const block of this.constructor.lifecycleHooks[event] ?? []) {
      try {
        await block();
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
  mattrReader.call(this, "lifecycleHooks", { default: { start: [], stop: [] } });
});
