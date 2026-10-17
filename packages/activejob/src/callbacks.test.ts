import "./test-helpers/helper.js";
import { isIn } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { block as rbBlock, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { TestHost } from "./codegen-runtime.js";
import { AbortBeforeEnqueueJob } from "./test-helpers/jobs/abort-before-enqueue-job.js";
import { CallbackJob } from "./test-helpers/jobs/callback-job.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("CallbacksTest", () => {
  class CallbacksTest extends TestHost {}
  registerConstant("CallbacksTest", CallbacksTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("perform callbacks", async ({ testCase }: any) => {
    const performedCallbackJob: any = new CallbackJob("A-JOB-ID");
    await await performedCallbackJob.performNow();
    expect(
      await isIn("CallbackJob ran before_perform", await performedCallbackJob.history()),
    ).toBeTruthy();
    expect(
      await isIn("CallbackJob ran after_perform", await performedCallbackJob.history()),
    ).toBeTruthy();
    expect(
      await isIn("CallbackJob ran around_perform_start", await performedCallbackJob.history()),
    ).toBeTruthy();
    expect(
      await isIn("CallbackJob ran around_perform_stop", await performedCallbackJob.history()),
    ).toBeTruthy();
  });
  it("perform return value", async ({ testCase }: any) => {
    const job: any = class extends Base {
      static [key: string]: any;
      [key: string]: any;
      perform(): any {
        return 123;
      }
    };
    expect(await await job.performNow()).toEqual(123);
  });
  it("perform around_callbacks return value", async ({ testCase }: any) => {
    let value: any = null;
    await await class extends Base {
      static [key: string]: any;
      [key: string]: any;
      perform(): any {
        return 123;
      }
      static {
        this.aroundPerform(
          rbBlock(function (this: any, _?: any, block?: any) {
            value = block();
            return value;
          }),
        );
      }
    }.performNow();
    expect(value).toEqual(123);
  });
  it("enqueue callbacks", async ({ testCase }: any) => {
    const enqueuedCallbackJob: any = await await CallbackJob.performLater();
    expect(
      await isIn("CallbackJob ran before_enqueue", await enqueuedCallbackJob.history()),
    ).toBeTruthy();
    expect(
      await isIn("CallbackJob ran after_enqueue", await enqueuedCallbackJob.history()),
    ).toBeTruthy();
    expect(
      await isIn("CallbackJob ran around_enqueue_start", await enqueuedCallbackJob.history()),
    ).toBeTruthy();
    expect(
      await isIn("CallbackJob ran around_enqueue_stop", await enqueuedCallbackJob.history()),
    ).toBeTruthy();
  });
  it("#enqueue returns false when before_enqueue aborts callback chain", async ({
    testCase,
  }: any) => {
    expect(await await new AbortBeforeEnqueueJob().enqueue()).toEqual(false);
  });
  it("#enqueue does not run after_enqueue callbacks when previous callbacks aborted", async ({
    testCase,
  }: any) => {
    const job: any = new AbortBeforeEnqueueJob();
    await await job.enqueue();
    expect((await job.flag) ?? null).toBeNull();
  });
  it("#perform does not run after_perform callbacks when swhen previous callbacks aborted", async ({
    testCase,
  }: any) => {
    const job: any = new AbortBeforeEnqueueJob();
    await await job.performNow();
    expect((await job.flag) ?? null).toBeNull();
  });
  it("#enqueue returns self when the job was enqueued", async ({ testCase }: any) => {
    const job: any = new CallbackJob();
    expect(await await job.enqueue()).toEqual(job);
  });
});
