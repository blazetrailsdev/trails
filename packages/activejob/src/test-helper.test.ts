import { beforeEach, describe, it, type TestContext } from "vitest";
import {
  Assertion,
  TimeWithZone,
  TimeZone,
  assertEqual,
  assertInDelta,
  assertInstanceOf,
  assertMatch,
  assertNil,
  assertNothingRaised,
  assertRaise,
  assertRaises,
  minutes,
} from "@blazetrails/activesupport";
import { noon, tomorrow } from "@blazetrails/activesupport/core-ext/date/calculations";
import { DateTime, Time } from "@blazetrails/date";
import {
  ArgumentError,
  NotImplementedError,
  Rational,
  fetch,
  include,
  included,
  rbEqual,
  rbInspect,
  rbModConstSet,
  rbModName,
  rbObjClass,
  registerConstant,
  toF,
} from "@blazetrails/ruby-compat";
import { ActiveJob, QueueAdapters } from "./namespaces.js";
import "./queue-adapters/async-adapter.js";
import "./queue-adapters/inline-adapter.js";
import "./queue-adapters/test-adapter.js";
import type { TestAdapter } from "./queue-adapters/test-adapter.js";
import { TestCase } from "./test-case.js";
import type { TestHelper } from "./test-helper.js";
import { isAdapterIs } from "./test-helpers/helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { InheritedJob } from "./test-helpers/jobs/inherited-job.js";
import { LoggingJob } from "./test-helpers/jobs/logging-job.js";
import { MultipleKwargsJob } from "./test-helpers/jobs/multiple-kwargs-job.js";
import { NestedJob } from "./test-helpers/jobs/nested-job.js";
import { RaisingJob } from "./test-helpers/jobs/raising-job.js";
import { RescueJob } from "./test-helpers/jobs/rescue-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

type Payload = Record<string, unknown>;
type AssertEnqueuedWithOptions = Parameters<TestHelper["assertEnqueuedWith"]>[0];
type HelperContext = TestContext & { testCase: TestHelper };

class NotTestAdapterTest extends TestCase {
  static override toString(): string {
    return "NotTestAdapterTest";
  }
}
registerConstant("NotTestAdapterTest", NotTestAdapterTest);

class AdapterIsNotTestAdapterTest extends TestCase {
  static override toString(): string {
    return "AdapterIsNotTestAdapterTest";
  }

  override queueAdapterForTest = (): unknown => new QueueAdapters.InlineAdapter();
}
registerConstant("AdapterIsNotTestAdapterTest", AdapterIsNotTestAdapterTest);

describe.skipIf(isAdapterIs("test"))("NotTestAdapterTest", () => {
  let adapter: string | null;
  beforeEach(({ testCase }: TestContext) => {
    adapter = rbModName(rbObjClass((testCase as unknown as TestHelper).queueAdapter()));
  });

  it("assert_enqueued_jobs raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_enqueued_jobs requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertEnqueuedJobs(0, {}, () => {}),
    );
  });

  it("assert_no_enqueued_jobs raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_no_enqueued_jobs requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertNoEnqueuedJobs({}, () => {}),
    );
  });

  it("assert_performed_jobs raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_performed_jobs requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertPerformedJobs(0, {}, () => {}),
    );
  });

  it("assert_no_performed_jobs raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_no_performed_jobs requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertNoPerformedJobs({}, () => {}),
    );
  });

  it("assert_enqueued_with raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_enqueued_with requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertEnqueuedWith({}, () => {}),
    );
  });

  it("assert_performed_with raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `assert_performed_with requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.assertPerformedWith({}, () => {}),
    );
  });

  it("perform_enqueued_jobs without a block", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertRaises(
      [ArgumentError],
      {
        match: `perform_enqueued_jobs (without a block) requires the Active Job test adapter, you're using ${adapter}`,
      },
      () => t.performEnqueuedJobs(),
    );
  });

  it("perform_enqueued_jobs with a block does not raise", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertNothingRaised(() => t.performEnqueuedJobs({}, () => {}));
  });
});

describe("AdapterIsNotTestAdapterTest", () => {
  it("perform enqueued jobs just yields", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    JobBuffer.clear();
    await t.performEnqueuedJobs({}, async () => {
      await HelloJob.performLater("kevin");
    });
    assertEqual(1, JobBuffer.values().length);
  });
});

type Configured = { performLater(...args: unknown[]): Promise<unknown> };

class DoNotPerformEnqueuedJobs {
  static [included](base: typeof TestCase): void {
    base.setup(function (this: PerformedJobsTest) {
      const queueAdapter = this.queueAdapter() as TestAdapter;
      this._performEnqueuedJobs = queueAdapter.performEnqueuedJobs;
      this._performEnqueuedAtJobs = queueAdapter.performEnqueuedAtJobs;
      queueAdapter.performEnqueuedJobs = queueAdapter.performEnqueuedAtJobs = false;
    });

    base.teardown(function (this: PerformedJobsTest) {
      const queueAdapter = this.queueAdapter() as TestAdapter;
      queueAdapter.performEnqueuedJobs = this._performEnqueuedJobs;
      queueAdapter.performEnqueuedAtJobs = this._performEnqueuedAtJobs;
    });
  }
}

class EnqueuedJobsTest extends TestCase {
  static override toString(): string {
    return "EnqueuedJobsTest";
  }
}
registerConstant("EnqueuedJobsTest", EnqueuedJobsTest);
if (isAdapterIs("test")) include(EnqueuedJobsTest, DoNotPerformEnqueuedJobs);

