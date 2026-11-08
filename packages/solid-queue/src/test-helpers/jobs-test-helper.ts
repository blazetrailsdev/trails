import type { Base as ActiveJobBase } from "@blazetrails/activejob";
import { waitWhileWithTimeout } from "./processes-test-helper.js";
import { Job } from "../job.js";
import { Record } from "../record.js";

export async function waitForJobsToFinishFor(
  timeout = 1,
  { except = [] }: { except?: ActiveJobBase | ActiveJobBase[] } = {},
) {
  await waitWhileWithTimeout(
    timeout,
    async () =>
      await Record.uncached(() =>
        Job.where()
          .not({ active_job_id: [except].flat().map((job) => job.jobId) })
          .where({ finished_at: null })
          .isAny(),
      ),
  );
}

export async function waitForJobsToBeEnqueued(count: number, { timeout = 1 } = {}) {
  await waitWhileWithTimeout(
    timeout,
    async () => await Record.uncached(async () => (await Job.count()) < count),
  );
}

export function silentOnThreadErrorFor(
  exceptions: object | object[],
  onThreadError: ((error: unknown) => unknown) | null,
) {
  return (exception: unknown) => {
    if (![exceptions].flat().some((e) => (exception as object)?.constructor === e)) {
      onThreadError?.(exception);
    }
  };
}
