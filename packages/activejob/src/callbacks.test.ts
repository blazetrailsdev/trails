import type {} from "@blazetrails/vitest-matchers";
import "./test-helpers/helper.js";
import { isIn } from "@blazetrails/activesupport";
import { Base } from "./base.js";
import { AbortBeforeEnqueueJob } from "./test-helpers/jobs/abort-before-enqueue-job.js";
import { CallbackJob } from "./test-helpers/jobs/callback-job.js";
import { expect, it, describe } from "vitest";

describe("CallbacksTest", () => {
  it("perform callbacks", async () => {
    const performedCallbackJob = new CallbackJob("A-JOB-ID");
    await performedCallbackJob.performNow();
    expect(
      await isIn("CallbackJob ran before_perform", await performedCallbackJob.history()),
    ).toBeRubyTruthy();
    expect(
      await isIn("CallbackJob ran after_perform", await performedCallbackJob.history()),
    ).toBeRubyTruthy();
    expect(
      await isIn("CallbackJob ran around_perform_start", await performedCallbackJob.history()),
    ).toBeRubyTruthy();
    expect(
      await isIn("CallbackJob ran around_perform_stop", await performedCallbackJob.history()),
    ).toBeRubyTruthy();
  });

  it("perform return value", async () => {
    const job = class extends Base {
      perform() {
        return 123;
      }
    };
    expect(await job.performNow()).toEqual(123);
  });

  it("perform around_callbacks return value", async () => {
    let value = null;
    await class extends Base {
      perform() {
        return 123;
      }
      static {
        this.aroundPerform(function (_: unknown, block: unknown) {
          value = block();
          return value;
        });
      }
    }.performNow();
    expect(value).toEqual(123);
  });

  it("enqueue callbacks", async () => {
    const enqueuedCallbackJob = await CallbackJob.performLater();
    expect(
      await isIn("CallbackJob ran before_enqueue", await enqueuedCallbackJob.history()),
    ).toBeRubyTruthy();
    expect(
      await isIn("CallbackJob ran after_enqueue", await enqueuedCallbackJob.history()),
    ).toBeRubyTruthy();
    expect(
      await isIn("CallbackJob ran around_enqueue_start", await enqueuedCallbackJob.history()),
    ).toBeRubyTruthy();
    expect(
      await isIn("CallbackJob ran around_enqueue_stop", await enqueuedCallbackJob.history()),
    ).toBeRubyTruthy();
  });

  it("#enqueue returns false when before_enqueue aborts callback chain", async () => {
    expect(await new AbortBeforeEnqueueJob().enqueue()).toEqual(false);
  });

  it("#enqueue does not run after_enqueue callbacks when previous callbacks aborted", async () => {
    const job = new AbortBeforeEnqueueJob();
    await job.enqueue();
    expect(await job.flag).toBeNull();
  });

  it("#perform does not run after_perform callbacks when swhen previous callbacks aborted", async () => {
    const job = new AbortBeforeEnqueueJob();
    await job.performNow();
    expect(await job.flag).toBeNull();
  });

  it("#enqueue returns self when the job was enqueued", async () => {
    const job = new CallbackJob();
    expect(await job.enqueue()).toEqualRuby(job);
  });
});
