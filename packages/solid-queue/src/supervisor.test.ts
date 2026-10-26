import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import "./test-helpers/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { minutes } from "@blazetrails/activesupport";
import { Job, Process, Supervisor, SolidQueueAdapter } from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { loadAppSchema } from "./test-helpers/queue-schema.js";
import { runSupervisor, waitForRegisteredProcesses } from "./test-helpers/processes-test-helper.js";

async function assertRegisteredProcesses(kind: string, count: number, supervisor?: Supervisor) {
  const processes = await Process.where({ kind }).toArray();
  expect(processes.length).toBe(count);
  for (const process of processes) {
    if (supervisor) expect(process.supervisor_id).toBe(supervisor.processId);
  }
}

describe("SupervisorTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Job.destroyAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("start", async () => {
    const run = runSupervisor();
    await waitForRegisteredProcesses(4);

    await assertRegisteredProcesses("Supervisor", 1);
    await assertRegisteredProcesses("Worker", 2, run.supervisor);
    await assertRegisteredProcesses("Dispatcher", 1, run.supervisor);

    await run.terminate();

    expect(await Process.count()).toBe(0);
  });

  it("start with provided configuration", async () => {
    const run = runSupervisor({ dispatchers: [{ batch_size: 100 }] });
    await waitForRegisteredProcesses(2, { timeout: 2 });

    await assertRegisteredProcesses("Supervisor", 1);
    await assertRegisteredProcesses("Worker", 0);
    await assertRegisteredProcesses("Dispatcher", 1, run.supervisor);

    await run.terminate();

    expect(await Process.count()).toBe(0);
  });

  it("prune processes with expired heartbeats", async () => {
    const pruned = await Process.register({ kind: "Worker", pid: 42, name: "worker-42" });

    await Process.updateAll({ last_heartbeat_at: minutes(10).ago() });

    const notPruned = await Process.register({ kind: "Worker", pid: 44, name: "worker-44" });

    expect(await Process.count()).toBe(2);

    const run = runSupervisor({ workers: [{ queues: "background" }] });
    await waitForRegisteredProcesses(4);

    await run.terminate();

    expect(await Process.count()).toBe(1);
    expect(await Process.findBy({ id: pruned.id })).toBeNull();
    expect(await Process.findBy({ id: notPruned.id })).not.toBeNull();
  });
});
