import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { AbstractMysqlAdapter } from "@blazetrails/activerecord/connection-adapters/abstract-mysql-adapter.js";
import { minutes, seconds } from "@blazetrails/activesupport";
import { travelBack, travelTo } from "@blazetrails/activesupport/testing/time-helpers";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Time } from "@blazetrails/date";
import {
  Concurrent,
  Process as RubyProcess,
  SecureRandom,
  Thread,
  constGet,
  constSet,
  rbFSleep,
} from "@blazetrails/ruby-compat";
import {
  BlockedExecution,
  Job,
  Record,
  ScheduledExecution,
  Semaphore,
  SolidQueue,
  SolidQueueAdapter,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { JobResult } from "./support/job-result.js";
import { NonOverlappingUpdateResultJob } from "./support/non-overlapping-update-result-job.js";
import { loadAppSchema } from "./support/queue-schema.js";
import "./test-helper.js";

class NonOverlappingByKeyJob extends ApplicationJob {
  static {
    this.limitsConcurrency({ key: (key: unknown) => key });
  }

  perform(_key: string): void {}
}

class SemaphoreTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(constGet(Object, "SolidQueue") as object, "SemaphoreTest", SemaphoreTest);
constSet(SemaphoreTest, "NonOverlappingByKeyJob", NonOverlappingByKeyJob);

async function adapterName(): Promise<string> {
  return (await Record.leaseConnection()).adapterName.toLowerCase();
}

describe("SolidQueue::SemaphoreTest", () => {
  let result: JobResult;
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
    result = await JobResult.createBang({ queue_name: "default" });
  });

  afterEach(async () => {
    travelBack();
    vi.restoreAllMocks();
  });

  it("a job records the semaphore it created, not one deleted after its transaction began", async (ctx) => {
    ctx.skip(
      !/mysql|trilogy/.test(await adapterName()),
      "Only MySQL reads a deleted row from the transaction's snapshot",
    );

    await NonOverlappingUpdateResultJob.performLater(result);
    const expired = await Semaphore.sole();

    await Record.transaction(async () => {
      await Job.count();

      await new Thread(async () => {
        await Record.connectionPool().withConnection(async () => {
          await Semaphore.where({ id: expired.id }).deleteAll();
        });
      }).join();

      const job = await Job.enqueue(new NonOverlappingUpdateResultJob(result));

      expect(await job.isReady()).toBeTruthy();
      expect(job.acquiredSemaphoreId()).not.toEqual(expired.id);
      expect(job.acquiredSemaphoreId()).toEqual(
        (await Semaphore.lock().findByBang({ key: job.concurrency_key })).id,
      );
    });
  });

  it("wait acquires a row lock that blocks concurrent signal", async (ctx) => {
    await skipOnSqlite(ctx);

    await NonOverlappingUpdateResultJob.performLater(result);
    const concurrencyKey = ((await Job.last()) as Job).concurrency_key;
    expect((await Semaphore.findBy({ key: concurrencyKey }))!.value).toBe(0);

    const lockHeld = new Concurrent.Event();

    const locker = new Thread(async () => {
      await Record.connectionPool().withConnection(async () => {
        await Record.transaction(async () => {
          await Semaphore.where({ key: concurrencyKey }).lock().first();
          lockHeld.set();
          await rbFSleep(1);
        });
      });
    });

    await lockHeld.wait(5);
    await rbFSleep(0.1);

    const start = monotonicNow();
    await Semaphore.where({ key: concurrencyKey }).updateAll("value = value + 1");
    const elapsed = monotonicNow() - start;

    await locker.join(5);

    expect(
      elapsed >= 0.5,
      `UPDATE should have been blocked by FOR UPDATE lock (took ${elapsed.toFixed(3)}s)`,
    ).toBeTruthy();
    expect((await Semaphore.findBy({ key: concurrencyKey }))!.value).toBe(1);
  });

  it("blocked execution created during enqueue is visible to release_one after signal", async (ctx) => {
    await skipOnSqlite(ctx);

    await NonOverlappingUpdateResultJob.performLater(result);
    const jobA = (await Job.last()) as Job;
    const concurrencyKey = jobA.concurrency_key;
    expect((await Semaphore.findBy({ key: concurrencyKey }))!.value).toBe(0);

    const lockHeld = new Concurrent.Event();

    const enqueueThread = new Thread(async () => {
      await Record.connectionPool().withConnection(async () => {
        await Record.transaction(async () => {
          await Semaphore.where({ key: concurrencyKey }).lock().first();

          const uuid = SecureRandom.uuid();
          await Job.insert({
            queue_name: "default",
            class_name: "NonOverlappingUpdateResultJob",
            concurrency_key: concurrencyKey,
            active_job_id: uuid,
            arguments: {},
            scheduled_at: Time.current(),
          });
          const jobBId = await Job.where({ active_job_id: uuid }).pick("id");

          await BlockedExecution.insert({
            job_id: jobBId,
            queue_name: "default",
            concurrency_key: concurrencyKey,
            expires_at: SolidQueue.defaultConcurrencyControlPeriod.fromNow(),
            priority: 0,
          });

          lockHeld.set();

          await rbFSleep(1);
        });
      });
    });

    await lockHeld.wait(5);
    await rbFSleep(0.1);

    expect(await Semaphore.signal(jobA)).toBeTruthy();
    expect(
      await BlockedExecution.releaseOne(concurrencyKey),
      "release_one should find the BlockedExecution created by the concurrent enqueue",
    ).toBeTruthy();

    await enqueueThread.join(5);

    expect(await BlockedExecution.where({ concurrency_key: concurrencyKey }).count()).toBe(0);
  });

  it("dispatchers with jobs for the same concurrency keys in different order don't deadlock", async (ctx) => {
    await skipOnSqlite(ctx);
    const connection = await Record.leaseConnection();
    ctx.skip(
      connection instanceof AbstractMysqlAdapter && connection.isMariadb(),
      "CONVERGEABLE solid-queue-mariadb-snapshot-isolation-dispatch",
    );

    const jobs: Job[] = [];
    for (const key of ["one", "two", "two", "one"]) {
      await NonOverlappingByKeyJob.set({ wait: minutes(1) }).performLater(key);
      jobs.push((await Job.last()) as Job);
    }
    travelTo(minutes(2).fromNow());

    const errors = await dispatchInTwoBatchesAtOnce();

    expect(errors).toBeEmpty();
    expect(await ScheduledExecution.count()).toBe(0);

    const statuses = [];
    for (const job of jobs) statuses.push(await (await job.reload()).status());
    expect(statuses).toEqual(["ready", "ready", "blocked", "blocked"]);
  });

  async function dispatchInTwoBatchesAtOnce(): Promise<unknown[]> {
    const acquiredFirst = [new Concurrent.Event(), new Concurrent.Event()];

    return await pauseAfterFirstLock(acquiredFirst, async () => {
      const dispatchers = [0, 1].map(
        (index) =>
          new Thread(async () => {
            try {
              Thread.current().set("dispatcher", index);
              if (index === 1) await acquiredFirst[0].wait(seconds(5).toF());

              await Record.connectionPool().withConnection(async () => {
                await ScheduledExecution.dispatchNextBatch(2);
              });

              return null;
            } catch (error) {
              return error;
            }
          }),
      );

      const values = [];
      for (const dispatcher of dispatchers) values.push(await dispatcher.value());
      return values.filter((value) => value != null);
    });
  }

  async function pauseAfterFirstLock<T>(
    acquiredFirst: InstanceType<typeof Concurrent.Event>[],
    block: () => Promise<T>,
  ): Promise<T> {
    const originalWait = Semaphore.wait.bind(Semaphore);

    vi.spyOn(Semaphore, "wait").mockImplementation(async (job) => {
      const value = await originalWait(job);
      const index = Thread.current().get("dispatcher") as number | undefined;

      if (index != null && !acquiredFirst[index].isSet()) {
        acquiredFirst[index].set();
        await acquiredFirst[1 - index].wait(seconds(2).toF());
      }
      return value;
    });

    try {
      return await block();
    } finally {
      vi.mocked(Semaphore.wait).mockRestore();
    }
  }

  async function skipOnSqlite(ctx: { skip(note?: string): void }): Promise<void> {
    if ((await adapterName()).includes("sqlite"))
      ctx.skip("Row-level locking not supported on SQLite");
  }

  function monotonicNow(): number {
    return RubyProcess.clockGettime(RubyProcess.CLOCK_MONOTONIC);
  }
});
