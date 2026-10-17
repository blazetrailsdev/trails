import "./test-helpers/helper.js";
import { assertDifference, TopLevel } from "@blazetrails/activesupport";
import { TestCase as AsTestCase } from "@blazetrails/activesupport/test-case";
import "@blazetrails/activesupport/testing/autorun";
import { rtest, block as rbBlock, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { TestHost, rbBinop, rbAppend, rbAryEnsure } from "./codegen-runtime.js";
import { EnqueueError } from "./enqueuing.js";
import { EnqueueErrorJob } from "./test-helpers/jobs/enqueue-error-job.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("EnqueueAfterTransactionCommitTest", () => {
  class EnqueueAfterTransactionCommitTest extends TestHost {}
  registerConstant("EnqueueAfterTransactionCommitTest", EnqueueAfterTransactionCommitTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("#perform_later wait for transactions to complete before enqueuing the job", async ({
    testCase,
  }: any) => {
    const fakeActiveRecord: any = new FakeActiveRecord();
    await AsTestCase.stubConst(
      TopLevel as any,
      "ActiveRecord",
      fakeActiveRecord,
      async () =>
        await assertDifference(
          async () => await fakeActiveRecord.calls,
          1,
          undefined,
          async () => await await EnqueueAfterCommitJob.performLater(),
        ),
      { exists: false },
    );
  });
  it("#perform_later returns the Job instance even if it's delayed by `after_all_transactions_commit`", async ({
    testCase,
  }: any) => {
    const fakeActiveRecord: any = new FakeActiveRecord(false);
    await AsTestCase.stubConst(
      TopLevel as any,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        const job: any = await await EnqueueAfterCommitJob.performLater();
        expect(job).toBeInstanceOf(EnqueueAfterCommitJob);
        return expect(rtest(await job.isSuccessfullyEnqueued())).toBe(true);
      },
      { exists: false },
    );
  });
  it("#perform_later yields the enqueued Job instance even if it's delayed by `after_all_transactions_commit`", async ({
    testCase,
  }: any) => {
    const fakeActiveRecord: any = new FakeActiveRecord(false);
    await AsTestCase.stubConst(
      TopLevel as any,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        let called: any = false;
        const job: any = await await EnqueueAfterCommitJob.performLater(
          rbBlock((yieldedJob?: any) => {
            called = true;
            return expect(yieldedJob).toBeInstanceOf(EnqueueAfterCommitJob);
          }),
        );
        expect(called).toBeTruthy();
        expect(job).toBeInstanceOf(EnqueueAfterCommitJob);
        return expect(rtest(await job.isSuccessfullyEnqueued())).toBe(true);
      },
      { exists: false },
    );
  });
  it("#perform_later assumes successful enqueue, but update status later", async ({
    testCase,
  }: any) => {
    const fakeActiveRecord: any = new FakeActiveRecord(false);
    await AsTestCase.stubConst(
      TopLevel as any,
      "ActiveRecord",
      fakeActiveRecord,
      async () => {
        const job: any = await await ErrorEnqueueAfterCommitJob.performLater();
        expect(job).toBeInstanceOf(ErrorEnqueueAfterCommitJob);
        expect(rtest(await job.isSuccessfullyEnqueued())).toBe(true);
        await fakeActiveRecord.runAfterCommitCallbacks();
        return expect(rtest(await job.isSuccessfullyEnqueued())).toBe(false);
      },
      { exists: false },
    );
  });
});
export class FakeActiveRecord {
  [key: string]: any;
  static [key: string]: any;

  get calls(): any {
    return this._calls;
  }

  constructor(shouldYield: any = true) {
    this._calls = 0;
    this._yield = shouldYield;
    this._callbacks = [];
  }

  afterAllTransactionsCommit(block?: any): any {
    this._calls = rbBinop(this._calls, "+", 1);
    if (rtest(this._yield)) {
      return block();
    } else {
      return rbAppend(this._callbacks, block);
    }
  }

  runAfterCommitCallbacks(): any {
    const values = rbAryEnsure([this._callbacks, []]);
    const callbacks: any = values[0];
    this._callbacks = values[1];
    return callbacks.forEach((x: any) => x.call());
  }
}
registerConstant("EnqueueAfterTransactionCommitTest::FakeActiveRecord", FakeActiveRecord);
export class EnqueueAfterCommitJob extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(): any {}
}
registerConstant("EnqueueAfterTransactionCommitTest::EnqueueAfterCommitJob", EnqueueAfterCommitJob);
{
  EnqueueAfterCommitJob.enqueueAfterTransactionCommit = true;
}
export class ErrorEnqueueAfterCommitJob extends EnqueueErrorJob {
  [key: string]: any;
  static [key: string]: any;

  perform(): any {}
}
registerConstant(
  "EnqueueAfterTransactionCommitTest::ErrorEnqueueAfterCommitJob",
  ErrorEnqueueAfterCommitJob,
);
{
  ErrorEnqueueAfterCommitJob.enqueueAfterTransactionCommit = true;
}
export class EnqueueErrorAdapter {
  [key: string]: any;
  static [key: string]: any;

  enqueue(...args: any[]): any {
    throw new EnqueueError("There was an error enqueuing the job");
  }

  enqueueAt(...args: any[]): any {
    throw new EnqueueError("There was an error enqueuing the job");
  }
}
registerConstant(
  "EnqueueAfterTransactionCommitTest::ErrorEnqueueAfterCommitJob::EnqueueErrorAdapter",
  EnqueueErrorAdapter,
);
ErrorEnqueueAfterCommitJob.setQueueAdapter(new EnqueueErrorAdapter());
