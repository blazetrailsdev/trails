import { isAdapterIs } from "./test-helpers/helper.js";
import { Notifications } from "@blazetrails/activesupport";
import "@blazetrails/activesupport/testing/autorun";
import { include, first, registerConstant } from "@blazetrails/ruby-compat";
import { rbSize, rbAppend, TestHost } from "./codegen-runtime.js";
import { TestHelper } from "./test-helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { RetryJob } from "./test-helpers/jobs/retry-job.js";
import { clear } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

describe("InstrumentationTest", () => {
  class InstrumentationTest extends TestHost {
    async subscribed(name: any, block?: any): Promise<any> {
      return await (async (events: any) => {
        await Notifications.subscribed(
          (...args: any[]) => (events = rbAppend(events, args)),
          name,
          block,
        );
        return events;
      })([]);
    }
  }
  registerConstant("InstrumentationTest", InstrumentationTest);
  include(InstrumentationTest, TestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  beforeEach(async ({ testCase }: any) => {
    await clear();
  });
  it("perform_now emits perform events", async ({ testCase }: any) => {
    const events: any = await await testCase.subscribed(
      /perform.*\.active_job/,
      async () => await await HelloJob.performNow("World!"),
    );
    expect(await rbSize(events)).toEqual(2);
    expect(await first(await events[0])).toEqual("perform_start.active_job");
    expect(await first(await events[1])).toEqual("perform.active_job");
  });
  it("perform_later emits an enqueue event", async ({ testCase }: any) => {
    const events: any = await await testCase.subscribed(
      "enqueue.active_job",
      async () => await await HelloJob.performLater("World!"),
    );
    expect(await rbSize(events)).toEqual(1);
  });
  if (!isAdapterIs("inline", "sneakers")) {
    it("retry emits an enqueue retry event", async ({ testCase }: any) => {
      const events: any = await await testCase.subscribed(
        "enqueue_retry.active_job",
        async () =>
          await await testCase.performEnqueuedJobs(
            undefined,
            async () => await await RetryJob.performLater("DefaultsError", 2),
          ),
      );
      expect(await rbSize(events)).toEqual(1);
    });
    it("retry exhaustion emits a retry_stopped event", async ({ testCase }: any) => {
      const events: any = await await testCase.subscribed(
        "retry_stopped.active_job",
        async () =>
          await await testCase.performEnqueuedJobs(
            undefined,
            async () => await await RetryJob.performLater("CustomCatchError", 6),
          ),
      );
      expect(await rbSize(events)).toEqual(1);
    });
  }
  it("discard emits a discard event", async ({ testCase }: any) => {
    const events: any = await await testCase.subscribed(
      "discard.active_job",
      async () =>
        await await testCase.performEnqueuedJobs(
          undefined,
          async () => await await RetryJob.performLater("DiscardableError", 2),
        ),
    );
    expect(await rbSize(events)).toEqual(1);
  });
});
