import { Logger, TaggedLogging } from "@blazetrails/activesupport";
import { describe, expect, it } from "vitest";
import "./test-helpers/helper.js";
import { Base } from "./base.js";
import { NestedJob } from "./test-helpers/jobs/nested-job.js";

describe("Logging", () => {
  it("tags nested jobs with ActiveJob once", async () => {
    const lines: string[] = [];
    const original = Base.logger;
    Base.logger = TaggedLogging.new(new Logger({ write: (s: string) => void lines.push(s) }));
    try {
      await NestedJob.performNow();
    } finally {
      Base.logger = original;
    }
    expect(lines.join("")).toContain(
      "[ActiveJob] [NestedJob] [NESTED-JOB-ID] [LoggingJob] [LOGGING-JOB-ID] Dummy, here is it: NestedJob",
    );
  });

  it("log_arguments? defaults to true", () => {
    expect(Base.isLogArguments).toBe(true);
  });
});
