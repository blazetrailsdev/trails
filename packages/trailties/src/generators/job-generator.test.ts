import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Dir, File } from "@blazetrails/ruby-compat";
import { Application } from "../application.js";
import { Trails } from "../rails.js";
import "../test-unit/trailtie.js";
import { assertFile, assertNoFile } from "./testing/assertions.js";

class JobGeneratorApp extends Application {}
let JobGenerator: typeof import("./rails/job/job-generator.js").JobGenerator;

beforeAll(async () => {
  await JobGeneratorApp.instance().loadGenerators();
  ({ JobGenerator } = await import("./rails/job/job-generator.js"));
});

beforeEach(() => {
  Trails.application = JobGeneratorApp.instance();
});

afterEach(() => {
  Trails.application = null;
});

async function runGenerator(args: string[]): Promise<string> {
  const root = Dir.mktmpdir();
  File.write(File.join(root, "tsconfig.json"), "{}");
  await JobGenerator.start(args, { destinationRoot: root });
  return root;
}

const host = (destinationRoot: string) => ({ destinationRoot }) as never;

describe("JobGeneratorTest", () => {
  it("job skeleton is created", async () => {
    const root = await runGenerator(["refresh_counters"]);
    await assertFile.call(host(root), "app/jobs/refresh-counters-job.ts", (job) => {
      expect(job).toMatch(/class RefreshCountersJob extends ApplicationJob/);
    });
  });

  it("job queue param", async () => {
    const root = await runGenerator(["refresh_counters", "--queue", "important"]);
    await assertFile.call(host(root), "app/jobs/refresh-counters-job.ts", (job) => {
      expect(job).toMatch(/class RefreshCountersJob extends ApplicationJob/);
      expect(job).toMatch(/this\.queueAs\("important"\)/);
    });
  });

  it("job parent param", async () => {
    const root = await runGenerator(["refresh_counters", "--parent", "awesome_job"]);
    await assertFile.call(host(root), "app/jobs/refresh-counters-job.ts", (job) => {
      expect(job).toMatch(/class RefreshCountersJob extends AwesomeJob/);
    });
  });

  it("job namespace", async () => {
    const root = await runGenerator(["admin/refresh_counters", "--queue", "admin"]);
    await assertFile.call(host(root), "app/jobs/admin/refresh-counters-job.ts", (job) => {
      expect(job).toMatch(/class RefreshCountersJob extends ApplicationJob/);
      expect(job).toMatch(/this\.queueAs\("admin"\)/);
    });
  });

  it("application job skeleton is created", async () => {
    const root = await runGenerator(["refresh_counters"]);
    await assertFile.call(host(root), "app/jobs/application-job.ts", (job) => {
      expect(job).toMatch(/class ApplicationJob extends ActiveJob\.Base/);
    });
  });

  it("job suffix is not duplicated", async () => {
    const root = await runGenerator(["notifier_job"]);

    assertNoFile.call(host(root), "app/jobs/notifier-job-job.ts");
    await assertFile.call(host(root), "app/jobs/notifier-job.ts");

    assertNoFile.call(host(root), "test/jobs/notifier-job-job.test.ts");
    await assertFile.call(host(root), "test/jobs/notifier-job.test.ts");
  });
});
