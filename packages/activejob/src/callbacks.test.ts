import { describe, expect, it } from "vitest";
import { isIn } from "@blazetrails/activesupport";
import { block } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import "./test-helpers/helper.js";
import { AbortBeforeEnqueueJob } from "./test-helpers/jobs/abort-before-enqueue-job.js";
import { CallbackJob } from "./test-helpers/jobs/callback-job.js";

describe("CallbacksTest", () => {
  it("perform callbacks", async () => {
    const performedCallbackJob = new CallbackJob("A-JOB-ID");
    await performedCallbackJob.performNow();
    expect(isIn("CallbackJob ran before_perform", performedCallbackJob.history)).toBeTruthy();
    expect(isIn("CallbackJob ran after_perform", performedCallbackJob.history)).toBeTruthy();
    expect(isIn("CallbackJob ran around_perform_start", performedCallbackJob.history)).toBeTruthy();
    expect(isIn("CallbackJob ran around_perform_stop", performedCallbackJob.history)).toBeTruthy();
  });

  it("perform return value", async () => {
    const job = class extends Base {
      perform(): number {
        return 123;
      }
    };

    expect(await job.performNow()).toBe(123);
  });

  it("perform around_callbacks return value", async () => {
    let value: unknown = null;

    const job = class extends Base {
      perform(): number {
        return 123;
      }
    };
    job.aroundPerform(
      block(async (_: unknown, block: () => unknown) => {
        value = await block();
      }),
    );
    await job.performNow();

    expect(value).toBe(123);
  });

  it("enqueue callbacks", async () => {
    const enqueuedCallbackJob = (await CallbackJob.performLater()) as CallbackJob;
    expect(isIn("CallbackJob ran before_enqueue", enqueuedCallbackJob.history)).toBeTruthy();
    expect(isIn("CallbackJob ran after_enqueue", enqueuedCallbackJob.history)).toBeTruthy();
    expect(isIn("CallbackJob ran around_enqueue_start", enqueuedCallbackJob.history)).toBeTruthy();
    expect(isIn("CallbackJob ran around_enqueue_stop", enqueuedCallbackJob.history)).toBeTruthy();
  });

  it("#enqueue returns false when before_enqueue aborts callback chain", async () => {
    expect(await new AbortBeforeEnqueueJob().enqueue()).toBe(false);
  });

  it("#enqueue does not run after_enqueue callbacks when previous callbacks aborted", async () => {
    const job = new AbortBeforeEnqueueJob();
    await job.enqueue();

    expect(job.flag).toBeNull();
  });

  it("#perform does not run after_perform callbacks when swhen previous callbacks aborted", async () => {
    const job = new AbortBeforeEnqueueJob();
    await job.performNow();

    expect(job.flag).toBeNull();
  });

  it("#enqueue returns self when the job was enqueued", async () => {
    const job = new CallbackJob();
    expect(await job.enqueue()).toBe(job);
  });
});