describe.skipIf(!isAdapterIs("test"))("EnqueuedJobsTest", () => {
  it("assert enqueued jobs", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(1, {}, () => HelloJob.performLater("david")),
    );
  });

  it("repeated enqueued jobs calls", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(1, {}, () => HelloJob.performLater("abdelkader")),
    );

    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(2, {}, async () => {
        await HelloJob.performLater("sean");
        await HelloJob.performLater("yves");
      }),
    );
  });

  it("assert enqueued jobs message", async ({ testCase: t }: HelperContext) => {
    await HelloJob.performLater("sean");
    const e = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedJobs(2, {}, () => HelloJob.performLater("sean")),
    );
    assertMatch("Expected: 2", e.message);
    assertMatch("Actual: 1", e.message);
  });

  it("assert enqueued jobs with no block", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(async () => {
      await HelloJob.performLater("rafael");
      await t.assertEnqueuedJobs(1);
    });

    await assertNothingRaised(async () => {
      await HelloJob.performLater("aaron");
      await HelloJob.performLater("matthew");
      await t.assertEnqueuedJobs(3);
    });
  });

  it("assert no enqueued jobs with no block", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() => t.assertNoEnqueuedJobs());
  });

  it("assert no enqueued jobs", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() => t.assertNoEnqueuedJobs({}, () => HelloJob.performNow()));
  });

  it("assert enqueued jobs too few sent", async ({ testCase: t }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedJobs(2, {}, () => HelloJob.performLater("xavier")),
    );

    assertMatch(/2 .* but 1/, error.message);
  });

  it("assert enqueued jobs too many sent", async ({ testCase: t }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedJobs(1, {}, async () => {
        await HelloJob.performLater("cristian");
        await HelloJob.performLater("guillermo");
      }),
    );

    assertMatch(/1 .* but 2/, error.message);
  });

  it("assert no enqueued jobs failure", async ({ testCase: t }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertNoEnqueuedJobs({}, () => HelloJob.performLater("jeremy")),
    );

    assertMatch(/0 .* but 1/, error.message);
  });

  const helloAndTwoLogging = async (): Promise<void> => {
    await HelloJob.performLater("jeremy");
    await LoggingJob.performLater();
    await LoggingJob.performLater();
  };

  it("assert enqueued jobs with only option", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(1, { only: HelloJob }, helloAndTwoLogging),
    );
  });

  it("assert enqueued jobs with only option as proc", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(
        1,
        {
          only: (job: Payload) => rbModName(fetch(job, ":job")) === "HelloJob",
        },
        helloAndTwoLogging,
      ),
    );
  });

  it("assert enqueued jobs with except option", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(1, { except: LoggingJob }, helloAndTwoLogging),
    );
  });

  it("assert enqueued jobs with except option as proc", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(
        1,
        {
          except: (job: Payload) => rbModName(fetch(job, ":job")) === "LoggingJob",
        },
        helloAndTwoLogging,
      ),
    );
  });

  it("assert enqueued jobs with only and except option", async ({ testCase: t }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertEnqueuedJobs(1, { only: HelloJob, except: HelloJob }, helloAndTwoLogging),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  const someOtherAndLogging = async (): Promise<void> => {
    await (HelloJob.set({ queue: ":some_queue" }) as Configured).performLater();
    await (HelloJob.set({ queue: ":other_queue" }) as Configured).performLater();
    await LoggingJob.performLater();
  };

  it("assert enqueued jobs with only and queue option", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(1, { only: HelloJob, queue: ":some_queue" }, someOtherAndLogging),
    );
  });

  it("assert enqueued jobs with except and queue option", async ({
    testCase: t,
  }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(1, { except: LoggingJob, queue: ":some_queue" }, someOtherAndLogging),
    );
  });

  it("assert enqueued jobs with only and except and queue option", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertEnqueuedJobs(
        1,
        { only: HelloJob, except: HelloJob, queue: ":some_queue" },
        someOtherAndLogging,
      ),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  it("assert enqueued jobs with queue option", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(2, { queue: ":default" }, async () => {
        await HelloJob.performLater();
        await LoggingJob.performLater();
        await (HelloJob.set({ queue: ":other_queue" }) as Configured).performLater();
        await (LoggingJob.set({ queue: ":other_queue" }) as Configured).performLater();
      }),
    );
  });

  it("assert enqueued job with priority option", async ({ testCase: t }: HelperContext) => {
    await t.assertEnqueuedWith({ job: HelloJob, priority: 10 }, () =>
      (HelloJob.set({ priority: 10 }) as Configured).performLater(),
    );

    await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedWith({ job: HelloJob, priority: 10 }, () =>
        (HelloJob.set({ priority: 5 }) as Configured).performLater(),
      ),
    );
  });

  it("assert enqueued jobs with only option and none sent", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedJobs(1, { only: HelloJob }, () => LoggingJob.performLater()),
    );

    assertMatch(/1 .* but 0/, error.message);
  });

  it("assert enqueued jobs with except option and none sent", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedJobs(1, { except: LoggingJob }, () => LoggingJob.performLater()),
    );

    assertMatch(/1 .* but 0/, error.message);
  });

  it("assert enqueued jobs with only and except option and none sent", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertEnqueuedJobs(1, { only: HelloJob, except: HelloJob }, () =>
        LoggingJob.performLater(),
      ),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  const helloAndFourLogging = async (): Promise<void> => {
    await HelloJob.performLater("jeremy");
    for (let i = 0; i < 4; i++) await LoggingJob.performLater();
  };

  it("assert enqueued jobs with only option and too few sent", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedJobs(5, { only: HelloJob }, helloAndFourLogging),
    );

    assertMatch(/5 .* but 1/, error.message);
  });

  it("assert enqueued jobs with except option and too few sent", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedJobs(5, { except: LoggingJob }, helloAndFourLogging),
    );

    assertMatch(/5 .* but 1/, error.message);
  });

  it("assert enqueued jobs with only and except option and too few sent", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertEnqueuedJobs(5, { only: HelloJob, except: HelloJob }, helloAndFourLogging),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  const twoHello = async (): Promise<void> => {
    for (let i = 0; i < 2; i++) await HelloJob.performLater("jeremy");
  };

  it("assert enqueued jobs with only option and too many sent", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedJobs(1, { only: HelloJob }, twoHello),
    );

    assertMatch(/1 .* but 2/, error.message);
  });

  it("assert enqueued jobs with except option and too many sent", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedJobs(1, { except: LoggingJob }, twoHello),
    );

    assertMatch(/1 .* but 2/, error.message);
  });

  it("assert enqueued jobs with only and except option and too many sent", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertEnqueuedJobs(1, { only: HelloJob, except: HelloJob }, twoHello),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  const helloLoggingRescue = async (): Promise<void> => {
    await HelloJob.performLater("jeremy");
    await LoggingJob.performLater("stewie");
    await RescueJob.performLater("david");
  };

  it("assert enqueued jobs with only option as array", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(2, { only: [HelloJob, LoggingJob] }, helloLoggingRescue),
    );
  });

  it("assert enqueued jobs with except option as array", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertEnqueuedJobs(1, { except: [HelloJob, LoggingJob] }, helloLoggingRescue),
    );
  });

  it("assert enqueued jobs with only and except option as array", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertEnqueuedJobs(
        2,
        { only: [HelloJob, LoggingJob], except: [HelloJob, LoggingJob] },
        helloLoggingRescue,
      ),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  it("assert no enqueued jobs with only option", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertNoEnqueuedJobs({ only: HelloJob }, () => LoggingJob.performLater()),
    );
  });

  it("assert no enqueued jobs with except option", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertNoEnqueuedJobs({ except: LoggingJob }, () => LoggingJob.performLater()),
    );
  });

  it("assert no enqueued jobs with only and except option", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertNoEnqueuedJobs({ only: HelloJob, except: HelloJob }, () => LoggingJob.performLater()),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  const helloAndLogging = async (): Promise<void> => {
    await HelloJob.performLater("jeremy");
    await LoggingJob.performLater();
  };

  it("assert no enqueued jobs with only option failure", async ({ testCase: t }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertNoEnqueuedJobs({ only: HelloJob }, helloAndLogging),
    );

    assertMatch(/0 .* but 1/, error.message);
  });

  it("assert no enqueued jobs with except option failure", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertNoEnqueuedJobs({ except: LoggingJob }, helloAndLogging),
    );

    assertMatch(/0 .* but 1/, error.message);
  });

  it("assert no enqueued jobs with only and except option failure", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertNoEnqueuedJobs({ only: HelloJob, except: HelloJob }, helloAndLogging),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  it("assert no enqueued jobs with only option as array", async ({
    testCase: t,
  }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertNoEnqueuedJobs({ only: [HelloJob, RescueJob] }, () => LoggingJob.performLater()),
    );
  });

  it("assert no enqueued jobs with except option as array", async ({
    testCase: t,
  }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertNoEnqueuedJobs({ except: [HelloJob, RescueJob] }, async () => {
        await HelloJob.performLater();
        await RescueJob.performLater();
      }),
    );
  });

  it("assert no enqueued jobs with only and except option as array", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertNoEnqueuedJobs({ only: [HelloJob, RescueJob], except: [HelloJob, RescueJob] }, () =>
        LoggingJob.performLater(),
      ),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  it("assert no enqueued jobs with queue option", async ({ testCase: t }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertNoEnqueuedJobs({ queue: ":default" }, async () => {
        await (HelloJob.set({ queue: ":other_queue" }) as Configured).performLater();
        await (LoggingJob.set({ queue: ":other_queue" }) as Configured).performLater();
      }),
    );
  });

  it("assert no enqueued jobs with queue option failure", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertNoEnqueuedJobs({ queue: ":other_queue" }, () =>
        (HelloJob.set({ queue: ":other_queue" }) as Configured).performLater(),
      ),
    );

    assertMatch(/0 .* but 1/, error.message);
  });

  const otherOtherSomeLogging = async (): Promise<void> => {
    await (HelloJob.set({ queue: ":other_queue" }) as Configured).performLater();
    await (HelloJob.set({ queue: ":other_queue" }) as Configured).performLater();
    await (LoggingJob.set({ queue: ":some_queue" }) as Configured).performLater();
  };
  const otherSomeSomeLogging = async (): Promise<void> => {
    await (HelloJob.set({ queue: ":other_queue" }) as Configured).performLater();
    await (HelloJob.set({ queue: ":some_queue" }) as Configured).performLater();
    await (LoggingJob.set({ queue: ":some_queue" }) as Configured).performLater();
  };

  it("assert no enqueued jobs with only and queue option", async ({
    testCase: t,
  }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertNoEnqueuedJobs({ only: HelloJob, queue: ":some_queue" }, otherOtherSomeLogging),
    );
  });

  it("assert no enqueued jobs with only and queue option failure", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertNoEnqueuedJobs({ only: HelloJob, queue: ":some_queue" }, otherSomeSomeLogging),
    );

    assertMatch(/0 .* but 1/, error.message);
  });

  it("assert no enqueued jobs with except and queue option", async ({
    testCase: t,
  }: HelperContext) => {
    await assertNothingRaised(() =>
      t.assertNoEnqueuedJobs({ except: LoggingJob, queue: ":some_queue" }, otherOtherSomeLogging),
    );
  });

  it("assert no enqueued jobs with except and queue option failure", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertNoEnqueuedJobs({ except: LoggingJob, queue: ":some_queue" }, otherSomeSomeLogging),
    );

    assertMatch(/0 .* but 1/, error.message);
  });

  it("assert no enqueued jobs with only and except and queue option", async ({
    testCase: t,
  }: HelperContext) => {
    const error = await assertRaises([ArgumentError], {}, () =>
      t.assertNoEnqueuedJobs({ only: HelloJob, except: HelloJob, queue: ":some_queue" }, () =>
        (HelloJob.set({ queue: ":other_queue" }) as Configured).performLater(),
      ),
    );

    assertMatch(/`:only` and `:except`/, error.message);
  });

  it("assert enqueued with", async ({ testCase: t }: HelperContext) => {
    await t.assertEnqueuedWith({ job: LoggingJob, queue: "default" }, () =>
      (LoggingJob.set({ waitUntil: noon(tomorrow()) }) as Configured).performLater(),
    );
  });

  it("assert enqueued with with no block", async ({ testCase: t }: HelperContext) => {
    await (LoggingJob.set({ waitUntil: noon(tomorrow()) }) as Configured).performLater();
    await t.assertEnqueuedWith({ job: LoggingJob, queue: "default" });
  });

  it("assert enqueued with when queue name is symbol", async ({ testCase: t }: HelperContext) => {
    await t.assertEnqueuedWith({ job: LoggingJob, queue: ":default" }, () =>
      (LoggingJob.set({ waitUntil: noon(tomorrow()) }) as Configured).performLater(),
    );
  });

  it("assert no enqueued jobs and perform now", async ({ testCase: t }: HelperContext) => {
    await t.assertNoEnqueuedJobs({}, () => LoggingJob.performNow(1, 2, 3, { keyword: true }));
  });

  it("assert enqueued with returns", async ({ testCase: t }: HelperContext) => {
    const job = (await t.assertEnqueuedWith({ job: LoggingJob }, () =>
      (LoggingJob.set({ waitUntil: minutes(5).fromNow() }) as Configured).performLater(1, 2, 3, {
        keyword: true,
      }),
    )) as LoggingJob;

    assertInstanceOf(LoggingJob, job);
    assertInDelta(minutes(5).fromNow().toF(), toF(job.scheduledAt), 1);
    assertEqual("default", job.queueName);
    assertEqual([1, 2, 3, { keyword: true }], job.arguments);
  });

  it("assert enqueued with with no block returns", async ({ testCase: t }: HelperContext) => {
    await (LoggingJob.set({ waitUntil: minutes(5).fromNow() }) as Configured).performLater(
      1,
      2,
      3,
      { keyword: true },
    );
    const job = (await t.assertEnqueuedWith({ job: LoggingJob })) as LoggingJob;

    assertInstanceOf(LoggingJob, job);
    assertInDelta(minutes(5).fromNow().toF(), toF(job.scheduledAt), 1);
    assertEqual("default", job.queueName);
    assertEqual([1, 2, 3, { keyword: true }], job.arguments);
  });

  it("assert enqueued with failure", async ({ testCase: t }: HelperContext) => {
    await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedWith({ job: LoggingJob, queue: "default" }, () => NestedJob.performLater()),
    );

    await assertRaises([Assertion], {}, async () => {
      await LoggingJob.performLater();
      await t.assertEnqueuedWith({ job: LoggingJob }, () => {});
    });

    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedWith({ job: NestedJob, queue: "low" }, () => NestedJob.performLater()),
    );

    assertMatch(
      `No enqueued job found with ${rbInspect({ ":job": NestedJob, ":queue": "low" })}`,
      error.message,
    );
  });

  it("assert enqueued with with no block failure", async ({ testCase: t }: HelperContext) => {
    await assertRaises([Assertion], {}, async () => {
      await NestedJob.performLater();
      await t.assertEnqueuedWith({ job: LoggingJob, queue: "default" });
    });

    const error = await assertRaises([Assertion], {}, async () => {
      await NestedJob.performLater();
      await t.assertEnqueuedWith({ job: NestedJob, queue: "low" });
    });

    assertMatch(
      `No enqueued job found with ${rbInspect({ ":job": NestedJob, ":queue": "low" })}`,
      error.message,
    );
  });

  it("assert enqueued with args", async ({ testCase: t }: HelperContext) => {
    await assertRaises([ArgumentError], {}, () =>
      t.assertEnqueuedWith({ class: LoggingJob } as AssertEnqueuedWithOptions, () =>
        (NestedJob.set({ waitUntil: noon(tomorrow()) }) as Configured).performLater(),
      ),
    );
  });

  it("assert enqueued with supports matcher procs", async ({ testCase: t }: HelperContext) => {
    const facets = {
      job: HelloJob,
      args: ["Rails"],
      at: noon(tomorrow()),
      queue: "important",
    };

    await (
      facets.job.set({ queue: facets.queue, waitUntil: facets.at }) as Configured
    ).performLater(...facets.args);

    for (const [facet, value] of Object.entries(facets)) {
      const matcher = (jobValue: unknown): boolean => rbEqual(jobValue, value);
      const refuser = (_jobValue: unknown): boolean => false;

      await t.assertEnqueuedWith({ [facet]: matcher });

      await assertRaises([Assertion], {}, () => t.assertEnqueuedWith({ [facet]: refuser }));
    }
  });

  it("assert enqueued with time", async ({ testCase: t }: HelperContext) => {
    const now = Time.now();
    const args = [{ argument1: [now] }];

    await t.assertEnqueuedWith({ job: MultipleKwargsJob, args }, () =>
      MultipleKwargsJob.performLater({ argument1: [now] }),
    );
  });

  it("assert enqueued with date time", async ({ testCase: t }: HelperContext) => {
    const now = DateTime.now();
    const args = [{ argument1: [now] }];

    await t.assertEnqueuedWith({ job: MultipleKwargsJob, args }, () =>
      MultipleKwargsJob.performLater({ argument1: [now] }),
    );
  });

  it("assert enqueued with time with zone", async ({ testCase: t }: HelperContext) => {
    const now = Time.now().inTimeZone("Tokyo");
    const args = [{ argument1: [now] }];

    await t.assertEnqueuedWith({ job: MultipleKwargsJob, args }, () =>
      MultipleKwargsJob.performLater({ argument1: [now] }),
    );
  });

  it("assert enqueued with time and time precision", async ({ testCase: t }: HelperContext) => {
    const timeWithZone = new TimeWithZone(
      Time.utc(1999, 12, 31, 23, 59, new Rational(59123456789, 1000000000)),
      TimeZone.find("Tokyo")!,
    );

    const time = Time.at(946702800, 1234567, "nanosecond");
    const dateTime = new DateTime(2001, 2, 3, 4, 5, 6.123456, "+03:00");
    const args = [{ argument1: [timeWithZone, time, dateTime] }];

    await t.assertEnqueuedWith({ job: MultipleKwargsJob, args }, () =>
      MultipleKwargsJob.performLater({ argument1: [timeWithZone, time, dateTime] }),
    );
  });

  it("assert enqueued with with no block args", async ({ testCase: t }: HelperContext) => {
    await assertRaises([ArgumentError], {}, async () => {
      await (NestedJob.set({ waitUntil: noon(tomorrow()) }) as Configured).performLater();
      await t.assertEnqueuedWith({ class: LoggingJob } as AssertEnqueuedWithOptions);
    });
  });

  it("assert enqueued with with at option", async ({ testCase: t }: HelperContext) => {
    await t.assertEnqueuedWith({ job: HelloJob, at: noon(tomorrow()) }, () =>
      (HelloJob.set({ waitUntil: noon(tomorrow()) }) as Configured).performLater(),
    );
  });

  it("assert enqueued with with relative at option", async ({ testCase: t }: HelperContext) => {
    await t.assertEnqueuedWith({ job: HelloJob, at: minutes(5).fromNow() }, () =>
      (HelloJob.set({ wait: minutes(5) }) as Configured).performLater(),
    );
  });

  it("assert enqueued with with no block with at option", async ({
    testCase: t,
  }: HelperContext) => {
    await (HelloJob.set({ waitUntil: noon(tomorrow()) }) as Configured).performLater();
    await t.assertEnqueuedWith({ job: HelloJob, at: noon(tomorrow()) });
  });

  it("assert enqueued with wait until with performed", async ({ testCase: t }: HelperContext) => {
    await t.assertEnqueuedWith({ job: LoggingJob }, () =>
      t.performEnqueuedJobs({ only: HelloJob }, async () => {
        await (HelloJob.set({ waitUntil: noon(tomorrow()) }) as Configured).performLater("david");
        await (LoggingJob.set({ waitUntil: noon(tomorrow()) }) as Configured).performLater(
          "enqueue",
        );
      }),
    );
    await t.assertEnqueuedJobs(1);
    await t.assertPerformedJobs(1);
  });

  it("assert enqueued with with hash arg", async ({ testCase: t }: HelperContext) => {
    await t.assertEnqueuedWith(
      { job: MultipleKwargsJob, args: [{ argument1: 1, argument2: { a: 1, b: 2 } }] },
      () => MultipleKwargsJob.performLater({ argument2: { b: 2, a: 1 }, argument1: 1 }),
    );
  });

  it("assert enqueued with with global id args", async ({ testCase: t }: HelperContext) => {
    const ricardo = new Person(9);
    await t.assertEnqueuedWith({ job: HelloJob, args: [ricardo] }, () =>
      HelloJob.performLater(ricardo),
    );
  });

  it("assert enqueued with with no block with global id args", async ({
    testCase: t,
  }: HelperContext) => {
    const ricardo = new Person(9);
    await HelloJob.performLater(ricardo);
    await t.assertEnqueuedWith({ job: HelloJob, args: [ricardo] });
  });

  it("assert enqueued with failure with global id args", async ({ testCase: t }: HelperContext) => {
    const ricardo = new Person(9);
    const wilma = new Person(11);
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedWith({ job: HelloJob, args: [wilma] }, () => HelloJob.performLater(ricardo)),
    );

    assertMatch(
      `No enqueued job found with ${rbInspect({ ":job": HelloJob, ":args": [wilma] })}`,
      error.message,
    );
    assertMatch(/Potential matches:.*Person.* @id="9"/, error.message);
  });

  it("show jobs that are enqueued when job is not queued at all", async ({
    testCase: t,
  }: HelperContext) => {
    const ricardo = new Person(9);
    const wilma = new Person(11);

    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedWith({ job: MultipleKwargsJob, args: [wilma] }, () =>
        HelloJob.performLater(ricardo),
      ),
    );

    assertMatch(
      `No enqueued job found with ${rbInspect({ ":job": MultipleKwargsJob, ":args": [wilma] })}`,
      error.message,
    );
    assertMatch(
      /No jobs of class MultipleKwargsJob were enqueued, job classes enqueued: HelloJob/,
      error.message,
    );
  });

  it("shows no jobs enqueued when there are no jobs", async ({ testCase: t }: HelperContext) => {
    const error = await assertRaises([Assertion], {}, () =>
      t.assertEnqueuedWith({ job: HelloJob, args: [] }, () => {}),
    );

    assertMatch(
      `No enqueued job found with ${rbInspect({ ":job": HelloJob, ":args": [] })}`,
      error.message,
    );
    assertMatch(/No jobs were enqueued/, error.message);
  });

  it("assert enqueued with failure with no block with global id args", async ({
    testCase: t,
  }: HelperContext) => {
    const ricardo = new Person(9);
    const wilma = new Person(11);
    const error = await assertRaises([Assertion], {}, async () => {
      await HelloJob.performLater(ricardo);
      await t.assertEnqueuedWith({ job: HelloJob, args: [wilma] });
    });

    assertMatch(
      `No enqueued job found with ${rbInspect({ ":job": HelloJob, ":args": [wilma] })}`,
      error.message,
    );
    assertMatch(/Potential matches: {.*?HelloJob,.*\[#<Person.* @id="9">\].*?}/, error.message);
  });

  it("assert enqueued with does not change jobs count", async ({ testCase: t }: HelperContext) => {
    await HelloJob.performLater();
    await t.assertEnqueuedWith({ job: HelloJob }, () => HelloJob.performLater());

    assertEqual(2, (t.queueAdapter() as TestAdapter).enqueuedJobs.length);
  });

  it("assert enqueued with with no block does not change jobs count", async ({
    testCase: t,
  }: HelperContext) => {
    await HelloJob.performLater();
    await HelloJob.performLater();
    await t.assertEnqueuedWith({ job: HelloJob });

    assertEqual(2, (t.queueAdapter() as TestAdapter).enqueuedJobs.length);
  });

  it("assert enqueued jobs with performed", async ({ testCase: t }: HelperContext) => {
    await t.assertEnqueuedWith({ job: LoggingJob }, () =>
      t.performEnqueuedJobs({ only: HelloJob }, async () => {
        await HelloJob.performLater("david");
        await LoggingJob.performLater("enqueue");
      }),
    );
    await t.assertEnqueuedJobs(1);
    await t.assertPerformedJobs(1);
  });
});

class PerformedJobsTest extends TestCase {
  static override toString(): string {
    return "PerformedJobsTest";
  }

  declare _performEnqueuedJobs: unknown;
  declare _performEnqueuedAtJobs: unknown;
}
registerConstant("PerformedJobsTest", PerformedJobsTest);
if (isAdapterIs("test")) include(PerformedJobsTest, DoNotPerformEnqueuedJobs);

describe.runIf(isAdapterIs("test"))("PerformedJobsTest", () => {
  const adapterOf = (t: TestHelper) => t.queueAdapter() as TestAdapter;

  it("perform enqueued jobs with only option doesnt leak outside the block", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    assertNil(adapterOf(t).filter);
    await t.performEnqueuedJobs({ only: HelloJob }, () => {
      assertEqual(HelloJob, adapterOf(t).filter);
    });
    assertNil(adapterOf(t).filter);
  });

  it("perform enqueued jobs without block with only option doesnt leak", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ only: HelloJob });

    assertNil(adapterOf(t).filter);
  });

  it("perform enqueued jobs with except option doesnt leak outside the block", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    assertNil(adapterOf(t).reject);
    await t.performEnqueuedJobs({ except: HelloJob }, () => {
      assertEqual(HelloJob, adapterOf(t).reject);
    });
    assertNil(adapterOf(t).reject);
  });

  it("perform enqueued jobs without block with except option doesnt leak", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ except: HelloJob });

    assertNil(adapterOf(t).reject);
  });

  it("perform enqueued jobs with queue option doesnt leak outside the block", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    assertNil(adapterOf(t).queue);
    await t.performEnqueuedJobs({ queue: "some_queue" }, () => {
      assertEqual("some_queue", adapterOf(t).queue);
    });
    assertNil(adapterOf(t).queue);
  });

  it("perform enqueued jobs without block with queue option doesnt leak", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ queue: "some_queue" });

    assertNil(adapterOf(t).reject);
  });

  it("perform enqueued jobs with block", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({}, async () => {
      await HelloJob.performLater("kevin");
      await LoggingJob.performLater("bogdan");
    });

    await t.assertPerformedJobs(2);
  });

  it("perform enqueued jobs without block", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await HelloJob.performLater("kevin");
    await LoggingJob.performLater("bogdan");

    await t.performEnqueuedJobs();

    await t.assertPerformedJobs(2);
  });

  it("perform enqueued jobs with block with only option", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ only: LoggingJob }, async () => {
      await HelloJob.performLater("kevin");
      await LoggingJob.performLater("bogdan");
    });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: LoggingJob });
  });

  it("perform enqueued jobs without block with only option", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await HelloJob.performLater("kevin");
    await LoggingJob.performLater("bogdan");

    await t.performEnqueuedJobs({ only: LoggingJob });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: LoggingJob });
  });

  it("perform enqueued jobs with block with except option", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ except: HelloJob }, async () => {
      await HelloJob.performLater("kevin");
      await LoggingJob.performLater("bogdan");
    });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: LoggingJob });
  });

  it("perform enqueued jobs without block with except option", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await HelloJob.performLater("kevin");
    await LoggingJob.performLater("bogdan");

    await t.performEnqueuedJobs({ except: HelloJob });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: LoggingJob });
  });

  it("perform enqueued jobs with block with queue option", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ queue: "some_queue" }, async () => {
      await (HelloJob.set({ queue: "some_queue" }) as Configured).performLater("kevin");
      await (HelloJob.set({ queue: "other_queue" }) as Configured).performLater("bogdan");
      await LoggingJob.performLater("bogdan");
    });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" });
  });

  it("perform enqueued jobs without block with queue option", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await (HelloJob.set({ queue: "some_queue" }) as Configured).performLater("kevin");
    await (HelloJob.set({ queue: "other_queue" }) as Configured).performLater("bogdan");
    await LoggingJob.performLater("bogdan");

    await t.performEnqueuedJobs({ queue: "some_queue" });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" });
  });

  it("perform enqueued jobs with block with only and queue options", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ only: HelloJob, queue: "other_queue" }, async () => {
      await (HelloJob.set({ queue: "some_queue" }) as Configured).performLater("kevin");
      await (HelloJob.set({ queue: "other_queue" }) as Configured).performLater("bogdan");
      await (LoggingJob.set({ queue: "other_queue" }) as Configured).performLater("bogdan");
    });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: HelloJob, queue: "other_queue" });
  });

  it("perform enqueued jobs without block with only and queue options", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await (HelloJob.set({ queue: "some_queue" }) as Configured).performLater("kevin");
    await (HelloJob.set({ queue: "other_queue" }) as Configured).performLater("bogdan");
    await (LoggingJob.set({ queue: "other_queue" }) as Configured).performLater("bogdan");

    await t.performEnqueuedJobs({ only: HelloJob, queue: "other_queue" });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: HelloJob, queue: "other_queue" });
  });

  it("perform enqueued jobs with block with except and queue options", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ except: HelloJob, queue: "other_queue" }, async () => {
      await (HelloJob.set({ queue: "other_queue" }) as Configured).performLater("kevin");
      await (LoggingJob.set({ queue: "some_queue" }) as Configured).performLater("bogdan");
      await (LoggingJob.set({ queue: "other_queue" }) as Configured).performLater("bogdan");
    });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: LoggingJob, queue: "other_queue" });
  });

  it("perform enqueued jobs without block with except and queue options", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await (HelloJob.set({ queue: "other_queue" }) as Configured).performLater("kevin");
    await (LoggingJob.set({ queue: "some_queue" }) as Configured).performLater("bogdan");
    await (LoggingJob.set({ queue: "other_queue" }) as Configured).performLater("bogdan");

    await t.performEnqueuedJobs({ except: HelloJob, queue: "other_queue" });

    await t.assertPerformedJobs(1);
    await t.assertPerformedJobs(1, { only: LoggingJob, queue: "other_queue" });
  });

  it("perform enqueued jobs with at with job performed now", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await HelloJob.performLater("kevin");

    await t.performEnqueuedJobs({ at: Time.now() });

    await t.assertPerformedJobs(1);
  });

  it("perform enqueued jobs with at with job wait in past", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await (HelloJob.set({ waitUntil: Time.now().minus(100) }) as Configured).performLater("kevin");

    await t.performEnqueuedJobs({ at: Time.now() });

    await t.assertPerformedJobs(1);
  });

  it("perform enqueued jobs with at with job wait in future", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await (HelloJob.set({ waitUntil: Time.now().plus(100) }) as Configured).performLater("kevin");

    await t.performEnqueuedJobs({ at: Time.now() });

    await t.assertPerformedJobs(0);
  });

  it("perform enqueued jobs block with at with job performed now", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ at: Time.now() }, async () => {
      await HelloJob.performLater("kevin");
    });

    await t.assertPerformedJobs(1);
  });

  it("perform enqueued jobs block with at with job wait in past", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ at: Time.now() }, async () => {
      await (HelloJob.set({ waitUntil: Time.now().minus(100) }) as Configured).performLater(
        "kevin",
      );
    });

    await t.assertPerformedJobs(1);
  });

  it("perform enqueued jobs block with at with job wait in future", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await t.performEnqueuedJobs({ at: Time.now() }, async () => {
      await (HelloJob.set({ waitUntil: Time.now().plus(100) }) as Configured).performLater("kevin");
    });

    await t.assertPerformedJobs(0);
  });

  it("perform enqueued jobs properly count job that raises", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await RaisingJob.performLater("NotImplementedError");

    await assertRaises([NotImplementedError], {}, () =>
      t.performEnqueuedJobs({ only: RaisingJob }),
    );

    assertEqual(1, t.performedJobs.length);
  });

  it("perform enqueued jobs dont perform retries", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await RaisingJob.performLater();

    await assertNothingRaised(() => t.performEnqueuedJobs({ only: RaisingJob }));

    assertEqual(1, t.performedJobs.length);
    assertEqual(1, t.enqueuedJobs.length);
  });

  it("perform enqueued jobs without block removes from enqueued jobs", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await HelloJob.performLater("rafael");
    assertEqual(0, t.performedJobs.length);
    assertEqual(1, t.enqueuedJobs.length);
    await t.performEnqueuedJobs();
    assertEqual(1, t.performedJobs.length);
    assertEqual(0, t.enqueuedJobs.length);
  });

  it("perform enqueued jobs without block works with other helpers", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await NestedJob.performLater();
    assertEqual(0, t.performedJobs.length);
    assertEqual(1, t.enqueuedJobs.length);
    await t.assertEnqueuedJobs(1, {}, () =>
      t.assertEnqueuedWith({ job: LoggingJob }, () => t.performEnqueuedJobs()),
    );
    assertEqual(1, t.performedJobs.length);
    assertEqual(1, t.enqueuedJobs.length);
  });

  it("perform enqueued jobs without block only performs once", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    JobBuffer.clear();
    await RescueJob.performLater("no exception");
    await t.performEnqueuedJobs();
    await t.performEnqueuedJobs();
    assertEqual(1, JobBuffer.values().length);
  });

  it("assert performed jobs", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertNothingRaised(() =>
      t.assertPerformedJobs(1, {}, () => HelloJob.performLater("david")),
    );
  });

  it("repeated performed jobs calls", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertNothingRaised(() =>
      t.assertPerformedJobs(1, {}, () => HelloJob.performLater("abdelkader")),
    );

    await assertNothingRaised(() =>
      t.assertPerformedJobs(2, {}, async () => {
        await HelloJob.performLater("sean");
        await HelloJob.performLater("yves");
      }),
    );
  });

  it("assert performed jobs message", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await HelloJob.performLater("sean");
    const e = await assertRaises([Assertion], {}, () =>
      t.assertPerformedJobs(2, {}, () => HelloJob.performLater("sean")),
    );
    assertMatch("Expected: 2", e.message);
    assertMatch("Actual: 1", e.message);
  });

  it("assert performed jobs with no block", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertNothingRaised(async () => {
      await t.performEnqueuedJobs({}, () => HelloJob.performLater("rafael"));
      await t.assertPerformedJobs(1);
    });

    await assertNothingRaised(() =>
      t.performEnqueuedJobs({}, async () => {
        await HelloJob.performLater("aaron");
        await HelloJob.performLater("matthew");
        await t.assertPerformedJobs(3);
      }),
    );
  });

  it("assert no performed jobs with no block", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertNothingRaised(() => t.assertNoPerformedJobs());
  });

  it("assert no performed jobs", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertNothingRaised(() => t.assertNoPerformedJobs({}, () => {}));
  });

  it("assert performed jobs too few sent", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    const error = await assertRaise([Assertion], {}, () =>
      t.assertPerformedJobs(2, {}, () => HelloJob.performLater("xavier")),
    );

    assertMatch(/2 .* but 1/, error.message);
  });

  it("assert performed jobs too many sent", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    const error = await assertRaise([Assertion], {}, () =>
      t.assertPerformedJobs(1, {}, async () => {
        await HelloJob.performLater("cristian");
        await HelloJob.performLater("guillermo");
      }),
    );

    assertMatch(/1 .* but 2/, error.message);
  });

  it("assert no performed jobs failure", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    const error = await assertRaise([Assertion], {}, () =>
      t.assertNoPerformedJobs({}, () => HelloJob.performLater("jeremy")),
    );

    assertMatch(/0 .* but 1/, error.message);
  });

  it("assert performed jobs with only option", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertNothingRaised(() =>
      t.assertPerformedJobs(1, { only: HelloJob }, async () => {
        await HelloJob.performLater("jeremy");
        await LoggingJob.performLater();
      }),
    );
  });

  it("assert performed jobs with only option as proc", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await assertNothingRaised(() =>
      t.assertPerformedJobs(1, { only: (job: unknown) => job instanceof HelloJob }, async () => {
        await HelloJob.performLater("jeremy");
        await LoggingJob.performLater("bogdan");
      }),
    );
  });

  it("assert performed jobs without block with only option", async ({ testCase }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await HelloJob.performLater("jeremy");
    await LoggingJob.performLater("bogdan");

    await t.performEnqueuedJobs();

    await t.assertPerformedJobs(1, { only: HelloJob });
  });

  it("assert performed jobs without block with only option as proc", async ({
    testCase,
  }: TestContext) => {
    const t = testCase as unknown as TestHelper;
    await HelloJob.performLater("jeremy");
    await LoggingJob.performLater("bogdan");

    await t.performEnqueuedJobs();

    await t.assertPerformedJobs(1, {
      only: (job: Record<string, unknown>) => rbModName(fetch(job, ":job")) === "HelloJob",
    });
  });
});

