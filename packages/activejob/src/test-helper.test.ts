import { beforeEach, describe, it, type TestContext } from "vitest";
import {
  Assertion,
  assertEqual,
  assertMatch,
  assertNil,
  assertNothingRaised,
  assertRaise,
  assertRaises,
} from "@blazetrails/activesupport";
import { Time } from "@blazetrails/date";
import {
  ArgumentError,
  fetch,
  include,
  included,
  NotImplementedError,
  rbModName,
  rbObjClass,
  registerConstant,
} from "@blazetrails/ruby-compat";
import { QueueAdapters } from "./namespaces.js";
import "./queue-adapters/inline-adapter.js";
import type { TestAdapter } from "./queue-adapters/test-adapter.js";
import "./queue-adapters/test-adapter.js";
import { TestCase } from "./test-case.js";
import type { TestHelper } from "./test-helper.js";
import { isAdapterIs } from "./test-helpers/helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { LoggingJob } from "./test-helpers/jobs/logging-job.js";
import { NestedJob } from "./test-helpers/jobs/nested-job.js";
import { RaisingJob } from "./test-helpers/jobs/raising-job.js";
import { RescueJob } from "./test-helpers/jobs/rescue-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

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
