import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./test-helpers/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { minutes } from "@blazetrails/activesupport";
import {
  File,
  FileUtils,
  SecureRandom,
  SystemExit,
  Process as RubyProcess,
  getProcessAdapter,
} from "@blazetrails/ruby-compat";
import { SolidQueue } from "./solid-queue.js";
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

  it("create and delete pidfile", async () => {
    expect(await File.isExistAsync(pidfile)).toBe(false);

    const run = runSupervisor();
    const pid = RubyProcess.pid;
    await waitForRegisteredProcesses(4);

    expect(await File.isExistAsync(pidfile)).toBe(true);
    expect(parseInt((await File.readAsync(pidfile)).trim(), 10)).toBe(pid);

    await run.terminate();

    expect(await File.isExistAsync(pidfile)).toBe(false);
  });

  it("abort if there's already a pidfile for a supervisor", async () => {
    await FileUtils.mkdirPAsync(File.dirname(pidfile));
    await File.writeAsync(pidfile, RubyProcess.pid.toString());
    const err: string[] = [];
    vi.spyOn(getProcessAdapter().stderr, "write").mockImplementation((chunk) => {
      err.push(String(chunk));
      return true;
    });
    const setExitCode = vi.spyOn(getProcessAdapter(), "setExitCode").mockImplementation(() => {});

    const run = runSupervisor();
    await waitForRegisteredProcesses(4);

    expect(await File.isExistAsync(pidfile)).toBe(true);
    expect(await File.readAsync(pidfile)).toBe(RubyProcess.pid.toString());
    expect(err.join("")).toMatch(/A Solid Queue supervisor is already running/);

    const error = await run.terminate().catch((e: unknown) => e);
    expect(error).toBeInstanceOf(SystemExit);
    expect((error as SystemExit).status).toBe(1);
    expect(setExitCode).toHaveBeenCalledWith(1);
  });

  it("delete previous pidfile if the owner is dead", async () => {
    const deadPid = 4194304 + 1;
    await FileUtils.mkdirPAsync(File.dirname(pidfile));
    await File.writeAsync(pidfile, deadPid.toString());

    const run = runSupervisor();
    const pid = RubyProcess.pid;
    await waitForRegisteredProcesses(4);

    expect(await File.isExistAsync(pidfile)).toBe(true);
    expect(parseInt((await File.readAsync(pidfile)).trim(), 10)).toBe(pid);

    await run.terminate();
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
