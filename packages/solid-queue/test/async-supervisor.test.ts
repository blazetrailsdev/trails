import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import {
  ConnectionNotEstablished,
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord";
import { Logger, pluck, TopLevel } from "@blazetrails/activesupport";
import { Process as RubyProcess, StringIO, constSet } from "@blazetrails/ruby-compat";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { assertNothingRaised } from "@blazetrails/activesupport/testing/assertions";
import { SolidQueue } from "../lib/solid-queue.js";
import {
  AsyncSupervisor,
  ClaimedExecution,
  Configuration,
  FailedExecution,
  Process,
  ReadyExecution,
  SolidQueueAdapter,
  Supervisor,
} from "../lib/index.js";
import { StoreResultJob } from "./support/job-result.js";
import { ApplicationJob } from "./support/application-job.js";
import { loadAppSchema } from "./support/queue-schema.js";
import {
  assertNoRegisteredProcesses,
  assertRegisteredProcesses,
  runSupervisor,
  waitForRegisteredProcesses,
  waitWhileWithTimeout,
} from "./support/processes-test-helper.js";
import { destroyRecords } from "./test-helper.js";

class AsyncSupervisorTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "AsyncSupervisorTest", AsyncSupervisorTest);

async function runSupervisorAsThread(options: { [key: string]: unknown } = {}) {
  return await Supervisor.start({
    mode: "async",
    standalone: false,
    skipRecurring: true,
    ...options,
  });
}

async function withSolidQueueLogger(logger: Logger, block: () => Promise<void>) {
  const oldLogger = SolidQueue.logger;
  SolidQueue.logger = logger;
  try {
    await block();
  } finally {
    SolidQueue.logger = oldLogger;
  }
}

async function simulateOrphanedExecutions(count: number) {
  for (let i = 0; i < count; i++) {
    await (
      StoreResultJob.set({ queue: "new_queue" }) as unknown as typeof StoreResultJob
    ).performLater(i);
  }
  const process = await Process.register({ kind: "Worker", pid: 42, name: "worker-123" });

  await ReadyExecution.claim("*", count + 1, process.id);

  expect(await ClaimedExecution.count()).toBe(count);
  expect(await ReadyExecution.count()).toBe(0);

  expect([...new Set(pluck(await ClaimedExecution.last(3), "process_id"))]).toEqual([process.id]);

  await process.delete();
}

