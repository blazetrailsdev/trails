import { File, Dir } from "@blazetrails/ruby-compat";
import { registerSpecType } from "@blazetrails/activesupport/testing/autorun";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Application } from "../../lib/application.js";
import { Trails } from "../../lib/trails.js";
import "../../lib/test-unit/trailtie.js";
import { TestCase } from "../../lib/generators/test-case.js";

class JobGeneratorApp extends Application {}
class JobGeneratorTest extends TestCase {}
JobGeneratorTest.destination(Dir.mktmpdir());
registerSpecType(/^JobGeneratorTest$/, JobGeneratorTest);
let t: TestCase;

beforeAll(async () => {
  await JobGeneratorApp.instance().loadGenerators();
  const { JobGenerator } = await import("../../lib/generators/trails/job/job-generator.js");
  JobGeneratorTest.tests(JobGenerator);
});

beforeEach((context) => {
  t = context.testCase as TestCase;
  t.prepareDestination();
  Trails.application = JobGeneratorApp.instance();
  File.write(File.join(t.destinationRoot, "tsconfig.json"), "{}");
});

afterEach(() => {
  Trails.application = null;
});

describe("JobGeneratorTest", () => {
  it("job skeleton is created", async () => {
    await t.runGenerator(["refresh_counters"]);
    await t.assertFile("app/jobs/refresh-counters-job.ts", (job) => {
      expect(job).toMatch(/class RefreshCountersJob extends ApplicationJob/);
    });
  });

  it("job queue param", async () => {
    await t.runGenerator(["refresh_counters", "--queue", "important"]);
    await t.assertFile("app/jobs/refresh-counters-job.ts", (job) => {
      expect(job).toMatch(/class RefreshCountersJob extends ApplicationJob/);
      expect(job).toMatch(/this\.queueAs\("important"\)/);
    });
  });

  it("job parent param", async () => {
    await t.runGenerator(["refresh_counters", "--parent", "awesome_job"]);
    await t.assertFile("app/jobs/refresh-counters-job.ts", (job) => {
      expect(job).toMatch(/class RefreshCountersJob extends AwesomeJob/);
    });
  });

  it("job namespace", async () => {
    await t.runGenerator(["admin/refresh_counters", "--queue", "admin"]);
    await t.assertFile("app/jobs/admin/refresh-counters-job.ts", (job) => {
      expect(job).toMatch(/class RefreshCountersJob extends ApplicationJob/);
      expect(job).toMatch(/this\.queueAs\("admin"\)/);
    });
  });

  it("application job skeleton is created", async () => {
    await t.runGenerator(["refresh_counters"]);
    await t.assertFile("app/jobs/application-job.ts", (job) => {
      expect(job).toMatch(/class ApplicationJob extends ActiveJob\.Base/);
    });
  });

  it("job suffix is not duplicated", async () => {
    await t.runGenerator(["notifier_job"]);

    t.assertNoFile("app/jobs/notifier-job-job.ts");
    await t.assertFile("app/jobs/notifier-job.ts");

    t.assertNoFile("test/jobs/notifier-job-job.test.ts");
    await t.assertFile("test/jobs/notifier-job.test.ts");
  });
});
