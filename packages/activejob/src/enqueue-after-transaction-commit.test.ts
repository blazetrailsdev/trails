import { describe, expect, it } from "vitest";
import { assertDifference, TopLevel } from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { block, rbModConstSet, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { EnqueueError } from "./enqueuing.js";
import "./test-helpers/helper.js";
import { EnqueueErrorJob } from "./test-helpers/jobs/enqueue-error-job.js";

class FakeActiveRecord {
  calls: number;
  private _yield: boolean;
  private _callbacks: (() => unknown)[];

  constructor(shouldYield = true) {
    this.calls = 0;
    this._yield = shouldYield;
    this._callbacks = [];
  }

  afterAllTransactionsCommit(block: () => unknown): unknown {
    this.calls += 1;
    if (this._yield) {
      return block();
    } else {
      this._callbacks.push(block);
    }
  }

  async runAfterCommitCallbacks(): Promise<void> {
    const callbacks = this._callbacks;
    this._callbacks = [];
    for (const callback of callbacks) await callback();
  }
}

class EnqueueAfterCommitJob extends Base {
  static toString(): string {
    return "EnqueueAfterTransactionCommitTest::EnqueueAfterCommitJob";
  }

  perform(): void {}
}
EnqueueAfterCommitJob.enqueueAfterTransactionCommit = true;
registerConstant("EnqueueAfterTransactionCommitTest::EnqueueAfterCommitJob", EnqueueAfterCommitJob);

class EnqueueErrorAdapter {
  enqueue(..._args: unknown[]): never {
    throw new EnqueueError("There was an error enqueuing the job");
  }

  enqueueAt(..._args: unknown[]): never {
    throw new EnqueueError("There was an error enqueuing the job");
  }
}

class ErrorEnqueueAfterCommitJob extends EnqueueErrorJob {
  static toString(): string {
    return "EnqueueAfterTransactionCommitTest::ErrorEnqueueAfterCommitJob";
  }

  override perform(): void {}
}
rbModConstSet(ErrorEnqueueAfterCommitJob, "EnqueueErrorAdapter", EnqueueErrorAdapter);
ErrorEnqueueAfterCommitJob.setQueueAdapter(new EnqueueErrorAdapter());
ErrorEnqueueAfterCommitJob.enqueueAfterTransactionCommit = true;
registerConstant(
  "EnqueueAfterTransactionCommitTest::ErrorEnqueueAfterCommitJob",
  ErrorEnqueueAfterCommitJob,
);
registerConstant("EnqueueAfterTransactionCommitTest::EnqueueAfterCommitJob", EnqueueAfterCommitJob);

const topLevel = TopLevel as Record<string, unknown>;

describe("EnqueueAfterTransactionCommitTest", () => {
  it("#perform_later wait for transactions to complete before enqueuing the job", async () => {
    const fakeActiveRecord = new FakeActiveRecord();
    await TestCase.stubConst(
      topLevel,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        await assertDifference(
          () => fakeActiveRecord.calls,
          +1,
          null,
          async () => {
            await EnqueueAfterCommitJob.performLater();
          },
        );
      },
      { exists: false },
    );
  });

  it("#perform_later returns the Job instance even if it's delayed by `after_all_transactions_commit`", async () => {
    const fakeActiveRecord = new FakeActiveRecord(false);
    await TestCase.stubConst(
      topLevel,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        const job = (await EnqueueAfterCommitJob.performLater()) as EnqueueAfterCommitJob;
        expect(job).toBeInstanceOf(EnqueueAfterCommitJob);
        expect(job.isSuccessfullyEnqueued()).toBe(true);
      },
      { exists: false },
    );
  });

  it("#perform_later yields the enqueued Job instance even if it's delayed by `after_all_transactions_commit`", async () => {
    const fakeActiveRecord = new FakeActiveRecord(false);
    await TestCase.stubConst(
      topLevel,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        let called = false;
        const job = (await EnqueueAfterCommitJob.performLater(
          block((yieldedJob: unknown) => {
            called = true;
            expect(yieldedJob).toBeInstanceOf(EnqueueAfterCommitJob);
          }),
        )) as EnqueueAfterCommitJob;
        expect(called, "#perform_later yielded the job").toBe(true);
        expect(job).toBeInstanceOf(EnqueueAfterCommitJob);
        expect(job.isSuccessfullyEnqueued()).toBe(true);
      },
      { exists: false },
    );
  });

  it("#perform_later assumes successful enqueue, but update status later", async () => {
    const fakeActiveRecord = new FakeActiveRecord(false);
    await TestCase.stubConst(
      topLevel,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        const job = (await ErrorEnqueueAfterCommitJob.performLater()) as ErrorEnqueueAfterCommitJob;
        expect(job).toBeInstanceOf(ErrorEnqueueAfterCommitJob);
        expect(job.isSuccessfullyEnqueued()).toBe(true);

        await fakeActiveRecord.runAfterCommitCallbacks();
        expect(job.isSuccessfullyEnqueued()).toBe(false);
      },
      { exists: false },
    );
  });
});
