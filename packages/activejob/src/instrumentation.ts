import { Notifications, Callbacks, Concern } from "@blazetrails/activesupport";
import { extend, classModule, Extended } from "@blazetrails/ruby-compat";
import { Execution } from "./execution.js";
import type { Base } from "./base.js";

export function instrumentEnqueueAll(
  queueAdapter: unknown,
  jobs: unknown[],
  block?: (...args: unknown[]) => unknown,
) {
  const payload: Record<string, unknown> = { adapter: queueAdapter, jobs: jobs };
  return Notifications.instrument("enqueue_all.active_job", payload, () => {
    const result = block(payload);
    payload["enqueued_count"] = result;
    return result;
  });
}

export class Instrumentation {
  declare _haltedCallbackHookCalled: boolean | null;
  declare static included: Extended<typeof Concern>["included"];

  static readonly [classModule] = true;

  static toString(): string {
    return "ActiveJob::Instrumentation";
  }

  async performNow(this: Base) {
    return await this.instrument(
      "perform",
      undefined,
      async () => await Execution.prototype.performNow.call(this),
    );
  }

  /** @internal */
  async _performJob(this: Base) {
    await this.instrument("perform_start");
    return await Execution.prototype._performJob.call(this);
  }

  /** @internal */
  async instrument(
    this: Base,
    operation: string,
    payload: Record<string, unknown> | undefined = {},
    block?: (...args: unknown[]) => unknown,
  ) {
    payload["job"] = this;
    payload["adapter"] = this.queueAdapter;
    return Notifications.instrument(`${operation}.active_job`, payload, async () => {
      let value;
      if (block != null) {
        value = await block();
      }
      if (this._haltedCallbackHookCalled !== undefined) {
        payload["aborted"] = this._haltedCallbackHookCalled;
      }
      this._haltedCallbackHookCalled = null;
      return value;
    });
  }

  /** @internal */
  haltedCallbackHook(this: Base, ...rest: unknown[][]) {
    Callbacks.instanceMethod("haltedCallbackHook")!.value.call(this, ...rest);
    return (this._haltedCallbackHookCalled = true);
  }
}
extend(Instrumentation, Concern);
Instrumentation.included(null, function (this: typeof Base): void {
  this.aroundEnqueue(async function (this: Base, _: unknown, block: unknown) {
    if (this.scheduledAt != null) {
      return await this.instrument(
        "enqueue_at",
        undefined,
        block as undefined | ((...args: unknown[]) => unknown),
      );
    } else {
      return await this.instrument(
        "enqueue",
        undefined,
        block as undefined | ((...args: unknown[]) => unknown),
      );
    }
  });
});
