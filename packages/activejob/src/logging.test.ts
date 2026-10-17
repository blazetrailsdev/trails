import { isAdapterIs } from "./test-helpers/helper.js";
import {
  TaggedLogging,
  Notifications,
  assertRaises,
  Duration,
  Logger,
} from "@blazetrails/activesupport";
import { TestHelper as LogSubscriberTestHelper } from "@blazetrails/activesupport/log-subscriber/test-helper";
import "@blazetrails/activesupport/testing/autorun";
import {
  include,
  first,
  rbEqual,
  kernelThrow,
  block as rbBlock,
  rbStrSend,
  basicObjRespondTo,
  rtest,
  isEmpty,
  registerConstant,
  StringIO,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { rbAppend, rbAryEnsure, rbSize, TestHost } from "./codegen-runtime.js";
import { performAllLater } from "./enqueuing.js";
import { LogSubscriber } from "./log-subscriber.js";
import { ActiveJob } from "./namespaces.js";
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
import { clear } from "./test-helpers/support/job-buffer.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

describe("LoggingTest", () => {
  class LoggingTest extends TestHost {
    setup(): any {
      super.setup();
      clear();
      this._oldLogger = Base.logger;
      this._logger = TaggedLogging.new(new TestLogger());
      this.setLogger(this._logger);
      return LogSubscriber.attachTo("active_job");
    }

    teardown(): any {
      super.teardown();
      LogSubscriber.logSubscribers().pop();
      return this.setLogger(this._oldLogger);
    }

    setLogger(logger: any): any {
      Base.logger = logger;
      return Base.logger;
    }

    async subscribed(block?: any): Promise<any> {
      return await (async (events: any) => {
        await Notifications.subscribed(
          (...args: any[]) => (events = rbAppend(events, args)),
          /enqueue.*\.active_job/,
          block,
        );
        return events;
      })([]);
    }
  }
  registerConstant("LoggingTest", LoggingTest);
  include(LoggingTest, TestHelper);
  include(LoggingTest, LogSubscriberTestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("uses active job as tag", async ({ testCase }: any) => {
    await await HelloJob.performLater("Cristian");
    expect(await testCase._logger.messages()).toMatch(/\[ActiveJob\]/);
  });
  it("uses job name as tag", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      await await LoggingJob.performLater("Dummy");
      return expect(await testCase._logger.messages()).toMatch(/\[LoggingJob\]/);
    });
  });
  it("uses job id as tag", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      await await LoggingJob.performLater("Dummy");
      return expect(await testCase._logger.messages()).toMatch(/\[LOGGING-JOB-ID\]/);
    });
  });
  it("logs correct queue name", async ({ testCase }: any) => {
    let originalQueueName: any;
    try {
      originalQueueName = await LoggingJob.queueName;
      await LoggingJob.queueAs("php_jobs");
      await await LoggingJob.performLater("Dummy");
      expect(await testCase._logger.messages()).toMatch(/to .*?\(php_jobs\).*/);
    } finally {
      LoggingJob.queueName = originalQueueName;
    }
  });
  it("globalid parameter logging", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      const person: any = new Person(123);
      await await LoggingJob.performLater(person);
      expect(await testCase._logger.messages()).toMatch(/Enqueued.*gid:\/\/aj\/Person\/123/);
      expect(await testCase._logger.messages()).toMatch(/Dummy, here is it: #<Person:.*>/);
      return expect(await testCase._logger.messages()).toMatch(
        /Performing.*gid:\/\/aj\/Person\/123/,
      );
    });
  });
  it("globalid nested parameter logging", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      const person: any = new Person(123);
      await await LoggingJob.performLater({ person: person });
      expect(await testCase._logger.messages()).toMatch(/Enqueued.*gid:\/\/aj\/Person\/123/);
      expect(await testCase._logger.messages()).toMatch(/Dummy, here is it: .*#<Person:.*>/);
      return expect(await testCase._logger.messages()).toMatch(
        /Performing.*gid:\/\/aj\/Person\/123/,
      );
    });
  });
  it("enqueue job logging", async ({ testCase }: any) => {
    const events: any = await await testCase.subscribed(
      async () => await await HelloJob.performLater("Cristian"),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Enqueued HelloJob \(Job ID: .*?\) to .*?:.*Cristian/,
    );
    expect(await events.length).toEqual(1);
    const [key] = rbAryEnsure(await first(events));
    expect(key).toEqual("enqueue.active_job");
  });
  it("enqueue job log error when callback chain is halted", async ({ testCase }: any) => {
    const events: any = await await testCase.subscribed(
      async () => await await AbortBeforeEnqueueJob.performLater(),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Failed enqueuing AbortBeforeEnqueueJob.* a before_enqueue callback halted/,
    );
    expect(await events.length).toEqual(1);
    const [key] = rbAryEnsure(await first(events));
    expect(key).toEqual("enqueue.active_job");
  });
  it("enqueue job log error when error is raised during callback chain", async ({
    testCase,
  }: any) => {
    const events: any = await await testCase.subscribed(
      async () =>
        await assertRaises(
          [MyError],
          {},
          async () => await await AbortBeforeEnqueueJob.performLater("raise"),
        ),
    );
    expect(await testCase._logger.messages()).toMatch(/Failed enqueuing AbortBeforeEnqueueJob/);
    expect(await events.length).toEqual(1);
    const [key] = rbAryEnsure(await first(events));
    expect(key).toEqual("enqueue.active_job");
  });
  it("perform job logging", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      await await LoggingJob.performLater("Dummy");
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
  it("perform job logging when job is not enqueued", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      await await LoggingJob.performNow("Dummy");
      expect(await testCase._logger.messages()).toMatch(
        /Performing LoggingJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
      );
      return expect(await testCase._logger.messages()).not.toMatch(/enqueued at /);
    });
  });
  it("perform job log error when callback chain is halted", async ({ testCase }: any) => {
    await await testCase.subscribed(async () => await await AbortBeforeEnqueueJob.performNow());
    expect(await testCase._logger.messages()).toMatch(
      /Error performing AbortBeforeEnqueueJob.* a before_perform callback halted/,
    );
  });
  it("perform job doesnt log error when job returns falsy value", async ({ testCase }: any) => {
    const job: any = class extends Base {
      static [key: string]: any;
      [key: string]: any;
      perform(): any {
        return null;
      }
    };
    await await testCase.subscribed(async () => await await job.performNow());
    expect(await testCase._logger.messages()).not.toMatch(
      /Error performing AbortBeforeEnqueueJob.* a before_perform callback halted/,
    );
  });
  it("perform job doesnt log error when job is performed multiple times and fail the first time", async ({
    testCase,
  }: any) => {
    const job: any = new (class extends Base {
      static [key: string]: any;
      [key: string]: any;
      perform(_: any): any {}
      static {
        this.beforePerform(
          rbBlock(function (this: any) {
            if (rbEqual(this.arguments[0].pop(), "abort")) {
              return kernelThrow(":abort");
            }
            return null;
          }),
        );
      }
    })(["dont_abort", "abort"]);
    await await testCase.subscribed(async () => {
      await await job.performNow();
      return await await job.performNow();
    });
    expect(
      await rbSize(
        await rbStrSend(
          await testCase._logger.messages(),
          "scan",
          /a before_perform callback halted the job execution/,
        )[0],
      ),
    ).toEqual(1);
  });
  it("perform disabled job logging", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      await await DisableLogJob.performLater("Dummy");
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
  it("perform nested jobs logging", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      await await NestedJob.performLater();
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
  const run = !isAdapterIs("inline", "sneakers");
  {
    (run ? it : it.skip)("enqueue at job logging", async ({ testCase }: any) => {
      const events: any = await await testCase.subscribed(
        async () =>
          await await (
            await HelloJob.set({ waitUntil: await (await Duration.hours(24)).fromNow() })
          ).performLater("Cristian"),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Enqueued HelloJob \(Job ID: .*\) to .*? at.*Cristian/,
      );
      expect(await events.length).toEqual(1);
      const [key] = rbAryEnsure(await first(events));
      expect(key).toEqual("enqueue_at.active_job");
    });
  }
  it("enqueue at job log error when callback chain is halted", async ({ testCase }: any) => {
    const events: any = await await testCase.subscribed(
      async () =>
        await await (
          await AbortBeforeEnqueueJob.set({ wait: await Duration.seconds(1) })
        ).performLater(),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Failed enqueuing AbortBeforeEnqueueJob.* a before_enqueue callback halted/,
    );
    expect(await events.length).toEqual(1);
    const [key] = rbAryEnsure(await first(events));
    expect(key).toEqual("enqueue_at.active_job");
  });
  it("enqueue at job log error when error is raised during callback chain", async ({
    testCase,
  }: any) => {
    const events: any = await await testCase.subscribed(
      async () =>
        await assertRaises(
          [MyError],
          {},
          async () =>
            await await (
              await AbortBeforeEnqueueJob.set({ wait: await Duration.seconds(1) })
            ).performLater("raise"),
        ),
    );
    expect(await testCase._logger.messages()).toMatch(/Failed enqueuing AbortBeforeEnqueueJob/);
    expect(await events.length).toEqual(1);
    const [key] = rbAryEnsure(await first(events));
    expect(key).toEqual("enqueue_at.active_job");
  });
  const run1 = !isAdapterIs("inline", "sneakers");
  {
    (run1 ? it : it.skip)("enqueue in job logging", async ({ testCase }: any) => {
      const events: any = await await testCase.subscribed(
        async () =>
          await await (
            await HelloJob.set({ wait: await Duration.seconds(2) })
          ).performLater("Cristian"),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Enqueued HelloJob \(Job ID: .*\) to .*? at.*Cristian/,
      );
      expect(await events.length).toEqual(1);
      const [key] = rbAryEnsure(await first(events));
      expect(key).toEqual("enqueue_at.active_job");
    });
  }
  it("enqueue log when enqueue error is set", async ({ testCase }: any) => {
    await EnqueueErrorJob.disableTestAdapter();
    await await EnqueueErrorJob.performLater();
    expect(await testCase._logger.messages()).toMatch(
      /Failed enqueuing EnqueueErrorJob to EnqueueError\(default\): ActiveJob::EnqueueError \(There was an error enqueuing the job\)/,
    );
  });
  it("enqueue at log when enqueue error is set", async ({ testCase }: any) => {
    await EnqueueErrorJob.disableTestAdapter();
    await await (await EnqueueErrorJob.set({ wait: await Duration.hours(1) })).performLater();
    expect(await testCase._logger.messages()).toMatch(
      /Failed enqueuing EnqueueErrorJob to EnqueueError\(default\): ActiveJob::EnqueueError \(There was an error enqueuing the job\)/,
    );
  });
  it("for tagged logger support is consistent", async ({ testCase }: any) => {
    await testCase.setLogger(new Logger(null));
    await expect(
      (async () => await await OverriddenLoggingJob.performLater("Dummy"))(),
    ).resolves.not.toThrow();
  });
  it.skip("job error logging", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      try {
        return await await await RescueJob.performLater("other");
      } catch (error: any) {
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
  it("job no error logging on rescuable job", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await RescueJob.performLater("david"),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Performing RescueJob \(Job ID: .*?\) from .*? with arguments:.*david/,
    );
    expect(await testCase._logger.messages()).not.toMatch(
      /Error performing RescueJob \(Job ID: .*?\) from .*? in .*ms: ArgumentError \(Hair too good\):\n.*\brescue_job\.rb:\d+:in .*perform'/,
    );
  });
  const run2 = !isAdapterIs("inline", "sneakers");
  {
    (run2 ? it : it.skip)("enqueue retry logging", async ({ testCase }: any) => {
      await await testCase.performEnqueuedJobs(undefined, async () => {
        await await RetryJob.performLater("DefaultsError", 2);
        return expect(await testCase._logger.messages()).toMatch(
          /Retrying RetryJob \(Job ID: .*?\) after \d+ attempts in 3 seconds, due to a DefaultsError.*\./,
        );
      });
    });
  }
  it("enqueue retry logging on retry job", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await RescueJob.performLater("david"),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Retrying RescueJob \(Job ID: .*?\) after \d+ attempts in 0 seconds\./,
    );
  });
  const run3 = !isAdapterIs("inline", "sneakers");
  {
    (run3 ? it : it.skip)("retry stopped logging", async ({ testCase }: any) => {
      await await testCase.performEnqueuedJobs(
        undefined,
        async () => await await RetryJob.performLater("CustomCatchError", 6),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Stopped retrying RetryJob \(Job ID: .*?\) due to a CustomCatchError.*, which reoccurred on \d+ attempts\./,
      );
    });
    (run3 ? it : it.skip)("retry stopped logging without block", async ({ testCase }: any) => {
      await await testCase.performEnqueuedJobs(undefined, async () => {
        try {
          return await await await RetryJob.performLater("DefaultsError", 6);
        } catch (error: any) {
          if (error instanceof DefaultsError) {
            return expect(await testCase._logger.messages()).toMatch(
              /Stopped retrying RetryJob \(Job ID: .*?\) due to a DefaultsError.*, which reoccurred on \d+ attempts\./,
            );
          } else {
            throw error;
          }
        }
      });
    });
  }
  it("discard logging", async ({ testCase }: any) => {
    await await testCase.performEnqueuedJobs(undefined, async () => {
      await await RetryJob.performLater("DiscardableError", 2);
      return expect(await testCase._logger.messages()).toMatch(
        /Discarded RetryJob \(Job ID: .*?\) due to a DiscardableError.*\./,
      );
    });
  });
  it("enqueue all job logging some jobs failed enqueuing", async ({ testCase }: any) => {
    try {
      await EnqueueErrorJob.disableTestAdapter();
      EnqueueErrorAdapter.shouldRaiseSequence = [false, true];
      await performAllLater(new EnqueueErrorJob(), new EnqueueErrorJob());
      expect(await testCase._logger.messages()).toMatch(
        /Enqueued 1 job to .+ \(1 EnqueueErrorJob\)\. Failed enqueuing 1 job/,
      );
    } finally {
      EnqueueErrorAdapter.shouldRaiseSequence = [];
    }
  });
  it("enqueue all job logging all jobs failed enqueuing", async ({ testCase }: any) => {
    try {
      await EnqueueErrorJob.disableTestAdapter();
      EnqueueErrorAdapter.shouldRaiseSequence = [true, true];
      await performAllLater(new EnqueueErrorJob(), new EnqueueErrorJob());
      expect(await testCase._logger.messages()).toMatch(/Failed enqueuing 2 jobs to .+/);
    } finally {
      EnqueueErrorAdapter.shouldRaiseSequence = [];
    }
  });
  it.skip("verbose enqueue logs", async ({ testCase }: any) => {
    try {
      (ActiveJob as any).setVerboseEnqueueLogs(true);
      await await LoggingJob.performLater("Dummy");
      expect(await testCase._logger.messages()).toMatch("↳");
    } finally {
      (ActiveJob as any).setVerboseEnqueueLogs(false);
    }
  });
  it("verbose enqueue logs disabled by default", async ({ testCase }: any) => {
    await await LoggingJob.performLater("Dummy");
    expect(await testCase._logger.messages()).not.toMatch("↳");
  });
  it("enqueue all job logging", async ({ testCase }: any) => {
    await performAllLater(new LoggingJob("Dummy"), new HelloJob("Jamie"), new HelloJob("John"));
    expect(await testCase._logger.messages()).toMatch(
      /Enqueued 3 jobs to .+ \(2 HelloJob, 1 LoggingJob\)/,
    );
  });
  it("enqueue all graceful failure when enqueued count is nil", async ({ testCase }: any) => {
    let originalAdapter: any, stubbedInlineAdapter: any;
    try {
      originalAdapter = await Base.queueAdapter();
      stubbedInlineAdapter = new InlineAdapter();
      stubbedInlineAdapter.isRespondTo = function (
        this: any,
        methodName?: any,
        includePrivate: any = false,
      ) {
        return (
          rbEqual(methodName, "enqueueAll") ||
          basicObjRespondTo(this, methodName, !rtest(includePrivate))
        );
      };
      stubbedInlineAdapter.enqueueAll = function (this: any, ...rest: any[]) {
        return null;
      };
      Base.setQueueAdapter(stubbedInlineAdapter);
      await performAllLater(new LoggingJob("Dummy"), new HelloJob("Jamie"), new HelloJob("John"));
      expect(await testCase._logger.messages()).toMatch(/Failed enqueuing 3 jobs to .+/);
    } finally {
      Base.setQueueAdapter(originalAdapter);
    }
  });
  it("enqueue log level", async ({ testCase }: any) => {
    testCase._logger.level = Logger.WARN;
    await await HelloJob.performLater("Dummy");
    expect(await testCase._logger.messages()).not.toMatch(/HelloJob/);
    expect(isEmpty(await testCase._logger.messages())).toBe(true);
    testCase._logger.level = Logger.INFO;
    await await LoggingJob.performLater("Dummy");
    expect(await testCase._logger.messages()).toMatch(
      /Enqueued LoggingJob \(Job ID: .*?\) to .*? with arguments:.*Dummy/,
    );
  });
  const run4 = !isAdapterIs("inline", "sneakers");
  {
    (run4 ? it : it.skip)("enqueue at log level", async ({ testCase }: any) => {
      testCase._logger.level = Logger.WARN;
      await await (
        await HelloJob.set({ waitUntil: await (await Duration.hours(24)).fromNow() })
      ).performLater("Cristian");
      expect(await testCase._logger.messages()).not.toMatch(/HelloJob/);
      expect(isEmpty(await testCase._logger.messages())).toBe(true);
      testCase._logger.level = Logger.INFO;
      await await (
        await LoggingJob.set({ waitUntil: await (await Duration.hours(24)).fromNow() })
      ).performLater("Dummy");
      expect(await testCase._logger.messages()).toMatch(
        /Enqueued LoggingJob \(Job ID: .*\) to .*? at.*Dummy/,
      );
    });
  }
  it("enqueue all log level", async ({ testCase }: any) => {
    testCase._logger.level = Logger.WARN;
    await performAllLater(new LoggingJob("Dummy"), new HelloJob("Jamie"), new HelloJob("John"));
    expect(await testCase._logger.messages()).not.toMatch(/\(2 HelloJob, 1 LoggingJob\)/);
    expect(isEmpty(await testCase._logger.messages())).toBe(true);
    testCase._logger.level = Logger.INFO;
    await performAllLater(new LoggingJob("Dummy"), new HelloJob("Jamie"), new HelloJob("John"));
    expect(await testCase._logger.messages()).toMatch(
      /Enqueued 3 jobs to .+ \(2 HelloJob, 1 LoggingJob\)/,
    );
  });
  it("perform start log level", async ({ testCase }: any) => {
    testCase._logger.level = Logger.WARN;
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await LoggingJob.performLater("Dummy"),
    );
    expect(await testCase._logger.messages()).not.toMatch(/LoggingJob/);
    expect(isEmpty(await testCase._logger.messages())).toBe(true);
    testCase._logger.level = Logger.INFO;
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await LoggingJob.performLater("Dummy"),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Performing LoggingJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
    );
  });
  it("perform log level", async ({ testCase }: any) => {
    testCase._logger.level = Logger.WARN;
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await LoggingJob.performLater("Dummy"),
    );
    expect(await testCase._logger.messages()).not.toMatch(/Dummy, here is it: Dummy/);
    expect(isEmpty(await testCase._logger.messages())).toBe(true);
    testCase._logger.level = Logger.INFO;
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await LoggingJob.performLater("Dummy"),
    );
    expect(await testCase._logger.messages()).toMatch(/Dummy, here is it: Dummy/);
  });
  const run5 = !isAdapterIs("inline", "sneakers");
  {
    (run5 ? it : it.skip)("enqueue retry log level", async ({ testCase }: any) => {
      testCase._logger.level = Logger.WARN;
      await await testCase.performEnqueuedJobs(
        undefined,
        async () => await await RetryJob.performLater("DefaultsError", 2),
      );
      expect(await testCase._logger.messages()).not.toMatch(/RetryJob/);
      expect(isEmpty(await testCase._logger.messages())).toBe(true);
      testCase._logger.level = Logger.INFO;
      await await testCase.performEnqueuedJobs(
        undefined,
        async () => await await RetryJob.performLater("DefaultsError", 2),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Retrying RetryJob \(Job ID: .*?\) after \d+ attempts in 3 seconds, due to a DefaultsError.*\./,
      );
    });
  }
  it("enqueue retry log level on retry job", async ({ testCase }: any) => {
    testCase._logger.level = Logger.WARN;
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await RescueJob.performLater("david"),
    );
    expect(await testCase._logger.messages()).not.toMatch(/RescueJob/);
    expect(isEmpty(await testCase._logger.messages())).toBe(true);
    testCase._logger.level = Logger.INFO;
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await RescueJob.performLater("david"),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Retrying RescueJob \(Job ID: .*?\) after \d+ attempts in 0 seconds\./,
    );
  });
  const run6 = !isAdapterIs("inline", "sneakers");
  {
    (run6 ? it : it.skip)("retry stopped log level", async ({ testCase }: any) => {
      testCase._logger.level = Logger.FATAL;
      await await testCase.performEnqueuedJobs(
        undefined,
        async () => await await RetryJob.performLater("CustomCatchError", 6),
      );
      expect(await testCase._logger.messages()).not.toMatch(/RetryJob/);
      expect(isEmpty(await testCase._logger.messages())).toBe(true);
      testCase._logger.level = Logger.ERROR;
      await await testCase.performEnqueuedJobs(
        undefined,
        async () => await await RetryJob.performLater("CustomCatchError", 6),
      );
      expect(await testCase._logger.messages()).toMatch(
        /Stopped retrying RetryJob \(Job ID: .*?\) due to a CustomCatchError.*, which reoccurred on \d+ attempts\./,
      );
    });
  }
  it("discard log level", async ({ testCase }: any) => {
    testCase._logger.level = Logger.FATAL;
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await RetryJob.performLater("DiscardableError", 2),
    );
    expect(await testCase._logger.messages()).not.toMatch(/RetryJob/);
    expect(isEmpty(await testCase._logger.messages())).toBe(true);
    testCase._logger.level = Logger.ERROR;
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await RetryJob.performLater("DiscardableError", 2),
    );
    expect(await testCase._logger.messages()).toMatch(
      /Discarded RetryJob \(Job ID: .*?\) due to a DiscardableError.*\./,
    );
  });
});
export class TestLogger extends Logger {
  [key: string]: any;
  static [key: string]: any;

  constructor() {
    const file = new StringIO();
    super(file);
    this._file = file;
  }

  messages(): any {
    this._file.rewind();
    return this._file.read();
  }
}
registerConstant("LoggingTest::TestLogger", TestLogger);
