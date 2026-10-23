import { describe, expect, it } from "vitest";
import { block, kernelThrow, registerConstant } from "@blazetrails/ruby-compat";
import { Base } from "./base.js";
import { ConfiguredJob } from "./configured-job.js";
import { ActiveJob } from "./namespaces.js";
import "./test-helpers/helper.js";
import { HelloJob } from "./test-helpers/jobs/hello-job.js";
import { JobBuffer } from "./test-helpers/support/job-buffer.js";

class AbortJob extends HelloJob {
  static toString(): string {
    return "AbortJob";
  }
}
registerConstant("AbortJob", AbortJob);
(AbortJob as unknown as { setCallback(...a: unknown[]): void }).setCallback(
  "enqueue",
  "before",
  () => kernelThrow(":abort"),
);

describe("ActiveJob::Enqueuing", () => {
  it("awaits perform_later's block before it resolves", async () => {
    const log: string[] = [];
    await HelloJob.performLater(
      "x",
      block(async (job: HelloJob) => {
        await new Promise((resolve) => setTimeout(resolve, 5));
        log.push(String(job.arguments[0]));
      }),
    );
    expect(log).toEqual(["x"]);
  });

  it("perform_later returns false when a before_enqueue callback aborts", async () => {
    expect(await AbortJob.performLater()).toBe(false);
    expect(JobBuffer.values()).toEqual([]);
  });

  it("perform_all_later returns nil", async () => {
    expect(await ActiveJob.performAllLater(new HelloJob("a"))).toBeNull();
  });

  it("defaults enqueue_after_transaction_commit to false", () => {
    expect(Base.enqueueAfterTransactionCommit).toBe(false);
  });
});

describe("ActiveJob::ConfiguredJob", () => {
  it("perform_now sets the options then performs", async () => {
    await new ConfiguredJob(HelloJob, { queue: "low" }).performNow("Ada");
    expect(JobBuffer.lastValue()).toBe("Ada says hello");
  });

  it("perform_later enqueues with the options", async () => {
    const job = (await new ConfiguredJob(HelloJob, { priority: 3 }).performLater("Bo")) as HelloJob;
    expect(job.priority).toBe(3);
    expect(JobBuffer.lastValue()).toBe("Bo says hello");
  });

  it("perform_all_later calls a class method Rails 8.0.2 does not define", async () => {
    await expect(new ConfiguredJob(HelloJob).performAllLater([["a"]])).rejects.toThrow(TypeError);
  });
});
