import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { Dir, File } from "@blazetrails/ruby-compat";
import { Application } from "../../../application.js";
import { Trails } from "../../../rails.js";
import "../../../test-unit/trailtie.js";

class JobGeneratorApp extends Application {}
let JobGenerator: typeof import("./job-generator.js").JobGenerator;

beforeAll(async () => {
  await JobGeneratorApp.instance().loadGenerators();
  ({ JobGenerator } = await import("./job-generator.js"));
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
  await JobGenerator.start(args, { cwd: root, output: () => {} });
  return root;
}

describe("JobGeneratorTest", () => {
  it("job skeleton is created", async () => {
    const root = await runGenerator(["refresh_counters"]);
    const job = File.read(File.join(root, "app/jobs/refresh-counters-job.ts"));
    expect(job).toMatch(/class RefreshCountersJob extends ApplicationJob/);
  });

  it("job queue param", async () => {
    const root = await runGenerator(["refresh_counters", "--queue", "important"]);
    const job = File.read(File.join(root, "app/jobs/refresh-counters-job.ts"));
    expect(job).toMatch(/class RefreshCountersJob extends ApplicationJob/);
    expect(job).toMatch(/this\.queueAs\("important"\)/);
  });

  it("job parent param", async () => {
    const root = await runGenerator(["refresh_counters", "--parent", "awesome_job"]);
    const job = File.read(File.join(root, "app/jobs/refresh-counters-job.ts"));
    expect(job).toMatch(/class RefreshCountersJob extends AwesomeJob/);
  });

  it("job namespace", async () => {
    const root = await runGenerator(["admin/refresh_counters", "--queue", "admin"]);
    const job = File.read(File.join(root, "app/jobs/admin/refresh-counters-job.ts"));
    expect(job).toMatch(/class RefreshCountersJob extends ApplicationJob/);
    expect(job).toMatch(/this\.queueAs\("admin"\)/);
  });

  it("application job skeleton is created", async () => {
    const root = await runGenerator(["refresh_counters"]);
    const job = File.read(File.join(root, "app/jobs/application-job.ts"));
    expect(job).toMatch(/class ApplicationJob extends ActiveJob\.Base/);
  });

  it("job suffix is not duplicated", async () => {
    const root = await runGenerator(["notifier_job"]);

    expect(File.isExist(File.join(root, "app/jobs/notifier-job-job.ts"))).toBe(false);
    expect(File.isExist(File.join(root, "app/jobs/notifier-job.ts"))).toBe(true);

    expect(File.isExist(File.join(root, "test/jobs/notifier-job-job.test.ts"))).toBe(false);
    expect(File.isExist(File.join(root, "test/jobs/notifier-job.test.ts"))).toBe(true);
  });
});
