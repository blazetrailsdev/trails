import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./test-helpers/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { assertDifference } from "@blazetrails/activesupport";
import { TopLevel, constSet } from "@blazetrails/ruby-compat";
import {
  FailedExecution,
  Job,
  Process,
  ReadyExecution,
  SolidQueue,
  SolidQueueAdapter,
  Worker,
} from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { AddToBufferJob, JobBuffer } from "./test-helpers/add-to-buffer-job.js";
import { RaisingJob } from "./test-helpers/raising-job.js";
import { ExpectedTestError } from "./test-helpers/expected-test-error.js";
import { loadAppSchema } from "./test-helpers/queue-schema.js";
import { silentOnThreadErrorFor } from "./test-helpers/jobs-test-helper.js";

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

describe("SolidQueue::FailedExecutionTest", () => {
  let worker: Worker;
  let originalOnThreadError: typeof SolidQueue.onThreadError;
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
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
