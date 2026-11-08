import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./test-helpers/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { isPresent, minutes, pluck } from "@blazetrails/activesupport";
import {
  File,
  FileUtils,
  SecureRandom,
  Process as RubyProcess,
  getProcessAdapter,
} from "@blazetrails/ruby-compat";
import { SolidQueue } from "./solid-queue.js";
import {
  ClaimedExecution,
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  SolidQueueAdapter,
} from "./index.js";
import { StoreResultJob } from "./test-helpers/job-result.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { loadAppSchema } from "./test-helpers/queue-schema.js";
import {
  assertNoRegisteredProcesses,
  assertRegisteredProcesses,
  findProcessesRegisteredAs,
  runSupervisor,
  sleep,
  waitForProcessTerminationWithTimeout,
  waitForRegisteredProcesses,
} from "./test-helpers/processes-test-helper.js";

const dummyRoot = `${import.meta.dirname}/test-helpers/dummy`;

function configFilePath(name: string): string {
  return `${dummyRoot}/config/${name}.yml`;
}

function captureStderr(): string[] {
  const err: string[] = [];
  vi.spyOn(getProcessAdapter().stderr, "write").mockImplementation((chunk) => {
    err.push(String(chunk));
    return true;
  });
  vi.spyOn(getProcessAdapter(), "setExitCode").mockImplementation(() => {});
  return err;
}

async function assertRegisteredWorkers({
  supervisorPid = null,
  count = 1,
}: { supervisorPid?: number | null; count?: number } = {}) {
  await assertRegisteredProcesses({ kind: "Worker", count, supervisorPid });
}

async function assertRegisteredDispatcher({
  supervisorPid = null,
}: { supervisorPid?: number | null } = {}) {
  await assertRegisteredProcesses({ kind: "Dispatcher", count: 1, supervisorPid });
}

async function assertRegisteredSupervisor(pid: number) {
  const processes = await findProcessesRegisteredAs("Supervisor").toArray();
  expect(processes.length).toEqual(1);
  expect(await processes[0].supervisor).toBeNull();
  expect(processes[0].pid).toEqual(pid);
}

describe("SupervisorTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;
  let previousPidfile: unknown;
  let pidfile: string;

  beforeEach(() => {
    previousPidfile = SolidQueue.supervisorPidfile;
    pidfile = `${import.meta.dirname}/test-helpers/dummy/tmp/pids/pidfile_${SecureRandom.hex()}.pid`;
    SolidQueue.supervisorPidfile = pidfile;
  });

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterEach(async () => {
    SolidQueue.supervisorPidfile = previousPidfile;
    if (await File.isExistAsync(pidfile)) await File.deleteAsync(pidfile);
    vi.restoreAllMocks();
    await Job.destroyAll();
    await Process.destroyAll();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("start", async () => {
    const run = runSupervisor();
    const pid = RubyProcess.pid;
    await waitForRegisteredProcesses(4);

    await assertRegisteredSupervisor(pid);
    await assertRegisteredWorkers({ count: 2, supervisorPid: pid });
    await assertRegisteredDispatcher({ supervisorPid: pid });

    await run.terminate();

    await assertNoRegisteredProcesses();
  });

  it("start with provided configuration", async () => {
    const run = runSupervisor({ dispatchers: [{ batch_size: 100 }] });
    await waitForRegisteredProcesses(2, { timeout: 2 });

    const pid = RubyProcess.pid;

    await assertRegisteredSupervisor(pid);
    await assertRegisteredWorkers({ count: 0 });
    await assertRegisteredDispatcher({ supervisorPid: pid });

    await run.terminate();

    await assertNoRegisteredProcesses();
  });

  it("start with empty configuration", async () => {
    const error = captureStderr();
    const run = runSupervisor({ workers: [], dispatchers: [] });
    await sleep(0.5);
    await assertNoRegisteredProcesses();

    await waitForProcessTerminationWithTimeout(run, { exitstatus: 1 });
    expect(run.supervisor).toBeFalsy();
    expect(error.join("")).toMatch(/No processes configured/);
  });

  it("start with invalid recurring tasks", async () => {
    const error = captureStderr();
    const run = runSupervisor({
      recurringScheduleFile: configFilePath("recurring_with_invalid"),
      skipRecurring: false,
    });

    await sleep(0.5);
    await assertNoRegisteredProcesses();

    await waitForProcessTerminationWithTimeout(run, { exitstatus: 1 });
    expect(run.supervisor).toBeFalsy();
    expect(error.join("")).toMatch(/Invalid recurring tasks/);
  });

  it("create and delete pidfile", async () => {
    expect(await File.isExistAsync(pidfile)).toBeFalsy();

    const run = runSupervisor();
    const pid = RubyProcess.pid;
    await waitForRegisteredProcesses(4);

    expect(await File.isExistAsync(pidfile)).toBeTruthy();
    expect(parseInt((await File.readAsync(pidfile)).trim(), 10)).toBe(pid);

    await run.terminate();

    expect(await File.isExistAsync(pidfile)).toBeFalsy();
  });

  it("abort if there's already a pidfile for a supervisor", async () => {
    await FileUtils.mkdirPAsync(File.dirname(pidfile));
    await File.writeAsync(pidfile, RubyProcess.pid.toString());
    const err = captureStderr();

    const run = runSupervisor();
    await waitForRegisteredProcesses(4);

    expect(await File.isExistAsync(pidfile)).toBeTruthy();
    expect(err.join("")).toMatch(/A Solid Queue supervisor is already running/);

    await waitForProcessTerminationWithTimeout(run, { exitstatus: 1 });
  });

  it("delete previous pidfile if the owner is dead", async () => {
    const deadPid = 4194304 + 1;
    await FileUtils.mkdirPAsync(File.dirname(pidfile));
    await File.writeAsync(pidfile, deadPid.toString());

    const run = runSupervisor();
    const pid = RubyProcess.pid;
    await waitForRegisteredProcesses(4);

    expect(await File.isExistAsync(pidfile)).toBeTruthy();
    expect(parseInt((await File.readAsync(pidfile)).trim(), 10)).toBe(pid);

    await run.terminate();
  });

  it("fail orphaned executions", async () => {
    for (let i = 0; i < 3; i++) {
      await (
        StoreResultJob.set({ queue: "new_queue" }) as unknown as typeof StoreResultJob
      ).performLater(i);
    }
    const process = await Process.register({ kind: "Worker", pid: 42, name: "worker-123" });

    await ReadyExecution.claim("*", 5, process.id);

    expect(await ClaimedExecution.count()).toBe(3);
    expect(await ReadyExecution.count()).toBe(0);

    expect([...new Set(pluck(await ClaimedExecution.last(3), "process_id"))]).toEqual([process.id]);

    await process.delete();

    const run = runSupervisor({
      workers: [{ queues: "background", pollingInterval: 10, processes: 2 }],
    });
    const pid = RubyProcess.pid;
    await waitForRegisteredProcesses(3);
    await assertRegisteredSupervisor(pid);

    await run.terminate();

    expect(await ClaimedExecution.count()).toBe(0);
    expect(await FailedExecution.count()).toBe(3);
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
    expect(isPresent(await Process.findBy({ id: notPruned.id }))).toBeTruthy();
  });
});
