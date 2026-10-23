import { isAdapterIs } from "./test-helpers/helper.js";
import { Notifications } from "@blazetrails/activesupport";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import "@blazetrails/activesupport/testing/autorun";
import { include, registerConstant } from "@blazetrails/ruby-compat";
import { TestHelper } from "./test-helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { RetryJob } from "./test-helpers/jobs/retry-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { describe, beforeEach, it, expect, afterEach } from "vitest";

class InstrumentationTest extends ActiveSupportTestCase {
  async subscribed(name: RegExp | string, block?: (...args: unknown[]) => unknown) {
    return await (async (events) => {
      await Notifications.subscribed(
        (...args: unknown[]) =>
          typeof events === "string"
            ? events + args
            : Array.isArray(events)
              ? (events.push(args), events)
              : events instanceof globalThis.Set
                ? events.add(args)
                : events.append(args),
        name,
        block,
      );
      return events;
    })([]);
  }
}

interface InstrumentationTest extends TestHelper {
  enqueuedJobs: unknown;
  performedJobs: unknown;
}

registerConstant("InstrumentationTest", InstrumentationTest);
include(InstrumentationTest, TestHelper);

describe("InstrumentationTest", () => {
  beforeEach<{ testCase: InstrumentationTest }>(async ({ testCase }) => {
    await testCase.setup();
  });

  afterEach<{ testCase: InstrumentationTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });

  beforeEach<{ testCase: InstrumentationTest }>(async ({ testCase }) => {
    JobBuffer.clear();
  });

  it<{ testCase: InstrumentationTest }>("perform_now emits perform events", async ({
    testCase,
  }) => {
    let events = await testCase.subscribed(
      /perform.*\.active_job/,
      async () => await HelloJob.performNow("World!"),
    );
    expect(
      await (events instanceof globalThis.Set || events instanceof globalThis.Map
        ? events.size
        : events.length),
    ).toEqual(2);
    expect(await events[0][0]).toEqual("perform_start.active_job");
    expect(await events[1][0]).toEqual("perform.active_job");
  });

  it<{ testCase: InstrumentationTest }>("perform_later emits an enqueue event", async ({
    testCase,
  }) => {
    let events = await testCase.subscribed(
      "enqueue.active_job",
      async () => await HelloJob.performLater("World!"),
    );
    expect(
      await (events instanceof globalThis.Set || events instanceof globalThis.Map
        ? events.size
        : events.length),
    ).toEqual(1);
  });

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: InstrumentationTest }>(
    "retry emits an enqueue retry event",
    async ({ testCase }) => {
      let events = await testCase.subscribed(
        "enqueue_retry.active_job",
        async () =>
          await testCase.performEnqueuedJobs(
            undefined,
            async () => await RetryJob.performLater("DefaultsError", 2),
          ),
      );
      expect(
        await (events instanceof globalThis.Set || events instanceof globalThis.Map
          ? events.size
          : events.length),
      ).toEqual(1);
    },
  );

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: InstrumentationTest }>(
    "retry exhaustion emits a retry_stopped event",
    async ({ testCase }) => {
      let events = await testCase.subscribed(
        "retry_stopped.active_job",
        async () =>
          await testCase.performEnqueuedJobs(
            undefined,
            async () => await RetryJob.performLater("CustomCatchError", 6),
          ),
      );
      expect(
        await (events instanceof globalThis.Set || events instanceof globalThis.Map
          ? events.size
          : events.length),
      ).toEqual(1);
    },
  );

  it<{ testCase: InstrumentationTest }>("discard emits a discard event", async ({ testCase }) => {
    let events = await testCase.subscribed(
      "discard.active_job",
      async () =>
        await testCase.performEnqueuedJobs(
          undefined,
          async () => await RetryJob.performLater("DiscardableError", 2),
        ),
    );
    expect(
      await (events instanceof globalThis.Set || events instanceof globalThis.Map
        ? events.size
        : events.length),
    ).toEqual(1);
  });
});
