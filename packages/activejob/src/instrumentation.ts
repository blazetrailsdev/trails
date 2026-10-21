import { Notifications } from "@blazetrails/activesupport";
import { ActiveJob } from "./namespaces.js";

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
