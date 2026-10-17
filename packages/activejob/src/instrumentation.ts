import { Notifications, Concern } from "@blazetrails/activesupport";
import {
  Module,
  rbObjAsString,
  rtest,
  block as rbBlock,
  extend,
  rbModConstSet,
} from "@blazetrails/ruby-compat";
import { ActiveJob as ActiveJobSeat } from "./namespaces.js";

export function instrumentEnqueueAll(queueAdapter: any, jobs: any, block?: any): any {
  const payload: any = { adapter: queueAdapter, jobs: jobs };
  return Notifications.instrument("enqueue_all.active_job", payload, async () => {
    const result: any = await block(payload);
    payload["enqueued_count"] = result;
    return result;
  });
}

export const ActiveJob: any = ActiveJobSeat;
Object.assign(ActiveJob, { instrumentEnqueueAll });
export function performNow(this: any): any {
  return this.instrument("perform", undefined, () =>
    Instrumentation.superMethod(this, "performNow")!(),
  );
}

/** @internal */
export async function _performJob(this: any): Promise<any> {
  await this.instrument("perform_start");
  return Instrumentation.superMethod(this, "_performJob")!();
}

/** @internal */
export function instrument(this: any, operation: any, payload: any = {}, block?: any): any {
  payload["job"] = this;
  payload["adapter"] = this.queueAdapter();
  return Notifications.instrument(`${rbObjAsString(operation)}.active_job`, payload, async () => {
    let value: any;
    if (rtest(block)) {
      value = await block();
    }
    if (rtest(this._haltedCallbackHookCalled !== undefined)) {
      payload["aborted"] = this._haltedCallbackHookCalled;
    }
    this._haltedCallbackHookCalled = null;
    return value;
  });
}

/** @internal */
export function haltedCallbackHook(this: any, ...rest: any[]): any {
  Instrumentation.superMethod(this, "haltedCallbackHook")!(...rest);
  return (this._haltedCallbackHookCalled = true);
}

export const Instrumentation: any = new Module((mod: any) => {
  mod.defineMethod("performNow", performNow);
  mod.defineMethod("_performJob", _performJob);
  mod.defineMethod("instrument", instrument);
  mod.defineMethod("haltedCallbackHook", haltedCallbackHook);
});
extend(Instrumentation, Concern);
Instrumentation.included(null, function (this: any): void {
  const base = this;
  base.aroundEnqueue(
    rbBlock(function (this: any, _?: any, block?: any) {
      if (rtest(this.scheduledAt)) {
        return this.instrument("enqueue_at", undefined, block);
      } else {
        return this.instrument("enqueue", undefined, block);
      }
    }),
  );
});
rbModConstSet(ActiveJobSeat, "Instrumentation", Instrumentation);