describe("AsyncSupervisorTest", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  beforeEach(() => {
    vi.spyOn(TopLevel.Trails!, "root").mockReturnValue(`${import.meta.dirname}/support/dummy`);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await destroyRecords();
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  it("start as non-standalone", async () => {
    let supervisor: Supervisor | undefined;
    try {
      supervisor = await runSupervisorAsThread();
      await waitForRegisteredProcesses(4, { timeout: 3 });

      await assertRegisteredProcesses({ kind: "Supervisor(async)" });
      await assertRegisteredProcesses({
        kind: "Worker",
        supervisor_id: supervisor.processId,
        count: 2,
      });
      await assertRegisteredProcesses({ kind: "Dispatcher", supervisor_id: supervisor.processId });
    } finally {
      await supervisor?.stop();
      await assertNoRegisteredProcesses();
    }
  });

  it("start standalone", async () => {
    const run = runSupervisor({ mode: "async" });
    const pid = RubyProcess.pid;
    await waitForRegisteredProcesses(4, { timeout: 5 });

    await assertRegisteredProcesses({ kind: "Supervisor(async)" });
    await assertRegisteredProcesses({ kind: "Worker", supervisorPid: pid, count: 2 });
    await assertRegisteredProcesses({ kind: "Dispatcher", supervisorPid: pid });

    await run.terminate();
    await assertNoRegisteredProcesses();
  });

  it("start as non-standalone with provided configuration", async () => {
    let supervisor: Supervisor | undefined;
    try {
      supervisor = await runSupervisorAsThread({
        workers: [],
        dispatchers: [{ batchSize: 100 }],
        skipRecurring: false,
      });
      await waitForRegisteredProcesses(3, { timeout: 3 });

      await assertRegisteredProcesses({ kind: "Supervisor(async)" });
      await assertRegisteredProcesses({ kind: "Worker", count: 0 });
      await assertRegisteredProcesses({ kind: "Dispatcher", supervisor_id: supervisor.processId });
      await assertRegisteredProcesses({ kind: "Scheduler", supervisor_id: supervisor.processId });
    } finally {
      await supervisor?.stop();
      await assertNoRegisteredProcesses();
    }
  });

  it("failed orphaned executions as non-standalone", async () => {
    await simulateOrphanedExecutions(3);

    const config = {
      workers: [{ queues: "background", pollingInterval: 10 }],
      dispatchers: [],
    };

    let supervisor: Supervisor | undefined;
    try {
      supervisor = await runSupervisorAsThread(config);
      await waitForRegisteredProcesses(2, { timeout: 3 });
      await assertRegisteredProcesses({ kind: "Supervisor(async)" });

      await waitWhileWithTimeout(
        5,
        async () => (await ClaimedExecution.count()) > 0 || (await FailedExecution.count()) < 3,
      );

      expect(await ClaimedExecution.count()).toBe(0);
      expect(await FailedExecution.count()).toBe(3);
    } finally {
      await supervisor?.stop();
    }
  });

  it("failed orphaned executions as standalone", async () => {
    await simulateOrphanedExecutions(3);

    const config = {
      workers: [{ queues: "background", pollingInterval: 10 }],
      dispatchers: [],
    };

    const run = runSupervisor({ mode: "async", ...config });
    await waitForRegisteredProcesses(2, { timeout: 3 });
    await assertRegisteredProcesses({ kind: "Supervisor(async)" });

    await waitWhileWithTimeout(
      5,
      async () => (await ClaimedExecution.count()) > 0 || (await FailedExecution.count()) < 3,
    );

    await run.terminate();

    expect(await ClaimedExecution.count()).toBe(0);
    expect(await FailedExecution.count()).toBe(3);
  });

  it("warns on boot when the thread pool is larger than the database connection pool", async () => {
    const log = new StringIO();
    await withSolidQueueLogger(new Logger(log), async () => {
      let supervisor: Supervisor | undefined;
      try {
        supervisor = await runSupervisorAsThread({
          workers: [{ queues: "background", threads: 50, pollingInterval: 10 }],
          dispatchers: [],
        });
        await waitForRegisteredProcesses(2, { timeout: 3 });
      } finally {
        await supervisor?.stop();
      }
    });

    expect(log.string()).toMatch(
      /Solid Queue needs at least \d+ database connections for the configured workers but the database connection pool is \d+\. Increase it in `config\/database.yml`/,
    );
  });

  it("does not warn on boot when the database connection pool is large enough", async () => {
    const log = new StringIO();
    await withSolidQueueLogger(new Logger(log), async () => {
      let supervisor: Supervisor | undefined;
      try {
        supervisor = await runSupervisorAsThread({
          workers: [{ queues: "background", threads: 1, pollingInterval: 10 }],
          dispatchers: [],
        });
        await waitForRegisteredProcesses(2, { timeout: 3 });
      } finally {
        await supervisor?.stop();
      }
    });

    expect(log.string()).not.toMatch(/the database connection pool is/);
  });

  it("replace a terminated thread even if releasing its claimed jobs fails", async () => {
    const configuration = new Configuration({
      workers: [{ queues: "*", processes: 1 }],
      dispatchers: [],
      skipRecurring: true,
    });
    const supervisor = new AsyncSupervisor(configuration) as unknown as {
      processInstances: Record<string, unknown>;
      configuredProcesses: Record<string, unknown>;
      releaseClaimedJobsBy(...args: unknown[]): Promise<void>;
      startProcess(configuredProcess: unknown): Promise<void>;
      checkAndReplaceTerminatedProcesses(): Promise<void>;
    };

    const configuredProcess = (await configuration.configuredProcesses())[0];
    const terminatedThread = {
      kind: "Worker",
      name: "worker-42",
      hostname: "localhost",
      isAlive: () => false,
    };

    supervisor.processInstances[42] = terminatedThread;
    supervisor.configuredProcesses[42] = configuredProcess;

    const releaseClaimedJobsBy = vi
      .spyOn(supervisor, "releaseClaimedJobsBy")
      .mockRejectedValue(new ConnectionNotEstablished("connection is closed"));
    const startProcess = vi.spyOn(supervisor, "startProcess").mockResolvedValue(undefined);

    await assertNothingRaised(async () => {
      await supervisor.checkAndReplaceTerminatedProcesses();
    });
    expect(releaseClaimedJobsBy).toHaveBeenCalledTimes(1);
    expect(startProcess).toHaveBeenCalledWith(configuredProcess);
  });
});
