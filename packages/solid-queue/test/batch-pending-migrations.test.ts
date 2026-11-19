import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import { Migration } from "@blazetrails/activerecord";
import { performAllLater } from "@blazetrails/activejob";
import { isPresent } from "@blazetrails/activesupport";
import { assertDifference } from "@blazetrails/activesupport/testing/assertions";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { constSet, File, FileUtils, loadIseqEval, TopLevel } from "@blazetrails/ruby-compat";
import {
  Batch,
  ClaimedExecution,
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  Record,
  RecurringTask,
  ScheduledExecution,
  Semaphore,
  SolidQueueAdapter,
} from "../lib/index.js";
import { AddToBufferJob } from "./support/add-to-buffer-job.js";
import { ApplicationJob } from "./support/application-job.js";
import { ExpectedTestError } from "./support/expected-test-error.js";
import { JobResult } from "./support/job-result.js";
import { loadAppSchema } from "./support/queue-schema.js";

const template = decodeURIComponent(
  new URL(
    "../lib/generators/solid-queue/update/templates/db/add_batches_to_solid_queue.ts.tt",
    import.meta.url,
  ).pathname,
);
const tmpDir = decodeURIComponent(new URL("./support/dummy/tmp", import.meta.url).pathname);
await FileUtils.mkdirPAsync(tmpDir);
await File.writeAsync(
  File.join(tmpDir, "add_batches_to_solid_queue.ts"),
  await File.readAsync(template),
);
const { AddBatchesToSolidQueue } = (await loadIseqEval(
  File.join(tmpDir, "add_batches_to_solid_queue.ts"),
)) as { AddBatchesToSolidQueue: new () => Migration };

class BatchPendingMigrationsTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(TopLevel, "BatchPendingMigrationsTest", BatchPendingMigrationsTest);

describe("BatchPendingMigrationsTest", () => {
  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
  });

  beforeEach(async () => {
    await migrate("down");
  });

  afterEach(async () => {
    await migrate("up");
    await destroyRecords();
  });

  it("the batches schema counts as pending migrations", async () => {
    expect(await Batch.isMigrated()).toBeFalsy();
  });

  it("starting a batch raises", async () => {
    await expect(
      Batch.enqueue({}, async () => {
        await AddToBufferJob.performLater("hey");
      }),
    ).rejects.toThrow(Batch.PendingMigrations);
  });

  it("jobs enqueue, finish and get destroyed without batch bookkeeping", async () => {
    const activeJob = (await AddToBufferJob.performLater("hey")) as AddToBufferJob;
    const job = await Job.findByBang({ active_job_id: activeJob.jobId });

    await job.finishedBang();
    expect((await job.reload()).isFinished()).toBeTruthy();

    await job.destroyBang();
    expect(await Job.isExists(job.id)).toBeFalsy();
  });

  it("jobs enqueue in bulk", async () => {
    await assertDifference(
      () => Job.count(),
      +2,
      null,
      async () => {
        await performAllLater([new AddToBufferJob("hey"), new AddToBufferJob("ho")]);
      },
    );
  });

  it("jobs fail", async () => {
    const activeJob = (await AddToBufferJob.performLater("hey")) as AddToBufferJob;
    const job = await Job.findByBang({ active_job_id: activeJob.jobId });

    await job.failedWith(new ExpectedTestError("boom"));
    expect(isPresent(await (await job.reload()).failedExecution)).toBeTruthy();
  });

  async function migrate(direction: "up" | "down"): Promise<void> {
    await Migration.nearestDelegate!.suppressMessages(async () => {
      await Record.connectionPool().withConnection(async (connection) => {
        await new AddBatchesToSolidQueue().execMigration(connection, direction);
      });
    });

    await Job.resetColumnInformation();
    Batch._migrated = null;

    await Record.connectionPool().disconnectBang();
  }

  async function destroyRecords(): Promise<void> {
    await Job.destroyAll();
    await Process.destroyAll();
    await Semaphore.deleteAll();
    await RecurringTask.deleteAll();
    await ScheduledExecution.deleteAll();
    await ReadyExecution.deleteAll();
    await ClaimedExecution.deleteAll();
    await FailedExecution.deleteAll();
    await JobResult.deleteAll();
  }
});
