import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import {
  assertDifference,
  assertNothingRaised,
} from "@blazetrails/activesupport/testing/assertions";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { constGet, constSet } from "@blazetrails/ruby-compat";
import {
  BlockedExecution,
  FailedExecution,
  Job,
  ReadyExecution,
  SolidQueueAdapter,
} from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { JobResult } from "./support/job-result.js";
import { loadAppSchema } from "./support/queue-schema.js";
import { destroyRecords } from "./test-helper.js";

class NonOverlappingJob extends ApplicationJob {
  static {
    this.limitsConcurrency({ key: (jobResult: unknown) => jobResult });
  }

  perform(_jobResult: JobResult): void {}
}

class BlockedExecutionTest extends TestCase {
  static {
    (this as unknown as { useTransactionalTests: boolean }).useTransactionalTests = false;
  }
}
constSet(constGet(Object, "SolidQueue") as object, "BlockedExecutionTest", BlockedExecutionTest);
constSet(BlockedExecutionTest, "NonOverlappingJob", NonOverlappingJob);

describe("SolidQueue::BlockedExecutionTest", () => {
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
    await destroyRecords();
  });

  it("release marks the job as failed and destroys the blocked row when the job class no longer resolves", async () => {
    await NonOverlappingJob.performLater(result);
    await Job.last();
    await NonOverlappingJob.performLater(result);
    const blockedJob = (await Job.last()) as Job;
    const blocked = (await blockedJob.blockedExecution) as BlockedExecution;
    expect(blocked, "expected the second job to be blocked").toBeTruthy();

    await blockedJob.updateColumns({ class_name: "GoneJob" });

    await assertDifference(
      new Map([
        [() => BlockedExecution.count(), -1],
        [() => FailedExecution.count(), 1],
      ]),
      null,
      async () => {
        await assertNothingRaised(async () => {
          await (await blocked.reload()).release();
        });
      },
    );

    expect(await ReadyExecution.findBy({ job_id: blockedJob.id })).toBeNull();

    const failed = (await FailedExecution.findBy({ job_id: blockedJob.id })) as FailedExecution;
    expect(failed, "expected a failed execution to be created for the orphan").toBeTruthy();
    expect(failed.exceptionClass()).toBe("SolidQueue::Job::ClassMissingError");
    expect(failed.message()).toMatch("GoneJob");
  });
});
