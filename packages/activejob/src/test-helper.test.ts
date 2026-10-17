// @ts-nocheck
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
  Module,
  registerConstant,
  include,
  fetch,
  rbModName,
  rbEqual,
  ArgumentError,
  rbInspect,
  rbFSend,
  rational,
  NotImplementedError,
  rbObjClass,
} from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { declined } from "./codegen-declined.js";
import {
  times,
  rbToF,
  rbAryEnsure,
  rbEntries,
  TestHost,
  rbBinop,
  rbSize,
} from "./codegen-runtime.js";
import { InlineAdapter } from "./queue-adapters/inline-adapter.js";
import { TestAdapter } from "./queue-adapters/test-adapter.js";
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
import { clear, values } from "./test-helpers/support/job-buffer.js";
import { describe, it, expect, beforeEach, afterEach } from "vitest";

export const DoNotPerformEnqueuedJobs: any = new Module();
extend(DoNotPerformEnqueuedJobs, Concern);
DoNotPerformEnqueuedJobs.included(null, function (this: any): void {
  const base = this;
  base.setup(function (this: any) {
    this._performEnqueuedJobs = this.queueAdapter().performEnqueuedJobs;
    this._performEnqueuedAtJobs = this.queueAdapter().performEnqueuedAtJobs;
    this.queueAdapter().performEnqueuedJobs = this.queueAdapter().performEnqueuedAtJobs = false;
    return this.queueAdapter().performEnqueuedJobs;
  });
  base.teardown(function (this: any) {
    this.queueAdapter().performEnqueuedJobs = this._performEnqueuedJobs;
    this.queueAdapter().performEnqueuedAtJobs = this._performEnqueuedAtJobs;
    return this.queueAdapter().performEnqueuedAtJobs;
  });
});
registerConstant("DoNotPerformEnqueuedJobs", DoNotPerformEnqueuedJobs);
describe("EnqueuedJobsTest", () => {
  class EnqueuedJobsTest extends TestHost {}
  registerConstant("EnqueuedJobsTest", EnqueuedJobsTest);
  include(EnqueuedJobsTest, TestHelper);
  include(EnqueuedJobsTest, DoNotPerformEnqueuedJobs);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  const run = isAdapterIs("test");
  {
    (run ? it : it.skip)("assert enqueued jobs", async ({ testCase }: any) => {
      await expect(
        (async () =>
          await await testCase.assertEnqueuedJobs(
            1,
            undefined,
            async () => await await HelloJob.performLater("david"),
          ))(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)("repeated enqueued jobs calls", async ({ testCase }: any) => {
      await expect(
        (async () =>
          await await testCase.assertEnqueuedJobs(
            1,
            undefined,
            async () => await await HelloJob.performLater("abdelkader"),
          ))(),
      ).resolves.not.toThrow();
      await expect(
        (async () => {
          return await await testCase.assertEnqueuedJobs(2, undefined, async () => {
            await await HelloJob.performLater("sean");
            return await await HelloJob.performLater("yves");
          });
        })(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)("assert enqueued jobs message", async ({ testCase }: any) => {
      await await HelloJob.performLater("sean");
      const e: any = await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertEnqueuedJobs(
            2,
            undefined,
            async () => await await HelloJob.performLater("sean"),
          ),
      );
      expect(await e.message).toMatch("Expected: 2");
      expect(await e.message).toMatch("Actual: 1");
    });
    (run ? it : it.skip)("assert enqueued jobs with no block", async ({ testCase }: any) => {
      await expect(
        (async () => {
          await await HelloJob.performLater("rafael");
          return await await testCase.assertEnqueuedJobs(1);
        })(),
      ).resolves.not.toThrow();
      await expect(
        (async () => {
          await await HelloJob.performLater("aaron");
          await await HelloJob.performLater("matthew");
          return await await testCase.assertEnqueuedJobs(3);
        })(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)("assert no enqueued jobs with no block", async ({ testCase }: any) => {
      await expect(
        (async () => await await testCase.assertNoEnqueuedJobs())(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)("assert no enqueued jobs", async ({ testCase }: any) => {
      await expect(
        (async () =>
          await await testCase.assertNoEnqueuedJobs(
            undefined,
            async () => await await HelloJob.performNow(),
          ))(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)("assert enqueued jobs too few sent", async ({ testCase }: any) => {
      const error: any = await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertEnqueuedJobs(
            2,
            undefined,
            async () => await await HelloJob.performLater("xavier"),
          ),
      );
      expect(await error.message).toMatch(/2 .* but 1/);
    });
    (run ? it : it.skip)("assert enqueued jobs too many sent", async ({ testCase }: any) => {
      const error: any = await assertRaises([Assertion], {}, async () => {
        return await await testCase.assertEnqueuedJobs(1, undefined, async () => {
          await await HelloJob.performLater("cristian");
          return await await HelloJob.performLater("guillermo");
        });
      });
      expect(await error.message).toMatch(/1 .* but 2/);
    });
    (run ? it : it.skip)("assert no enqueued jobs failure", async ({ testCase }: any) => {
      const error: any = await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertNoEnqueuedJobs(
            undefined,
            async () => await await HelloJob.performLater("jeremy"),
          ),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    });
    (run ? it : it.skip)("assert enqueued jobs with only option", async ({ testCase }: any) => {
      await expect(
        (async () => {
          return await await testCase.assertEnqueuedJobs(1, { only: HelloJob }, async () => {
            await await HelloJob.performLater("jeremy");
            await await LoggingJob.performLater();
            return await await LoggingJob.performLater();
          });
        })(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)(
      "assert enqueued jobs with only option as proc",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertEnqueuedJobs(
              1,
              { only: (job?: any) => rbEqual(rbModName(fetch(job, "job")), "HelloJob") },
              async () => {
                await await HelloJob.performLater("jeremy");
                await await LoggingJob.performLater();
                return await await LoggingJob.performLater();
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)("assert enqueued jobs with except option", async ({ testCase }: any) => {
      await expect(
        (async () => {
          return await await testCase.assertEnqueuedJobs(1, { except: LoggingJob }, async () => {
            await await HelloJob.performLater("jeremy");
            await await LoggingJob.performLater();
            return await await LoggingJob.performLater();
          });
        })(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)(
      "assert enqueued jobs with except option as proc",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertEnqueuedJobs(
              1,
              { except: (job?: any) => rbEqual(rbModName(fetch(job, "job")), "LoggingJob") },
              async () => {
                await await HelloJob.performLater("jeremy");
                await await LoggingJob.performLater();
                return await await LoggingJob.performLater();
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only and except option",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          return await await testCase.assertEnqueuedJobs(
            1,
            { only: HelloJob, except: HelloJob },
            async () => {
              await await HelloJob.performLater("jeremy");
              await await LoggingJob.performLater();
              return await await LoggingJob.performLater();
            },
          );
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only and queue option",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertEnqueuedJobs(
              1,
              { only: HelloJob, queue: "some_queue" },
              async () => {
                await await (await HelloJob.set({ queue: "some_queue" })).performLater();
                await await (await HelloJob.set({ queue: "other_queue" })).performLater();
                return await await LoggingJob.performLater();
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with except and queue option",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertEnqueuedJobs(
              1,
              { except: LoggingJob, queue: "some_queue" },
              async () => {
                await await (await HelloJob.set({ queue: "some_queue" })).performLater();
                await await (await HelloJob.set({ queue: "other_queue" })).performLater();
                return await await LoggingJob.performLater();
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only and except and queue option",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          return await await testCase.assertEnqueuedJobs(
            1,
            { only: HelloJob, except: HelloJob, queue: "some_queue" },
            async () => {
              await await (await HelloJob.set({ queue: "some_queue" })).performLater();
              await await (await HelloJob.set({ queue: "other_queue" })).performLater();
              return await await LoggingJob.performLater();
            },
          );
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)("assert enqueued jobs with queue option", async ({ testCase }: any) => {
      await expect(
        (async () => {
          return await await testCase.assertEnqueuedJobs(2, { queue: "default" }, async () => {
            await await HelloJob.performLater();
            await await LoggingJob.performLater();
            await await (await HelloJob.set({ queue: "other_queue" })).performLater();
            return await await (await LoggingJob.set({ queue: "other_queue" })).performLater();
          });
        })(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)("assert enqueued job with priority option", async ({ testCase }: any) => {
      await await testCase.assertEnqueuedWith(
        { job: HelloJob, priority: 10 },
        async () => await await (await HelloJob.set({ priority: 10 })).performLater(),
      );
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertEnqueuedWith(
            { job: HelloJob, priority: 10 },
            async () => await await (await HelloJob.set({ priority: 5 })).performLater(),
          ),
      );
    });
    (run ? it : it.skip)(
      "assert enqueued jobs with only option and none sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertEnqueuedJobs(
              1,
              { only: HelloJob },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with except option and none sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertEnqueuedJobs(
              1,
              { except: LoggingJob },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only and except option and none sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [ArgumentError],
          {},
          async () =>
            await await testCase.assertEnqueuedJobs(
              1,
              { only: HelloJob, except: HelloJob },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only option and too few sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertEnqueuedJobs(5, { only: HelloJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await times(4, async () => await await LoggingJob.performLater());
          });
        });
        expect(await error.message).toMatch(/5 .* but 1/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with except option and too few sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertEnqueuedJobs(5, { except: LoggingJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await times(4, async () => await await LoggingJob.performLater());
          });
        });
        expect(await error.message).toMatch(/5 .* but 1/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only and except option and too few sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          return await await testCase.assertEnqueuedJobs(
            5,
            { only: HelloJob, except: HelloJob },
            async () => {
              await await HelloJob.performLater("jeremy");
              return await times(4, async () => await await LoggingJob.performLater());
            },
          );
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only option and too many sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertEnqueuedJobs(
              1,
              { only: HelloJob },
              async () => await times(2, async () => await await HelloJob.performLater("jeremy")),
            ),
        );
        expect(await error.message).toMatch(/1 .* but 2/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with except option and too many sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertEnqueuedJobs(
              1,
              { except: LoggingJob },
              async () => await times(2, async () => await await HelloJob.performLater("jeremy")),
            ),
        );
        expect(await error.message).toMatch(/1 .* but 2/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only and except option and too many sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [ArgumentError],
          {},
          async () =>
            await await testCase.assertEnqueuedJobs(
              1,
              { only: HelloJob, except: HelloJob },
              async () => await times(2, async () => await await HelloJob.performLater("jeremy")),
            ),
        );
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only option as array",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertEnqueuedJobs(
              2,
              { only: [HelloJob, LoggingJob] },
              async () => {
                await await HelloJob.performLater("jeremy");
                await await LoggingJob.performLater("stewie");
                return await await RescueJob.performLater("david");
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with except option as array",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertEnqueuedJobs(
              1,
              { except: [HelloJob, LoggingJob] },
              async () => {
                await await HelloJob.performLater("jeremy");
                await await LoggingJob.performLater("stewie");
                return await await RescueJob.performLater("david");
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert enqueued jobs with only and except option as array",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          return await await testCase.assertEnqueuedJobs(
            2,
            { only: [HelloJob, LoggingJob], except: [HelloJob, LoggingJob] },
            async () => {
              await await HelloJob.performLater("jeremy");
              await await LoggingJob.performLater("stewie");
              return await await RescueJob.performLater("david");
            },
          );
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)("assert no enqueued jobs with only option", async ({ testCase }: any) => {
      await expect(
        (async () =>
          await await testCase.assertNoEnqueuedJobs(
            { only: HelloJob },
            async () => await await LoggingJob.performLater(),
          ))(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)(
      "assert no enqueued jobs with except option",
      async ({ testCase }: any) => {
        await expect(
          (async () =>
            await await testCase.assertNoEnqueuedJobs(
              { except: LoggingJob },
              async () => await await LoggingJob.performLater(),
            ))(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with only and except option",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [ArgumentError],
          {},
          async () =>
            await await testCase.assertNoEnqueuedJobs(
              { only: HelloJob, except: HelloJob },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with only option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertNoEnqueuedJobs({ only: HelloJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await await LoggingJob.performLater();
          });
        });
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with except option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertNoEnqueuedJobs({ except: LoggingJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await await LoggingJob.performLater();
          });
        });
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with only and except option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          return await await testCase.assertNoEnqueuedJobs(
            { only: HelloJob, except: HelloJob },
            async () => {
              await await HelloJob.performLater("jeremy");
              return await await LoggingJob.performLater();
            },
          );
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with only option as array",
      async ({ testCase }: any) => {
        await expect(
          (async () =>
            await await testCase.assertNoEnqueuedJobs(
              { only: [HelloJob, RescueJob] },
              async () => await await LoggingJob.performLater(),
            ))(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with except option as array",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertNoEnqueuedJobs(
              { except: [HelloJob, RescueJob] },
              async () => {
                await await HelloJob.performLater();
                return await await RescueJob.performLater();
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with only and except option as array",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [ArgumentError],
          {},
          async () =>
            await await testCase.assertNoEnqueuedJobs(
              { only: [HelloJob, RescueJob], except: [HelloJob, RescueJob] },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)("assert no enqueued jobs with queue option", async ({ testCase }: any) => {
      await expect(
        (async () => {
          return await await testCase.assertNoEnqueuedJobs({ queue: "default" }, async () => {
            await await (await HelloJob.set({ queue: "other_queue" })).performLater();
            return await await (await LoggingJob.set({ queue: "other_queue" })).performLater();
          });
        })(),
      ).resolves.not.toThrow();
    });
    (run ? it : it.skip)(
      "assert no enqueued jobs with queue option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertNoEnqueuedJobs(
              { queue: "other_queue" },
              async () => await await (await HelloJob.set({ queue: "other_queue" })).performLater(),
            ),
        );
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with only and queue option",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertNoEnqueuedJobs(
              { only: HelloJob, queue: "some_queue" },
              async () => {
                await await (await HelloJob.set({ queue: "other_queue" })).performLater();
                await await (await HelloJob.set({ queue: "other_queue" })).performLater();
                return await await (await LoggingJob.set({ queue: "some_queue" })).performLater();
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with only and queue option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertNoEnqueuedJobs(
            { only: HelloJob, queue: "some_queue" },
            async () => {
              await await (await HelloJob.set({ queue: "other_queue" })).performLater();
              await await (await HelloJob.set({ queue: "some_queue" })).performLater();
              return await await (await LoggingJob.set({ queue: "some_queue" })).performLater();
            },
          );
        });
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with except and queue option",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertNoEnqueuedJobs(
              { except: LoggingJob, queue: "some_queue" },
              async () => {
                await await (await HelloJob.set({ queue: "other_queue" })).performLater();
                await await (await HelloJob.set({ queue: "other_queue" })).performLater();
                return await await (await LoggingJob.set({ queue: "some_queue" })).performLater();
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with except and queue option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertNoEnqueuedJobs(
            { except: LoggingJob, queue: "some_queue" },
            async () => {
              await await (await HelloJob.set({ queue: "other_queue" })).performLater();
              await await (await HelloJob.set({ queue: "some_queue" })).performLater();
              return await await (await LoggingJob.set({ queue: "some_queue" })).performLater();
            },
          );
        });
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run ? it : it.skip)(
      "assert no enqueued jobs with only and except and queue option",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [ArgumentError],
          {},
          async () =>
            await await testCase.assertNoEnqueuedJobs(
              { only: HelloJob, except: HelloJob, queue: "some_queue" },
              async () => await await (await HelloJob.set({ queue: "other_queue" })).performLater(),
            ),
        );
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run ? it : it.skip)("assert enqueued with", async ({ testCase }: any) => {
      await await testCase.assertEnqueuedWith(
        { job: LoggingJob, queue: "default" },
        async () =>
          await await (
            await LoggingJob.set({ waitUntil: await noon(await tomorrow()) })
          ).performLater(),
      );
    });
    (run ? it : it.skip)("assert enqueued with with no block", async ({ testCase }: any) => {
      await await (
        await LoggingJob.set({ waitUntil: await noon(await tomorrow()) })
      ).performLater();
      await await testCase.assertEnqueuedWith({ job: LoggingJob, queue: "default" });
    });
    (run ? it : it.skip)(
      "assert enqueued with when queue name is symbol",
      async ({ testCase }: any) => {
        await await testCase.assertEnqueuedWith(
          { job: LoggingJob, queue: "default" },
          async () =>
            await await (
              await LoggingJob.set({ waitUntil: await noon(await tomorrow()) })
            ).performLater(),
        );
      },
    );
    (run ? it : it.skip)("assert no enqueued jobs and perform now", async ({ testCase }: any) => {
      await await testCase.assertNoEnqueuedJobs(
        undefined,
        async () => await await LoggingJob.performNow(1, 2, 3, { keyword: true }),
      );
    });
    (run ? it : it.skip)("assert enqueued with returns", async ({ testCase }: any) => {
      const job: any = await await testCase.assertEnqueuedWith(
        { job: LoggingJob },
        async () =>
          await await (
            await LoggingJob.set({ waitUntil: await (await Duration.minutes(5)).fromNow() })
          ).performLater(1, 2, 3, { keyword: true }),
      );
      expect(job).toBeInstanceOf(LoggingJob);
      await testCase.assertInDelta(
        await rbToF(await (await Duration.minutes(5)).fromNow()),
        await rbToF(await job.scheduledAt),
        1,
      );
      expect(await job.queueName).toEqual("default");
      expect(await job.arguments).toEqual([1, 2, 3, { keyword: true }]);
    });
    (run ? it : it.skip)(
      "assert enqueued with with no block returns",
      async ({ testCase }: any) => {
        await await (
          await LoggingJob.set({ waitUntil: await (await Duration.minutes(5)).fromNow() })
        ).performLater(1, 2, 3, { keyword: true });
        const job: any = await await testCase.assertEnqueuedWith({ job: LoggingJob });
        expect(job).toBeInstanceOf(LoggingJob);
        await testCase.assertInDelta(
          await rbToF(await (await Duration.minutes(5)).fromNow()),
          await rbToF(await job.scheduledAt),
          1,
        );
        expect(await job.queueName).toEqual("default");
        expect(await job.arguments).toEqual([1, 2, 3, { keyword: true }]);
      },
    );
    (run ? it : it.skip)("assert enqueued with failure", async ({ testCase }: any) => {
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertEnqueuedWith(
            { job: LoggingJob, queue: "default" },
            async () => await await NestedJob.performLater(),
          ),
      );
      await assertRaises([Assertion], {}, async () => {
        await await LoggingJob.performLater();
        return await await testCase.assertEnqueuedWith({ job: LoggingJob }, () => {});
      });
      const error: any = await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertEnqueuedWith(
            { job: NestedJob, queue: "low" },
            async () => await await NestedJob.performLater(),
          ),
      );
      expect(await error.message).toMatch(
        `No enqueued job found with ${rbInspect({ job: NestedJob, queue: "low" })}`,
      );
    });
    (run ? it : it.skip)(
      "assert enqueued with with no block failure",
      async ({ testCase }: any) => {
        await assertRaises([Assertion], {}, async () => {
          await await NestedJob.performLater();
          return await await testCase.assertEnqueuedWith({ job: LoggingJob, queue: "default" });
        });
        const error: any = await assertRaises([Assertion], {}, async () => {
          await await NestedJob.performLater();
          return await await testCase.assertEnqueuedWith({ job: NestedJob, queue: "low" });
        });
        expect(await error.message).toMatch(
          `No enqueued job found with ${rbInspect({ job: NestedJob, queue: "low" })}`,
        );
      },
    );
    (run ? it : it.skip)("assert enqueued with args", async ({ testCase }: any) => {
      await assertRaises(
        [ArgumentError],
        {},
        async () =>
          await await testCase.assertEnqueuedWith(
            { class: LoggingJob },
            async () =>
              await await (
                await NestedJob.set({ waitUntil: await noon(await tomorrow()) })
              ).performLater(),
          ),
      );
    });
    (run ? it : it.skip)(
      "assert enqueued with supports matcher procs",
      async ({ testCase }: any) => {
        const facets: any = {
          job: HelloJob,
          args: ["Rails"],
          at: await noon(await tomorrow()),
          queue: "important",
        };
        await await (
          await (
            await facets["job"]
          ).set({ queue: await facets["queue"], waitUntil: await facets["at"] })
        ).performLater(...rbAryEnsure(await facets["args"]));
        for (const [facet, value] of rbEntries(facets)) {
          const matcher: any = async (jobValue?: any) => await rbEqual(jobValue, value);
          const refuser: any = (jobValue?: any) => false;
          await await testCase.assertEnqueuedWith({ ...{ [facet]: matcher } });
          await assertRaises(
            [Assertion],
            {},
            async () => await await testCase.assertEnqueuedWith({ ...{ [facet]: refuser } }),
          );
        }
      },
    );
    (run ? it : it.skip)("assert enqueued with time", async ({ testCase }: any) => {
      const now: any = await RubyTime.now();
      const args: any = [{ argument1: [now] }];
      await await testCase.assertEnqueuedWith(
        { job: MultipleKwargsJob, args: args },
        async () => await await MultipleKwargsJob.performLater({ argument1: [now] }),
      );
    });
    (run ? it : it.skip)("assert enqueued with date time", async ({ testCase }: any) => {
      const now: any = await RubyDateTime.now();
      const args: any = [{ argument1: [now] }];
      await await testCase.assertEnqueuedWith(
        { job: MultipleKwargsJob, args: args },
        async () => await await MultipleKwargsJob.performLater({ argument1: [now] }),
      );
    });
    (run ? it : it.skip)("assert enqueued with time with zone", async ({ testCase }: any) => {
      const now: any = await rbFSend(await RubyTime.now(), "inTimeZone", "Tokyo");
      const args: any = [{ argument1: [now] }];
      await await testCase.assertEnqueuedWith(
        { job: MultipleKwargsJob, args: args },
        async () => await await MultipleKwargsJob.performLater({ argument1: [now] }),
      );
    });
    (run ? it : it.skip)(
      "assert enqueued with time and time precision",
      async ({ testCase }: any) => {
        const timeWithZone: any = new TimeWithZone(
          await RubyTime.utc(1999, 12, 31, 23, 59, await rational(59123456789n, 1000000000n)),
          await TimeZone.find("Tokyo"),
        );
        const time: any = await RubyTime.at(946702800, 1234567, "nanosecond");
        const dateTime: any = new RubyDateTime(2001, 2, 3, 4, 5, 6.123456, "+03:00");
        const args: any = [{ argument1: [timeWithZone, time, dateTime] }];
        await await testCase.assertEnqueuedWith(
          { job: MultipleKwargsJob, args: args },
          async () =>
            await await MultipleKwargsJob.performLater({
              argument1: [timeWithZone, time, dateTime],
            }),
        );
      },
    );
    (run ? it : it.skip)("assert enqueued with with no block args", async ({ testCase }: any) => {
      await assertRaises([ArgumentError], {}, async () => {
        await await (
          await NestedJob.set({ waitUntil: await noon(await tomorrow()) })
        ).performLater();
        return await await testCase.assertEnqueuedWith({ class: LoggingJob });
      });
    });
    (run ? it : it.skip)("assert enqueued with with at option", async ({ testCase }: any) => {
      await await testCase.assertEnqueuedWith(
        { job: HelloJob, at: await noon(await tomorrow()) },
        async () =>
          await await (
            await HelloJob.set({ waitUntil: await noon(await tomorrow()) })
          ).performLater(),
      );
    });
    (run ? it : it.skip)(
      "assert enqueued with with relative at option",
      async ({ testCase }: any) => {
        await await testCase.assertEnqueuedWith(
          { job: HelloJob, at: await (await Duration.minutes(5)).fromNow() },
          async () =>
            await await (await HelloJob.set({ wait: await Duration.minutes(5) })).performLater(),
        );
      },
    );
    (run ? it : it.skip)(
      "assert enqueued with with no block with at option",
      async ({ testCase }: any) => {
        await await (
          await HelloJob.set({ waitUntil: await noon(await tomorrow()) })
        ).performLater();
        await await testCase.assertEnqueuedWith({
          job: HelloJob,
          at: await noon(await tomorrow()),
        });
      },
    );
    (run ? it : it.skip)(
      "assert enqueued with wait until with performed",
      async ({ testCase }: any) => {
        await await testCase.assertEnqueuedWith({ job: LoggingJob }, async () => {
          return await await testCase.performEnqueuedJobs({ only: HelloJob }, async () => {
            await await (
              await HelloJob.set({ waitUntil: await noon(await tomorrow()) })
            ).performLater("david");
            return await await (
              await LoggingJob.set({ waitUntil: await noon(await tomorrow()) })
            ).performLater("enqueue");
          });
        });
        await await testCase.assertEnqueuedJobs(1);
        await await testCase.assertPerformedJobs(1);
      },
    );
    (run ? it : it.skip)("assert enqueued with with hash arg", async ({ testCase }: any) => {
      await await testCase.assertEnqueuedWith(
        { job: MultipleKwargsJob, args: [{ argument1: 1, argument2: { a: 1, b: 2 } }] },
        async () =>
          await await MultipleKwargsJob.performLater({ argument2: { b: 2, a: 1 }, argument1: 1 }),
      );
    });
    (run ? it : it.skip)("assert enqueued with with global id args", async ({ testCase }: any) => {
      const ricardo: any = new Person(9);
      await await testCase.assertEnqueuedWith(
        { job: HelloJob, args: [ricardo] },
        async () => await await HelloJob.performLater(ricardo),
      );
    });
    (run ? it : it.skip)(
      "assert enqueued with with no block with global id args",
      async ({ testCase }: any) => {
        const ricardo: any = new Person(9);
        await await HelloJob.performLater(ricardo);
        await await testCase.assertEnqueuedWith({ job: HelloJob, args: [ricardo] });
      },
    );
    (run ? it : it.skip)(
      "assert enqueued with failure with global id args",
      async ({ testCase }: any) => {
        const ricardo: any = new Person(9);
        const wilma: any = new Person(11);
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertEnqueuedWith(
              { job: HelloJob, args: [wilma] },
              async () => await await HelloJob.performLater(ricardo),
            ),
        );
        expect(await error.message).toMatch(
          `No enqueued job found with ${rbInspect({ job: HelloJob, args: [wilma] })}`,
        );
        expect(await error.message).toMatch(/Potential matches:.*Person.* @id="9"/);
      },
    );
    (run ? it : it.skip)(
      "show jobs that are enqueued when job is not queued at all",
      async ({ testCase }: any) => {
        const ricardo: any = new Person(9);
        const wilma: any = new Person(11);
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertEnqueuedWith(
              { job: MultipleKwargsJob, args: [wilma] },
              async () => await await HelloJob.performLater(ricardo),
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
    (run ? it : it.skip)(
      "shows no jobs enqueued when there are no jobs",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertEnqueuedWith({ job: HelloJob, args: [] }, () => {});
        });
        expect(await error.message).toMatch(
          `No enqueued job found with ${rbInspect({ job: HelloJob, args: [] })}`,
        );
        expect(await error.message).toMatch(/No jobs were enqueued/);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued with failure with no block with global id args",
      async ({ testCase }: any) => {
        const ricardo: any = new Person(9);
        const wilma: any = new Person(11);
        const error: any = await assertRaises([Assertion], {}, async () => {
          await await HelloJob.performLater(ricardo);
          return await await testCase.assertEnqueuedWith({ job: HelloJob, args: [wilma] });
        });
        expect(await error.message).toMatch(
          `No enqueued job found with ${rbInspect({ job: HelloJob, args: [wilma] })}`,
        );
        expect(await error.message).toMatch(
          /Potential matches: {.*?HelloJob,.*\[#<Person.* @id="9">\].*?}/,
        );
      },
    );
    (run ? it : it.skip)(
      "assert enqueued with does not change jobs count",
      async ({ testCase }: any) => {
        await await HelloJob.performLater();
        await await testCase.assertEnqueuedWith(
          { job: HelloJob },
          async () => await await HelloJob.performLater(),
        );
        expect(await (await (await testCase.queueAdapter()).enqueuedJobs).length).toEqual(2);
      },
    );
    (run ? it : it.skip)(
      "assert enqueued with with no block does not change jobs count",
      async ({ testCase }: any) => {
        await await HelloJob.performLater();
        await await HelloJob.performLater();
        await await testCase.assertEnqueuedWith({ job: HelloJob });
        expect(await (await (await testCase.queueAdapter()).enqueuedJobs).length).toEqual(2);
      },
    );
    (run ? it : it.skip)("assert enqueued jobs with performed", async ({ testCase }: any) => {
      await await testCase.assertEnqueuedWith({ job: LoggingJob }, async () => {
        return await await testCase.performEnqueuedJobs({ only: HelloJob }, async () => {
          await await HelloJob.performLater("david");
          return await await LoggingJob.performLater("enqueue");
        });
      });
      await await testCase.assertEnqueuedJobs(1);
      await await testCase.assertPerformedJobs(1);
    });
  }
});
describe("QueueAdapterTest", () => {
  class QueueAdapterTest extends TestHost {
    queueAdapterForTest(): any {
      return new TestAdapter();
    }
  }
  registerConstant("QueueAdapterTest", QueueAdapterTest);
  include(QueueAdapterTest, TestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("assert_enqueued_with enqueues a job with a queue_adapter and queue_adapter_for_test", async ({
    testCase,
  }: any) => {
    await await testCase.assertEnqueuedWith(
      { job: JobWithAnAdapter },
      async () => await await JobWithAnAdapter.performLater(),
    );
  });
});
export class JobWithAnAdapter extends Base {
  [key: string]: any;
  static [key: string]: any;

  perform(): any {}
}
registerConstant("QueueAdapterTest::JobWithAnAdapter", JobWithAnAdapter);
{
  JobWithAnAdapter.setQueueAdapter("async");
}
describe("PerformedJobsTest", () => {
  class PerformedJobsTest extends TestHost {}
  registerConstant("PerformedJobsTest", PerformedJobsTest);
  include(PerformedJobsTest, TestHelper);
  include(PerformedJobsTest, DoNotPerformEnqueuedJobs);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  const run1 = isAdapterIs("test");
  {
    (run1 ? it : it.skip)(
      "perform enqueued jobs with only option doesnt leak outside the block",
      async ({ testCase }: any) => {
        expect((await (await testCase.queueAdapter()).filter) ?? null).toBeNull();
        await await testCase.performEnqueuedJobs({ only: HelloJob }, async () =>
          expect(await (await testCase.queueAdapter()).filter).toEqual(HelloJob),
        );
        expect((await (await testCase.queueAdapter()).filter) ?? null).toBeNull();
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block with only option doesnt leak",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs({ only: HelloJob });
        expect((await (await testCase.queueAdapter()).filter) ?? null).toBeNull();
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs with except option doesnt leak outside the block",
      async ({ testCase }: any) => {
        expect((await (await testCase.queueAdapter()).reject) ?? null).toBeNull();
        await await testCase.performEnqueuedJobs({ except: HelloJob }, async () =>
          expect(await (await testCase.queueAdapter()).reject).toEqual(HelloJob),
        );
        expect((await (await testCase.queueAdapter()).reject) ?? null).toBeNull();
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block with except option doesnt leak",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs({ except: HelloJob });
        expect((await (await testCase.queueAdapter()).reject) ?? null).toBeNull();
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs with queue option doesnt leak outside the block",
      async ({ testCase }: any) => {
        expect((await (await testCase.queueAdapter()).queue) ?? null).toBeNull();
        await await testCase.performEnqueuedJobs({ queue: "some_queue" }, async () =>
          expect(await (await testCase.queueAdapter()).queue).toEqual("some_queue"),
        );
        expect((await (await testCase.queueAdapter()).queue) ?? null).toBeNull();
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block with queue option doesnt leak",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs({ queue: "some_queue" });
        expect((await (await testCase.queueAdapter()).reject) ?? null).toBeNull();
      },
    );
    (run1 ? it : it.skip)("perform enqueued jobs with block", async ({ testCase }: any) => {
      await await testCase.performEnqueuedJobs(undefined, async () => {
        await await HelloJob.performLater("kevin");
        return await await LoggingJob.performLater("bogdan");
      });
      await await testCase.assertPerformedJobs(2);
    });
    (run1 ? it : it.skip)("perform enqueued jobs without block", async ({ testCase }: any) => {
      await await HelloJob.performLater("kevin");
      await await LoggingJob.performLater("bogdan");
      await await testCase.performEnqueuedJobs();
      await await testCase.assertPerformedJobs(2);
    });
    (run1 ? it : it.skip)(
      "perform enqueued jobs with block with only option",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs({ only: LoggingJob }, async () => {
          await await HelloJob.performLater("kevin");
          return await await LoggingJob.performLater("bogdan");
        });
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: LoggingJob });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block with only option",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("kevin");
        await await LoggingJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs({ only: LoggingJob });
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: LoggingJob });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs with block with except option",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs({ except: HelloJob }, async () => {
          await await HelloJob.performLater("kevin");
          return await await LoggingJob.performLater("bogdan");
        });
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: LoggingJob });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block with except option",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("kevin");
        await await LoggingJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs({ except: HelloJob });
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: LoggingJob });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs with block with queue option",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs({ queue: "some_queue" }, async () => {
          await await (await HelloJob.set({ queue: "some_queue" })).performLater("kevin");
          await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
          return await await LoggingJob.performLater("bogdan");
        });
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block with queue option",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "some_queue" })).performLater("kevin");
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await LoggingJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs({ queue: "some_queue" });
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs with block with only and queue options",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs(
          { only: HelloJob, queue: "other_queue" },
          async () => {
            await await (await HelloJob.set({ queue: "some_queue" })).performLater("kevin");
            await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
            return await await (
              await LoggingJob.set({ queue: "other_queue" })
            ).performLater("bogdan");
          },
        );
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "other_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block with only and queue options",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "some_queue" })).performLater("kevin");
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await testCase.performEnqueuedJobs({ only: HelloJob, queue: "other_queue" });
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "other_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs with block with except and queue options",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs(
          { except: HelloJob, queue: "other_queue" },
          async () => {
            await await (await HelloJob.set({ queue: "other_queue" })).performLater("kevin");
            await await (await LoggingJob.set({ queue: "some_queue" })).performLater("bogdan");
            return await await (
              await LoggingJob.set({ queue: "other_queue" })
            ).performLater("bogdan");
          },
        );
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: LoggingJob, queue: "other_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block with except and queue options",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("kevin");
        await await (await LoggingJob.set({ queue: "some_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await testCase.performEnqueuedJobs({ except: HelloJob, queue: "other_queue" });
        await await testCase.assertPerformedJobs(1);
        await await testCase.assertPerformedJobs(1, { only: LoggingJob, queue: "other_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs with at with job performed now",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("kevin");
        await await testCase.performEnqueuedJobs({ at: await RubyTime.now() });
        await await testCase.assertPerformedJobs(1);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs with at with job wait in past",
      async ({ testCase }: any) => {
        await await (
          await HelloJob.set({ waitUntil: await rbBinop(await RubyTime.now(), "-", 100) })
        ).performLater("kevin");
        await await testCase.performEnqueuedJobs({ at: await RubyTime.now() });
        await await testCase.assertPerformedJobs(1);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs with at with job wait in future",
      async ({ testCase }: any) => {
        await await (
          await HelloJob.set({ waitUntil: await rbBinop(await RubyTime.now(), "+", 100) })
        ).performLater("kevin");
        await await testCase.performEnqueuedJobs({ at: await RubyTime.now() });
        await await testCase.assertPerformedJobs(0);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs block with at with job performed now",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs(
          { at: await RubyTime.now() },
          async () => await await HelloJob.performLater("kevin"),
        );
        await await testCase.assertPerformedJobs(1);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs block with at with job wait in past",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs(
          { at: await RubyTime.now() },
          async () =>
            await await (
              await HelloJob.set({ waitUntil: await rbBinop(await RubyTime.now(), "-", 100) })
            ).performLater("kevin"),
        );
        await await testCase.assertPerformedJobs(1);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs block with at with job wait in future",
      async ({ testCase }: any) => {
        await await testCase.performEnqueuedJobs(
          { at: await RubyTime.now() },
          async () =>
            await await (
              await HelloJob.set({ waitUntil: await rbBinop(await RubyTime.now(), "+", 100) })
            ).performLater("kevin"),
        );
        await await testCase.assertPerformedJobs(0);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs properly count job that raises",
      async ({ testCase }: any) => {
        await await RaisingJob.performLater("NotImplementedError");
        await assertRaises(
          [NotImplementedError],
          {},
          async () => await await testCase.performEnqueuedJobs({ only: RaisingJob }),
        );
        expect(await rbSize(await testCase.performedJobs)).toEqual(1);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs dont perform retries",
      async ({ testCase }: any) => {
        await await RaisingJob.performLater();
        await expect(
          (async () => await await testCase.performEnqueuedJobs({ only: RaisingJob }))(),
        ).resolves.not.toThrow();
        expect(await rbSize(await testCase.performedJobs)).toEqual(1);
        expect(await rbSize(await testCase.enqueuedJobs)).toEqual(1);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block removes from enqueued jobs",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("rafael");
        expect(await rbSize(await testCase.performedJobs)).toEqual(0);
        expect(await rbSize(await testCase.enqueuedJobs)).toEqual(1);
        await await testCase.performEnqueuedJobs();
        expect(await rbSize(await testCase.performedJobs)).toEqual(1);
        expect(await rbSize(await testCase.enqueuedJobs)).toEqual(0);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block works with other helpers",
      async ({ testCase }: any) => {
        await await NestedJob.performLater();
        expect(await rbSize(await testCase.performedJobs)).toEqual(0);
        expect(await rbSize(await testCase.enqueuedJobs)).toEqual(1);
        await await testCase.assertEnqueuedJobs(
          1,
          undefined,
          async () =>
            await await testCase.assertEnqueuedWith(
              { job: LoggingJob },
              async () => await await testCase.performEnqueuedJobs(),
            ),
        );
        expect(await rbSize(await testCase.performedJobs)).toEqual(1);
        expect(await rbSize(await testCase.enqueuedJobs)).toEqual(1);
      },
    );
    (run1 ? it : it.skip)(
      "perform enqueued jobs without block only performs once",
      async ({ testCase }: any) => {
        await clear();
        await await RescueJob.performLater("no exception");
        await await testCase.performEnqueuedJobs();
        await await testCase.performEnqueuedJobs();
        expect(await (await values()).length).toEqual(1);
      },
    );
    (run1 ? it : it.skip)("assert performed jobs", async ({ testCase }: any) => {
      await expect(
        (async () =>
          await await testCase.assertPerformedJobs(
            1,
            undefined,
            async () => await await HelloJob.performLater("david"),
          ))(),
      ).resolves.not.toThrow();
    });
    (run1 ? it : it.skip)("repeated performed jobs calls", async ({ testCase }: any) => {
      await expect(
        (async () =>
          await await testCase.assertPerformedJobs(
            1,
            undefined,
            async () => await await HelloJob.performLater("abdelkader"),
          ))(),
      ).resolves.not.toThrow();
      await expect(
        (async () => {
          return await await testCase.assertPerformedJobs(2, undefined, async () => {
            await await HelloJob.performLater("sean");
            return await await HelloJob.performLater("yves");
          });
        })(),
      ).resolves.not.toThrow();
    });
    (run1 ? it : it.skip)("assert performed jobs message", async ({ testCase }: any) => {
      await await HelloJob.performLater("sean");
      const e: any = await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertPerformedJobs(
            2,
            undefined,
            async () => await await HelloJob.performLater("sean"),
          ),
      );
      expect(await e.message).toMatch("Expected: 2");
      expect(await e.message).toMatch("Actual: 1");
    });
    (run1 ? it : it.skip)("assert performed jobs with no block", async ({ testCase }: any) => {
      await expect(
        (async () => {
          await await testCase.performEnqueuedJobs(
            undefined,
            async () => await await HelloJob.performLater("rafael"),
          );
          return await await testCase.assertPerformedJobs(1);
        })(),
      ).resolves.not.toThrow();
      await expect(
        (async () => {
          return await await testCase.performEnqueuedJobs(undefined, async () => {
            await await HelloJob.performLater("aaron");
            await await HelloJob.performLater("matthew");
            return await await testCase.assertPerformedJobs(3);
          });
        })(),
      ).resolves.not.toThrow();
    });
    (run1 ? it : it.skip)("assert no performed jobs with no block", async ({ testCase }: any) => {
      await expect(
        (async () => await await testCase.assertNoPerformedJobs())(),
      ).resolves.not.toThrow();
    });
    (run1 ? it : it.skip)("assert no performed jobs", async ({ testCase }: any) => {
      await expect(
        (async () => {
          return await await testCase.assertNoPerformedJobs(undefined, () => {});
        })(),
      ).resolves.not.toThrow();
    });
    (run1 ? it : it.skip)("assert performed jobs too few sent", async ({ testCase }: any) => {
      const error: any = await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertPerformedJobs(
            2,
            undefined,
            async () => await await HelloJob.performLater("xavier"),
          ),
      );
      expect(await error.message).toMatch(/2 .* but 1/);
    });
    (run1 ? it : it.skip)("assert performed jobs too many sent", async ({ testCase }: any) => {
      const error: any = await assertRaises([Assertion], {}, async () => {
        return await await testCase.assertPerformedJobs(1, undefined, async () => {
          await await HelloJob.performLater("cristian");
          return await await HelloJob.performLater("guillermo");
        });
      });
      expect(await error.message).toMatch(/1 .* but 2/);
    });
    (run1 ? it : it.skip)("assert no performed jobs failure", async ({ testCase }: any) => {
      const error: any = await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertNoPerformedJobs(
            undefined,
            async () => await await HelloJob.performLater("jeremy"),
          ),
      );
      expect(await error.message).toMatch(/0 .* but 1/);
    });
    (run1 ? it : it.skip)("assert performed jobs with only option", async ({ testCase }: any) => {
      await expect(
        (async () => {
          return await await testCase.assertPerformedJobs(1, { only: HelloJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await await LoggingJob.performLater();
          });
        })(),
      ).resolves.not.toThrow();
    });
    (run1 ? it : it.skip)(
      "assert performed jobs with only option as proc",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertPerformedJobs(
              1,
              { only: (job?: any) => job instanceof HelloJob },
              async () => {
                await await HelloJob.performLater("jeremy");
                return await await LoggingJob.performLater("bogdan");
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with only option",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("jeremy");
        await await LoggingJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedJobs(1, { only: HelloJob });
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with only option as proc",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("jeremy");
        await await LoggingJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedJobs(1, {
          only: (job?: any) => rbEqual(rbModName(fetch(job, "job")), "HelloJob"),
        });
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with only option failure",
      async ({ testCase }: any) => {
        await await LoggingJob.performLater("jeremy");
        await await LoggingJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () => await await testCase.assertPerformedJobs(1, { only: HelloJob }),
        );
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)("assert performed jobs with except option", async ({ testCase }: any) => {
      await expect(
        (async () => {
          return await await testCase.assertPerformedJobs(1, { except: LoggingJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await await LoggingJob.performLater();
          });
        })(),
      ).resolves.not.toThrow();
    });
    (run1 ? it : it.skip)(
      "assert performed jobs with except option as proc",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertPerformedJobs(
              1,
              { except: (job?: any) => job instanceof HelloJob },
              async () => {
                await await HelloJob.performLater("jeremy");
                return await await LoggingJob.performLater("bogdan");
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with except option",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("jeremy");
        await await LoggingJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedJobs(1, { except: HelloJob });
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with except option as proc",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("jeremy");
        await await LoggingJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedJobs(1, {
          except: (job?: any) => rbEqual(rbModName(fetch(job, "job")), "HelloJob"),
        });
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with except option failure",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("jeremy");
        await await HelloJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () => await await testCase.assertPerformedJobs(1, { except: HelloJob }),
        );
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only and except option",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          return await await testCase.assertPerformedJobs(
            1,
            { only: HelloJob, except: HelloJob },
            async () => {
              await await HelloJob.performLater("jeremy");
              return await await LoggingJob.performLater();
            },
          );
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with only and except options",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          await await HelloJob.performLater("jeremy");
          await await LoggingJob.performLater("bogdan");
          await await testCase.performEnqueuedJobs();
          return await await testCase.assertPerformedJobs(1, { only: HelloJob, except: HelloJob });
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only option as array",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertPerformedJobs(
              2,
              { only: [HelloJob, LoggingJob] },
              async () => {
                await await HelloJob.performLater("jeremy");
                await await LoggingJob.performLater("stewie");
                return await await RescueJob.performLater("david");
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with except option as array",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertPerformedJobs(
              1,
              { except: [LoggingJob, RescueJob] },
              async () => {
                await await HelloJob.performLater("jeremy");
                await await LoggingJob.performLater("stewie");
                return await await RescueJob.performLater("david");
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only and except option as array",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          return await await testCase.assertPerformedJobs(
            2,
            { only: [HelloJob, LoggingJob], except: [HelloJob, LoggingJob] },
            async () => {
              await await HelloJob.performLater("jeremy");
              await await LoggingJob.performLater("stewie");
              return await await RescueJob.performLater("david");
            },
          );
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only option and none sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedJobs(
              1,
              { only: HelloJob },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with except option and none sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedJobs(
              1,
              { except: LoggingJob },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only and except option and none sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [ArgumentError],
          {},
          async () =>
            await await testCase.assertPerformedJobs(
              1,
              { only: HelloJob, except: HelloJob },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only option and too few sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertPerformedJobs(5, { only: HelloJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await times(4, async () => await await LoggingJob.performLater());
          });
        });
        expect(await error.message).toMatch(/5 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with except option and too few sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertPerformedJobs(5, { except: LoggingJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await times(4, async () => await await LoggingJob.performLater());
          });
        });
        expect(await error.message).toMatch(/5 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only and except option and too few sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          return await await testCase.assertPerformedJobs(
            5,
            { only: HelloJob, except: HelloJob },
            async () => {
              await await HelloJob.performLater("jeremy");
              return await times(4, async () => await await LoggingJob.performLater());
            },
          );
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only option and too many sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedJobs(
              1,
              { only: HelloJob },
              async () => await times(2, async () => await await HelloJob.performLater("jeremy")),
            ),
        );
        expect(await error.message).toMatch(/1 .* but 2/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with except option and too many sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedJobs(
              1,
              { except: LoggingJob },
              async () => await times(2, async () => await await HelloJob.performLater("jeremy")),
            ),
        );
        expect(await error.message).toMatch(/1 .* but 2/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only and except option and too many sent",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [ArgumentError],
          {},
          async () =>
            await await testCase.assertPerformedJobs(
              1,
              { only: HelloJob, except: HelloJob },
              async () => await times(2, async () => await await HelloJob.performLater("jeremy")),
            ),
        );
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)("assert performed jobs with queue option", async ({ testCase }: any) => {
      await await testCase.assertPerformedJobs(1, { queue: "some_queue" }, async () => {
        await await (await HelloJob.set({ queue: "some_queue" })).performLater("jeremy");
        return await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
      });
    });
    (run1 ? it : it.skip)(
      "assert performed jobs with queue option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertPerformedJobs(1, { queue: "some_queue" }, async () => {
            await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy");
            return await await (
              await HelloJob.set({ queue: "other_queue" })
            ).performLater("bogdan");
          });
        });
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with queue option",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "some_queue" })).performLater("jeremy");
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedJobs(1, { queue: "some_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with queue option failure",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy");
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () => await await testCase.assertPerformedJobs(1, { queue: "some_queue" }),
        );
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only and queue options",
      async ({ testCase }: any) => {
        await await testCase.assertPerformedJobs(
          1,
          { only: HelloJob, queue: "some_queue" },
          async () => {
            await await (await HelloJob.set({ queue: "some_queue" })).performLater("jeremy");
            await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
            return await await (
              await LoggingJob.set({ queue: "some_queue" })
            ).performLater("jeremy");
          },
        );
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with only and queue options failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertPerformedJobs(
            1,
            { only: HelloJob, queue: "some_queue" },
            async () => {
              await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy");
              await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
              return await await (
                await LoggingJob.set({ queue: "some_queue" })
              ).performLater("jeremy");
            },
          );
        });
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with only and queue options",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "some_queue" })).performLater("jeremy");
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "some_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with only and queue options failure",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy");
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "some_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedJobs(1, { only: HelloJob, queue: "some_queue" }),
        );
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with except and queue options",
      async ({ testCase }: any) => {
        await await testCase.assertPerformedJobs(
          1,
          { except: HelloJob, queue: "other_queue" },
          async () => {
            await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy");
            await await (await LoggingJob.set({ queue: "some_queue" })).performLater("bogdan");
            return await await (
              await LoggingJob.set({ queue: "other_queue" })
            ).performLater("jeremy");
          },
        );
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs with except and queue options failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertPerformedJobs(
            1,
            { except: HelloJob, queue: "other_queue" },
            async () => {
              await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy");
              await await (await LoggingJob.set({ queue: "some_queue" })).performLater("bogdan");
              return await await (
                await LoggingJob.set({ queue: "some_queue" })
              ).performLater("jeremy");
            },
          );
        });
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with except and queue options",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy");
        await await (await LoggingJob.set({ queue: "some_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "other_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedJobs(1, { except: HelloJob, queue: "other_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "assert performed jobs without block with except and queue options failure",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy");
        await await (await LoggingJob.set({ queue: "some_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "some_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedJobs(1, { except: HelloJob, queue: "other_queue" }),
        );
        expect(await error.message).toMatch(/1 .* but 0/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with only option",
      async ({ testCase }: any) => {
        await expect(
          (async () =>
            await await testCase.assertNoPerformedJobs(
              { only: HelloJob },
              async () => await await LoggingJob.performLater(),
            ))(),
        ).resolves.not.toThrow();
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with only option",
      async ({ testCase }: any) => {
        await await LoggingJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertNoPerformedJobs({ only: HelloJob });
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with only option failure",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("bogdan");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () => await await testCase.assertNoPerformedJobs({ only: HelloJob }),
        );
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with except option",
      async ({ testCase }: any) => {
        await expect(
          (async () =>
            await await testCase.assertNoPerformedJobs(
              { except: LoggingJob },
              async () => await await LoggingJob.performLater(),
            ))(),
        ).resolves.not.toThrow();
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with except option",
      async ({ testCase }: any) => {
        await await HelloJob.performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertNoPerformedJobs({ except: HelloJob });
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with except option failure",
      async ({ testCase }: any) => {
        await await LoggingJob.performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () => await await testCase.assertNoPerformedJobs({ except: HelloJob }),
        );
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with only and except option",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [ArgumentError],
          {},
          async () =>
            await await testCase.assertNoPerformedJobs(
              { only: HelloJob, except: HelloJob },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with only and except options",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          await await HelloJob.performLater("jeremy");
          await await LoggingJob.performLater("bogdan");
          await await testCase.performEnqueuedJobs();
          return await await testCase.assertNoPerformedJobs({ only: HelloJob, except: HelloJob });
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with only option as array",
      async ({ testCase }: any) => {
        await expect(
          (async () =>
            await await testCase.assertNoPerformedJobs(
              { only: [HelloJob, RescueJob] },
              async () => await await LoggingJob.performLater(),
            ))(),
        ).resolves.not.toThrow();
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with except option as array",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.assertNoPerformedJobs(
              { except: [HelloJob, RescueJob] },
              async () => {
                await await HelloJob.performLater();
                return await await RescueJob.performLater();
              },
            );
          })(),
        ).resolves.not.toThrow();
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with only and except option as array",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [ArgumentError],
          {},
          async () =>
            await await testCase.assertNoPerformedJobs(
              { only: [HelloJob, RescueJob], except: [HelloJob, RescueJob] },
              async () => await await LoggingJob.performLater(),
            ),
        );
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with only option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertNoPerformedJobs({ only: HelloJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await await LoggingJob.performLater();
          });
        });
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with except option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertNoPerformedJobs({ except: LoggingJob }, async () => {
            await await HelloJob.performLater("jeremy");
            return await await LoggingJob.performLater();
          });
        });
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with only and except option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([ArgumentError], {}, async () => {
          return await await testCase.assertNoPerformedJobs(
            { only: HelloJob, except: HelloJob },
            async () => {
              await await HelloJob.performLater("jeremy");
              return await await LoggingJob.performLater();
            },
          );
        });
        expect(await error.message).toMatch(/`:only` and `:except`/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with queue option",
      async ({ testCase }: any) => {
        await await testCase.assertNoPerformedJobs(
          { queue: "some_queue" },
          async () =>
            await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy"),
        );
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with queue option failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertNoPerformedJobs(
              { queue: "some_queue" },
              async () =>
                await await (await HelloJob.set({ queue: "some_queue" })).performLater("jeremy"),
            ),
        );
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with queue option",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertNoPerformedJobs({ queue: "some_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with queue option failure",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "some_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () => await await testCase.assertNoPerformedJobs({ queue: "some_queue" }),
        );
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with only and queue options",
      async ({ testCase }: any) => {
        await await testCase.assertNoPerformedJobs(
          { only: HelloJob, queue: "some_queue" },
          async () => {
            await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
            return await await (
              await LoggingJob.set({ queue: "some_queue" })
            ).performLater("jeremy");
          },
        );
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with only and queue options failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertNoPerformedJobs(
            { only: HelloJob, queue: "some_queue" },
            async () => {
              await await (await HelloJob.set({ queue: "some_queue" })).performLater("bogdan");
              return await await (
                await LoggingJob.set({ queue: "some_queue" })
              ).performLater("jeremy");
            },
          );
        });
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with only and queue options",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "some_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertNoPerformedJobs({ only: HelloJob, queue: "some_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with only and queue options failure",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "some_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "some_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertNoPerformedJobs({ only: HelloJob, queue: "some_queue" }),
        );
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with except and queue options",
      async ({ testCase }: any) => {
        await await testCase.assertNoPerformedJobs(
          { except: HelloJob, queue: "some_queue" },
          async () => {
            await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
            await await (await HelloJob.set({ queue: "some_queue" })).performLater("bogdan");
            return await await (
              await LoggingJob.set({ queue: "other_queue" })
            ).performLater("jeremy");
          },
        );
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs with except and queue options failure",
      async ({ testCase }: any) => {
        const error: any = await assertRaises([Assertion], {}, async () => {
          return await await testCase.assertNoPerformedJobs(
            { except: HelloJob, queue: "some_queue" },
            async () => {
              await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
              await await (await HelloJob.set({ queue: "some_queue" })).performLater("bogdan");
              return await await (
                await LoggingJob.set({ queue: "some_queue" })
              ).performLater("jeremy");
            },
          );
        });
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with except and queue options",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await (await HelloJob.set({ queue: "some_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "other_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        await await testCase.assertNoPerformedJobs({ except: HelloJob, queue: "some_queue" });
      },
    );
    (run1 ? it : it.skip)(
      "assert no performed jobs without block with except and queue options failure",
      async ({ testCase }: any) => {
        await await (await HelloJob.set({ queue: "other_queue" })).performLater("bogdan");
        await await (await HelloJob.set({ queue: "some_queue" })).performLater("bogdan");
        await await (await LoggingJob.set({ queue: "some_queue" })).performLater("jeremy");
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertNoPerformedJobs({ except: HelloJob, queue: "some_queue" }),
        );
        expect(await error.message).toMatch(/0 .* but 1/);
      },
    );
    (run1 ? it : it.skip)("assert performed with", async ({ testCase }: any) => {
      await await testCase.assertPerformedWith(
        { job: NestedJob, queue: "default" },
        async () => await await NestedJob.performLater(),
      );
    });
    (run1 ? it : it.skip)("assert performed with without block", async ({ testCase }: any) => {
      await await NestedJob.performLater();
      await await testCase.performEnqueuedJobs();
      await await testCase.assertPerformedWith({ job: NestedJob, queue: "default" });
    });
    (run1 ? it : it.skip)(
      "assert performed with when queue name is symbol",
      async ({ testCase }: any) => {
        await await testCase.assertPerformedWith(
          { job: NestedJob, queue: "default" },
          async () => await await NestedJob.performLater(),
        );
      },
    );
    (run1 ? it : it.skip)("assert performed with returns", async ({ testCase }: any) => {
      const job: any = await await testCase.assertPerformedWith(
        { job: LoggingJob, queue: "default" },
        async () => await await LoggingJob.performLater({ keyword: "sym" }),
      );
      expect(job).toBeInstanceOf(LoggingJob);
      expect((await job.scheduledAt) ?? null).toBeNull();
      expect(await job.arguments).toEqual([{ keyword: "sym" }]);
      expect(await job.queueName).toEqual("default");
    });
    (run1 ? it : it.skip)(
      "assert performed with without block returns",
      async ({ testCase }: any) => {
        await await LoggingJob.performLater({ keyword: "sym" });
        await await testCase.performEnqueuedJobs();
        const job: any = await await testCase.assertPerformedWith({
          job: LoggingJob,
          queue: "default",
        });
        expect(job).toBeInstanceOf(LoggingJob);
        expect((await job.scheduledAt) ?? null).toBeNull();
        expect(await job.arguments).toEqual([{ keyword: "sym" }]);
        expect(await job.queueName).toEqual("default");
      },
    );
    (run1 ? it : it.skip)("assert performed with failure", async ({ testCase }: any) => {
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertPerformedWith(
            { job: LoggingJob },
            async () => await await HelloJob.performLater(),
          ),
      );
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertPerformedWith(
            { job: HelloJob, queue: "low" },
            async () => await await (await HelloJob.set({ queue: "important" })).performLater(),
          ),
      );
    });
    (run1 ? it : it.skip)(
      "assert performed with without block failure",
      async ({ testCase }: any) => {
        await await HelloJob.performLater();
        await await testCase.performEnqueuedJobs();
        await assertRaises(
          [Assertion],
          {},
          async () => await await testCase.assertPerformedWith({ job: LoggingJob }),
        );
        await await (await HelloJob.set({ queue: "important" })).performLater();
        await assertRaises(
          [Assertion],
          {},
          async () => await await testCase.assertPerformedWith({ job: HelloJob, queue: "low" }),
        );
      },
    );
    (run1 ? it : it.skip)(
      "assert performed job with priority option",
      async ({ testCase }: any) => {
        await await testCase.assertPerformedWith(
          { job: HelloJob, priority: 10 },
          async () => await await (await HelloJob.set({ priority: 10 })).performLater(),
        );
        await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedWith(
              { job: HelloJob, priority: 10 },
              async () => await await (await HelloJob.set({ priority: 5 })).performLater(),
            ),
        );
      },
    );
    (run1 ? it : it.skip)("assert performed with with at option", async ({ testCase }: any) => {
      await await testCase.assertPerformedWith(
        { job: HelloJob, at: await noon(await tomorrow()) },
        async () =>
          await await (
            await HelloJob.set({ waitUntil: await noon(await tomorrow()) })
          ).performLater(),
      );
      await assertRaises(
        [Assertion],
        {},
        async () =>
          await await testCase.assertPerformedWith(
            { job: HelloJob, at: await noon(await RubyDate.today()) },
            async () =>
              await await (
                await HelloJob.set({ waitUntil: await noon(await tomorrow()) })
              ).performLater(),
          ),
      );
    });
    (run1 ? it : it.skip)(
      "assert performed with with relative at option",
      async ({ testCase }: any) => {
        await await testCase.assertPerformedWith(
          { job: HelloJob, at: await (await Duration.minutes(5)).fromNow() },
          async () =>
            await await (await HelloJob.set({ wait: await Duration.minutes(5) })).performLater(),
        );
        await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedWith(
              { job: HelloJob, at: await (await Duration.minutes(2)).fromNow() },
              async () =>
                await await (
                  await HelloJob.set({ wait: await Duration.minutes(1) })
                ).performLater(),
            ),
        );
      },
    );
    (run1 ? it : it.skip)(
      "assert performed with without block with at option",
      async ({ testCase }: any) => {
        await await (
          await HelloJob.set({ waitUntil: await noon(await tomorrow()) })
        ).performLater();
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedWith({
          job: HelloJob,
          at: await noon(await tomorrow()),
        });
        await await (
          await HelloJob.set({ waitUntil: await noon(await tomorrow()) })
        ).performLater();
        await await testCase.performEnqueuedJobs();
        await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedWith({
              job: HelloJob,
              at: await noon(await RubyDate.today()),
            }),
        );
      },
    );
    (run1 ? it : it.skip)("assert performed with with hash arg", async ({ testCase }: any) => {
      await await testCase.assertPerformedWith(
        { job: MultipleKwargsJob, args: [{ argument1: 1, argument2: { a: 1, b: 2 } }] },
        async () =>
          await await MultipleKwargsJob.performLater({ argument2: { b: 2, a: 1 }, argument1: 1 }),
      );
    });
    (run1 ? it : it.skip)(
      "assert performed with supports matcher procs",
      async ({ testCase }: any) => {
        const facets: any = {
          job: HelloJob,
          args: ["Rails"],
          at: await noon(await tomorrow()),
          queue: "important",
        };
        await await (
          await (
            await facets["job"]
          ).set({ queue: await facets["queue"], waitUntil: await facets["at"] })
        ).performLater(...rbAryEnsure(await facets["args"]));
        await await testCase.performEnqueuedJobs();
        for (const [facet, value] of rbEntries(facets)) {
          const matcher: any = async (jobValue?: any) => await rbEqual(jobValue, value);
          const refuser: any = (jobValue?: any) => false;
          await await testCase.assertPerformedWith({ ...{ [facet]: matcher } });
          await assertRaises(
            [Assertion],
            {},
            async () => await await testCase.assertPerformedWith({ ...{ [facet]: refuser } }),
          );
        }
      },
    );
    (run1 ? it : it.skip)("assert performed with time", async ({ testCase }: any) => {
      const now: any = await RubyTime.now();
      const args: any = [{ argument1: { now: now }, argument2: now }];
      await await testCase.assertPerformedWith(
        { job: MultipleKwargsJob, args: args },
        async () =>
          await await MultipleKwargsJob.performLater({ argument1: { now: now }, argument2: now }),
      );
    });
    (run1 ? it : it.skip)("assert performed with date time", async ({ testCase }: any) => {
      const now: any = await RubyDateTime.now();
      const args: any = [{ argument1: { now: now }, argument2: now }];
      await await testCase.assertPerformedWith(
        { job: MultipleKwargsJob, args: args },
        async () =>
          await await MultipleKwargsJob.performLater({ argument1: { now: now }, argument2: now }),
      );
    });
    (run1 ? it : it.skip)("assert performed with time with zone", async ({ testCase }: any) => {
      const now: any = await rbFSend(await RubyTime.now(), "inTimeZone", "Tokyo");
      const args: any = [{ argument1: { now: now }, argument2: now }];
      await await testCase.assertPerformedWith(
        { job: MultipleKwargsJob, args: args },
        async () =>
          await await MultipleKwargsJob.performLater({ argument1: { now: now }, argument2: now }),
      );
    });
    (run1 ? it : it.skip)(
      "assert performed with with global id args",
      async ({ testCase }: any) => {
        const ricardo: any = new Person(9);
        await await testCase.assertPerformedWith(
          { job: HelloJob, args: [ricardo] },
          async () => await await HelloJob.performLater(ricardo),
        );
      },
    );
    (run1 ? it : it.skip)(
      "assert performed with without block with global id args",
      async ({ testCase }: any) => {
        const ricardo: any = new Person(9);
        await await HelloJob.performLater(ricardo);
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedWith({ job: HelloJob, args: [ricardo] });
      },
    );
    (run1 ? it : it.skip)(
      "assert performed with failure with global id args",
      async ({ testCase }: any) => {
        const ricardo: any = new Person(9);
        const wilma: any = new Person(11);
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedWith(
              { job: HelloJob, args: [wilma] },
              async () => await await HelloJob.performLater(ricardo),
            ),
        );
        expect(await error.message).toMatch(
          `No performed job found with ${rbInspect({ job: HelloJob, args: [wilma] })}`,
        );
        expect(await error.message).toMatch(/Potential matches:.*Person.* @id="9"/);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed with without block failure with global id args",
      async ({ testCase }: any) => {
        const ricardo: any = new Person(9);
        const wilma: any = new Person(11);
        await await HelloJob.performLater(ricardo);
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () => await await testCase.assertPerformedWith({ job: HelloJob, args: [wilma] }),
        );
        expect(await error.message).toMatch(
          `No performed job found with ${rbInspect({ job: HelloJob, args: [wilma] })}`,
        );
        expect(await error.message).toMatch(/Potential matches:.*Person.* @id="9"/);
      },
    );
    (run1 ? it : it.skip)("assert performed says no jobs performed", async ({ testCase }: any) => {
      const error: any = await assertRaises(
        [Assertion],
        {},
        async () => await await testCase.assertPerformedWith({ job: HelloJob, args: [] }),
      );
      expect(await error.message).toMatch(
        `No performed job found with ${rbInspect({ job: HelloJob, args: [] })}`,
      );
      expect(await error.message).toMatch(/No jobs were performed/);
    });
    (run1 ? it : it.skip)(
      "assert performed when not matching the class shows alteratives",
      async ({ testCase }: any) => {
        const ricardo: any = new Person(9);
        const wilma: any = new Person(11);
        await await HelloJob.performLater(ricardo);
        await await testCase.performEnqueuedJobs();
        const error: any = await assertRaises(
          [Assertion],
          {},
          async () =>
            await await testCase.assertPerformedWith({ job: MultipleKwargsJob, args: [wilma] }),
        );
        expect(await error.message).toMatch(
          /No performed job found with .*MultipleKwargsJob.*\[#<Person.* @id=11>\]}/,
        );
        expect(await error.message).toMatch(
          /No jobs of class MultipleKwargsJob were performed, job classes performed: HelloJob/,
        );
      },
    );
    (run1 ? it : it.skip)(
      "assert performed with does not change jobs count",
      async ({ testCase }: any) => {
        await await testCase.assertPerformedWith(
          { job: HelloJob },
          async () => await await HelloJob.performLater(),
        );
        await await testCase.assertPerformedWith(
          { job: HelloJob },
          async () => await await HelloJob.performLater(),
        );
        expect(await (await (await testCase.queueAdapter()).enqueuedJobs).length).toEqual(0);
        expect(await (await (await testCase.queueAdapter()).performedJobs).length).toEqual(2);
      },
    );
    (run1 ? it : it.skip)(
      "assert performed with without block does not change jobs count",
      async ({ testCase }: any) => {
        await await HelloJob.performLater();
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedWith({ job: HelloJob });
        await await HelloJob.performLater();
        await await testCase.performEnqueuedJobs();
        await await testCase.assertPerformedWith({ job: HelloJob });
        expect(await (await (await testCase.queueAdapter()).enqueuedJobs).length).toEqual(0);
        expect(await (await (await testCase.queueAdapter()).performedJobs).length).toEqual(2);
      },
    );
    (run1 ? it : it.skip)(
      "perform_enqueued_jobs doesn't raise if discard_on ActiveJob::DeserializationError",
      async ({ testCase }: any) => {
        await await RetryJob.performLater(new Person(404), 1);
        await expect(
          (async () => await await testCase.performEnqueuedJobs({ only: RetryJob }))(),
        ).resolves.not.toThrow();
      },
    );
    (run1 ? it : it.skip)("TestAdapter respect max attempts", async ({ testCase }: any) => {
      await await testCase.performEnqueuedJobs(
        { only: RaisingJob },
        async () =>
          await assertRaises([MyError], {}, async () => await await RaisingJob.performLater()),
      );
      expect(await (await (await testCase.queueAdapter()).performedJobs).length).toEqual(2);
    });
  }
});
describe("NotTestAdapterTest", () => {
  class NotTestAdapterTest extends TestHost {}
  registerConstant("NotTestAdapterTest", NotTestAdapterTest);
  include(NotTestAdapterTest, TestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  const run2 = !isAdapterIs("test");
  {
    beforeEach(async ({ testCase }: any) => {
      testCase._adapter = await rbModName(await rbObjClass(await testCase.queueAdapter()));
    });
    (run2 ? it : it.skip)("assert_enqueued_jobs raises", async ({ testCase }: any) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await await testCase.assertEnqueuedJobs(0, undefined, () => {});
      });
    });
    (run2 ? it : it.skip)("assert_no_enqueued_jobs raises", async ({ testCase }: any) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await await testCase.assertNoEnqueuedJobs(undefined, () => {});
      });
    });
    (run2 ? it : it.skip)("assert_performed_jobs raises", async ({ testCase }: any) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await await testCase.assertPerformedJobs(0, undefined, () => {});
      });
    });
    (run2 ? it : it.skip)("assert_no_performed_jobs raises", async ({ testCase }: any) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await await testCase.assertNoPerformedJobs(undefined, () => {});
      });
    });
    (run2 ? it : it.skip)("assert_enqueued_with raises", async ({ testCase }: any) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await await testCase.assertEnqueuedWith(undefined, () => {});
      });
    });
    (run2 ? it : it.skip)("assert_performed_with raises", async ({ testCase }: any) => {
      await assertRaises([ArgumentError], {}, async () => {
        return await await testCase.assertPerformedWith(undefined, () => {});
      });
    });
    (run2 ? it : it.skip)("perform_enqueued_jobs without a block", async ({ testCase }: any) => {
      await assertRaises(
        [ArgumentError],
        {},
        async () => await await testCase.performEnqueuedJobs(),
      );
    });
    (run2 ? it : it.skip)(
      "perform_enqueued_jobs with a block does not raise",
      async ({ testCase }: any) => {
        await expect(
          (async () => {
            return await await testCase.performEnqueuedJobs(undefined, () => {});
          })(),
        ).resolves.not.toThrow();
      },
    );
  }
});
describe("AdapterIsNotTestAdapterTest", () => {
  class AdapterIsNotTestAdapterTest extends TestHost {
    queueAdapterForTest(): any {
      return new InlineAdapter();
    }
  }
  registerConstant("AdapterIsNotTestAdapterTest", AdapterIsNotTestAdapterTest);
  include(AdapterIsNotTestAdapterTest, TestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("perform enqueued jobs just yields", async ({ testCase }: any) => {
    await clear();
    await await testCase.performEnqueuedJobs(
      undefined,
      async () => await await HelloJob.performLater("kevin"),
    );
    expect(await (await values()).length).toEqual(1);
  });
});
describe("OverrideQueueAdapterTest", () => {
  class OverrideQueueAdapterTest extends TestHost {
    queueAdapterForTest(): any {
      return new CustomQueueAdapter();
    }
  }
  registerConstant("OverrideQueueAdapterTest", OverrideQueueAdapterTest);
  include(OverrideQueueAdapterTest, TestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("assert job has custom queue adapter set", async ({ testCase }: any) => {
    expect(await HelloJob.queueAdapter()).toBeInstanceOf(CustomQueueAdapter);
  });
});
export class CustomQueueAdapter extends TestAdapter {
  [key: string]: any;
  static [key: string]: any;
}
registerConstant("OverrideQueueAdapterTest::CustomQueueAdapter", CustomQueueAdapter);
describe("InheritedJobTest", () => {
  class InheritedJobTest extends TestHost {}
  registerConstant("InheritedJobTest", InheritedJobTest);
  include(InheritedJobTest, TestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it("queue adapter is inline adapter because it is set on the job class", async ({
    testCase,
  }: any) => {
    expect(await InheritedJob.queueAdapter()).toBeInstanceOf(InlineAdapter);
  });
});
describe("QueueAdapterJobTest", () => {
  class QueueAdapterJobTest extends TestHost {}
  registerConstant("QueueAdapterJobTest", QueueAdapterJobTest);
  include(QueueAdapterJobTest, TestHelper);
  beforeEach(async ({ testCase }: any) => {
    await testCase.setup();
  });
  afterEach(async ({ testCase }: any) => {
    await testCase.teardown();
  });
  it.skip("queue adapter is is inline adapter because it is set on the job class", async ({
    testCase,
  }: any) => {
    await declined("test/cases/test_helper_test.rb:0", "const-unresolved", "Zeitwerk").withLoader(
      async (loader?: any) => {
        try {
          await loader.pushDir("test/jobs");
          await loader.setup();
          return await expect(
            await declined(
              "test/cases/test_helper_test.rb:0",
              "const-unresolved",
              "QueueAdapterJob",
            ).queueAdapter(),
          ).toBeInstanceOf(InlineAdapter);
        } finally {
          await loader.unload();
        }
      },
    );
  });
});
