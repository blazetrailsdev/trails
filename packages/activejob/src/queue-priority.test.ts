import "./test-helpers/helper.js";
import "@blazetrails/activesupport/testing/autorun";
import { first, rbEqual, registerConstant } from "@blazetrails/ruby-compat";
import { TestHost } from "./codegen-runtime.js";
import { ConfigurationJob } from "./test-helpers/jobs/configuration-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { clear, lastValue } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("QueuePriorityTest", () => {
  class QueuePriorityTest extends TestHost {}
  registerConstant("QueuePriorityTest", QueuePriorityTest);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    await clear();
  });
  it("priority unset by default", async ({ testCase }: any) => {
    expect((await HelloJob.priority) ?? null).toBeNull();
  });
  it("uses given priority", async ({ testCase }: any) => {
    const originalPriority: any = await HelloJob.priority;
    try {
      await HelloJob.queueWithPriority(90);
      expect(await new HelloJob().priority).toEqual(90);
    } finally {
      HelloJob.priority = originalPriority;
    }
  });
  it("evals block given to priority to determine priority", async ({ testCase }: any) => {
    const originalPriority: any = await HelloJob.priority;
    try {
      await HelloJob.queueWithPriority(undefined, function (this: any) {
        return 25;
      });
      expect(await new HelloJob().priority).toEqual(25);
    } finally {
      HelloJob.priority = originalPriority;
    }
  });
  it("can use arguments to determine priority in priority block", async ({ testCase }: any) => {
    const originalPriority: any = await HelloJob.priority;
    try {
      await HelloJob.queueWithPriority(undefined, function (this: any) {
        if (rbEqual(first(this.arguments), "1")) {
          return 99;
        } else {
          return 11;
        }
      });
      expect(await new HelloJob("1").priority).toEqual(99);
      expect(await new HelloJob("3").priority).toEqual(11);
    } finally {
      HelloJob.priority = originalPriority;
    }
  });
  it("is assigned when perform_now", async ({ testCase }: any) => {
    await await (await ConfigurationJob.set({ priority: 123 })).performNow();
    const job: any = await lastValue();
    expect(await job.priority).toEqual(123);
  });
  it("is assigned when perform_later", async ({ testCase }: any) => {
    await await (await ConfigurationJob.set({ priority: 123 })).performLater();
    const job: any = await lastValue();
    expect(await job.priority).toEqual(123);
  });
});
