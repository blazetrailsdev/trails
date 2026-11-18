import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { assertDifference } from "@blazetrails/activesupport/testing/assertions";
import { TopLevel, constSet, excSetBacktrace } from "@blazetrails/ruby-compat";
import {
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  SolidQueue,
  SolidQueueAdapter,
  Worker,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { AddToBufferJob, JobBuffer } from "./support/add-to-buffer-job.js";
import { RaisingJob } from "./support/raising-job.js";
import { LargeErrorMessageJob } from "./support/large-error-message-job.js";
import { ExpectedTestError } from "./support/expected-test-error.js";
import { loadAppSchema } from "./support/queue-schema.js";
import { silentOnThreadErrorFor } from "./support/jobs-test-helper.js";

class InfiniteRecursionJob extends ApplicationJob {
  static {
    this.queueAs("background");
  }

  perform(): void {
    this.start();
  }

  private start(): void {
    this.continue();
  }

  private continue(): void {
    this.startAgain();
  }

  private startAgain(): void {
    this.start();
  }
}
constSet(TopLevel, "InfiniteRecursionJob", InfiniteRecursionJob);

type ExecutionInternals = { errorColumnLimit(): Promise<number | null> };

async function withErrorColumnLimit(limit: number, block: () => Promise<void>) {
  vi.spyOn(
    FailedExecution.prototype as unknown as ExecutionInternals,
    "errorColumnLimit",
  ).mockResolvedValue(limit);
  try {
    await block();
  } finally {
    vi.restoreAllMocks();
  }
}

async function failJobWith(
  exception: Error,
  { backtrace }: { backtrace: string[] | null },
): Promise<FailedExecution> {
  if (backtrace != null) excSetBacktrace(exception, backtrace);
  else exception.stack = undefined;
  const job = await Job.findByBang({
    active_job_id: ((await AddToBufferJob.performLater(1)) as AddToBufferJob).jobId,
  });

  await job.failedWith(exception);
  await job.reload();
  return (await job.failedExecution) as FailedExecution;
}

async function assertFitsErrorColumn(execution: FailedExecution, limit?: number | null) {
  if (limit === undefined) {
    limit = await (execution as unknown as ExecutionInternals).errorColumnLimit();
  }
  if (limit != null) {
    const klass = execution.constructor as typeof FailedExecution;
    const storedError = (await (await klass.connection)!.selectValue(
      klass.where({ id: execution.id }).select("error").toSql(),
    )) as string;
    expect(new TextEncoder().encode(storedError).length).toBeLessThanOrEqual(limit);
  }
}

describe("SolidQueue::FailedExecutionTest", () => {
  let worker: Worker;
  let originalOnThreadError: typeof SolidQueue.onThreadError;
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

  beforeEach(() => {
    originalOnThreadError = SolidQueue.onThreadError;
    SolidQueue.onThreadError = silentOnThreadErrorFor([ExpectedTestError], originalOnThreadError);
    worker = new Worker({ queues: "background" });
    worker.mode = "inline";
  });

  afterEach(async () => {
    SolidQueue.onThreadError = originalOnThreadError;
    JobBuffer.clear();
    await Job.destroyAll();
    await Process.destroyAll();
  });

  it("run job that fails", async () => {
    await RaisingJob.performLater(ExpectedTestError, "A");
    await worker.start();

    expect(await FailedExecution.count()).toBe(1);
    expect(await ((await Job.last()) as Job).isFailed()).toBeTruthy();
  });

  it("run job that fails with a SystemStackError (stack level too deep)", async () => {
    const currentProc = SolidQueue.onThreadError;
    SolidQueue.onThreadError = silentOnThreadErrorFor([RangeError], currentProc);
    try {
      await InfiniteRecursionJob.performLater();
      await worker.start();

      expect(await FailedExecution.count()).toBe(1);
      expect(await ((await Job.last()) as Job).isFailed()).toBeTruthy();
    } finally {
      SolidQueue.onThreadError = currentProc;
    }
  });

  it("run job that fails with an error message larger than the error column", async () => {
    await LargeErrorMessageJob.performLater(70_000);
    await worker.start();

    expect(await FailedExecution.count()).toBe(1);
    expect(await ((await Job.last()) as Job).isFailed()).toBeTruthy();
    await assertFitsErrorColumn((await FailedExecution.last()) as FailedExecution);
  });

  it("truncate backtrace to fit the error column", async () => {
    await withErrorColumnLimit(1_000, async () => {
      const execution = await failJobWith(new ExpectedTestError("boom"), {
        backtrace: Array.from({ length: 100 }, (_, i) => `app/models/thing.rb:${i}:in 'do_it'`),
      });

      await assertFitsErrorColumn(execution, 1_000);
      expect(execution.message()).toBe("boom");
      expect((execution.backtrace() as string[]).length).toBeGreaterThan(0);
      expect((execution.backtrace() as string[]).length).toBeLessThan(100);
      expect((execution.backtrace() as string[])[0]).toBe("app/models/thing.rb:0:in 'do_it'");
    });
  });

  it("truncate message when it doesn't fit the error column by itself", async () => {
    await withErrorColumnLimit(1_000, async () => {
      const execution = await failJobWith(new ExpectedTestError("x".repeat(5_000)), {
        backtrace: ["app/models/thing.rb:1:in 'do_it'"],
      });

      await assertFitsErrorColumn(execution, 1_000);
      expect(execution.backtrace()).toEqual([]);
      expect((execution.message() as string).startsWith("xxx")).toBeTruthy();
      expect((execution.message() as string).endsWith("... (truncated)")).toBeTruthy();
    });
  });

  it("account for JSON escaping when fitting the error column", async () => {
    await withErrorColumnLimit(1_000, async () => {
      const execution = await failJobWith(new ExpectedTestError('"<>&'.repeat(200)), {
        backtrace: ["app/models/thing.rb:1:in 'do_it'"],
      });

      await assertFitsErrorColumn(execution, 1_000);
    });
  });

  it("fit errors without a backtrace into the error column", async () => {
    await withErrorColumnLimit(1_000, async () => {
      const execution = await failJobWith(new ExpectedTestError("x".repeat(5_000)), {
        backtrace: null,
      });

      await assertFitsErrorColumn(execution, 1_000);
      expect(execution.backtrace()).toBeNull();
    });
  });

  it("keep errors that fit in the error column intact", async () => {
    const backtrace = Array.from({ length: 5 }, (_, i) => `app/models/thing.rb:${i}:in 'do_it'`);

    await withErrorColumnLimit(1_000, async () => {
      const execution = await failJobWith(new ExpectedTestError("boom"), { backtrace });

      expect(execution.message()).toBe("boom");
      expect(execution.backtrace()).toEqual(backtrace);
    });
  });

  it("retry failed job", async () => {
    await RaisingJob.performLater(ExpectedTestError, "A");
    await worker.start();

    await assertDifference(
      () => FailedExecution.count(),
      -1,
      null,
      () =>
        assertDifference(
          () => ReadyExecution.count(),
          +1,
          null,
          async () => ((await FailedExecution.last()) as FailedExecution).retry(),
        ),
    );
  });

  it("retry failed jobs in bulk", async () => {
    for (let i = 1; i <= 5; i++) await RaisingJob.performLater(ExpectedTestError, i);
    for (let i = 1; i <= 3; i++) await AddToBufferJob.performLater(i);

    await worker.start();

    await assertDifference(
      () => FailedExecution.count(),
      -5,
      null,
      () =>
        assertDifference(
          () => ReadyExecution.count(),
          +5,
          null,
          () => FailedExecution.retryAll(Job.all()),
        ),
    );
  });
});
