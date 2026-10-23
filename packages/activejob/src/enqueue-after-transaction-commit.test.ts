import type {} from "@blazetrails/vitest-matchers";
import "./test-helpers/helper.js";
import { assertDifference, TopLevel } from "@blazetrails/activesupport";
import { TestCase as AsTestCase } from "@blazetrails/activesupport/test-case";
import { registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { EnqueueError } from "./enqueuing.js";
import { EnqueueErrorJob } from "./test-helpers/jobs/enqueue-error-job.js";
import { expect, it, describe } from "vitest";

class EnqueueAfterTransactionCommitTest {}

describe("EnqueueAfterTransactionCommitTest", () => {
  it("#perform_later wait for transactions to complete before enqueuing the job", async () => {
    const fakeActiveRecord = new FakeActiveRecord();
    await AsTestCase.stubConst(
      TopLevel,
      "ActiveRecord",
      fakeActiveRecord,
      async () =>
        await assertDifference(
          async () => await fakeActiveRecord.calls,
          1,
          undefined,
          async () => await EnqueueAfterCommitJob.performLater(),
        ),
      { exists: false },
    );
  });

  it("#perform_later returns the Job instance even if it's delayed by `after_all_transactions_commit`", async () => {
    const fakeActiveRecord = new FakeActiveRecord(false);
    await AsTestCase.stubConst(
      TopLevel,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        const job = await EnqueueAfterCommitJob.performLater();
        expect(job).toBeExactInstanceOf(EnqueueAfterCommitJob);
        return expect(await job.isSuccessfullyEnqueued()).toBeRubyTruthy();
      },
      { exists: false },
    );
  });

  it("#perform_later yields the enqueued Job instance even if it's delayed by `after_all_transactions_commit`", async () => {
    const fakeActiveRecord = new FakeActiveRecord(false);
    await AsTestCase.stubConst(
      TopLevel,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        let called = false;
        const job = await EnqueueAfterCommitJob.performLater((yieldedJob: unknown) => {
          called = true;
          return expect(yieldedJob).toBeExactInstanceOf(EnqueueAfterCommitJob);
        });
        expect(called).toBeTruthy();
        expect(job).toBeExactInstanceOf(EnqueueAfterCommitJob);
        return expect(await job.isSuccessfullyEnqueued()).toBeRubyTruthy();
      },
      { exists: false },
    );
  });

  it("#perform_later assumes successful enqueue, but update status later", async () => {
    const fakeActiveRecord = new FakeActiveRecord(false);
    await AsTestCase.stubConst(
      TopLevel,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        const job = await ErrorEnqueueAfterCommitJob.performLater();
        expect(job).toBeExactInstanceOf(ErrorEnqueueAfterCommitJob);
        expect(await job.isSuccessfullyEnqueued()).toBeRubyTruthy();
        await fakeActiveRecord.runAfterCommitCallbacks();
        return expect(await job.isSuccessfullyEnqueued()).toBeRubyFalsy();
      },
      { exists: false },
    );
  });
});
export class FakeActiveRecord {
  declare _calls: number;
  declare _yield: boolean;
  declare _callbacks: unknown[];

  static toString(): string {
    return "EnqueueAfterTransactionCommitTest::FakeActiveRecord";
  }

  get calls() {
    return this._calls;
  }

  constructor(shouldYield: boolean = true) {
    this._calls = 0;
    this._yield = shouldYield;
    this._callbacks = [];
  }

  afterAllTransactionsCommit(block?: (...args: unknown[]) => unknown) {
    this._calls = this._calls + 1;
    if (this._yield != null && this._yield !== false) {
      return block();
    } else {
      return this._callbacks.push(block);
    }
  }

  runAfterCommitCallbacks() {
    const values = [this._callbacks, []];
    const callbacks = values[0];
    this._callbacks = values[1];
    return callbacks.forEach((x) => x.call());
  }
}
registerConstant("EnqueueAfterTransactionCommitTest::FakeActiveRecord", FakeActiveRecord);
export class EnqueueAfterCommitJob extends Base {
  static toString(): string {
    return "EnqueueAfterTransactionCommitTest::EnqueueAfterCommitJob";
  }

  perform() {}
}
registerConstant("EnqueueAfterTransactionCommitTest::EnqueueAfterCommitJob", EnqueueAfterCommitJob);
{
  EnqueueAfterCommitJob.enqueueAfterTransactionCommit = true;
}
export class ErrorEnqueueAfterCommitJob extends EnqueueErrorJob {
  static toString(): string {
    return "EnqueueAfterTransactionCommitTest::ErrorEnqueueAfterCommitJob";
  }

  perform() {}
}
registerConstant(
  "EnqueueAfterTransactionCommitTest::ErrorEnqueueAfterCommitJob",
  ErrorEnqueueAfterCommitJob,
);
{
  ErrorEnqueueAfterCommitJob.enqueueAfterTransactionCommit = true;
}
export class EnqueueErrorAdapter {
  static toString(): string {
    return "EnqueueAfterTransactionCommitTest::ErrorEnqueueAfterCommitJob::EnqueueErrorAdapter";
  }

  enqueue(...args: unknown[]) {
    throw new EnqueueError("There was an error enqueuing the job");
  }

  enqueueAt(...args: unknown[]) {
    throw new EnqueueError("There was an error enqueuing the job");
  }
}
registerConstant(
  "EnqueueAfterTransactionCommitTest::ErrorEnqueueAfterCommitJob::EnqueueErrorAdapter",
  EnqueueErrorAdapter,
);
ErrorEnqueueAfterCommitJob.setQueueAdapter(new EnqueueErrorAdapter());
