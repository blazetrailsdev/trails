import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import { minutes } from "@blazetrails/activesupport";
import { assertChanges, assertDifference } from "@blazetrails/activesupport/testing/assertions";
import { travelBack, travelTo } from "@blazetrails/activesupport/testing/time-helpers";
import type { Time } from "@blazetrails/date";
import { Socket } from "@blazetrails/ruby-compat";
import {
  ClaimedExecution,
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  SolidQueueAdapter,
  Worker,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { JobResult, StoreResultJob } from "./support/job-result.js";
import { loadAppSchema } from "./support/queue-schema.js";
import { waitForRegisteredProcesses } from "./support/processes-test-helper.js";

describe("SolidQueue::ProcessTest", () => {
  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
  });

  afterEach(async () => {
    travelBack();
    vi.restoreAllMocks();
    await Job.destroyAll();
    await Process.destroyAll();
    await JobResult.deleteAll();
  });

  async function enqueueThreeOnNewQueue(): Promise<Job[]> {
    for (let i = 0; i < 3; i++) {
      await (
        StoreResultJob.set({ queue: "new_queue" }) as unknown as typeof StoreResultJob
      ).performLater(i);
    }
    return await Job.last(3);
  }

  it("prune processes with expired heartbeats", async () => {
    await Process.register({ kind: "Worker", pid: 42, name: "worker-42" });
    await Process.register({ kind: "Worker", pid: 43, name: "worker-43" });

    travelTo(minutes(10).fromNow() as Time);

    await Process.register({ kind: "Worker", pid: 44, name: "worker-44" });

    await assertDifference(
      () => Process.count(),
      -2,
      null,
      () => Process.prune(),
    );
  });

  it("prune processes with expired heartbeats and fail claimed executions", async () => {
    const process = await Process.register({ kind: "Worker", pid: 43, name: "worker-43" });
    const jobs = await enqueueThreeOnNewQueue();

    await ReadyExecution.claim("*", 5, process.id);

    travelTo(minutes(10).fromNow() as Time);

    await assertDifference(
      () => FailedExecution.count(),
      3,
      null,
      () =>
        assertDifference(
          () => ClaimedExecution.count(),
          -3,
          null,
          () => Process.prune(),
        ),
    );

    for (const job of jobs) await job.reload();
    expect((await Promise.all(jobs.map((job) => job.isFailed()))).every(Boolean)).toBeTruthy();
  });

  it("prune processes including their supervisor with expired heartbeats and fail claimed executions", async () => {
    const supervisor = await Process.register({
      kind: "Supervisor",
      pid: 42,
      name: "supervisor-42",
    });
    const process = await Process.register({
      kind: "Worker",
      pid: 43,
      name: "worker-43",
      supervisor_id: supervisor.id,
    });
    const jobs = await enqueueThreeOnNewQueue();

    await ReadyExecution.claim("*", 5, process.id);

    travelTo(minutes(10).fromNow() as Time);

    await assertDifference(
      () => Process.count(),
      -2,
      null,
      () =>
        assertDifference(
          () => FailedExecution.count(),
          3,
          null,
          () =>
            assertDifference(
              () => ClaimedExecution.count(),
              -3,
              null,
              () => Process.prune(),
            ),
        ),
    );

    for (const job of jobs) await job.reload();
    expect((await Promise.all(jobs.map((job) => job.isFailed()))).every(Boolean)).toBeTruthy();
  });

  it("hostname's with special characters are properly loaded", async () => {
    const worker = new Worker({ queues: "*", threads: 3, pollingInterval: 0.2 });
    const hostname = "Basecamp’s-Computer";

    vi.spyOn(Socket, "gethostname").mockReturnValue(hostname);
    await worker.start();
    await waitForRegisteredProcesses(1, { timeout: 1 });

    expect(((await Process.last()) as Process).hostname).toBe(hostname);

    await worker.stop();
  });

  it("clear unregistered changes before locking for heartbeat", async () => {
    const process = await Process.register({
      kind: "Supervisor",
      pid: 43,
      name: "supervisor-43",
    });

    const failedHeartbeatAt = minutes(10).ago() as Time;
    process.last_heartbeat_at = failedHeartbeatAt;

    await assertChanges(
      () => process.last_heartbeat_at,
      null,
      {},
      () => process.heartbeat(),
    );
  });
});
