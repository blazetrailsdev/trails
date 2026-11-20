import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { ConnectionNotEstablished } from "@blazetrails/activerecord";
import { TopLevel as AsTopLevel, isPresent, minutes, pluck } from "@blazetrails/activesupport";
import {
  File,
  FileUtils,
  Process as RbProcess,
  RuntimeError,
  SecureRandom,
  SystemCallError,
} from "@blazetrails/ruby-compat";
import { SolidQueue } from "../lib/solid-queue.js";
import {
  BlockedExecution,
  ClaimedExecution,
  Configuration,
  FailedExecution,
  ForkSupervisor,
  Process,
  ReadyExecution,
  SolidQueueAdapter,
} from "../lib/index.js";
import { Record } from "../lib/record.js";
import { JobResult, StoreResultJob } from "./support/job-result.js";
import { ThrottledUpdateResultJob } from "./support/throttled-update-result-job.js";
import { ApplicationJob } from "./support/application-job.js";
import { loadAppSchema } from "./support/queue-schema.js";
import {
  assertNoRegisteredProcesses,
  assertRegisteredProcesses,
  findProcessesRegisteredAs,
  isProcessExists,
  runSupervisorAsFork,
  runSupervisorAsForkWithCapturedIo,
  sleep,
  terminateProcess,
  waitForProcessTerminationWithTimeout,
  waitForRegisteredProcesses,
} from "./support/processes-test-helper.js";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import { destroyRecords } from "./test-helper.js";

const dummyRoot = `${import.meta.dirname}/support/dummy`;

function configFilePath(name: string): string {
  return `${dummyRoot}/config/${name}.yml`;
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
  await Record.uncached(async () => {
    const processes = await findProcessesRegisteredAs("Supervisor(fork)").toArray();
    expect(processes.length).toEqual(1);
    expect(await processes[0].supervisor).toBeNull();
    expect(processes[0].pid).toEqual(pid);
  });
}

type SupervisorInternals = {
  processInstances: { [pid: string]: unknown };
  configuredProcesses: { [pid: string]: unknown };
  releaseClaimedJobsBy(...args: unknown[]): Promise<void>;
  startProcess(...args: unknown[]): Promise<void>;
  replaceFork(pid: string, status: unknown): Promise<void>;
  reapTerminatedForks(): Promise<void>;
};

class ForkSupervisorTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "ForkSupervisorTest", ForkSupervisorTest);

