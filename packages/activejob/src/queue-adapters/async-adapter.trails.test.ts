import { describe, expect, it } from "vitest";
import { registerConstant, Thread } from "@blazetrails/ruby-compat";
import "../test-helpers/helper.js";
import { Base } from "../base.js";
import { AsyncAdapter } from "./async-adapter.js";

const threads: Thread[] = [];

class ThreadRecordingJob extends Base {
  static toString(): string {
    return "ThreadRecordingJob";
  }

  async perform(): Promise<void> {
    const thread = Thread.current();
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(Thread.current()).toBe(thread);
    threads.push(thread);
  }
}
registerConstant("ThreadRecordingJob", ThreadRecordingJob);

describe("AsyncAdapter", () => {
  it("runs two concurrent jobs in separate execution contexts", async () => {
    const adapter = new AsyncAdapter({ maxThreads: 2 });
    await adapter.enqueue(new ThreadRecordingJob());
    await adapter.enqueue(new ThreadRecordingJob());
    await adapter.shutdown();
    expect(threads).toHaveLength(2);
    expect(threads[0]).not.toBe(threads[1]);
  });

  it("sets a provider job id on enqueue", async () => {
    const adapter = new AsyncAdapter();
    adapter.immediate = true;
    const job = new ThreadRecordingJob();
    await adapter.enqueue(job);
    expect(job.providerJobId).toMatch(/^[0-9a-f-]{36}$/);
  });
});
