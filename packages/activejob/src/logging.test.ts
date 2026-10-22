import { describe, expect, it, type TestContext } from "vitest";
import {
  assertMatch,
  assertNothingRaised,
  assertRaises,
  hours,
  Logger,
  Notifications,
  seconds,
  TaggedLogging,
} from "@blazetrails/activesupport";
import { TestCase } from "@blazetrails/activesupport/test-case";
import {
  setup as logSubscriberTestHelperSetup,
  teardown as logSubscriberTestHelperTeardown,
  TestHelper as LogSubscriberTestHelper,
} from "@blazetrails/activesupport/log-subscriber/test-helper";
import {
  basicObjRespondTo,
  include,
  kernelThrow,
  registerConstant,
  StringIO,
} from "@blazetrails/ruby-compat";
import { setVerboseEnqueueLogs } from "./active-job.js";
import { Base } from "./base.js";
import { LogSubscriber } from "./log-subscriber.js";
import { ActiveJob, QueueAdapters } from "./namespaces.js";
import "./queue-adapters/inline-adapter.js";
import { TestHelper } from "./test-helper.js";
import { isAdapterIs } from "./test-helpers/helper.js";
import { AbortBeforeEnqueueJob } from "./test-helpers/jobs/abort-before-enqueue-job.js";
import { DisableLogJob } from "./test-helpers/jobs/disable-log-job.js";
import { EnqueueErrorJob } from "./test-helpers/jobs/enqueue-error-job.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { LoggingJob } from "./test-helpers/jobs/logging-job.js";
import { NestedJob } from "./test-helpers/jobs/nested-job.js";
import { OverriddenLoggingJob } from "./test-helpers/jobs/overridden-logging-job.js";
import { RescueJob } from "./test-helpers/jobs/rescue-job.js";
import { DefaultsError, RetryJob } from "./test-helpers/jobs/retry-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

const { WARN, INFO, ERROR, FATAL } = Logger;

class TestLogger extends Logger {
  private _file: StringIO;

  constructor() {
    const file = new StringIO();
    super(file);
    this._file = file;
  }

  get messages(): string {
    this._file.rewind();
    return this._file.read();
  }
}

type TaggedTestLogger = TestLogger & { level: number };

class LoggingTest extends TestCase {
  static override toString(): string {
    return "LoggingTest";
  }

  declare logger: TaggedTestLogger;
  oldLogger: unknown;

  setLogger(logger: unknown): void {
    Base.logger = logger;
  }

  async subscribed(block: () => unknown): Promise<unknown[][]> {
    const events: unknown[][] = [];
    await Notifications.subscribed(
      (...args: unknown[]) => void events.push(args),
      /enqueue.*\.active_job/,
      block,
    );
    return events;
  }
}
include(LoggingTest, TestHelper);
include(LoggingTest, LogSubscriberTestHelper);
registerConstant("LoggingTest", LoggingTest);

LoggingTest.setup(function (this: LoggingTest) {
  logSubscriberTestHelperSetup.call(this as never);
  JobBuffer.clear();
  this.oldLogger = Base.logger;
  this.logger = TaggedLogging.new(new TestLogger()) as TaggedTestLogger;
  this.setLogger(this.logger);
  LogSubscriber.attachTo("active_job");
});

LoggingTest.teardown(function (this: LoggingTest) {
  logSubscriberTestHelperTeardown.call(this as never);
  LogSubscriber.logSubscribers().pop();
  this.setLogger(this.oldLogger);
});

type Ctx = TestContext & { testCase: LoggingTest & TestHelper };
type Configured = { performLater(...args: unknown[]): Promise<unknown> };

