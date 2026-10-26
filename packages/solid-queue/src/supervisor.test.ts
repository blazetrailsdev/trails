import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./test-helpers/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { TopLevel, minutes } from "@blazetrails/activesupport";
import { Job, Process, Supervisor, SolidQueueAdapter } from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { loadAppSchema } from "./test-helpers/queue-schema.js";

const dummyRoot = `${import.meta.dirname}/../../../vendor/solid_queue/v1.1.3/test/dummy`;
const sleep = (s: number) => new Promise((resolve) => setTimeout(resolve, s * 1000));

async function waitForRegisteredProcesses(count: number, { timeout = 1 } = {}) {
  const end = Date.now() + timeout * 1000;
  while (Date.now() < end && (await Process.count()) !== count) await sleep(0.05);
}

function runSupervisor(options: { [key: string]: unknown } = {}) {
  const supervisors: Supervisor[] = [];
  const started = vi.spyOn(Supervisor.prototype, "start").mockImplementationOnce(function (
    this: Supervisor,
  ) {
    supervisors.push(this);
    started.mockRestore();
    return this.start();
  });
  const running = Supervisor.start({ skipRecurring: true, ...options });
  return {
    get supervisor() {
      return supervisors[0];
    },
    async terminate(signal: "TERM" | "QUIT" = "TERM") {
      const supervisor = supervisors[0];
      (supervisor as unknown as { signalQueue(): string[] }).signalQueue().push(signal);
      await (supervisor as unknown as { interrupt(): Promise<void> }).interrupt();
      await running;
    },
  };
}

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

  beforeEach(() => {
    vi.spyOn(TopLevel.Trails!, "root").mockReturnValue(dummyRoot);
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
