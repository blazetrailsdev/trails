import type {} from "@blazetrails/vitest-matchers";
import { isAdapterIs } from "./test-helpers/helper.js";
import {
  Concern,
  Assertion,
  assertRaises,
  Duration,
  TimeWithZone,
  TimeZone,
} from "@blazetrails/activesupport";
import { tomorrow, noon } from "@blazetrails/activesupport/core-ext/date/calculations";
import "@blazetrails/activesupport/testing/autorun";
import { Date as RubyDate, Time as RubyTime, DateTime as RubyDateTime } from "@blazetrails/date";
import {
  extend,
  classModule,
  Extended,
  registerConstant,
  include,
  fetch,
  ArgumentError,
  rbInspect,
  rational,
  NotImplementedError,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { declined } from "./codegen-declined.js";
import { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import { TestAdapter } from "./queue-adapters/test-adapter.js";
import { TestCase } from "./test-case.js";
import { TestHelper } from "./test-helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { InheritedJob } from "./test-helpers/jobs/inherited-job.js";
import { LoggingJob } from "./test-helpers/jobs/logging-job.js";
import { MultipleKwargsJob } from "./test-helpers/jobs/multiple-kwargs-job.js";
import { NestedJob } from "./test-helpers/jobs/nested-job.js";
import { RaisingJob, MyError } from "./test-helpers/jobs/raising-job.js";
import { RescueJob } from "./test-helpers/jobs/rescue-job.js";
import { RetryJob } from "./test-helpers/jobs/retry-job.js";
import { Person } from "./test-helpers/models/person.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

export class DoNotPerformEnqueuedJobs {
  declare static included: Extended<typeof Concern>["included"];

  static readonly [classModule] = true;

  static toString(): string {
    return "DoNotPerformEnqueuedJobs";
  }
}
extend(DoNotPerformEnqueuedJobs, Concern);
DoNotPerformEnqueuedJobs.included(null, function (): void {
  this.setup(function () {
    this._performEnqueuedJobs = this.queueAdapter().performEnqueuedJobs;
    this._performEnqueuedAtJobs = this.queueAdapter().performEnqueuedAtJobs;
    this.queueAdapter().performEnqueuedJobs = this.queueAdapter().performEnqueuedAtJobs = false;
    return this.queueAdapter().performEnqueuedJobs;
  });
  this.teardown(function () {
    this.queueAdapter().performEnqueuedJobs = this._performEnqueuedJobs;
    this.queueAdapter().performEnqueuedAtJobs = this._performEnqueuedAtJobs;
    return this.queueAdapter().performEnqueuedAtJobs;
  });
});
registerConstant("DoNotPerformEnqueuedJobs", DoNotPerformEnqueuedJobs);
class EnqueuedJobsTest extends TestCase {}
registerConstant("EnqueuedJobsTest", EnqueuedJobsTest);
include(EnqueuedJobsTest, TestHelper);
include(EnqueuedJobsTest, DoNotPerformEnqueuedJobs);

describe("EnqueuedJobsTest", () => {
  beforeEach<{ testCase: EnqueuedJobsTest }>(async ({ testCase }) => {
    await testCase.setup();
  });

  afterEach<{ testCase: EnqueuedJobsTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertEnqueuedJobs(
            1,
            undefined,
            async () => await HelloJob.performLater("david"),
          ))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "repeated enqueued jobs calls",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertEnqueuedJobs(
            1,
            undefined,
            async () => await HelloJob.performLater("abdelkader"),
          ))(),
      ).resolves.not.toThrow();
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(2, undefined, async () => {
            await HelloJob.performLater("sean");
            return await HelloJob.performLater("yves");
          });
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs message",
    async ({ testCase }) => {
      await HelloJob.performLater("sean");
      let e = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedJobs(
            2,
            undefined,
            async () => await HelloJob.performLater("sean"),
          ),
      );
      expect(await e.message).toMatch("Expected: 2");
      expect(await e.message).toMatch("Actual: 1");
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with no block",
    async ({ testCase }) => {
      await expect(
        (async () => {
          await HelloJob.performLater("rafael");
          return await testCase.assertEnqueuedJobs(1);
        })(),
      ).resolves.not.toThrow();
      await expect(
        (async () => {
          await HelloJob.performLater("aaron");
          await HelloJob.performLater("matthew");
          return await testCase.assertEnqueuedJobs(3);
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with no block",
    async ({ testCase }) => {
      await expect((async () => await testCase.assertNoEnqueuedJobs())()).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertNoEnqueuedJobs(
            undefined,
            async () => await HelloJob.performNow(),
          ))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs too few sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedJobs(
            2,
            undefined,
            async () => await HelloJob.performLater("xavier"),
          ),
      );
      expect(await error.message).toMatch(/2 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs too many sent",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertEnqueuedJobs(1, undefined, async () => {
          await HelloJob.performLater("cristian");
          return await HelloJob.performLater("guillermo");
        });
      });
      expect(await error.message).toMatch(/1 .* but 2/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs failure",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertNoEnqueuedJobs(
            undefined,
            async () => await HelloJob.performLater("jeremy"),
          ),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(1, { only: HelloJob }, async () => {
            await HelloJob.performLater("jeremy");
            await LoggingJob.performLater();
            return await LoggingJob.performLater();
          });
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only option as proc",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(
            1,
            {
              only: (job?: unknown) =>
                ((x) => (Object.hasOwn(x, "toString") ? String(x) : x.name || null))(
                  fetch(job, ":job"),
                ) === "HelloJob",
            },
            async () => {
              await HelloJob.performLater("jeremy");
              await LoggingJob.performLater();
              return await LoggingJob.performLater();
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with except option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(1, { except: LoggingJob }, async () => {
            await HelloJob.performLater("jeremy");
            await LoggingJob.performLater();
            return await LoggingJob.performLater();
          });
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with except option as proc",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(
            1,
            {
              except: (job?: unknown) =>
                ((x) => (Object.hasOwn(x, "toString") ? String(x) : x.name || null))(
                  fetch(job, ":job"),
                ) === "LoggingJob",
            },
            async () => {
              await HelloJob.performLater("jeremy");
              await LoggingJob.performLater();
              return await LoggingJob.performLater();
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only and except option",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertEnqueuedJobs(
          1,
          { only: HelloJob, except: HelloJob },
          async () => {
            await HelloJob.performLater("jeremy");
            await LoggingJob.performLater();
            return await LoggingJob.performLater();
          },
        );
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only and queue option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(
            1,
            { only: HelloJob, queue: "some_queue" },
            async () => {
              await HelloJob.set({ queue: "some_queue" }).performLater();
              await HelloJob.set({ queue: "other_queue" }).performLater();
              return await LoggingJob.performLater();
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with except and queue option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(
            1,
            { except: LoggingJob, queue: "some_queue" },
            async () => {
              await HelloJob.set({ queue: "some_queue" }).performLater();
              await HelloJob.set({ queue: "other_queue" }).performLater();
              return await LoggingJob.performLater();
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only and except and queue option",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertEnqueuedJobs(
          1,
          { only: HelloJob, except: HelloJob, queue: "some_queue" },
          async () => {
            await HelloJob.set({ queue: "some_queue" }).performLater();
            await HelloJob.set({ queue: "other_queue" }).performLater();
            return await LoggingJob.performLater();
          },
        );
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with queue option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(2, { queue: "default" }, async () => {
            await HelloJob.performLater();
            await LoggingJob.performLater();
            await HelloJob.set({ queue: "other_queue" }).performLater();
            return await LoggingJob.set({ queue: "other_queue" }).performLater();
          });
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued job with priority option",
    async ({ testCase }) => {
      await testCase.assertEnqueuedWith(
        { job: HelloJob, priority: 10 },
        async () => await HelloJob.set({ priority: 10 }).performLater(),
      );
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedWith(
            { job: HelloJob, priority: 10 },
            async () => await HelloJob.set({ priority: 5 }).performLater(),
          ),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only option and none sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedJobs(
            1,
            { only: HelloJob },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with except option and none sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedJobs(
            1,
            { except: LoggingJob },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only and except option and none sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertEnqueuedJobs(
            1,
            { only: HelloJob, except: HelloJob },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only option and too few sent",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertEnqueuedJobs(5, { only: HelloJob }, async () => {
          await HelloJob.performLater("jeremy");
          return await (async (n: number) => {
            for (let i = 0; i < n; i++) await (async () => await LoggingJob.performLater())();
            return n;
          })(4);
        });
      });
      expect(await error.message).toMatch(/5 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with except option and too few sent",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertEnqueuedJobs(5, { except: LoggingJob }, async () => {
          await HelloJob.performLater("jeremy");
          return await (async (n: number) => {
            for (let i = 0; i < n; i++) await (async () => await LoggingJob.performLater())();
            return n;
          })(4);
        });
      });
      expect(await error.message).toMatch(/5 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only and except option and too few sent",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertEnqueuedJobs(
          5,
          { only: HelloJob, except: HelloJob },
          async () => {
            await HelloJob.performLater("jeremy");
            return await (async (n: number) => {
              for (let i = 0; i < n; i++) await (async () => await LoggingJob.performLater())();
              return n;
            })(4);
          },
        );
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only option and too many sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedJobs(
            1,
            { only: HelloJob },
            async () =>
              await (async (n: number) => {
                for (let i = 0; i < n; i++)
                  await (async () => await HelloJob.performLater("jeremy"))();
                return n;
              })(2),
          ),
      );
      expect(await error.message).toMatch(/1 .* but 2/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with except option and too many sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedJobs(
            1,
            { except: LoggingJob },
            async () =>
              await (async (n: number) => {
                for (let i = 0; i < n; i++)
                  await (async () => await HelloJob.performLater("jeremy"))();
                return n;
              })(2),
          ),
      );
      expect(await error.message).toMatch(/1 .* but 2/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only and except option and too many sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertEnqueuedJobs(
            1,
            { only: HelloJob, except: HelloJob },
            async () =>
              await (async (n: number) => {
                for (let i = 0; i < n; i++)
                  await (async () => await HelloJob.performLater("jeremy"))();
                return n;
              })(2),
          ),
      );
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only option as array",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(
            2,
            { only: [HelloJob, LoggingJob] },
            async () => {
              await HelloJob.performLater("jeremy");
              await LoggingJob.performLater("stewie");
              return await RescueJob.performLater("david");
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with except option as array",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertEnqueuedJobs(
            1,
            { except: [HelloJob, LoggingJob] },
            async () => {
              await HelloJob.performLater("jeremy");
              await LoggingJob.performLater("stewie");
              return await RescueJob.performLater("david");
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with only and except option as array",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertEnqueuedJobs(
          2,
          { only: [HelloJob, LoggingJob], except: [HelloJob, LoggingJob] },
          async () => {
            await HelloJob.performLater("jeremy");
            await LoggingJob.performLater("stewie");
            return await RescueJob.performLater("david");
          },
        );
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with only option",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertNoEnqueuedJobs(
            { only: HelloJob },
            async () => await LoggingJob.performLater(),
          ))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with except option",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertNoEnqueuedJobs(
            { except: LoggingJob },
            async () => await LoggingJob.performLater(),
          ))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with only and except option",
    async ({ testCase }) => {
      let error = await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertNoEnqueuedJobs(
            { only: HelloJob, except: HelloJob },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with only option failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertNoEnqueuedJobs({ only: HelloJob }, async () => {
          await HelloJob.performLater("jeremy");
          return await LoggingJob.performLater();
        });
      });
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with except option failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertNoEnqueuedJobs({ except: LoggingJob }, async () => {
          await HelloJob.performLater("jeremy");
          return await LoggingJob.performLater();
        });
      });
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with only and except option failure",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertNoEnqueuedJobs(
          { only: HelloJob, except: HelloJob },
          async () => {
            await HelloJob.performLater("jeremy");
            return await LoggingJob.performLater();
          },
        );
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with only option as array",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertNoEnqueuedJobs(
            { only: [HelloJob, RescueJob] },
            async () => await LoggingJob.performLater(),
          ))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with except option as array",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertNoEnqueuedJobs(
            { except: [HelloJob, RescueJob] },
            async () => {
              await HelloJob.performLater();
              return await RescueJob.performLater();
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with only and except option as array",
    async ({ testCase }) => {
      let error = await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertNoEnqueuedJobs(
            { only: [HelloJob, RescueJob], except: [HelloJob, RescueJob] },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with queue option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertNoEnqueuedJobs({ queue: "default" }, async () => {
            await HelloJob.set({ queue: "other_queue" }).performLater();
            return await LoggingJob.set({ queue: "other_queue" }).performLater();
          });
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with queue option failure",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertNoEnqueuedJobs(
            { queue: "other_queue" },
            async () => await HelloJob.set({ queue: "other_queue" }).performLater(),
          ),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with only and queue option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertNoEnqueuedJobs(
            { only: HelloJob, queue: "some_queue" },
            async () => {
              await HelloJob.set({ queue: "other_queue" }).performLater();
              await HelloJob.set({ queue: "other_queue" }).performLater();
              return await LoggingJob.set({ queue: "some_queue" }).performLater();
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with only and queue option failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertNoEnqueuedJobs(
          { only: HelloJob, queue: "some_queue" },
          async () => {
            await HelloJob.set({ queue: "other_queue" }).performLater();
            await HelloJob.set({ queue: "some_queue" }).performLater();
            return await LoggingJob.set({ queue: "some_queue" }).performLater();
          },
        );
      });
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with except and queue option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertNoEnqueuedJobs(
            { except: LoggingJob, queue: "some_queue" },
            async () => {
              await HelloJob.set({ queue: "other_queue" }).performLater();
              await HelloJob.set({ queue: "other_queue" }).performLater();
              return await LoggingJob.set({ queue: "some_queue" }).performLater();
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with except and queue option failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertNoEnqueuedJobs(
          { except: LoggingJob, queue: "some_queue" },
          async () => {
            await HelloJob.set({ queue: "other_queue" }).performLater();
            await HelloJob.set({ queue: "some_queue" }).performLater();
            return await LoggingJob.set({ queue: "some_queue" }).performLater();
          },
        );
      });
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs with only and except and queue option",
    async ({ testCase }) => {
      let error = await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertNoEnqueuedJobs(
            { only: HelloJob, except: HelloJob, queue: "some_queue" },
            async () => await HelloJob.set({ queue: "other_queue" }).performLater(),
          ),
      );
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with",
    async ({ testCase }) => {
      await testCase.assertEnqueuedWith(
        { job: LoggingJob, queue: "default" },
        async () =>
          await LoggingJob.set({ waitUntil: await noon(await tomorrow()) }).performLater(),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with no block",
    async ({ testCase }) => {
      await LoggingJob.set({ waitUntil: await noon(await tomorrow()) }).performLater();
      await testCase.assertEnqueuedWith({ job: LoggingJob, queue: "default" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with when queue name is symbol",
    async ({ testCase }) => {
      await testCase.assertEnqueuedWith(
        { job: LoggingJob, queue: "default" },
        async () =>
          await LoggingJob.set({ waitUntil: await noon(await tomorrow()) }).performLater(),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert no enqueued jobs and perform now",
    async ({ testCase }) => {
      await testCase.assertNoEnqueuedJobs(
        undefined,
        async () => await LoggingJob.performNow(1, 2, 3, { keyword: true }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with returns",
    async ({ testCase }) => {
      let job = await testCase.assertEnqueuedWith(
        { job: LoggingJob },
        async () =>
          await LoggingJob.set({
            waitUntil: await (await Duration.minutes(5)).fromNow(),
          }).performLater(1, 2, 3, { keyword: true }),
      );
      expect(job).toBeExactInstanceOf(LoggingJob);
      expect(await Number(await job.scheduledAt)).toBeWithinDelta(
        await Number(await (await Duration.minutes(5)).fromNow()),
        1,
      );
      expect(await job.queueName).toEqual("default");
      expect(await job.arguments).toEqualRuby([1, 2, 3, { keyword: true }]);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with no block returns",
    async ({ testCase }) => {
      await LoggingJob.set({ waitUntil: await (await Duration.minutes(5)).fromNow() }).performLater(
        1,
        2,
        3,
        { keyword: true },
      );
      let job = await testCase.assertEnqueuedWith({ job: LoggingJob });
      expect(job).toBeExactInstanceOf(LoggingJob);
      expect(await Number(await job.scheduledAt)).toBeWithinDelta(
        await Number(await (await Duration.minutes(5)).fromNow()),
        1,
      );
      expect(await job.queueName).toEqual("default");
      expect(await job.arguments).toEqualRuby([1, 2, 3, { keyword: true }]);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with failure",
    async ({ testCase }) => {
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedWith(
            { job: LoggingJob, queue: "default" },
            async () => await NestedJob.performLater(),
          ),
      );
      await assertRaises([Assertion], {}, async () => {
        await LoggingJob.performLater();
        return await testCase.assertEnqueuedWith({ job: LoggingJob }, () => {});
      });
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedWith(
            { job: NestedJob, queue: "low" },
            async () => await NestedJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(
        `No enqueued job found with ${rbInspect({ job: NestedJob, queue: "low" })}`,
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with no block failure",
    async ({ testCase }) => {
      await assertRaises([Assertion], {}, async () => {
        await NestedJob.performLater();
        return await testCase.assertEnqueuedWith({ job: LoggingJob, queue: "default" });
      });
      let error = await assertRaises([Assertion], {}, async () => {
        await NestedJob.performLater();
        return await testCase.assertEnqueuedWith({ job: NestedJob, queue: "low" });
      });
      expect(await error.message).toMatch(
        `No enqueued job found with ${rbInspect({ job: NestedJob, queue: "low" })}`,
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with args",
    async ({ testCase }) => {
      await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertEnqueuedWith(
            { class: LoggingJob },
            async () =>
              await NestedJob.set({ waitUntil: await noon(await tomorrow()) }).performLater(),
          ),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with supports matcher procs",
    async ({ testCase }) => {
      let facets = {
        job: HelloJob,
        args: ["Rails"],
        at: await noon(await tomorrow()),
        queue: "important",
      };
      await (
        await facets[":job"].set({ queue: facets[":queue"], waitUntil: facets[":at"] })
      ).performLater(
        ...((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(facets[":args"]),
      );
      for (const [facet, value] of Object.entries(facets)) {
        let matcher = (jobValue?: unknown) => jobValue === value;
        let refuser = (jobValue?: unknown) => false;
        await testCase.assertEnqueuedWith({ ...{ [facet]: matcher } });
        await assertRaises(
          [Assertion],
          {},
          async () => await testCase.assertEnqueuedWith({ ...{ [facet]: refuser } }),
        );
      }
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with time",
    async ({ testCase }) => {
      let now = RubyTime.now();
      let args = [{ argument1: [now] }];
      await testCase.assertEnqueuedWith(
        { job: MultipleKwargsJob, args: args },
        async () => await MultipleKwargsJob.performLater({ argument1: [now] }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with date time",
    async ({ testCase }) => {
      let now = await RubyDateTime.now();
      let args = [{ argument1: [now] }];
      await testCase.assertEnqueuedWith(
        { job: MultipleKwargsJob, args: args },
        async () => await MultipleKwargsJob.performLater({ argument1: [now] }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with time with zone",
    async ({ testCase }) => {
      let now = await RubyTime.now().inTimeZone("Tokyo");
      let args = [{ argument1: [now] }];
      await testCase.assertEnqueuedWith(
        { job: MultipleKwargsJob, args: args },
        async () => await MultipleKwargsJob.performLater({ argument1: [now] }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with time and time precision",
    async ({ testCase }) => {
      let timeWithZone = new TimeWithZone(
        RubyTime.utc(1999, 12, 31, 23, 59, await rational(59123456789n, 1000000000n)),
        TimeZone.find("Tokyo")!,
      );
      let time = RubyTime.at(946702800, 1234567, "nanosecond");
      let dateTime = new RubyDateTime(2001, 2, 3, 4, 5, 6.123456, "+03:00");
      let args = [{ argument1: [timeWithZone, time, dateTime] }];
      await testCase.assertEnqueuedWith(
        { job: MultipleKwargsJob, args: args },
        async () =>
          await MultipleKwargsJob.performLater({ argument1: [timeWithZone, time, dateTime] }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with no block args",
    async ({ testCase }) => {
      await assertRaises([ArgumentError], {}, async () => {
        await NestedJob.set({ waitUntil: await noon(await tomorrow()) }).performLater();
        return await testCase.assertEnqueuedWith({ class: LoggingJob });
      });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with at option",
    async ({ testCase }) => {
      await testCase.assertEnqueuedWith(
        { job: HelloJob, at: await noon(await tomorrow()) },
        async () => await HelloJob.set({ waitUntil: await noon(await tomorrow()) }).performLater(),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with relative at option",
    async ({ testCase }) => {
      await testCase.assertEnqueuedWith(
        { job: HelloJob, at: await (await Duration.minutes(5)).fromNow() },
        async () => await HelloJob.set({ wait: await Duration.minutes(5) }).performLater(),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with no block with at option",
    async ({ testCase }) => {
      await HelloJob.set({ waitUntil: await noon(await tomorrow()) }).performLater();
      await testCase.assertEnqueuedWith({ job: HelloJob, at: await noon(await tomorrow()) });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with wait until with performed",
    async ({ testCase }) => {
      await testCase.assertEnqueuedWith({ job: LoggingJob }, async () => {
        return await testCase.performEnqueuedJobs({ only: HelloJob }, async () => {
          await HelloJob.set({ waitUntil: await noon(await tomorrow()) }).performLater("david");
          return await LoggingJob.set({ waitUntil: await noon(await tomorrow()) }).performLater(
            "enqueue",
          );
        });
      });
      await testCase.assertEnqueuedJobs(1);
      await testCase.assertPerformedJobs(1);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with hash arg",
    async ({ testCase }) => {
      await testCase.assertEnqueuedWith(
        { job: MultipleKwargsJob, args: [{ argument1: 1, argument2: { a: 1, b: 2 } }] },
        async () =>
          await MultipleKwargsJob.performLater({ argument2: { b: 2, a: 1 }, argument1: 1 }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with global id args",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      await testCase.assertEnqueuedWith(
        { job: HelloJob, args: [ricardo] },
        async () => await HelloJob.performLater(ricardo),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with no block with global id args",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      await HelloJob.performLater(ricardo);
      await testCase.assertEnqueuedWith({ job: HelloJob, args: [ricardo] });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with failure with global id args",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      let wilma = new Person(11);
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedWith(
            { job: HelloJob, args: [wilma] },
            async () => await HelloJob.performLater(ricardo),
          ),
      );
      expect(await error.message).toMatch(
        `No enqueued job found with ${rbInspect({ job: HelloJob, args: [wilma] })}`,
      );
      expect(await error.message).toMatch(/Potential matches:.*Person.* @id="9"/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "show jobs that are enqueued when job is not queued at all",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      let wilma = new Person(11);
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertEnqueuedWith(
            { job: MultipleKwargsJob, args: [wilma] },
            async () => await HelloJob.performLater(ricardo),
          ),
      );
      expect(await error.message).toMatch(
        `No enqueued job found with ${rbInspect({ job: MultipleKwargsJob, args: [wilma] })}`,
      );
      expect(await error.message).toMatch(
        /No jobs of class MultipleKwargsJob were enqueued, job classes enqueued: HelloJob/,
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "shows no jobs enqueued when there are no jobs",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertEnqueuedWith({ job: HelloJob, args: [] }, () => {});
      });
      expect(await error.message).toMatch(
        `No enqueued job found with ${rbInspect({ job: HelloJob, args: [] })}`,
      );
      expect(await error.message).toMatch(/No jobs were enqueued/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with failure with no block with global id args",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      let wilma = new Person(11);
      let error = await assertRaises([Assertion], {}, async () => {
        await HelloJob.performLater(ricardo);
        return await testCase.assertEnqueuedWith({ job: HelloJob, args: [wilma] });
      });
      expect(await error.message).toMatch(
        `No enqueued job found with ${rbInspect({ job: HelloJob, args: [wilma] })}`,
      );
      expect(await error.message).toMatch(
        /Potential matches: {.*?HelloJob,.*\[#<Person.* @id="9">\].*?}/,
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with does not change jobs count",
    async ({ testCase }) => {
      await HelloJob.performLater();
      await testCase.assertEnqueuedWith(
        { job: HelloJob },
        async () => await HelloJob.performLater(),
      );
      expect(await (await testCase.queueAdapter().enqueuedJobs).length).toEqual(2);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued with with no block does not change jobs count",
    async ({ testCase }) => {
      await HelloJob.performLater();
      await HelloJob.performLater();
      await testCase.assertEnqueuedWith({ job: HelloJob });
      expect(await (await testCase.queueAdapter().enqueuedJobs).length).toEqual(2);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: EnqueuedJobsTest }>(
    "assert enqueued jobs with performed",
    async ({ testCase }) => {
      await testCase.assertEnqueuedWith({ job: LoggingJob }, async () => {
        return await testCase.performEnqueuedJobs({ only: HelloJob }, async () => {
          await HelloJob.performLater("david");
          return await LoggingJob.performLater("enqueue");
        });
      });
      await testCase.assertEnqueuedJobs(1);
      await testCase.assertPerformedJobs(1);
    },
  );
});
class QueueAdapterTest extends TestCase {
  queueAdapterForTest() {
    return new TestAdapter();
  }
}

registerConstant("QueueAdapterTest", QueueAdapterTest);
include(QueueAdapterTest, TestHelper);

describe("QueueAdapterTest", () => {
  beforeEach<{ testCase: QueueAdapterTest }>(async ({ testCase }) => {
    await testCase.setup();
  });
  afterEach<{ testCase: QueueAdapterTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });
  it<{
    testCase: QueueAdapterTest;
  }>("assert_enqueued_with enqueues a job with a queue_adapter and queue_adapter_for_test", async ({
    testCase,
  }) => {
    await testCase.assertEnqueuedWith(
      { job: JobWithAnAdapter },
      async () => await JobWithAnAdapter.performLater(),
    );
  });
});
export class JobWithAnAdapter extends Base {
  static toString(): string {
    return "QueueAdapterTest::JobWithAnAdapter";
  }

  perform() {}
}
registerConstant("QueueAdapterTest::JobWithAnAdapter", JobWithAnAdapter);
{
  JobWithAnAdapter.setQueueAdapter("async");
}
class PerformedJobsTest extends TestCase {}
registerConstant("PerformedJobsTest", PerformedJobsTest);
include(PerformedJobsTest, TestHelper);
include(PerformedJobsTest, DoNotPerformEnqueuedJobs);

describe("PerformedJobsTest", () => {
  beforeEach<{ testCase: PerformedJobsTest }>(async ({ testCase }) => {
    await testCase.setup();
  });

  afterEach<{ testCase: PerformedJobsTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with only option doesnt leak outside the block",
    async ({ testCase }) => {
      expect(await testCase.queueAdapter().filter).toBeNull();
      await testCase.performEnqueuedJobs({ only: HelloJob }, async () =>
        expect(await testCase.queueAdapter().filter).toEqualRuby(HelloJob),
      );
      expect(await testCase.queueAdapter().filter).toBeNull();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block with only option doesnt leak",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs({ only: HelloJob });
      expect(await testCase.queueAdapter().filter).toBeNull();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with except option doesnt leak outside the block",
    async ({ testCase }) => {
      expect(await testCase.queueAdapter().reject).toBeNull();
      await testCase.performEnqueuedJobs({ except: HelloJob }, async () =>
        expect(await testCase.queueAdapter().reject).toEqualRuby(HelloJob),
      );
      expect(await testCase.queueAdapter().reject).toBeNull();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block with except option doesnt leak",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs({ except: HelloJob });
      expect(await testCase.queueAdapter().reject).toBeNull();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with queue option doesnt leak outside the block",
    async ({ testCase }) => {
      expect(await testCase.queueAdapter().queue).toBeNull();
      await testCase.performEnqueuedJobs({ queue: "some_queue" }, async () =>
        expect(await testCase.queueAdapter().queue).toEqual("some_queue"),
      );
      expect(await testCase.queueAdapter().queue).toBeNull();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block with queue option doesnt leak",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs({ queue: "some_queue" });
      expect(await testCase.queueAdapter().reject).toBeNull();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with block",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs(undefined, async () => {
        await HelloJob.performLater("kevin");
        return await LoggingJob.performLater("bogdan");
      });
      await testCase.assertPerformedJobs(2);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block",
    async ({ testCase }) => {
      await HelloJob.performLater("kevin");
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedJobs(2);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with block with only option",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs({ only: LoggingJob }, async () => {
        await HelloJob.performLater("kevin");
        return await LoggingJob.performLater("bogdan");
      });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: LoggingJob });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block with only option",
    async ({ testCase }) => {
      await HelloJob.performLater("kevin");
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs({ only: LoggingJob });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: LoggingJob });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with block with except option",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs({ except: HelloJob }, async () => {
        await HelloJob.performLater("kevin");
        return await LoggingJob.performLater("bogdan");
      });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: LoggingJob });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block with except option",
    async ({ testCase }) => {
      await HelloJob.performLater("kevin");
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs({ except: HelloJob });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: LoggingJob });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with block with queue option",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs({ queue: "some_queue" }, async () => {
        await HelloJob.set({ queue: "some_queue" }).performLater("kevin");
        await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
        return await LoggingJob.performLater("bogdan");
      });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block with queue option",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "some_queue" }).performLater("kevin");
      await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs({ queue: "some_queue" });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with block with only and queue options",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs({ only: HelloJob, queue: "other_queue" }, async () => {
        await HelloJob.set({ queue: "some_queue" }).performLater("kevin");
        await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
        return await LoggingJob.set({ queue: "other_queue" }).performLater("bogdan");
      });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "other_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block with only and queue options",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "some_queue" }).performLater("kevin");
      await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "other_queue" }).performLater("bogdan");
      await testCase.performEnqueuedJobs({ only: HelloJob, queue: "other_queue" });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "other_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with block with except and queue options",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs({ except: HelloJob, queue: "other_queue" }, async () => {
        await HelloJob.set({ queue: "other_queue" }).performLater("kevin");
        await LoggingJob.set({ queue: "some_queue" }).performLater("bogdan");
        return await LoggingJob.set({ queue: "other_queue" }).performLater("bogdan");
      });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: LoggingJob, queue: "other_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block with except and queue options",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "other_queue" }).performLater("kevin");
      await LoggingJob.set({ queue: "some_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "other_queue" }).performLater("bogdan");
      await testCase.performEnqueuedJobs({ except: HelloJob, queue: "other_queue" });
      await testCase.assertPerformedJobs(1);
      await testCase.assertPerformedJobs(1, { only: LoggingJob, queue: "other_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with at with job performed now",
    async ({ testCase }) => {
      await HelloJob.performLater("kevin");
      await testCase.performEnqueuedJobs({ at: RubyTime.now() });
      await testCase.assertPerformedJobs(1);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with at with job wait in past",
    async ({ testCase }) => {
      await HelloJob.set({ waitUntil: await RubyTime.now().minus(100) }).performLater("kevin");
      await testCase.performEnqueuedJobs({ at: RubyTime.now() });
      await testCase.assertPerformedJobs(1);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs with at with job wait in future",
    async ({ testCase }) => {
      await HelloJob.set({ waitUntil: await RubyTime.now().plus(100) }).performLater("kevin");
      await testCase.performEnqueuedJobs({ at: RubyTime.now() });
      await testCase.assertPerformedJobs(0);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs block with at with job performed now",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs(
        { at: RubyTime.now() },
        async () => await HelloJob.performLater("kevin"),
      );
      await testCase.assertPerformedJobs(1);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs block with at with job wait in past",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs(
        { at: RubyTime.now() },
        async () =>
          await HelloJob.set({ waitUntil: await RubyTime.now().minus(100) }).performLater("kevin"),
      );
      await testCase.assertPerformedJobs(1);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs block with at with job wait in future",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs(
        { at: RubyTime.now() },
        async () =>
          await HelloJob.set({ waitUntil: await RubyTime.now().plus(100) }).performLater("kevin"),
      );
      await testCase.assertPerformedJobs(0);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs properly count job that raises",
    async ({ testCase }) => {
      await RaisingJob.performLater("NotImplementedError");
      await assertRaises(
        [NotImplementedError],
        {},
        async () => await testCase.performEnqueuedJobs({ only: RaisingJob }),
      );
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.performedJobs,
        ),
      ).toEqual(1);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs dont perform retries",
    async ({ testCase }) => {
      await RaisingJob.performLater();
      await expect(
        (async () => await testCase.performEnqueuedJobs({ only: RaisingJob }))(),
      ).resolves.not.toThrow();
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.performedJobs,
        ),
      ).toEqual(1);
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.enqueuedJobs,
        ),
      ).toEqual(1);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block removes from enqueued jobs",
    async ({ testCase }) => {
      await HelloJob.performLater("rafael");
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.performedJobs,
        ),
      ).toEqual(0);
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.enqueuedJobs,
        ),
      ).toEqual(1);
      await testCase.performEnqueuedJobs();
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.performedJobs,
        ),
      ).toEqual(1);
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.enqueuedJobs,
        ),
      ).toEqual(0);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block works with other helpers",
    async ({ testCase }) => {
      await NestedJob.performLater();
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.performedJobs,
        ),
      ).toEqual(0);
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.enqueuedJobs,
        ),
      ).toEqual(1);
      await testCase.assertEnqueuedJobs(
        1,
        undefined,
        async () =>
          await testCase.assertEnqueuedWith(
            { job: LoggingJob },
            async () => await testCase.performEnqueuedJobs(),
          ),
      );
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.performedJobs,
        ),
      ).toEqual(1);
      expect(
        await ((x) =>
          x instanceof globalThis.Set || x instanceof globalThis.Map ? x.size : x.length)(
          await testCase.enqueuedJobs,
        ),
      ).toEqual(1);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform enqueued jobs without block only performs once",
    async ({ testCase }) => {
      JobBuffer.clear();
      await RescueJob.performLater("no exception");
      await testCase.performEnqueuedJobs();
      await testCase.performEnqueuedJobs();
      expect(await JobBuffer.values().length).toEqual(1);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertPerformedJobs(
            1,
            undefined,
            async () => await HelloJob.performLater("david"),
          ))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "repeated performed jobs calls",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertPerformedJobs(
            1,
            undefined,
            async () => await HelloJob.performLater("abdelkader"),
          ))(),
      ).resolves.not.toThrow();
      await expect(
        (async () => {
          return await testCase.assertPerformedJobs(2, undefined, async () => {
            await HelloJob.performLater("sean");
            return await HelloJob.performLater("yves");
          });
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs message",
    async ({ testCase }) => {
      await HelloJob.performLater("sean");
      let e = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedJobs(
            2,
            undefined,
            async () => await HelloJob.performLater("sean"),
          ),
      );
      expect(await e.message).toMatch("Expected: 2");
      expect(await e.message).toMatch("Actual: 1");
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with no block",
    async ({ testCase }) => {
      await expect(
        (async () => {
          await testCase.performEnqueuedJobs(
            undefined,
            async () => await HelloJob.performLater("rafael"),
          );
          return await testCase.assertPerformedJobs(1);
        })(),
      ).resolves.not.toThrow();
      await expect(
        (async () => {
          return await testCase.performEnqueuedJobs(undefined, async () => {
            await HelloJob.performLater("aaron");
            await HelloJob.performLater("matthew");
            return await testCase.assertPerformedJobs(3);
          });
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with no block",
    async ({ testCase }) => {
      await expect((async () => await testCase.assertNoPerformedJobs())()).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertNoPerformedJobs(undefined, () => {});
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs too few sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedJobs(
            2,
            undefined,
            async () => await HelloJob.performLater("xavier"),
          ),
      );
      expect(await error.message).toMatch(/2 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs too many sent",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertPerformedJobs(1, undefined, async () => {
          await HelloJob.performLater("cristian");
          return await HelloJob.performLater("guillermo");
        });
      });
      expect(await error.message).toMatch(/1 .* but 2/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs failure",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertNoPerformedJobs(
            undefined,
            async () => await HelloJob.performLater("jeremy"),
          ),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertPerformedJobs(1, { only: HelloJob }, async () => {
            await HelloJob.performLater("jeremy");
            return await LoggingJob.performLater();
          });
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only option as proc",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertPerformedJobs(
            1,
            { only: (job?: unknown) => job instanceof HelloJob },
            async () => {
              await HelloJob.performLater("jeremy");
              return await LoggingJob.performLater("bogdan");
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with only option",
    async ({ testCase }) => {
      await HelloJob.performLater("jeremy");
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedJobs(1, { only: HelloJob });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with only option as proc",
    async ({ testCase }) => {
      await HelloJob.performLater("jeremy");
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedJobs(1, {
        only: (job?: unknown) =>
          ((x) => (Object.hasOwn(x, "toString") ? String(x) : x.name || null))(
            fetch(job, ":job"),
          ) === "HelloJob",
      });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with only option failure",
    async ({ testCase }) => {
      await LoggingJob.performLater("jeremy");
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertPerformedJobs(1, { only: HelloJob }),
      );
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with except option",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertPerformedJobs(1, { except: LoggingJob }, async () => {
            await HelloJob.performLater("jeremy");
            return await LoggingJob.performLater();
          });
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with except option as proc",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertPerformedJobs(
            1,
            { except: (job?: unknown) => job instanceof HelloJob },
            async () => {
              await HelloJob.performLater("jeremy");
              return await LoggingJob.performLater("bogdan");
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with except option",
    async ({ testCase }) => {
      await HelloJob.performLater("jeremy");
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedJobs(1, { except: HelloJob });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with except option as proc",
    async ({ testCase }) => {
      await HelloJob.performLater("jeremy");
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedJobs(1, {
        except: (job?: unknown) =>
          ((x) => (Object.hasOwn(x, "toString") ? String(x) : x.name || null))(
            fetch(job, ":job"),
          ) === "HelloJob",
      });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with except option failure",
    async ({ testCase }) => {
      await HelloJob.performLater("jeremy");
      await HelloJob.performLater("bogdan");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertPerformedJobs(1, { except: HelloJob }),
      );
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only and except option",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertPerformedJobs(
          1,
          { only: HelloJob, except: HelloJob },
          async () => {
            await HelloJob.performLater("jeremy");
            return await LoggingJob.performLater();
          },
        );
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with only and except options",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        await HelloJob.performLater("jeremy");
        await LoggingJob.performLater("bogdan");
        await testCase.performEnqueuedJobs();
        return await testCase.assertPerformedJobs(1, { only: HelloJob, except: HelloJob });
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only option as array",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertPerformedJobs(
            2,
            { only: [HelloJob, LoggingJob] },
            async () => {
              await HelloJob.performLater("jeremy");
              await LoggingJob.performLater("stewie");
              return await RescueJob.performLater("david");
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with except option as array",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertPerformedJobs(
            1,
            { except: [LoggingJob, RescueJob] },
            async () => {
              await HelloJob.performLater("jeremy");
              await LoggingJob.performLater("stewie");
              return await RescueJob.performLater("david");
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only and except option as array",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertPerformedJobs(
          2,
          { only: [HelloJob, LoggingJob], except: [HelloJob, LoggingJob] },
          async () => {
            await HelloJob.performLater("jeremy");
            await LoggingJob.performLater("stewie");
            return await RescueJob.performLater("david");
          },
        );
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only option and none sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedJobs(
            1,
            { only: HelloJob },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with except option and none sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedJobs(
            1,
            { except: LoggingJob },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only and except option and none sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertPerformedJobs(
            1,
            { only: HelloJob, except: HelloJob },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only option and too few sent",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertPerformedJobs(5, { only: HelloJob }, async () => {
          await HelloJob.performLater("jeremy");
          return await (async (n: number) => {
            for (let i = 0; i < n; i++) await (async () => await LoggingJob.performLater())();
            return n;
          })(4);
        });
      });
      expect(await error.message).toMatch(/5 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with except option and too few sent",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertPerformedJobs(5, { except: LoggingJob }, async () => {
          await HelloJob.performLater("jeremy");
          return await (async (n: number) => {
            for (let i = 0; i < n; i++) await (async () => await LoggingJob.performLater())();
            return n;
          })(4);
        });
      });
      expect(await error.message).toMatch(/5 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only and except option and too few sent",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertPerformedJobs(
          5,
          { only: HelloJob, except: HelloJob },
          async () => {
            await HelloJob.performLater("jeremy");
            return await (async (n: number) => {
              for (let i = 0; i < n; i++) await (async () => await LoggingJob.performLater())();
              return n;
            })(4);
          },
        );
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only option and too many sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedJobs(
            1,
            { only: HelloJob },
            async () =>
              await (async (n: number) => {
                for (let i = 0; i < n; i++)
                  await (async () => await HelloJob.performLater("jeremy"))();
                return n;
              })(2),
          ),
      );
      expect(await error.message).toMatch(/1 .* but 2/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with except option and too many sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedJobs(
            1,
            { except: LoggingJob },
            async () =>
              await (async (n: number) => {
                for (let i = 0; i < n; i++)
                  await (async () => await HelloJob.performLater("jeremy"))();
                return n;
              })(2),
          ),
      );
      expect(await error.message).toMatch(/1 .* but 2/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only and except option and too many sent",
    async ({ testCase }) => {
      let error = await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertPerformedJobs(
            1,
            { only: HelloJob, except: HelloJob },
            async () =>
              await (async (n: number) => {
                for (let i = 0; i < n; i++)
                  await (async () => await HelloJob.performLater("jeremy"))();
                return n;
              })(2),
          ),
      );
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with queue option",
    async ({ testCase }) => {
      await testCase.assertPerformedJobs(1, { queue: "some_queue" }, async () => {
        await HelloJob.set({ queue: "some_queue" }).performLater("jeremy");
        return await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with queue option failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertPerformedJobs(1, { queue: "some_queue" }, async () => {
          await HelloJob.set({ queue: "other_queue" }).performLater("jeremy");
          return await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
        });
      });
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with queue option",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "some_queue" }).performLater("jeremy");
      await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedJobs(1, { queue: "some_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with queue option failure",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "other_queue" }).performLater("jeremy");
      await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertPerformedJobs(1, { queue: "some_queue" }),
      );
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only and queue options",
    async ({ testCase }) => {
      await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" }, async () => {
        await HelloJob.set({ queue: "some_queue" }).performLater("jeremy");
        await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
        return await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
      });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with only and queue options failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertPerformedJobs(
          1,
          { only: HelloJob, queue: "some_queue" },
          async () => {
            await HelloJob.set({ queue: "other_queue" }).performLater("jeremy");
            await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
            return await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
          },
        );
      });
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with only and queue options",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "some_queue" }).performLater("jeremy");
      await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with only and queue options failure",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "other_queue" }).performLater("jeremy");
      await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" }),
      );
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with except and queue options",
    async ({ testCase }) => {
      await testCase.assertPerformedJobs(
        1,
        { except: HelloJob, queue: "other_queue" },
        async () => {
          await HelloJob.set({ queue: "other_queue" }).performLater("jeremy");
          await LoggingJob.set({ queue: "some_queue" }).performLater("bogdan");
          return await LoggingJob.set({ queue: "other_queue" }).performLater("jeremy");
        },
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs with except and queue options failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertPerformedJobs(
          1,
          { except: HelloJob, queue: "other_queue" },
          async () => {
            await HelloJob.set({ queue: "other_queue" }).performLater("jeremy");
            await LoggingJob.set({ queue: "some_queue" }).performLater("bogdan");
            return await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
          },
        );
      });
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with except and queue options",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "other_queue" }).performLater("jeremy");
      await LoggingJob.set({ queue: "some_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "other_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedJobs(1, { except: HelloJob, queue: "other_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed jobs without block with except and queue options failure",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "other_queue" }).performLater("jeremy");
      await LoggingJob.set({ queue: "some_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedJobs(1, { except: HelloJob, queue: "other_queue" }),
      );
      expect(await error.message).toMatch(/1 .* but 0/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with only option",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertNoPerformedJobs(
            { only: HelloJob },
            async () => await LoggingJob.performLater(),
          ))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with only option",
    async ({ testCase }) => {
      await LoggingJob.performLater("bogdan");
      await testCase.performEnqueuedJobs();
      await testCase.assertNoPerformedJobs({ only: HelloJob });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with only option failure",
    async ({ testCase }) => {
      await HelloJob.performLater("bogdan");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertNoPerformedJobs({ only: HelloJob }),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with except option",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertNoPerformedJobs(
            { except: LoggingJob },
            async () => await LoggingJob.performLater(),
          ))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with except option",
    async ({ testCase }) => {
      await HelloJob.performLater("jeremy");
      await testCase.performEnqueuedJobs();
      await testCase.assertNoPerformedJobs({ except: HelloJob });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with except option failure",
    async ({ testCase }) => {
      await LoggingJob.performLater("jeremy");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertNoPerformedJobs({ except: HelloJob }),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with only and except option",
    async ({ testCase }) => {
      let error = await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertNoPerformedJobs(
            { only: HelloJob, except: HelloJob },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with only and except options",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        await HelloJob.performLater("jeremy");
        await LoggingJob.performLater("bogdan");
        await testCase.performEnqueuedJobs();
        return await testCase.assertNoPerformedJobs({ only: HelloJob, except: HelloJob });
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with only option as array",
    async ({ testCase }) => {
      await expect(
        (async () =>
          await testCase.assertNoPerformedJobs(
            { only: [HelloJob, RescueJob] },
            async () => await LoggingJob.performLater(),
          ))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with except option as array",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.assertNoPerformedJobs(
            { except: [HelloJob, RescueJob] },
            async () => {
              await HelloJob.performLater();
              return await RescueJob.performLater();
            },
          );
        })(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with only and except option as array",
    async ({ testCase }) => {
      let error = await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await testCase.assertNoPerformedJobs(
            { only: [HelloJob, RescueJob], except: [HelloJob, RescueJob] },
            async () => await LoggingJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with only option failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertNoPerformedJobs({ only: HelloJob }, async () => {
          await HelloJob.performLater("jeremy");
          return await LoggingJob.performLater();
        });
      });
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with except option failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertNoPerformedJobs({ except: LoggingJob }, async () => {
          await HelloJob.performLater("jeremy");
          return await LoggingJob.performLater();
        });
      });
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with only and except option failure",
    async ({ testCase }) => {
      let error = await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertNoPerformedJobs(
          { only: HelloJob, except: HelloJob },
          async () => {
            await HelloJob.performLater("jeremy");
            return await LoggingJob.performLater();
          },
        );
      });
      expect(await error.message).toMatch(/`:only` and `:except`/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with queue option",
    async ({ testCase }) => {
      await testCase.assertNoPerformedJobs(
        { queue: "some_queue" },
        async () => await HelloJob.set({ queue: "other_queue" }).performLater("jeremy"),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with queue option failure",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertNoPerformedJobs(
            { queue: "some_queue" },
            async () => await HelloJob.set({ queue: "some_queue" }).performLater("jeremy"),
          ),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with queue option",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "other_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      await testCase.assertNoPerformedJobs({ queue: "some_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with queue option failure",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "some_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertNoPerformedJobs({ queue: "some_queue" }),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with only and queue options",
    async ({ testCase }) => {
      await testCase.assertNoPerformedJobs({ only: HelloJob, queue: "some_queue" }, async () => {
        await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
        return await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
      });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with only and queue options failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertNoPerformedJobs(
          { only: HelloJob, queue: "some_queue" },
          async () => {
            await HelloJob.set({ queue: "some_queue" }).performLater("bogdan");
            return await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
          },
        );
      });
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with only and queue options",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      await testCase.assertNoPerformedJobs({ only: HelloJob, queue: "some_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with only and queue options failure",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "some_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertNoPerformedJobs({ only: HelloJob, queue: "some_queue" }),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with except and queue options",
    async ({ testCase }) => {
      await testCase.assertNoPerformedJobs({ except: HelloJob, queue: "some_queue" }, async () => {
        await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
        await HelloJob.set({ queue: "some_queue" }).performLater("bogdan");
        return await LoggingJob.set({ queue: "other_queue" }).performLater("jeremy");
      });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs with except and queue options failure",
    async ({ testCase }) => {
      let error = await assertRaises([Assertion], {}, async () => {
        return await testCase.assertNoPerformedJobs(
          { except: HelloJob, queue: "some_queue" },
          async () => {
            await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
            await HelloJob.set({ queue: "some_queue" }).performLater("bogdan");
            return await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
          },
        );
      });
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with except and queue options",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      await HelloJob.set({ queue: "some_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "other_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      await testCase.assertNoPerformedJobs({ except: HelloJob, queue: "some_queue" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert no performed jobs without block with except and queue options failure",
    async ({ testCase }) => {
      await HelloJob.set({ queue: "other_queue" }).performLater("bogdan");
      await HelloJob.set({ queue: "some_queue" }).performLater("bogdan");
      await LoggingJob.set({ queue: "some_queue" }).performLater("jeremy");
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertNoPerformedJobs({ except: HelloJob, queue: "some_queue" }),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with",
    async ({ testCase }) => {
      await testCase.assertPerformedWith(
        { job: NestedJob, queue: "default" },
        async () => await NestedJob.performLater(),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with without block",
    async ({ testCase }) => {
      await NestedJob.performLater();
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedWith({ job: NestedJob, queue: "default" });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with when queue name is symbol",
    async ({ testCase }) => {
      await testCase.assertPerformedWith(
        { job: NestedJob, queue: "default" },
        async () => await NestedJob.performLater(),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with returns",
    async ({ testCase }) => {
      let job = await testCase.assertPerformedWith(
        { job: LoggingJob, queue: "default" },
        async () => await LoggingJob.performLater({ keyword: "sym" }),
      );
      expect(job).toBeExactInstanceOf(LoggingJob);
      expect(await job.scheduledAt).toBeNull();
      expect(await job.arguments).toEqualRuby([{ keyword: "sym" }]);
      expect(await job.queueName).toEqual("default");
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with without block returns",
    async ({ testCase }) => {
      await LoggingJob.performLater({ keyword: "sym" });
      await testCase.performEnqueuedJobs();
      let job = await testCase.assertPerformedWith({ job: LoggingJob, queue: "default" });
      expect(job).toBeExactInstanceOf(LoggingJob);
      expect(await job.scheduledAt).toBeNull();
      expect(await job.arguments).toEqualRuby([{ keyword: "sym" }]);
      expect(await job.queueName).toEqual("default");
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with failure",
    async ({ testCase }) => {
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedWith(
            { job: LoggingJob },
            async () => await HelloJob.performLater(),
          ),
      );
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedWith(
            { job: HelloJob, queue: "low" },
            async () => await HelloJob.set({ queue: "important" }).performLater(),
          ),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with without block failure",
    async ({ testCase }) => {
      await HelloJob.performLater();
      await testCase.performEnqueuedJobs();
      await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertPerformedWith({ job: LoggingJob }),
      );
      await HelloJob.set({ queue: "important" }).performLater();
      await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertPerformedWith({ job: HelloJob, queue: "low" }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed job with priority option",
    async ({ testCase }) => {
      await testCase.assertPerformedWith(
        { job: HelloJob, priority: 10 },
        async () => await HelloJob.set({ priority: 10 }).performLater(),
      );
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedWith(
            { job: HelloJob, priority: 10 },
            async () => await HelloJob.set({ priority: 5 }).performLater(),
          ),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with with at option",
    async ({ testCase }) => {
      await testCase.assertPerformedWith(
        { job: HelloJob, at: await noon(await tomorrow()) },
        async () => await HelloJob.set({ waitUntil: await noon(await tomorrow()) }).performLater(),
      );
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedWith(
            { job: HelloJob, at: await noon(await RubyDate.today()) },
            async () =>
              await HelloJob.set({ waitUntil: await noon(await tomorrow()) }).performLater(),
          ),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with with relative at option",
    async ({ testCase }) => {
      await testCase.assertPerformedWith(
        { job: HelloJob, at: await (await Duration.minutes(5)).fromNow() },
        async () => await HelloJob.set({ wait: await Duration.minutes(5) }).performLater(),
      );
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedWith(
            { job: HelloJob, at: await (await Duration.minutes(2)).fromNow() },
            async () => await HelloJob.set({ wait: await Duration.minutes(1) }).performLater(),
          ),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with without block with at option",
    async ({ testCase }) => {
      await HelloJob.set({ waitUntil: await noon(await tomorrow()) }).performLater();
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedWith({ job: HelloJob, at: await noon(await tomorrow()) });
      await HelloJob.set({ waitUntil: await noon(await tomorrow()) }).performLater();
      await testCase.performEnqueuedJobs();
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedWith({
            job: HelloJob,
            at: await noon(await RubyDate.today()),
          }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with with hash arg",
    async ({ testCase }) => {
      await testCase.assertPerformedWith(
        { job: MultipleKwargsJob, args: [{ argument1: 1, argument2: { a: 1, b: 2 } }] },
        async () =>
          await MultipleKwargsJob.performLater({ argument2: { b: 2, a: 1 }, argument1: 1 }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with supports matcher procs",
    async ({ testCase }) => {
      let facets = {
        job: HelloJob,
        args: ["Rails"],
        at: await noon(await tomorrow()),
        queue: "important",
      };
      await (
        await facets[":job"].set({ queue: facets[":queue"], waitUntil: facets[":at"] })
      ).performLater(
        ...((x) => (x == null ? [] : Array.isArray(x) ? (x as unknown[]) : [x]))(facets[":args"]),
      );
      await testCase.performEnqueuedJobs();
      for (const [facet, value] of Object.entries(facets)) {
        let matcher = (jobValue?: unknown) => jobValue === value;
        let refuser = (jobValue?: unknown) => false;
        await testCase.assertPerformedWith({ ...{ [facet]: matcher } });
        await assertRaises(
          [Assertion],
          {},
          async () => await testCase.assertPerformedWith({ ...{ [facet]: refuser } }),
        );
      }
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with time",
    async ({ testCase }) => {
      let now = RubyTime.now();
      let args = [{ argument1: { now: now }, argument2: now }];
      await testCase.assertPerformedWith(
        { job: MultipleKwargsJob, args: args },
        async () =>
          await MultipleKwargsJob.performLater({ argument1: { now: now }, argument2: now }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with date time",
    async ({ testCase }) => {
      let now = await RubyDateTime.now();
      let args = [{ argument1: { now: now }, argument2: now }];
      await testCase.assertPerformedWith(
        { job: MultipleKwargsJob, args: args },
        async () =>
          await MultipleKwargsJob.performLater({ argument1: { now: now }, argument2: now }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with time with zone",
    async ({ testCase }) => {
      let now = await RubyTime.now().inTimeZone("Tokyo");
      let args = [{ argument1: { now: now }, argument2: now }];
      await testCase.assertPerformedWith(
        { job: MultipleKwargsJob, args: args },
        async () =>
          await MultipleKwargsJob.performLater({ argument1: { now: now }, argument2: now }),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with with global id args",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      await testCase.assertPerformedWith(
        { job: HelloJob, args: [ricardo] },
        async () => await HelloJob.performLater(ricardo),
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with without block with global id args",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      await HelloJob.performLater(ricardo);
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedWith({ job: HelloJob, args: [ricardo] });
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with failure with global id args",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      let wilma = new Person(11);
      let error = await assertRaises(
        [Assertion],
        {},
        async () =>
          await testCase.assertPerformedWith(
            { job: HelloJob, args: [wilma] },
            async () => await HelloJob.performLater(ricardo),
          ),
      );
      expect(await error.message).toMatch(
        `No performed job found with ${rbInspect({ job: HelloJob, args: [wilma] })}`,
      );
      expect(await error.message).toMatch(/Potential matches:.*Person.* @id="9"/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with without block failure with global id args",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      let wilma = new Person(11);
      await HelloJob.performLater(ricardo);
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertPerformedWith({ job: HelloJob, args: [wilma] }),
      );
      expect(await error.message).toMatch(
        `No performed job found with ${rbInspect({ job: HelloJob, args: [wilma] })}`,
      );
      expect(await error.message).toMatch(/Potential matches:.*Person.* @id="9"/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed says no jobs performed",
    async ({ testCase }) => {
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertPerformedWith({ job: HelloJob, args: [] }),
      );
      expect(await error.message).toMatch(
        `No performed job found with ${rbInspect({ job: HelloJob, args: [] })}`,
      );
      expect(await error.message).toMatch(/No jobs were performed/);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed when not matching the class shows alteratives",
    async ({ testCase }) => {
      let ricardo = new Person(9);
      let wilma = new Person(11);
      await HelloJob.performLater(ricardo);
      await testCase.performEnqueuedJobs();
      let error = await assertRaises(
        [Assertion],
        {},
        async () => await testCase.assertPerformedWith({ job: MultipleKwargsJob, args: [wilma] }),
      );
      expect(await error.message).toMatch(
        /No performed job found with .*MultipleKwargsJob.*\[#<Person.* @id=11>\]}/,
      );
      expect(await error.message).toMatch(
        /No jobs of class MultipleKwargsJob were performed, job classes performed: HelloJob/,
      );
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with does not change jobs count",
    async ({ testCase }) => {
      await testCase.assertPerformedWith(
        { job: HelloJob },
        async () => await HelloJob.performLater(),
      );
      await testCase.assertPerformedWith(
        { job: HelloJob },
        async () => await HelloJob.performLater(),
      );
      expect(await (await testCase.queueAdapter().enqueuedJobs).length).toEqual(0);
      expect(await (await testCase.queueAdapter().performedJobs).length).toEqual(2);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "assert performed with without block does not change jobs count",
    async ({ testCase }) => {
      await HelloJob.performLater();
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedWith({ job: HelloJob });
      await HelloJob.performLater();
      await testCase.performEnqueuedJobs();
      await testCase.assertPerformedWith({ job: HelloJob });
      expect(await (await testCase.queueAdapter().enqueuedJobs).length).toEqual(0);
      expect(await (await testCase.queueAdapter().performedJobs).length).toEqual(2);
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "perform_enqueued_jobs doesn't raise if discard_on ActiveJob::DeserializationError",
    async ({ testCase }) => {
      await RetryJob.performLater(new Person(404), 1);
      await expect(
        (async () => await testCase.performEnqueuedJobs({ only: RetryJob }))(),
      ).resolves.not.toThrow();
    },
  );

  it.skipIf(!isAdapterIs("test"))<{ testCase: PerformedJobsTest }>(
    "TestAdapter respect max attempts",
    async ({ testCase }) => {
      await testCase.performEnqueuedJobs(
        { only: RaisingJob },
        async () => await assertRaises([MyError], {}, async () => await RaisingJob.performLater()),
      );
      expect(await (await testCase.queueAdapter().performedJobs).length).toEqual(2);
    },
  );
});
class NotTestAdapterTest extends TestCase {
  declare _adapter: unknown;
}

registerConstant("NotTestAdapterTest", NotTestAdapterTest);
include(NotTestAdapterTest, TestHelper);

describe("NotTestAdapterTest", () => {
  beforeEach<{ testCase: NotTestAdapterTest }>(async ({ testCase }) => {
    await testCase.setup();
  });

  afterEach<{ testCase: NotTestAdapterTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });

  if (!isAdapterIs("test")) {
    beforeEach<{ testCase: NotTestAdapterTest }>(async ({ testCase }) => {
      testCase._adapter = await ((x) =>
        Object.hasOwn(x, "toString") ? String(x) : x.name || null)(
        await testCase.queueAdapter().constructor,
      );
    });
  }

  it.skipIf(!!isAdapterIs("test"))<{ testCase: NotTestAdapterTest }>(
    "assert_enqueued_jobs raises",
    async ({ testCase }) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertEnqueuedJobs(0, undefined, () => {});
      });
    },
  );

  it.skipIf(!!isAdapterIs("test"))<{ testCase: NotTestAdapterTest }>(
    "assert_no_enqueued_jobs raises",
    async ({ testCase }) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertNoEnqueuedJobs(undefined, () => {});
      });
    },
  );

  it.skipIf(!!isAdapterIs("test"))<{ testCase: NotTestAdapterTest }>(
    "assert_performed_jobs raises",
    async ({ testCase }) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertPerformedJobs(0, undefined, () => {});
      });
    },
  );

  it.skipIf(!!isAdapterIs("test"))<{ testCase: NotTestAdapterTest }>(
    "assert_no_performed_jobs raises",
    async ({ testCase }) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertNoPerformedJobs(undefined, () => {});
      });
    },
  );

  it.skipIf(!!isAdapterIs("test"))<{ testCase: NotTestAdapterTest }>(
    "assert_enqueued_with raises",
    async ({ testCase }) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertEnqueuedWith(undefined, () => {});
      });
    },
  );

  it.skipIf(!!isAdapterIs("test"))<{ testCase: NotTestAdapterTest }>(
    "assert_performed_with raises",
    async ({ testCase }) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await testCase.assertPerformedWith(undefined, () => {});
      });
    },
  );

  it.skipIf(!!isAdapterIs("test"))<{ testCase: NotTestAdapterTest }>(
    "perform_enqueued_jobs without a block",
    async ({ testCase }) => {
      await assertRaises([ArgumentError], {}, async () => await testCase.performEnqueuedJobs());
    },
  );

  it.skipIf(!!isAdapterIs("test"))<{ testCase: NotTestAdapterTest }>(
    "perform_enqueued_jobs with a block does not raise",
    async ({ testCase }) => {
      await expect(
        (async () => {
          return await testCase.performEnqueuedJobs(undefined, () => {});
        })(),
      ).resolves.not.toThrow();
    },
  );
});
class AdapterIsNotTestAdapterTest extends TestCase {
  queueAdapterForTest() {
    return new InlineAdapter();
  }
}

registerConstant("AdapterIsNotTestAdapterTest", AdapterIsNotTestAdapterTest);
include(AdapterIsNotTestAdapterTest, TestHelper);

describe("AdapterIsNotTestAdapterTest", () => {
  beforeEach<{ testCase: AdapterIsNotTestAdapterTest }>(async ({ testCase }) => {
    await testCase.setup();
  });
  afterEach<{ testCase: AdapterIsNotTestAdapterTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });
  it<{ testCase: AdapterIsNotTestAdapterTest }>("perform enqueued jobs just yields", async ({
    testCase,
  }) => {
    JobBuffer.clear();
    await testCase.performEnqueuedJobs(undefined, async () => await HelloJob.performLater("kevin"));
    expect(await JobBuffer.values().length).toEqual(1);
  });
});
class OverrideQueueAdapterTest extends TestCase {
  queueAdapterForTest() {
    return new CustomQueueAdapter();
  }
}

registerConstant("OverrideQueueAdapterTest", OverrideQueueAdapterTest);
include(OverrideQueueAdapterTest, TestHelper);

describe("OverrideQueueAdapterTest", () => {
  beforeEach<{ testCase: OverrideQueueAdapterTest }>(async ({ testCase }) => {
    await testCase.setup();
  });
  afterEach<{ testCase: OverrideQueueAdapterTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });
  it<{ testCase: OverrideQueueAdapterTest }>("assert job has custom queue adapter set", async ({
    testCase,
  }) => {
    expect(await HelloJob.queueAdapter).toBeExactInstanceOf(CustomQueueAdapter);
  });
});
export class CustomQueueAdapter extends TestAdapter {
  static toString(): string {
    return "OverrideQueueAdapterTest::CustomQueueAdapter";
  }
}
registerConstant("OverrideQueueAdapterTest::CustomQueueAdapter", CustomQueueAdapter);
class InheritedJobTest extends TestCase {}
registerConstant("InheritedJobTest", InheritedJobTest);
include(InheritedJobTest, TestHelper);

describe("InheritedJobTest", () => {
  beforeEach<{ testCase: InheritedJobTest }>(async ({ testCase }) => {
    await testCase.setup();
  });
  afterEach<{ testCase: InheritedJobTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });
  it<{
    testCase: InheritedJobTest;
  }>("queue adapter is inline adapter because it is set on the job class", async ({ testCase }) => {
    expect(await InheritedJob.queueAdapter).toBeExactInstanceOf(InlineAdapter);
  });
});
class QueueAdapterJobTest extends TestCase {}
registerConstant("QueueAdapterJobTest", QueueAdapterJobTest);
include(QueueAdapterJobTest, TestHelper);

describe("QueueAdapterJobTest", () => {
  beforeEach<{ testCase: QueueAdapterJobTest }>(async ({ testCase }) => {
    await testCase.setup();
  });

  afterEach<{ testCase: QueueAdapterJobTest }>(async ({ testCase }) => {
    await testCase.teardown();
  });

  // PERMANENT-SKIP: CLAUDE.md "Trails has no autoloader (`Rails.autoloaders` / Zeitwerk)"
  it.skip<{
    testCase: QueueAdapterJobTest;
  }>("queue adapter is is inline adapter because it is set on the job class", async ({
    testCase,
  }) => {
    await declined("test/cases/test_helper_test.rb:0", "const-unresolved", "Zeitwerk").withLoader(
      async (loader: unknown) => {
        try {
          await loader.pushDir("test/jobs");
          await loader.setup();
          return await expect(
            await declined(
              "test/cases/test_helper_test.rb:0",
              "const-unresolved",
              "QueueAdapterJob",
            ).queueAdapter(),
          ).toBeExactInstanceOf(InlineAdapter);
        } finally {
          await loader.unload();
        }
      },
    );
  });
});