describe("LoggingTest", () => {
  it("uses active job as tag", async ({ testCase: t }: Ctx) => {
    await HelloJob.performLater("Cristian");
    expect(t.logger.messages).toMatch(/\[ActiveJob\]/);
  });

  it("uses job name as tag", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      await LoggingJob.performLater("Dummy");
      expect(t.logger.messages).toMatch(/\[LoggingJob\]/);
    });
  });

  it("uses job id as tag", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      await LoggingJob.performLater("Dummy");
      expect(t.logger.messages).toMatch(/\[LOGGING-JOB-ID\]/);
    });
  });

  it("logs correct queue name", async ({ testCase: t }: Ctx) => {
    const originalQueueName = LoggingJob.queueName;
    try {
      LoggingJob.queueAs("php_jobs");
      await LoggingJob.performLater("Dummy");
      expect(t.logger.messages).toMatch(/to .*?\(php_jobs\).*/);
    } finally {
      LoggingJob.queueName = originalQueueName;
    }
  });

  it("globalid parameter logging", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      const person = new Person(123);
      await LoggingJob.performLater(person);
      expect(t.logger.messages).toMatch(/Enqueued.*gid:\/\/aj\/Person\/123/);
      expect(t.logger.messages).toMatch(/Dummy, here is it: #<Person:.*>/);
      expect(t.logger.messages).toMatch(/Performing.*gid:\/\/aj\/Person\/123/);
    });
  });

  it("globalid nested parameter logging", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      const person = new Person(123);
      await LoggingJob.performLater({ person: person });
      expect(t.logger.messages).toMatch(/Enqueued.*gid:\/\/aj\/Person\/123/);
      expect(t.logger.messages).toMatch(/Dummy, here is it: .*#<Person:.*>/);
      expect(t.logger.messages).toMatch(/Performing.*gid:\/\/aj\/Person\/123/);
    });
  });

  it("enqueue job logging", async ({ testCase: t }: Ctx) => {
    const events = await t.subscribed(() => HelloJob.performLater("Cristian"));
    expect(t.logger.messages).toMatch(/Enqueued HelloJob \(Job ID: .*?\) to .*?:.*Cristian/);
    expect(events.length).toBe(1);
    const [key] = events[0];
    expect(key).toBe("enqueue.active_job");
  });

  it("enqueue job log error when callback chain is halted", async ({ testCase: t }: Ctx) => {
    const events = await t.subscribed(() => AbortBeforeEnqueueJob.performLater());
    expect(t.logger.messages).toMatch(
      /Failed enqueuing AbortBeforeEnqueueJob.* a before_enqueue callback halted/,
    );
    expect(events.length).toBe(1);
    const [key] = events[0];
    expect(key).toBe("enqueue.active_job");
  });

  it("enqueue job log error when error is raised during callback chain", async ({
    testCase: t,
  }: Ctx) => {
    const events = await t.subscribed(async () => {
      await assertRaises([AbortBeforeEnqueueJob.MyError], {}, () =>
        AbortBeforeEnqueueJob.performLater(":raise"),
      );
    });

    expect(t.logger.messages).toMatch(/Failed enqueuing AbortBeforeEnqueueJob/);
    expect(events.length).toBe(1);
    const [key] = events[0];
    expect(key).toBe("enqueue.active_job");
  });

  it("perform job logging", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      await LoggingJob.performLater("Dummy");
      expect(t.logger.messages).toMatch(
        /Performing LoggingJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
      );

      expect(t.logger.messages).toMatch(/enqueued at /);
      expect(t.logger.messages).toMatch(/Dummy, here is it: Dummy/);
      expect(t.logger.messages).toMatch(/Performed LoggingJob \(Job ID: .*?\) from .*? in .*ms/);
    });
  });

  it("perform job logging when job is not enqueued", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      await LoggingJob.performNow("Dummy");

      expect(t.logger.messages).toMatch(
        /Performing LoggingJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
      );
      expect(t.logger.messages).not.toMatch(/enqueued at /);
    });
  });

  it("perform job log error when callback chain is halted", async ({ testCase: t }: Ctx) => {
    await t.subscribed(() => AbortBeforeEnqueueJob.performNow());
    expect(t.logger.messages).toMatch(
      /Error performing AbortBeforeEnqueueJob.* a before_perform callback halted/,
    );
  });

  it("perform job doesnt log error when job returns falsy value", async ({ testCase: t }: Ctx) => {
    const job = class extends Base {
      perform(): null {
        return null;
      }
    };

    await t.subscribed(() => job.performNow());
    expect(t.logger.messages).not.toMatch(
      /Error performing AbortBeforeEnqueueJob.* a before_perform callback halted/,
    );
  });

  it("perform job doesnt log error when job is performed multiple times and fail the first time", async ({
    testCase: t,
  }: Ctx) => {
    const klass = class extends Base {
      perform(_: unknown): void {}
    };
    klass.beforePerform(function (this: Base) {
      if ((this.arguments[0] as unknown[]).pop() === ":abort") kernelThrow(":abort");
    });
    const job = new klass([":dont_abort", ":abort"]);

    await t.subscribed(async () => {
      await job.performNow();
      await job.performNow();
    });

    expect(
      t.logger.messages.match(/a before_perform callback halted the job execution/g)?.length ?? 0,
    ).toBe(1);
  });

  it("perform disabled job logging", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      await DisableLogJob.performLater("Dummy");
      expect(t.logger.messages).not.toMatch(
        /Enqueued DisableLogJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
      );
      expect(t.logger.messages).not.toMatch(
        /Performing DisableLogJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
      );

      expect(t.logger.messages).toMatch(/enqueued at /);
      expect(t.logger.messages).toMatch(/Dummy, here is it: Dummy/);
      expect(t.logger.messages).toMatch(/Performed DisableLogJob \(Job ID: .*?\) from .*? in .*ms/);
    });
  });

  it("perform nested jobs logging", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      await NestedJob.performLater();
      expect(t.logger.messages).toMatch(/\[LoggingJob\] \[.*?\]/);
      expect(t.logger.messages).toMatch(/\[ActiveJob\] Enqueued NestedJob \(Job ID: .*\) to/);
      expect(t.logger.messages).toMatch(
        /\[ActiveJob\] \[NestedJob\] \[NESTED-JOB-ID\] Performing NestedJob \(Job ID: .*?\) from/,
      );
      expect(t.logger.messages).toMatch(
        /\[ActiveJob\] \[NestedJob\] \[NESTED-JOB-ID\] Enqueued LoggingJob \(Job ID: .*?\) to .* with arguments: "NestedJob"/,
      );
      expect(t.logger.messages).toMatch(
        /\[ActiveJob\].*\[LoggingJob\] \[LOGGING-JOB-ID\] Performing LoggingJob \(Job ID: .*?\) from .* with arguments: "NestedJob"/,
      );
      expect(t.logger.messages).toMatch(
        /\[ActiveJob\].*\[LoggingJob\] \[LOGGING-JOB-ID\] Dummy, here is it: NestedJob/,
      );
      expect(t.logger.messages).toMatch(
        /\[ActiveJob\].*\[LoggingJob\] \[LOGGING-JOB-ID\] Performed LoggingJob \(Job ID: .*?\) from .* in/,
      );
      expect(t.logger.messages).toMatch(
        /\[ActiveJob\] \[NestedJob\] \[NESTED-JOB-ID\] Performed NestedJob \(Job ID: .*?\) from .* in/,
      );
    });
  });

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "enqueue at job logging",
    async ({ testCase: t }: Ctx) => {
      const events = await t.subscribed(() =>
        (HelloJob.set({ waitUntil: hours(24).fromNow() }) as Configured).performLater("Cristian"),
      );
      expect(t.logger.messages).toMatch(/Enqueued HelloJob \(Job ID: .*\) to .*? at.*Cristian/);
      expect(events.length).toBe(1);
      const [key] = events[0];
      expect(key).toBe("enqueue_at.active_job");
    },
  );

  it("enqueue at job log error when callback chain is halted", async ({ testCase: t }: Ctx) => {
    const events = await t.subscribed(() =>
      (AbortBeforeEnqueueJob.set({ wait: seconds(1) }) as Configured).performLater(),
    );
    expect(t.logger.messages).toMatch(
      /Failed enqueuing AbortBeforeEnqueueJob.* a before_enqueue callback halted/,
    );
    expect(events.length).toBe(1);
    const [key] = events[0];
    expect(key).toBe("enqueue_at.active_job");
  });

  it("enqueue at job log error when error is raised during callback chain", async ({
    testCase: t,
  }: Ctx) => {
    const events = await t.subscribed(async () => {
      await assertRaises([AbortBeforeEnqueueJob.MyError], {}, () =>
        (AbortBeforeEnqueueJob.set({ wait: seconds(1) }) as Configured).performLater(":raise"),
      );
    });

    expect(t.logger.messages).toMatch(/Failed enqueuing AbortBeforeEnqueueJob/);
    expect(events.length).toBe(1);
    const [key] = events[0];
    expect(key).toBe("enqueue_at.active_job");
  });

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "enqueue in job logging",
    async ({ testCase: t }: Ctx) => {
      const events = await t.subscribed(() =>
        (HelloJob.set({ wait: seconds(2) }) as Configured).performLater("Cristian"),
      );
      expect(t.logger.messages).toMatch(/Enqueued HelloJob \(Job ID: .*\) to .*? at.*Cristian/);
      expect(events.length).toBe(1);
      const [key] = events[0];
      expect(key).toBe("enqueue_at.active_job");
    },
  );

  it("enqueue log when enqueue error is set", async ({ testCase: t }: Ctx) => {
    EnqueueErrorJob.disableTestAdapter();

    await EnqueueErrorJob.performLater();
    expect(t.logger.messages).toMatch(
      /Failed enqueuing EnqueueErrorJob to EnqueueError\(default\): ActiveJob::EnqueueError \(There was an error enqueuing the job\)/,
    );
  });

  it("enqueue at log when enqueue error is set", async ({ testCase: t }: Ctx) => {
    EnqueueErrorJob.disableTestAdapter();

    await (EnqueueErrorJob.set({ wait: hours(1) }) as Configured).performLater();
    expect(t.logger.messages).toMatch(
      /Failed enqueuing EnqueueErrorJob to EnqueueError\(default\): ActiveJob::EnqueueError \(There was an error enqueuing the job\)/,
    );
  });

  it("for tagged logger support is consistent", async ({ testCase: t }: Ctx) => {
    t.setLogger(new Logger(null));
    await assertNothingRaised(() => OverriddenLoggingJob.performLater("Dummy"));
  });

  it("job error logging", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      try {
        await RescueJob.performLater("other");
      } catch (e) {
        if (!(e instanceof RescueJob.OtherError)) throw e;
        assertMatch(
          /Performing RescueJob \(Job ID: .*?\) from .*? with arguments:.*other/,
          t.logger.messages,
        );
        assertMatch(
          /Error performing RescueJob \(Job ID: .*?\) from .*? in .*ms: RescueJob::OtherError \(Bad hair\):\n.*\bRescueJob\.perform .*\brescue-job\.ts:\d+/,
          t.logger.messages,
        );
      }
    });
  });

  it("job no error logging on rescuable job", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, () => RescueJob.performLater("david"));
    expect(t.logger.messages).toMatch(
      /Performing RescueJob \(Job ID: .*?\) from .*? with arguments:.*david/,
    );
    expect(t.logger.messages).not.toMatch(
      /Error performing RescueJob \(Job ID: .*?\) from .*? in .*ms: ArgumentError \(Hair too good\):\n.*\bRescueJob\.perform .*\brescue-job\.ts:\d+/,
    );
  });

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "enqueue retry logging",
    async ({ testCase: t }: Ctx) => {
      await t.performEnqueuedJobs({}, async () => {
        await RetryJob.performLater("DefaultsError", 2);
        expect(t.logger.messages).toMatch(
          /Retrying RetryJob \(Job ID: .*?\) after \d+ attempts in 3 seconds, due to a DefaultsError.*\./,
        );
      });
    },
  );

  it("enqueue retry logging on retry job", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, () => RescueJob.performLater("david"));
    expect(t.logger.messages).toMatch(
      /Retrying RescueJob \(Job ID: .*?\) after \d+ attempts in 0 seconds\./,
    );
  });

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "retry stopped logging",
    async ({ testCase: t }: Ctx) => {
      await t.performEnqueuedJobs({}, () => RetryJob.performLater("CustomCatchError", 6));
      expect(t.logger.messages).toMatch(
        /Stopped retrying RetryJob \(Job ID: .*?\) due to a CustomCatchError.*, which reoccurred on \d+ attempts\./,
      );
    },
  );

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "retry stopped logging without block",
    async ({ testCase: t }: Ctx) => {
      await t.performEnqueuedJobs({}, async () => {
        try {
          await RetryJob.performLater("DefaultsError", 6);
        } catch (e) {
          if (!(e instanceof DefaultsError)) throw e;
          assertMatch(
            /Stopped retrying RetryJob \(Job ID: .*?\) due to a DefaultsError.*, which reoccurred on \d+ attempts\./,
            t.logger.messages,
          );
        }
      });
    },
  );

  it("discard logging", async ({ testCase: t }: Ctx) => {
    await t.performEnqueuedJobs({}, async () => {
      await RetryJob.performLater("DiscardableError", 2);
      expect(t.logger.messages).toMatch(
        /Discarded RetryJob \(Job ID: .*?\) due to a DiscardableError.*\./,
      );
    });
  });

  it("enqueue all job logging some jobs failed enqueuing", async ({ testCase: t }: Ctx) => {
    try {
      EnqueueErrorJob.disableTestAdapter();

      EnqueueErrorJob.EnqueueErrorAdapter.shouldRaiseSequence = [false, true];

      await ActiveJob.performAllLater(new EnqueueErrorJob(), new EnqueueErrorJob());
      expect(t.logger.messages).toMatch(
        /Enqueued 1 job to .+ \(1 EnqueueErrorJob\)\. Failed enqueuing 1 job/,
      );
    } finally {
      EnqueueErrorJob.EnqueueErrorAdapter.shouldRaiseSequence = [];
    }
  });

  it("enqueue all job logging all jobs failed enqueuing", async ({ testCase: t }: Ctx) => {
    try {
      EnqueueErrorJob.disableTestAdapter();

      EnqueueErrorJob.EnqueueErrorAdapter.shouldRaiseSequence = [true, true];

      await ActiveJob.performAllLater(new EnqueueErrorJob(), new EnqueueErrorJob());
      expect(t.logger.messages).toMatch(/Failed enqueuing 2 jobs to .+/);
    } finally {
      EnqueueErrorJob.EnqueueErrorAdapter.shouldRaiseSequence = [];
    }
  });

  it("verbose enqueue logs", async ({ testCase: t }: Ctx) => {
    try {
      setVerboseEnqueueLogs(true);

      await LoggingJob.performLater("Dummy");
      expect(t.logger.messages).toMatch("↳");
    } finally {
      setVerboseEnqueueLogs(false);
    }
  });

  it("verbose enqueue logs disabled by default", async ({ testCase: t }: Ctx) => {
    await LoggingJob.performLater("Dummy");
    expect(t.logger.messages).not.toMatch("↳");
  });

  it("enqueue all job logging", async ({ testCase: t }: Ctx) => {
    await ActiveJob.performAllLater(
      new LoggingJob("Dummy"),
      new HelloJob("Jamie"),
      new HelloJob("John"),
    );
    expect(t.logger.messages).toMatch(/Enqueued 3 jobs to .+ \(2 HelloJob, 1 LoggingJob\)/);
  });

  it("enqueue all graceful failure when enqueued count is nil", async ({ testCase: t }: Ctx) => {
    const originalAdapter = Base.queueAdapter;
    try {
      const stubbedInlineAdapter = new QueueAdapters.InlineAdapter();
      Object.assign(stubbedInlineAdapter, {
        isRespondTo(methodName: string, includePrivate: boolean = false): boolean {
          return (
            methodName === "enqueueAll" || basicObjRespondTo(this, methodName, !includePrivate)
          );
        },
        enqueueAll(..._args: unknown[]): null {
          return null;
        },
      });

      Base.setQueueAdapter(stubbedInlineAdapter);

      await ActiveJob.performAllLater(
        new LoggingJob("Dummy"),
        new HelloJob("Jamie"),
        new HelloJob("John"),
      );
      expect(t.logger.messages).toMatch(/Failed enqueuing 3 jobs to .+/);
    } finally {
      Base.setQueueAdapter(originalAdapter);
    }
  });

  it("enqueue log level", async ({ testCase: t }: Ctx) => {
    t.logger.level = WARN;
    await HelloJob.performLater("Dummy");
    expect(t.logger.messages).not.toMatch(/HelloJob/);
    expect(t.logger.messages).toBeEmpty();

    t.logger.level = INFO;
    await LoggingJob.performLater("Dummy");
    expect(t.logger.messages).toMatch(
      /Enqueued LoggingJob \(Job ID: .*?\) to .*? with arguments:.*Dummy/,
    );
  });

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "enqueue at log level",
    async ({ testCase: t }: Ctx) => {
      t.logger.level = WARN;
      await (HelloJob.set({ waitUntil: hours(24).fromNow() }) as Configured).performLater(
        "Cristian",
      );
      expect(t.logger.messages).not.toMatch(/HelloJob/);
      expect(t.logger.messages).toBeEmpty();

      t.logger.level = INFO;
      await (LoggingJob.set({ waitUntil: hours(24).fromNow() }) as Configured).performLater(
        "Dummy",
      );
      expect(t.logger.messages).toMatch(/Enqueued LoggingJob \(Job ID: .*\) to .*? at.*Dummy/);
    },
  );

  it("enqueue all log level", async ({ testCase: t }: Ctx) => {
    t.logger.level = WARN;
    await ActiveJob.performAllLater(
      new LoggingJob("Dummy"),
      new HelloJob("Jamie"),
      new HelloJob("John"),
    );
    expect(t.logger.messages).not.toMatch(/\(2 HelloJob, 1 LoggingJob\)/);
    expect(t.logger.messages).toBeEmpty();

    t.logger.level = INFO;
    await ActiveJob.performAllLater(
      new LoggingJob("Dummy"),
      new HelloJob("Jamie"),
      new HelloJob("John"),
    );
    expect(t.logger.messages).toMatch(/Enqueued 3 jobs to .+ \(2 HelloJob, 1 LoggingJob\)/);
  });

  it("perform start log level", async ({ testCase: t }: Ctx) => {
    t.logger.level = WARN;
    await t.performEnqueuedJobs({}, () => LoggingJob.performLater("Dummy"));
    expect(t.logger.messages).not.toMatch(/LoggingJob/);
    expect(t.logger.messages).toBeEmpty();

    t.logger.level = INFO;
    await t.performEnqueuedJobs({}, () => LoggingJob.performLater("Dummy"));
    expect(t.logger.messages).toMatch(
      /Performing LoggingJob \(Job ID: .*?\) from .*? with arguments:.*Dummy/,
    );
  });

  it("perform log level", async ({ testCase: t }: Ctx) => {
    t.logger.level = WARN;
    await t.performEnqueuedJobs({}, () => LoggingJob.performLater("Dummy"));
    expect(t.logger.messages).not.toMatch(/Dummy, here is it: Dummy/);
    expect(t.logger.messages).toBeEmpty();

    t.logger.level = INFO;
    await t.performEnqueuedJobs({}, () => LoggingJob.performLater("Dummy"));
    expect(t.logger.messages).toMatch(/Dummy, here is it: Dummy/);
  });

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "enqueue retry log level",
    async ({ testCase: t }: Ctx) => {
      t.logger.level = WARN;
      await t.performEnqueuedJobs({}, () => RetryJob.performLater("DefaultsError", 2));
      expect(t.logger.messages).not.toMatch(/RetryJob/);
      expect(t.logger.messages).toBeEmpty();

      t.logger.level = INFO;
      await t.performEnqueuedJobs({}, () => RetryJob.performLater("DefaultsError", 2));
      expect(t.logger.messages).toMatch(
        /Retrying RetryJob \(Job ID: .*?\) after \d+ attempts in 3 seconds, due to a DefaultsError.*\./,
      );
    },
  );

  it("enqueue retry log level on retry job", async ({ testCase: t }: Ctx) => {
    t.logger.level = WARN;
    await t.performEnqueuedJobs({}, () => RescueJob.performLater("david"));
    expect(t.logger.messages).not.toMatch(/RescueJob/);
    expect(t.logger.messages).toBeEmpty();

    t.logger.level = INFO;
    await t.performEnqueuedJobs({}, () => RescueJob.performLater("david"));
    expect(t.logger.messages).toMatch(
      /Retrying RescueJob \(Job ID: .*?\) after \d+ attempts in 0 seconds\./,
    );
  });

  it.skipIf(isAdapterIs("inline", "sneakers"))(
    "retry stopped log level",
    async ({ testCase: t }: Ctx) => {
      t.logger.level = FATAL;
      await t.performEnqueuedJobs({}, () => RetryJob.performLater("CustomCatchError", 6));
      expect(t.logger.messages).not.toMatch(/RetryJob/);
      expect(t.logger.messages).toBeEmpty();

      t.logger.level = ERROR;
      await t.performEnqueuedJobs({}, () => RetryJob.performLater("CustomCatchError", 6));
      expect(t.logger.messages).toMatch(
        /Stopped retrying RetryJob \(Job ID: .*?\) due to a CustomCatchError.*, which reoccurred on \d+ attempts\./,
      );
    },
  );

  it("discard log level", async ({ testCase: t }: Ctx) => {
    t.logger.level = FATAL;
    await t.performEnqueuedJobs({}, () => RetryJob.performLater("DiscardableError", 2));
    expect(t.logger.messages).not.toMatch(/RetryJob/);
    expect(t.logger.messages).toBeEmpty();

    t.logger.level = ERROR;
    await t.performEnqueuedJobs({}, () => RetryJob.performLater("DiscardableError", 2));
    expect(t.logger.messages).toMatch(
      /Discarded RetryJob \(Job ID: .*?\) due to a DiscardableError.*\./,
    );
  });
});