class JobWithAnAdapter extends ActiveJob.Base {
  static override toString(): string {
    return "QueueAdapterTest::JobWithAnAdapter";
  }

  perform(): void {}
}
JobWithAnAdapter.setQueueAdapter("async");

class QueueAdapterTest extends TestCase {
  static override toString(): string {
    return "QueueAdapterTest";
  }

  override queueAdapterForTest = (): unknown => new QueueAdapters.TestAdapter();
}
registerConstant("QueueAdapterTest", QueueAdapterTest);
rbModConstSet(QueueAdapterTest, "JobWithAnAdapter", JobWithAnAdapter);

describe("QueueAdapterTest", () => {
  it("assert_enqueued_with enqueues a job with a queue_adapter and queue_adapter_for_test", async ({
    testCase: t,
  }: HelperContext) => {
    await t.assertEnqueuedWith({ job: JobWithAnAdapter }, () => JobWithAnAdapter.performLater());
  });
});

class CustomQueueAdapter extends QueueAdapters.TestAdapter {
  static override toString(): string {
    return "OverrideQueueAdapterTest::CustomQueueAdapter";
  }
}

class OverrideQueueAdapterTest extends TestCase {
  static override toString(): string {
    return "OverrideQueueAdapterTest";
  }

  override queueAdapterForTest = (): unknown => new CustomQueueAdapter();
}
registerConstant("OverrideQueueAdapterTest", OverrideQueueAdapterTest);
rbModConstSet(OverrideQueueAdapterTest, "CustomQueueAdapter", CustomQueueAdapter);

describe("OverrideQueueAdapterTest", () => {
  it("assert job has custom queue adapter set", () => {
    assertInstanceOf(CustomQueueAdapter, HelloJob.queueAdapter);
  });
});

class InheritedJobTest extends TestCase {
  static override toString(): string {
    return "InheritedJobTest";
  }
}
registerConstant("InheritedJobTest", InheritedJobTest);

describe("InheritedJobTest", () => {
  it("queue adapter is inline adapter because it is set on the job class", () => {
    assertInstanceOf(QueueAdapters.InlineAdapter, InheritedJob.queueAdapter);
  });
});
