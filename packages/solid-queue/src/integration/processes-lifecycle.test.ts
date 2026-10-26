import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "../test-helpers/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { ClaimedExecution, Job, Process, SolidQueueAdapter } from "../index.js";
import { ApplicationJob } from "../test-helpers/application-job.js";
import { JobResult, StoreResultJob } from "../test-helpers/job-result.js";
import { loadAppSchema } from "../test-helpers/queue-schema.js";
import {
  runSupervisor,
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "../test-helpers/processes-test-helper.js";

async function enqueueStoreResultJob(value: string, queueName = "background") {
  return await StoreResultJob.set({ queue: queueName }).performLater(value);
}

async function assertCompletedJobResults(value: string, queueName = "background", count = 1) {
  expect(await JobResult.where({ queue_name: queueName, status: "completed", value }).count()).toBe(
    count,
  );
}

describe("ProcessesLifecycleTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;
  let run: ReturnType<typeof runSupervisor>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    run = runSupervisor({
      workers: [{ queues: "background" }, { queues: "default", threads: 5 }],
    });

    await waitForRegisteredProcesses(3, { timeout: 3 });
    const workers = await Process.where({ kind: "Worker" }).toArray();
    expect(workers.map((process) => process.metadata.get("queues")).sort()).toEqual([
      "background",
      "default",
    ]);
  });

  afterEach(async () => {
    await run.terminate();
    vi.restoreAllMocks();
    await Job.destroyAll();
    await JobResult.deleteAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("enqueue jobs in multiple queues", async () => {
    for (let i = 0; i < 6; i++) await enqueueStoreResultJob(`job_${i}`);
    for (let i = 0; i < 6; i++) await enqueueStoreResultJob(`job_${i}`, "default");

    await waitWhileWithTimeout(2, async () => await Job.where({ finished_at: null }).isAny());

    expect(await JobResult.count()).toBe(12);
    for (let i = 0; i < 6; i++) await assertCompletedJobResults(`job_${i}`, "background");
    for (let i = 0; i < 6; i++) await assertCompletedJobResults(`job_${i}`, "default");

    await run.terminate();
    await waitForRegisteredProcesses(0, { timeout: 0.2 });
    expect(await Process.count()).toBe(0);
    expect(await ClaimedExecution.count()).toBe(0);
  });
});
