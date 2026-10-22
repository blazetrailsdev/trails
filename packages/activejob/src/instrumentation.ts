import { Concern, extend, Notifications } from "@blazetrails/activesupport";
import { block, defineModule, rbCallSuper, rbModConstSet } from "@blazetrails/ruby-compat";
import { ActiveJob } from "./namespaces.js";

interface InstrumentationJob {
  scheduledAt: unknown;
  queueAdapter: unknown;
  _haltedCallbackHookCalled?: unknown;
  instrument(
    operation: string,
    payload?: Record<string, unknown>,
    block?: () => unknown,
  ): Promise<unknown>;
}

interface InstrumentationClass {
  aroundEnqueue(...filters: unknown[]): void;
}

/** @internal */
export async function instrumentEnqueueAll(
  queueAdapter: unknown,
  jobs: unknown[],
  block: (payload: Record<string, unknown>) => Promise<unknown>,
): Promise<unknown> {
  const payload: Record<string, unknown> = { adapter: queueAdapter, jobs: jobs };
  return await Notifications.instrument("enqueue_all.active_job", payload, async () => {
    const result = await block(payload);
    payload["enqueued_count"] = result;
    return result;
  });
}
Object.assign(ActiveJob, { instrumentEnqueueAll });

async function performNow(this: InstrumentationJob): Promise<unknown> {
  return await this.instrument("perform", {}, () => rbCallSuper(this, performNow));
}

/** @internal */
async function _performJob(this: InstrumentationJob): Promise<unknown> {
  await this.instrument("perform_start");
  return await rbCallSuper(this, _performJob);
}

/** @internal */
async function instrument(
  this: InstrumentationJob,
  operation: string,
  payload: Record<string, unknown> = {},
  block?: () => unknown,
): Promise<unknown> {
  payload["job"] = this;
  payload["adapter"] = this.queueAdapter;

  return await Notifications.instrument(`${operation}.active_job`, payload, async () => {
    const value = block ? await block() : null;
    if (Object.hasOwn(this, "_haltedCallbackHookCalled"))
      payload["aborted"] = this._haltedCallbackHookCalled;
    this._haltedCallbackHookCalled = null;
    return value;
  });
}

/** @internal */
function haltedCallbackHook(this: InstrumentationJob, ...args: unknown[]): void {
  rbCallSuper(this, haltedCallbackHook, ...args);
  this._haltedCallbackHookCalled = true;
}

export const Instrumentation = defineModule(
  { performNow },
  {},
  { _performJob, instrument, haltedCallbackHook },
);
extend(Instrumentation, Concern);

(
  Instrumentation as unknown as { included(base: null, block: (this: never) => void): void }
).included(null, function (this: InstrumentationClass) {
  this.aroundEnqueue(
    block(function (this: InstrumentationJob, _: unknown, block: () => unknown) {
      return this.scheduledAt != null && this.scheduledAt !== false
        ? this.instrument("enqueue_at", {}, block)
        : this.instrument("enqueue", {}, block);
    }),
  );
});

rbModConstSet(ActiveJob, "Instrumentation", Instrumentation);
