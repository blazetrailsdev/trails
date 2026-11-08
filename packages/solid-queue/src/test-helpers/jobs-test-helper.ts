import { waitWhileWithTimeout } from "./processes-test-helper.js";
import { Job } from "../job.js";

export async function waitForJobsToFinishFor(timeout = 1) {
  await waitWhileWithTimeout(timeout, () => Job.where({ finished_at: null }).isAny());
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

export async function waitForJobsToBeEnqueued(count: number, { timeout = 1 } = {}) {
  await waitWhileWithTimeout(timeout, async () => (await Job.count()) < count);
}
