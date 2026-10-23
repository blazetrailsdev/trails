import type {} from "@blazetrails/vitest-matchers";
import { isAdapterIs } from "./test-helpers/helper.js";
import {
  TaggedLogging,
  Notifications,
  assertRaises,
  Duration,
  Logger,
} from "@blazetrails/activesupport";
import { TestHelper as LogSubscriberTestHelper } from "@blazetrails/activesupport/log-subscriber/test-helper";
import { TestCase as ActiveSupportTestCase } from "@blazetrails/activesupport/test-case";
import "@blazetrails/activesupport/testing/autorun";
import {
  include,
  kernelThrow,
  rbStrSend,
  basicObjRespondTo,
  registerConstant,
  StringIO,
} from "@blazetrails/ruby-compat";
import { ActiveJob } from "./active-job.js";
import { Base } from "./base.js";
import { performAllLater } from "./enqueuing.js";
import { LogSubscriber } from "./log-subscriber.js";
import { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import { TestHelper } from "./test-helper.js";
import { AbortBeforeEnqueueJob, MyError } from "./test-helpers/jobs/abort-before-enqueue-job.js";
import { DisableLogJob } from "./test-helpers/jobs/disable-log-job.js";
import { EnqueueErrorJob, EnqueueErrorAdapter } from "./test-helpers/jobs/enqueue-error-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { LoggingJob } from "./test-helpers/jobs/logging-job.js";
import { NestedJob } from "./test-helpers/jobs/nested-job.js";
import { OverriddenLoggingJob } from "./test-helpers/jobs/overridden-logging-job.js";
import { RescueJob, OtherError } from "./test-helpers/jobs/rescue-job.js";
import { RetryJob, DefaultsError } from "./test-helpers/jobs/retry-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import type { TaggedLogger } from "@blazetrails/activesupport";

class LoggingTest extends ActiveSupportTestCase {
  declare _logger: TestLogger & TaggedLogger;

  setup() {
    super.setup();
    JobBuffer.clear();
    this._oldLogger = Base.logger;
    this._logger = TaggedLogging.new(new TestLogger());
    this.setLogger(this._logger);
    return LogSubscriber.attachTo("active_job");
  }

  teardown() {
    super.teardown();
    LogSubscriber.logSubscribers().pop();
    return this.setLogger(this._oldLogger);
  }

  setLogger(logger: unknown) {
    Base.logger = logger;
    return Base.logger;
  }

  async subscribed(block?: (...args: unknown[]) => unknown) {
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
        /enqueue.*\.active_job/,
        block,
      );
      return events;
    })([]);
  }
}

interface LoggingTest extends TestHelper {
  enqueuedJobs: unknown;
  performedJobs: unknown;
}

registerConstant("LoggingTest", LoggingTest);
include(LoggingTest, TestHelper);
include(LoggingTest, LogSubscriberTestHelper);