describe("ForkSupervisorTest", { timeout: 60_000 }, () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;
  let previousPidfile: unknown;
  let pidfile: string;
  const pids: number[] = [];

  function run(options: { [key: string]: unknown } = {}) {
    const pid = runSupervisorAsFork(options);
    pids.push(pid);
    return pid;
  }

  async function runWithCapturedIo(options: { [key: string]: unknown } = {}) {
    const result = await runSupervisorAsForkWithCapturedIo(options);
    pids.push(result[0]);
    return result;
  }

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(async () => {
    await destroyRecords();
    previousPidfile = SolidQueue.supervisorPidfile;
    pidfile = `${dummyRoot}/tmp/pids/pidfile_${SecureRandom.hex()}.pid`;
    SolidQueue.supervisorPidfile = pidfile;
    vi.spyOn(AsTopLevel.Trails!, "root").mockReturnValue(dummyRoot);
  });

  afterEach(async () => {
    for (const pid of pids.splice(0)) {
      if (isProcessExists(pid))
        await terminateProcess(pid).catch(() => RbProcess.kill("KILL", pid));
    }
    for (const process of await Record.uncached(() => Process.all().toArray())) {
      try {
        if (process.pid !== RbProcess.pid) RbProcess.kill("KILL", process.pid);
      } catch (error) {
        if (!(error instanceof SystemCallError)) throw error;
      }
    }
    SolidQueue.supervisorPidfile = previousPidfile;
    if (await File.isExistAsync(pidfile)) await File.deleteAsync(pidfile);
    vi.restoreAllMocks();
    await destroyRecords();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("start", async () => {
    const pid = run();
    await waitForRegisteredProcesses(4, { timeout: 10 });

    await assertRegisteredSupervisor(pid);
    await assertRegisteredWorkers({ count: 2, supervisorPid: pid });
    await assertRegisteredDispatcher({ supervisorPid: pid });

    await terminateProcess(pid);

    await assertNoRegisteredProcesses();
  });

  it("start with provided configuration", async () => {
    const pid = run({ dispatchers: [{ batchSize: 100 }] });
    await waitForRegisteredProcesses(2, { timeout: 10 });

    await assertRegisteredSupervisor(pid);
    await assertRegisteredWorkers({ count: 0 });
    await assertRegisteredDispatcher({ supervisorPid: pid });

    await terminateProcess(pid);

    await assertNoRegisteredProcesses();
  });

  it("start with empty configuration", async () => {
    const [pid, , error] = await runWithCapturedIo({ workers: [], dispatchers: [] });
    await sleep(0.5);
    await assertNoRegisteredProcesses();

    expect(isProcessExists(pid)).toBeFalsy();
    expect(error).toMatch(/No processes configured/);
  });

  it("start with invalid recurring tasks", async () => {
    const [pid, , error] = await runWithCapturedIo({
      recurringScheduleFile: configFilePath("recurring_with_invalid"),
      skipRecurring: false,
    });

    await sleep(0.5);
    await assertNoRegisteredProcesses();

    expect(isProcessExists(pid)).toBeFalsy();
    expect(error).toMatch(/Invalid recurring tasks/);
  });

  it("create and delete pidfile", async () => {
    expect(await File.isExistAsync(pidfile)).toBeFalsy();

    const pid = run();
    await waitForRegisteredProcesses(4, { timeout: 10 });

    expect(await File.isExistAsync(pidfile)).toBeTruthy();
    expect(parseInt((await File.readAsync(pidfile)).trim(), 10)).toEqual(pid);

    await terminateProcess(pid);

    expect(await File.isExistAsync(pidfile)).toBeFalsy();
  });

  it("abort if there's already a pidfile for a supervisor", async () => {
    await FileUtils.mkdirPAsync(File.dirname(pidfile));
    await File.writeAsync(pidfile, RbProcess.pid.toString());

    const [pid, , err] = await runWithCapturedIo();
    await waitForRegisteredProcesses(4, { timeout: 10 });

    expect(await File.isExistAsync(pidfile)).toBeTruthy();
    expect(parseInt((await File.readAsync(pidfile)).trim(), 10)).not.toEqual(pid);
    expect(err).toMatch(/A Solid Queue supervisor is already running/);

    await waitForProcessTerminationWithTimeout(pid, { exitstatus: 1 });
  });

  it("delete previous pidfile if the owner is dead", async () => {
    let pid = run();
    await waitForRegisteredProcesses(4, { timeout: 10 });

    await terminateProcess(pid, { signal: "KILL" });

    expect(await File.isExistAsync(pidfile)).toBeTruthy();
    expect(parseInt((await File.readAsync(pidfile)).trim(), 10)).toEqual(pid);

    await waitForRegisteredProcesses(0);

    pid = run();
    await waitForRegisteredProcesses(4, { timeout: 10 });

    expect(await File.isExistAsync(pidfile)).toBeTruthy();
    expect(parseInt((await File.readAsync(pidfile)).trim(), 10)).toEqual(pid);

    await terminateProcess(pid);
  });

  it("replace a terminated fork even if releasing its claimed jobs fails", async () => {
    const configuration = new Configuration({
      workers: [{ queues: "*", processes: 1 }],
      dispatchers: [],
      skipRecurring: true,
    });
    const supervisor = new ForkSupervisor(configuration) as unknown as SupervisorInternals;

    const configuredProcess = (await configuration.configuredProcesses())[0];
    const terminatedFork = {
      kind: "Worker",
      name: "worker-42",
      hostname: "localhost",
      markAsReaped: () => true,
    };

    supervisor.processInstances[42] = terminatedFork;
    supervisor.configuredProcesses[42] = configuredProcess;

    const releaseClaimedJobsBy = vi
      .spyOn(supervisor, "releaseClaimedJobsBy")
      .mockRejectedValue(new ConnectionNotEstablished("connection is closed"));
    const startProcess = vi.spyOn(supervisor, "startProcess").mockResolvedValue();

    const status = {
      isExited: () => true,
      exitstatus: () => 1,
      pid: 42,
      isSignaled: () => false,
      stopsig: () => null,
      termsig: () => null,
    };

    await expect(supervisor.replaceFork("42", status)).resolves.not.toThrow();
    expect(releaseClaimedJobsBy).toHaveBeenCalledOnce();
    expect(startProcess).toHaveBeenCalledExactlyOnceWith(configuredProcess);
  });

  it("reap a terminated fork on shutdown even if releasing its claimed jobs fails", async () => {
    const configuration = new Configuration({
      workers: [{ queues: "*", processes: 1 }],
      dispatchers: [],
      skipRecurring: true,
    });
    const supervisor = new ForkSupervisor(configuration) as unknown as SupervisorInternals;

    const terminatedFork = {
      kind: "Worker",
      name: "worker-42",
      hostname: "localhost",
      markAsReaped: () => true,
    };
    supervisor.processInstances[42] = terminatedFork;
    supervisor.configuredProcesses[42] = (await configuration.configuredProcesses())[0];

    const status = {
      isExited: () => false,
      exitstatus: () => null,
      pid: 42,
      isSignaled: () => true,
      stopsig: () => null,
      termsig: () => 9,
    };
    vi.spyOn(RbProcess, "waitpid2")
      .mockReturnValueOnce([42, status as never])
      .mockReturnValue(null);
    const releaseClaimedJobsBy = vi
      .spyOn(supervisor, "releaseClaimedJobsBy")
      .mockRejectedValue(new ConnectionNotEstablished("connection is closed"));

    await expect(supervisor.reapTerminatedForks()).resolves.not.toThrow();
    expect(releaseClaimedJobsBy).toHaveBeenCalledOnce();

    expect(supervisor.processInstances).toBeEmpty();
    expect(supervisor.configuredProcesses).toBeEmpty();
  });

  it("fail orphaned executions", async () => {
    for (let i = 0; i < 3; i++) await StoreResultJob.set({ queue: "new_queue" }).performLater(i);
    const process = await Process.register({ kind: "Worker", pid: 42, name: "worker-123" });

    await ReadyExecution.claim("*", 5, process.id);

    expect(await ClaimedExecution.count()).toEqual(3);
    expect(await ReadyExecution.count()).toEqual(0);

    expect([...new Set(pluck(await ClaimedExecution.last(3), "process_id"))]).toEqual([process.id]);

    await process.delete();

    const pid = run({ workers: [{ queues: "background", pollingInterval: 10, processes: 2 }] });
    await waitForRegisteredProcesses(3, { timeout: 10 });
    await assertRegisteredSupervisor(pid);

    await terminateProcess(pid);

    await Record.uncached(async () => {
      expect(await ClaimedExecution.count()).toEqual(0);
      expect(await FailedExecution.count()).toEqual(3);
    });
  });

  it("fail orphaned executions by releasing their concurrency locks", async () => {
    const result = await JobResult.createBang({ queue_name: "default", status: "seq: " });
    for (let i = 0; i < 4; i++) {
      await ThrottledUpdateResultJob.set({ queue: "new_queue" }).performLater(result);
    }
    const process = await Process.register({ kind: "Worker", pid: 42, name: "worker-123" });

    await ReadyExecution.claim("*", 5, process.id);

    expect(await ClaimedExecution.count()).toEqual(3);
    expect(await ReadyExecution.count()).toEqual(0);
    expect(await BlockedExecution.count()).toEqual(1);

    expect([...new Set(pluck(await ClaimedExecution.last(3), "process_id"))]).toEqual([process.id]);

    await process.delete();

    const pid = run({ workers: [{ queues: "background", pollingInterval: 10, processes: 2 }] });
    await waitForRegisteredProcesses(3, { timeout: 10 });
    await assertRegisteredSupervisor(pid);

    await terminateProcess(pid);

    await Record.uncached(async () => {
      expect(await ClaimedExecution.count()).toEqual(0);
      expect(await FailedExecution.count()).toEqual(3);
      expect(await BlockedExecution.count()).toEqual(0);
      expect(await ReadyExecution.count()).toEqual(1);
    });
  });

  it("prune processes with expired heartbeats", async () => {
    const pruned = await Process.register({ kind: "Worker", pid: 42, name: "worker-42" });

    await Process.updateAll({ last_heartbeat_at: minutes(10).ago() });

    const notPruned = await Process.register({ kind: "Worker", pid: 44, name: "worker-44" });

    expect(await Process.count()).toEqual(2);

    const pid = run({ loadConfigurationFrom: { workers: [{ queues: "background" }] } });
    await waitForRegisteredProcesses(4, { timeout: 10 });

    await terminateProcess(pid);

    await Record.uncached(async () => {
      expect(await Process.count()).toEqual(1);
      expect(await Process.findBy({ id: pruned.id })).toBeNull();
      expect(isPresent(await Process.findBy({ id: notPruned.id }))).toBeTruthy();
    });
  });

  it("release_claimed_jobs_by fails claimed executions even if supervisor record is missing", async () => {
    const workerName = `worker-test-${SecureRandom.hex(4)}`;

    const workerProcess = await Process.register({
      kind: "Worker",
      pid: 999_999,
      name: workerName,
    });

    await StoreResultJob.performLater(42);
    const claimedExecution = (await ReadyExecution.claim("*", 1, workerProcess.id))[0];

    const terminatedFork = { name: workerName };
    const supervisor = Object.create(ForkSupervisor.prototype) as SupervisorInternals;
    const error = new RuntimeError();

    await supervisor.releaseClaimedJobsBy(terminatedFork, { withError: error });

    const failed = await FailedExecution.findBy({ job_id: claimedExecution.job_id });
    expect(isPresent(failed)).toBeTruthy();
    expect(failed!.exceptionClass()).toEqual("RuntimeError");
  });

  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (`fork`): a child boots for seconds, past the 0.2s / 0.5s `fork_boot_timeout`.
  it.skip("replace only the fork that does not finish booting", () => {});

  // PERMANENT-SKIP: CLAUDE.md, "Runtime facts Node does not expose" (`fork`): a child boots for seconds, past the 0.2s / 0.5s `fork_boot_timeout`.
  it.skip("preserve a fork that finishes booting before the timeout", () => {});
});
