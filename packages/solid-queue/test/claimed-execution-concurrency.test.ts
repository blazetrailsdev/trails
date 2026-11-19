import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { days } from "@blazetrails/activesupport";
import { assertNothingRaised, assertRaises } from "@blazetrails/activesupport/testing/assertions";
import { TestCase } from "@blazetrails/activesupport/test-case";
import {
  Concurrent,
  Process as RubyProcess,
  RuntimeError,
  Thread,
  Timeout,
  constGet,
  constSet,
  rbFSleep,
} from "@blazetrails/ruby-compat";
import {
  BlockedExecution,
  ClaimedExecution,
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  Record,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
} from "../lib/index.js";
import { ProcessPrunedError } from "../lib/processes/process-pruned-error.js";
import { ApplicationJob } from "./support/application-job.js";
import { JobResult } from "./support/job-result.js";
import { NonOverlappingUpdateResultJob } from "./support/non-overlapping-update-result-job.js";
import { loadAppSchema } from "./support/queue-schema.js";

class ClaimedExecutionConcurrencyTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(
  constGet(Object, "SolidQueue") as object,
  "ClaimedExecutionConcurrencyTest",
  ClaimedExecutionConcurrencyTest,
);

describe("SolidQueue::ClaimedExecutionConcurrencyTest", () => {
  let process: Process;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterAll(() => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
  });

  beforeEach(async () => {
    process = await Process.register({ kind: "Worker", pid: 42, name: "worker-123" });
  });

  afterEach(async () => {
    await Job.destroyAll();
    await Semaphore.deleteAll();
    await Process.destroyAll();
    await JobResult.deleteAll();
  });

  it("a stale performer that loses the claim lock to pruning does not finish or re-promote a pruned job", async (ctx) => {
    await skipOnSqlite(ctx);

    const [firstJob, claimedExecution, concurrencyKey] = await enqueueBlockedGroup();

    const elapsed = await withWinnerHoldingClaim(
      claimedExecution,
      {
        inTransaction: async (lockedClaim) => {
          await firstJob.failedWith(new ProcessPrunedError(days(1).ago()));
          await lockedClaim.destroyBang();
        },
        afterCommit: () => firstJob.unblockNextBlockedJob(),
      },
      () => claimedExecution.perform(),
    );

    expect(
      elapsed,
      `performer should have blocked on the claim lock (took ${elapsed.toFixed(3)}s)`,
    ).toBeGreaterThanOrEqual(0.3);
    expect(await (await firstJob.reload()).isFailed()).toBeTruthy();
    expect(firstJob.isFinished()).toBeFalsy();
    expect(await ReadyExecution.count()).toBe(1);
    expect(await BlockedExecution.count()).toBe(1);
    expect(await ClaimedExecution.count()).toBe(0);
    expect((await Semaphore.findByBang({ key: concurrencyKey })).value).toBe(0);
  });

  it("a stale failing performer that loses the claim lock to pruning does not double-finalize", async (ctx) => {
    await skipOnSqlite(ctx);

    const [firstJob, claimedExecution, concurrencyKey] = await enqueueBlockedGroup({
      exception: RuntimeError,
    });

    const elapsed = await withWinnerHoldingClaim(
      claimedExecution,
      {
        inTransaction: async (lockedClaim) => {
          await firstJob.failedWith(new ProcessPrunedError(days(1).ago()));
          await lockedClaim.destroyBang();
        },
        afterCommit: () => firstJob.unblockNextBlockedJob(),
      },
      async () => {
        await assertRaises([RuntimeError], {}, () => claimedExecution.perform());
      },
    );

    expect(
      elapsed,
      `performer should have blocked on the claim lock (took ${elapsed.toFixed(3)}s)`,
    ).toBeGreaterThanOrEqual(0.3);
    expect(await (await firstJob.reload()).isFailed()).toBeTruthy();
    expect(await ReadyExecution.count()).toBe(1);
    expect(await BlockedExecution.count()).toBe(1);
    expect(await FailedExecution.count()).toBe(1);
    expect(await ClaimedExecution.count()).toBe(0);
    expect((await Semaphore.findByBang({ key: concurrencyKey })).value).toBe(0);
  });

  it("a stale release that loses the claim lock to pruning does not re-dispatch a pruned job", async (ctx) => {
    await skipOnSqlite(ctx);

    const [firstJob, claimedExecution, concurrencyKey] = await enqueueBlockedGroup();

    const elapsed = await withWinnerHoldingClaim(
      claimedExecution,
      {
        inTransaction: async (lockedClaim) => {
          await firstJob.failedWith(new ProcessPrunedError(days(1).ago()));
          await lockedClaim.destroyBang();
        },
        afterCommit: () => firstJob.unblockNextBlockedJob(),
      },
      () => claimedExecution.release(),
    );

    expect(
      elapsed,
      `release should have blocked on the claim lock (took ${elapsed.toFixed(3)}s)`,
    ).toBeGreaterThanOrEqual(0.3);
    expect(await (await firstJob.reload()).isFailed()).toBeTruthy();
    expect(await firstJob.isReady()).toBeFalsy();
    expect(await ReadyExecution.count()).toBe(1);
    expect(await BlockedExecution.count()).toBe(1);
    expect(await ClaimedExecution.count()).toBe(0);
    expect((await Semaphore.findByBang({ key: concurrencyKey })).value).toBe(0);
  });

  it("pruning that loses the claim lock to a finishing performer does not fail a finished job", async (ctx) => {
    await skipOnSqlite(ctx);

    const [firstJob, claimedExecution, concurrencyKey] = await enqueueBlockedGroup();

    const elapsed = await withWinnerHoldingClaim(
      claimedExecution,
      {
        inTransaction: async (lockedClaim) => {
          await firstJob.finishedBang();
          await lockedClaim.destroyBang();
        },
        afterCommit: () => firstJob.unblockNextBlockedJob(),
      },
      () => process.prune(),
    );

    expect(
      elapsed,
      `pruning should have blocked on the claim lock (took ${elapsed.toFixed(3)}s)`,
    ).toBeGreaterThanOrEqual(0.3);
    expect((await firstJob.reload()).isFinished()).toBeTruthy();
    expect(await firstJob.isFailed()).toBeFalsy();
    expect(await ReadyExecution.count()).toBe(1);
    expect(await BlockedExecution.count()).toBe(1);
    expect(await FailedExecution.count()).toBe(0);
    expect(await ClaimedExecution.count()).toBe(0);
    expect((await Semaphore.findByBang({ key: concurrencyKey })).value).toBe(0);
  });

  it("finalizing a claim does not deadlock a concurrent blocked-job release when skip_locked is off", async (ctx) => {
    await skipOnSqlite(ctx);

    await withSkipLocked(false, async () => {
      const [firstJob, claimedExecution, concurrencyKey] = await enqueueBlockedGroup();
      const blockedExecution = (await BlockedExecution.first()) as BlockedExecution;

      const holdingBlockedRow = new Concurrent.Event();
      const releaseBlockedRow = new Concurrent.Event();

      const releaser = new Thread(async () => {
        await Record.connectionPool().withConnection(async () => {
          await Record.transaction(async () => {
            await BlockedExecution.where({ id: blockedExecution.id }).lock().first();
            holdingBlockedRow.set();
            await releaseBlockedRow.wait(5);
            await Semaphore.where({ key: concurrencyKey }).lock().first();
          });
        });
      });

      await holdingBlockedRow.wait(5);

      await assertNothingRaised(async () => {
        await Timeout.timeout(10, null, null, async () => {
          const finisher = new Thread(async () => {
            await Record.connectionPool().withConnection(async () => {
              await claimedExecution["finished"]();
            });
          });

          await rbFSleep(0.5);
          releaseBlockedRow.set();
          await finisher.join(10);
        });
      });

      await releaser.join(10);

      expect((await firstJob.reload()).isFinished()).toBeTruthy();
      expect(await ClaimedExecution.count()).toBe(0);
    });
  });

  async function enqueueBlockedGroup({
    exception = null,
  }: { exception?: (new () => Error) | null } = {}): Promise<
    [Job, ClaimedExecution, string | null]
  > {
    const jobResult = await JobResult.createBang({ queue_name: "default", status: "" });
    const firstActiveJob = await NonOverlappingUpdateResultJob.performLater(jobResult, {
      name: "A",
      exception,
    });
    await NonOverlappingUpdateResultJob.performLater(jobResult, { name: "B" });
    await NonOverlappingUpdateResultJob.performLater(jobResult, { name: "C" });

    const firstJob = await Job.findByBang({
      active_job_id: (firstActiveJob as NonOverlappingUpdateResultJob).jobId,
    });
    const claimedExecution = await claimFirstJob(firstJob);

    return [firstJob, claimedExecution, firstJob.concurrency_key];
  }

  async function claimFirstJob(job: Job): Promise<ClaimedExecution> {
    await ReadyExecution.claim(job.queue_name, 1, process.id);
    return await ClaimedExecution.findByBang({ job_id: job.id });
  }

  async function withWinnerHoldingClaim(
    claimedExecution: ClaimedExecution,
    {
      inTransaction,
      afterCommit = null,
    }: {
      inTransaction: (lockedClaim: ClaimedExecution) => Promise<unknown>;
      afterCommit?: (() => Promise<unknown>) | null;
    },
    block: () => Promise<unknown>,
  ): Promise<number> {
    const claimLocked = new Concurrent.Event();

    const winner = new Thread(async () => {
      await Record.connectionPool().withConnection(async () => {
        await Record.transaction(async () => {
          const lockedClaim = (await ClaimedExecution.unscoped()
            .lock()
            .findBy({ id: claimedExecution.id })) as ClaimedExecution;
          claimLocked.set();
          await rbFSleep(0.5);
          await inTransaction(lockedClaim);
        });

        await afterCommit?.();
      });
    });

    await claimLocked.wait(5);
    await rbFSleep(0.1);

    const startedAt = monotonicNow();
    await block();
    const elapsed = monotonicNow() - startedAt;

    await winner.join(5);
    return elapsed;
  }

  async function withSkipLocked(value: boolean, block: () => Promise<void>): Promise<void> {
    const previous = SolidQueue.useSkipLocked;
    SolidQueue.useSkipLocked = value;
    try {
      await block();
    } finally {
      SolidQueue.useSkipLocked = previous;
    }
  }

  async function skipOnSqlite(ctx: { skip(note?: string): void }): Promise<void> {
    if ((await Record.leaseConnection()).adapterName.toLowerCase().includes("sqlite"))
      ctx.skip("Row-level locking not supported on SQLite");
  }

  function monotonicNow(): number {
    return RubyProcess.clockGettime(RubyProcess.CLOCK_MONOTONIC);
  }
});
