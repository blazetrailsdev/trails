import { describe, expect, it } from "vitest";
import { NotImplementedError, rbModConstSet } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { Callbacks } from "./callbacks.js";
import { ActiveJob } from "./namespaces.js";

class OtherError extends Error {}

describe("ActiveJob::Execution", () => {
  it("awaits an async perform before perform_now resolves", async () => {
    const log: string[] = [];
    class SlowJob extends Base {
      async perform(name: unknown): Promise<string> {
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push(`performed ${name}`);
        return "done";
      }
    }
    const job = new SlowJob("mike");
    expect(await job.performNow()).toBe("done");
    expect(log).toEqual(["performed mike"]);
    expect(job.executions).toBe(1);
  });

  it("hands a rejected perform to rescue_with_handler", async () => {
    const rescued: unknown[] = [];
    class RescuingJob extends Base {
      async perform(): Promise<void> {
        await Promise.resolve();
        throw new OtherError("boom");
      }
    }
    RescuingJob.rescueFrom(OtherError, {
      with: async (e: unknown) => {
        await Promise.resolve();
        rescued.push(e);
      },
    });
    const job = new RescuingJob();
    const handled = await job.performNow();
    expect(rescued).toHaveLength(1);
    expect(handled).toBe(rescued[0]);
  });

  it("raises NotImplementedError from the default perform", async () => {
    class EmptyJob extends Base {}
    EmptyJob.rescueFrom(NotImplementedError, { with: () => null });
    await expect(new EmptyJob().performNow()).resolves.toBeInstanceOf(NotImplementedError);
  });

  it("performs through the class-level perform_now", async () => {
    class EchoJob extends Base {
      perform(value: unknown): unknown {
        return value;
      }
    }
    expect(await EchoJob.performNow("hi")).toBe("hi");
  });

  it("runs execute inside the ActiveJob::Callbacks execute chain", async () => {
    expect(ActiveJob.Callbacks).toBe(Callbacks);
    class ExecutedJob extends Base {
      async perform(value: unknown): Promise<unknown> {
        await Promise.resolve();
        return value;
      }
    }
    rbModConstSet(ActiveJob, "ExecutedJob", ExecutedJob);
    const jobData = new ExecutedJob(1).serialize();
    expect(await Base.execute(jobData)).toBe(1);
  });
});