describe("LoggingTest", () => {
  beforeEach<{ testCase: LoggingTest }>(async ({ testCase }) => {
    await testCase.setup();
  });

  afterEach<{ testCase: LoggingTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });

  it<{ testCase: LoggingTest }>("uses active job as tag", async ({ testCase }) => {
    await HelloJob.performLater("Cristian");
    expect(await testCase._logger.messages()).toMatch(/\[ActiveJob\]/);
  });

  it<{ testCase: LoggingTest }>("uses job name as tag", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      await LoggingJob.performLater("Dummy");
      return expect(await testCase._logger.messages()).toMatch(/\[LoggingJob\]/);
    });
  });

  it<{ testCase: LoggingTest }>("uses job id as tag", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      await LoggingJob.performLater("Dummy");
      return expect(await testCase._logger.messages()).toMatch(/\[LOGGING-JOB-ID\]/);
    });
  });

  it<{ testCase: LoggingTest }>("logs correct queue name", async ({ testCase }) => {
    let originalQueueName;
    try {
      originalQueueName = await LoggingJob.queueName;
      LoggingJob.queueAs("php_jobs");
      await LoggingJob.performLater("Dummy");
      expect(await testCase._logger.messages()).toMatch(/to .*?\(php_jobs\).*/);
    } finally {
      LoggingJob.queueName = originalQueueName!;
    }
  });

  it<{ testCase: LoggingTest }>("globalid parameter logging", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      const person = new Person(123);
      await LoggingJob.performLater(person);
      expect(await testCase._logger.messages()).toMatch(/Enqueued.*gid:\/\/aj\/Person\/123/);
      expect(await testCase._logger.messages()).toMatch(/Dummy, here is it: #<Person:.*>/);
      return expect(await testCase._logger.messages()).toMatch(
        /Performing.*gid:\/\/aj\/Person\/123/,
      );
    });
  });

  it<{ testCase: LoggingTest }>("globalid nested parameter logging", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      const person = new Person(123);
      await LoggingJob.performLater({ person: person });
      expect(await testCase._logger.messages()).toMatch(/Enqueued.*gid:\/\/aj\/Person\/123/);
      expect(await testCase._logger.messages()).toMatch(/Dummy, here is it: .*#<Person:.*>/);
      return expect(await testCase._logger.messages()).toMatch(
        /Performing.*gid:\/\/aj\/Person\/123/,
      );
    });
  });

  it<{ testCase: LoggingTest }>("enqueue job logging", async ({ testCase }) => {
    let events = await testCase.subscribed(async () => await HelloJob.performLater("Cristian"));
    expect(await testCase._logger.messages()).toMatch(
      /Enqueued HelloJob \(Job ID: .*?\) to .*?:.*Cristian/,
    );
    expect(await events.length).toEqual(1);
    let [key] = ((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(
      await events[0],
    );
    expect(key).toEqual("enqueue.active_job");
  });

  it<{ testCase: LoggingTest }>("enqueue job log error when callback chain is halted", async ({
    testCase,
  }) => {
    let events = await testCase.subscribed(async () => await AbortBeforeEnqueueJob.performLater());
    expect(await testCase._logger.messages()).toMatch(
      /Failed enqueuing AbortBeforeEnqueueJob.* a before_enqueue callback halted/,
    );
    expect(await events.length).toEqual(1);
    let [key] = ((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(
      await events[0],
    );
    expect(key).toEqual("enqueue.active_job");
  });

  it<{
    testCase: LoggingTest;
  }>("enqueue job log error when error is raised during callback chain", async ({ testCase }) => {
    let events = await testCase.subscribed(
      async () =>
        await assertRaises(
          [MyError],
          {},
          async () => await AbortBeforeEnqueueJob.performLater("raise"),
        ),
    );
    expect(await testCase._logger.messages()).toMatch(/Failed enqueuing AbortBeforeEnqueueJob/);
    expect(await events.length).toEqual(1);
    let [key] = ((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(
      await events[0],
    );
    expect(key).toEqual("enqueue.active_job");
  });

  it<{ testCase: LoggingTest }>("perform job logging", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      await LoggingJob.performLater("Dummy");
      expect(await testCase._logger.messages()).toMatch(
        /Performing LoggingJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
      );
      expect(await testCase._logger.messages()).toMatch(/enqueued at /);
      expect(await testCase._logger.messages()).toMatch(/Dummy, here is it: Dummy/);
      return expect(await testCase._logger.messages()).toMatch(
        /Performed LoggingJob \(Job ID: .*?\) from .*? in .*ms/,
      );
    });
  });

  it<{ testCase: LoggingTest }>("perform job logging when job is not enqueued", async ({
    testCase,
  }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      await LoggingJob.performNow("Dummy");
      expect(await testCase._logger.messages()).toMatch(
        /Performing LoggingJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
      );
      return expect(await testCase._logger.messages()).not.toMatch(/enqueued at /);
    });
  });

  it<{ testCase: LoggingTest }>("perform job log error when callback chain is halted", async ({
    testCase,
  }) => {
    await testCase.subscribed(async () => await AbortBeforeEnqueueJob.performNow());
    expect(await testCase._logger.messages()).toMatch(
      /Error performing AbortBeforeEnqueueJob.* a before_perform callback halted/,
    );
  });

  it<{
    testCase: LoggingTest;
  }>("perform job doesnt log error when job returns falsy value", async ({ testCase }) => {
    let job = class extends Base {
      perform() {
        return null;
      }
    };
    await testCase.subscribed(async () => await job.performNow());
    expect(await testCase._logger.messages()).not.toMatch(
      /Error performing AbortBeforeEnqueueJob.* a before_perform callback halted/,
    );
  });

  it<{
    testCase: LoggingTest;
  }>("perform job doesnt log error when job is performed multiple times and fail the first time", async ({
    testCase,
  }) => {
    let job = new (class extends Base {
      perform(_: unknown) {}
      static {
        this.beforePerform(function () {
          if (this.arguments[0].pop() === "abort") {
            return kernelThrow(":abort");
          }
          return null;
        });
      }
    })(["dont_abort", "abort"]);
    await testCase.subscribed(async () => {
      await job.performNow();
      return await job.performNow();
    });
    expect(
      await ((x) =>
        x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
        await rbStrSend(
          await testCase._logger.messages(),
          "scan",
          /a before_perform callback halted the job execution/,
        )[0],
      ),
    ).toEqual(1);
  });

  it<{ testCase: LoggingTest }>("perform disabled job logging", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      await DisableLogJob.performLater("Dummy");
      expect(await testCase._logger.messages()).not.toMatch(
        /Enqueued DisableLogJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
      );
      expect(await testCase._logger.messages()).not.toMatch(
        /Performing DisableLogJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
      );
      expect(await testCase._logger.messages()).toMatch(/enqueued at /);
      expect(await testCase._logger.messages()).toMatch(/Dummy, here is it: Dummy/);
      return expect(await testCase._logger.messages()).toMatch(
        /Performed DisableLogJob \(Job ID: .*?\) from .*? in .*ms/,
      );
    });
  });

  it<{ testCase: LoggingTest }>("perform nested jobs logging", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      await NestedJob.performLater();
      expect(await testCase._logger.messages()).toMatch(/\[LoggingJob\] \[.*?\]/);
      expect(await testCase._logger.messages()).toMatch(
        /\[ActiveJob\] Enqueued NestedJob \(Job ID: .*\) to/,
      );
      expect(await testCase._logger.messages()).toMatch(
        /\[ActiveJob\] \[NestedJob\] \[NESTED-JOB-ID\] Performing NestedJob \(Job ID: .*?\) from/,
      );
      expect(await testCase._logger.messages()).toMatch(
        /\[ActiveJob\] \[NestedJob\] \[NESTED-JOB-ID\] Enqueued LoggingJob \(Job ID: .*?\) to .* with arguments: "NestedJob"/,
      );
      expect(await testCase._logger.messages()).toMatch(
        /\[ActiveJob\].*\[LoggingJob\] \[LOGGING-JOB-ID\] Performing LoggingJob \(Job ID: .*?\) from .* with arguments: "NestedJob"/,
      );
      expect(await testCase._logger.messages()).toMatch(
        /\[ActiveJob\].*\[LoggingJob\] \[LOGGING-JOB-ID\] Dummy, here is it: NestedJob/,
      );
      expect(await testCase._logger.messages()).toMatch(
        /\[ActiveJob\].*\[LoggingJob\] \[LOGGING-JOB-ID\] Performed LoggingJob \(Job ID: .*?\) from .* in/,
      );
      return expect(await testCase._logger.messages()).toMatch(
        /\[ActiveJob\] \[NestedJob\] \[NESTED-JOB-ID\] Performed NestedJob \(Job ID: .*?\) from .* in/,
      );
    });
  });

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: LoggingTest }>(
    "enqueue at job logging",
    async ({ testCase }) => {
      let events = await testCase.subscribed(
        async () =>
          await HelloJob.set({
            waitUntil: await (await Duration.hours(24)).fromNow(),
          }).performLater("Cristian"),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Enqueued HelloJob \(Job ID: .*\) to .*? at.*Cristian/,
      );
      expect(await events.length).toEqual(1);
      let [key] = ((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(
        await events[0],
      );
      expect(key).toEqual("enqueue_at.active_job");
    },
  );

  it<{ testCase: LoggingTest }>("enqueue at job log error when callback chain is halted", async ({
    testCase,
  }) => {
    let events = await testCase.subscribed(
      async () =>
        await AbortBeforeEnqueueJob.set({ wait: await Duration.seconds(1) }).performLater(),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Failed enqueuing AbortBeforeEnqueueJob.* a before_enqueue callback halted/,
    );
    expect(await events.length).toEqual(1);
    let [key] = ((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(
      await events[0],
    );
    expect(key).toEqual("enqueue_at.active_job");
  });

  it<{
    testCase: LoggingTest;
  }>("enqueue at job log error when error is raised during callback chain", async ({
    testCase,
  }) => {
    let events = await testCase.subscribed(
      async () =>
        await assertRaises(
          [MyError],
          {},
          async () =>
            await AbortBeforeEnqueueJob.set({ wait: await Duration.seconds(1) }).performLater(
              "raise",
            ),
        ),
    );
    expect(await testCase._logger.messages()).toMatch(/Failed enqueuing AbortBeforeEnqueueJob/);
    expect(await events.length).toEqual(1);
    let [key] = ((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(
      await events[0],
    );
    expect(key).toEqual("enqueue_at.active_job");
  });

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: LoggingTest }>(
    "enqueue in job logging",
    async ({ testCase }) => {
      let events = await testCase.subscribed(
        async () =>
          await HelloJob.set({ wait: await Duration.seconds(2) }).performLater("Cristian"),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Enqueued HelloJob \(Job ID: .*\) to .*? at.*Cristian/,
      );
      expect(await events.length).toEqual(1);
      let [key] = ((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(
        await events[0],
      );
      expect(key).toEqual("enqueue_at.active_job");
    },
  );

  it<{ testCase: LoggingTest }>("enqueue log when enqueue error is set", async ({ testCase }) => {
    EnqueueErrorJob.disableTestAdapter();
    await EnqueueErrorJob.performLater();
    expect(await testCase._logger.messages()).toMatch(
      /Failed enqueuing EnqueueErrorJob to EnqueueError\(default\): ActiveJob::EnqueueError \(There was an error enqueuing the job\)/,
    );
  });

  it<{ testCase: LoggingTest }>("enqueue at log when enqueue error is set", async ({
    testCase,
  }) => {
    EnqueueErrorJob.disableTestAdapter();
    await EnqueueErrorJob.set({ wait: await Duration.hours(1) }).performLater();
    expect(await testCase._logger.messages()).toMatch(
      /Failed enqueuing EnqueueErrorJob to EnqueueError\(default\): ActiveJob::EnqueueError \(There was an error enqueuing the job\)/,
    );
  });

  it<{ testCase: LoggingTest }>("for tagged logger support is consistent", async ({ testCase }) => {
    testCase.setLogger(new Logger(null));
    await expect(
      (async () => await OverriddenLoggingJob.performLater("Dummy"))(),
    ).resolves.not.toThrow();
  });

  it<{ testCase: LoggingTest }>("job error logging", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      try {
        return await RescueJob.performLater("other");
      } catch (error) {
        if (error instanceof OtherError) {
          expect(await testCase._logger.messages()).toMatch(
            /Performing RescueJob \(Job ID: .*?\) from .*? with arguments:.*other/,
          );
          return expect(await testCase._logger.messages()).toMatch(
            /Error performing RescueJob \(Job ID: .*?\) from .*? in .*ms: RescueJob::OtherError \(Bad hair\):\n.*\brescue_job\.rb:\d+:in .*perform'/,
          );
        } else {
          throw error;
        }
      }
    });
  });

  it<{ testCase: LoggingTest }>("job no error logging on rescuable job", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await RescueJob.performLater("david"),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Performing RescueJob \(Job ID: .*?\) from .*? with arguments:.*david/,
    );
    expect(await testCase._logger.messages()).not.toMatch(
      /Error performing RescueJob \(Job ID: .*?\) from .*? in .*ms: ArgumentError \(Hair too good\):\n.*\brescue_job\.rb:\d+:in .*perform'/,
    );
  });

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: LoggingTest }>(
    "enqueue retry logging",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs(undefined, async () => {
        await RetryJob.performLater("DefaultsError", 2);
        return expect(await testCase._logger.messages()).toMatch(
          /Retrying RetryJob \(Job ID: .*?\) after \d+ attempts in 3 seconds, due to a DefaultsError.*\./,
        );
      });
    },
  );

  it<{ testCase: LoggingTest }>("enqueue retry logging on retry job", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await RescueJob.performLater("david"),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Retrying RescueJob \(Job ID: .*?\) after \d+ attempts in 0 seconds\./,
    );
  });

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: LoggingTest }>(
    "retry stopped logging",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs(
        undefined,
        async () => await RetryJob.performLater("CustomCatchError", 6),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Stopped retrying RetryJob \(Job ID: .*?\) due to a CustomCatchError.*, which reoccurred on \d+ attempts\./,
      );
    },
  );

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: LoggingTest }>(
    "retry stopped logging without block",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs(undefined, async () => {
        try {
          return await RetryJob.performLater("DefaultsError", 6);
        } catch (error) {
          if (error instanceof DefaultsError) {
            return expect(await testCase._logger.messages()).toMatch(
              /Stopped retrying RetryJob \(Job ID: .*?\) due to a DefaultsError.*, which reoccurred on \d+ attempts\./,
            );
          } else {
            throw error;
          }
        }
      });
    },
  );

  it<{ testCase: LoggingTest }>("discard logging", async ({ testCase }) => {
    await testCase.performEnqueuedJobs(undefined, async () => {
      await RetryJob.performLater("DiscardableError", 2);
      return expect(await testCase._logger.messages()).toMatch(
        /Discarded RetryJob \(Job ID: .*?\) due to a DiscardableError.*\./,
      );
    });
  });

  it<{ testCase: LoggingTest }>("enqueue all job logging some jobs failed enqueuing", async ({
    testCase,
  }) => {
    try {
      EnqueueErrorJob.disableTestAdapter();
      EnqueueErrorAdapter.shouldRaiseSequence = [false, true];
      performAllLater(new EnqueueErrorJob(), new EnqueueErrorJob());
      expect(await testCase._logger.messages()).toMatch(
        /Enqueued 1 job to .+ \(1 EnqueueErrorJob\)\. Failed enqueuing 1 job/,
      );
    } finally {
      EnqueueErrorAdapter.shouldRaiseSequence = [];
    }
  });

  it<{ testCase: LoggingTest }>("enqueue all job logging all jobs failed enqueuing", async ({
    testCase,
  }) => {
    try {
      EnqueueErrorJob.disableTestAdapter();
      EnqueueErrorAdapter.shouldRaiseSequence = [true, true];
      performAllLater(new EnqueueErrorJob(), new EnqueueErrorJob());
      expect(await testCase._logger.messages()).toMatch(/Failed enqueuing 2 jobs to .+/);
    } finally {
      EnqueueErrorAdapter.shouldRaiseSequence = [];
    }
  });

  it<{ testCase: LoggingTest }>("verbose enqueue logs", async ({ testCase }) => {
    try {
      ActiveJob.verboseEnqueueLogs = true;
      await LoggingJob.performLater("Dummy");
      expect(await testCase._logger.messages()).toMatch("↳");
    } finally {
      ActiveJob.verboseEnqueueLogs = false;
    }
  });

  it<{ testCase: LoggingTest }>("verbose enqueue logs disabled by default", async ({
    testCase,
  }) => {
    await LoggingJob.performLater("Dummy");
    expect(await testCase._logger.messages()).not.toMatch("↳");
  });

  it<{ testCase: LoggingTest }>("enqueue all job logging", async ({ testCase }) => {
    performAllLater(new LoggingJob("Dummy"), new HelloJob("Jamie"), new HelloJob("John"));
    expect(await testCase._logger.messages()).toMatch(
      /Enqueued 3 jobs to .+ \(2 HelloJob, 1 LoggingJob\)/,
    );
  });

  it<{ testCase: LoggingTest }>("enqueue all graceful failure when enqueued count is nil", async ({
    testCase,
  }) => {
    let originalAdapter, stubbedInlineAdapter;
    try {
      originalAdapter = await Base.queueAdapter;
      stubbedInlineAdapter = new InlineAdapter();
      stubbedInlineAdapter.isRespondTo = function (
        this: unknown,
        methodName?: unknown,
        includePrivate: unknown = false,
      ) {
        return (
          methodName === "enqueueAll" ||
          basicObjRespondTo(
            this,
            methodName as string,
            !(includePrivate != null && includePrivate !== false),
          )
        );
      };
      stubbedInlineAdapter.enqueueAll = function (this: unknown, ...rest: unknown[]) {
        return null;
      };
      Base.setQueueAdapter(stubbedInlineAdapter);
      performAllLater(new LoggingJob("Dummy"), new HelloJob("Jamie"), new HelloJob("John"));
      expect(await testCase._logger.messages()).toMatch(/Failed enqueuing 3 jobs to .+/);
    } finally {
      Base.setQueueAdapter(originalAdapter);
    }
  });

  it<{ testCase: LoggingTest }>("enqueue log level", async ({ testCase }) => {
    testCase._logger.level = Logger.WARN;
    await HelloJob.performLater("Dummy");
    expect(await testCase._logger.messages()).not.toMatch(/HelloJob/);
    expect(await testCase._logger.messages()).toBeEmpty();
    testCase._logger.level = Logger.INFO;
    await LoggingJob.performLater("Dummy");
    expect(await testCase._logger.messages()).toMatch(
      /Enqueued LoggingJob \(Job ID: .*?\) to .*? with arguments:.*Dummy/,
    );
  });

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: LoggingTest }>(
    "enqueue at log level",
    async ({ testCase }) => {
      testCase._logger.level = Logger.WARN;
      await HelloJob.set({ waitUntil: await (await Duration.hours(24)).fromNow() }).performLater(
        "Cristian",
      );
      expect(await testCase._logger.messages()).not.toMatch(/HelloJob/);
      expect(await testCase._logger.messages()).toBeEmpty();
      testCase._logger.level = Logger.INFO;
      await LoggingJob.set({ waitUntil: await (await Duration.hours(24)).fromNow() }).performLater(
        "Dummy",
      );
      expect(await testCase._logger.messages()).toMatch(
        /Enqueued LoggingJob \(Job ID: .*\) to .*? at.*Dummy/,
      );
    },
  );

  it<{ testCase: LoggingTest }>("enqueue all log level", async ({ testCase }) => {
    testCase._logger.level = Logger.WARN;
    performAllLater(new LoggingJob("Dummy"), new HelloJob("Jamie"), new HelloJob("John"));
    expect(await testCase._logger.messages()).not.toMatch(/\(2 HelloJob, 1 LoggingJob\)/);
    expect(await testCase._logger.messages()).toBeEmpty();
    testCase._logger.level = Logger.INFO;
    performAllLater(new LoggingJob("Dummy"), new HelloJob("Jamie"), new HelloJob("John"));
    expect(await testCase._logger.messages()).toMatch(
      /Enqueued 3 jobs to .+ \(2 HelloJob, 1 LoggingJob\)/,
    );
  });

  it<{ testCase: LoggingTest }>("perform start log level", async ({ testCase }) => {
    testCase._logger.level = Logger.WARN;
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await LoggingJob.performLater("Dummy"),
    );
    expect(await testCase._logger.messages()).not.toMatch(/LoggingJob/);
    expect(await testCase._logger.messages()).toBeEmpty();
    testCase._logger.level = Logger.INFO;
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await LoggingJob.performLater("Dummy"),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Performing LoggingJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
    );
  });

  it<{ testCase: LoggingTest }>("perform log level", async ({ testCase }) => {
    testCase._logger.level = Logger.WARN;
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await LoggingJob.performLater("Dummy"),
    );
    expect(await testCase._logger.messages()).not.toMatch(/Dummy, here is it: Dummy/);
    expect(await testCase._logger.messages()).toBeEmpty();
    testCase._logger.level = Logger.INFO;
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await LoggingJob.performLater("Dummy"),
    );
    expect(await testCase._logger.messages()).toMatch(/Dummy, here is it: Dummy/);
  });

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: LoggingTest }>(
    "enqueue retry log level",
    async ({ testCase }) => {
      testCase._logger.level = Logger.WARN;
      await testCase.performEnqueuedJobs(
        undefined,
        async () => await RetryJob.performLater("DefaultsError", 2),
      );
      expect(await testCase._logger.messages()).not.toMatch(/RetryJob/);
      expect(await testCase._logger.messages()).toBeEmpty();
      testCase._logger.level = Logger.INFO;
      await testCase.performEnqueuedJobs(
        undefined,
        async () => await RetryJob.performLater("DefaultsError", 2),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Retrying RetryJob \(Job ID: .*?\) after \d+ attempts in 3 seconds, due to a DefaultsError.*\./,
      );
    },
  );

  it<{ testCase: LoggingTest }>("enqueue retry log level on retry job", async ({ testCase }) => {
    testCase._logger.level = Logger.WARN;
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await RescueJob.performLater("david"),
    );
    expect(await testCase._logger.messages()).not.toMatch(/RescueJob/);
    expect(await testCase._logger.messages()).toBeEmpty();
    testCase._logger.level = Logger.INFO;
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await RescueJob.performLater("david"),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Retrying RescueJob \(Job ID: .*?\) after \d+ attempts in 0 seconds\./,
    );
  });

  it.skipIf(!!isAdapterIs("inline", "sneakers"))<{ testCase: LoggingTest }>(
    "retry stopped log level",
    async ({ testCase }) => {
      testCase._logger.level = Logger.FATAL;
      await testCase.performEnqueuedJobs(
        undefined,
        async () => await RetryJob.performLater("CustomCatchError", 6),
      );
      expect(await testCase._logger.messages()).not.toMatch(/RetryJob/);
      expect(await testCase._logger.messages()).toBeEmpty();
      testCase._logger.level = Logger.ERROR;
      await testCase.performEnqueuedJobs(
        undefined,
        async () => await RetryJob.performLater("CustomCatchError", 6),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Stopped retrying RetryJob \(Job ID: .*?\) due to a CustomCatchError.*, which reoccurred on \d+ attempts\./,
      );
    },
  );

  it<{ testCase: LoggingTest }>("discard log level", async ({ testCase }) => {
    testCase._logger.level = Logger.FATAL;
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await RetryJob.performLater("DiscardableError", 2),
    );
    expect(await testCase._logger.messages()).not.toMatch(/RetryJob/);
    expect(await testCase._logger.messages()).toBeEmpty();
    testCase._logger.level = Logger.ERROR;
    await testCase.performEnqueuedJobs(
      undefined,
      async () => await RetryJob.performLater("DiscardableError", 2),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Discarded RetryJob \(Job ID: .*?\) due to a DiscardableError.*\./,
    );
  });
});
export class TestLogger extends Logger {
  declare _file: StringIO;

  static toString(): string {
    return "LoggingTest::TestLogger";
  }

  constructor() {
    const file = new StringIO();
    super(file);
    this._file = file;
  }

  messages() {
    this._file.rewind();
    return this._file.read();
  }
}
registerConstant("LoggingTest::TestLogger", TestLogger);
