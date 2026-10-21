import { describe, expect, it } from "vitest";
import { Base as JobBase } from "@blazetrails/activejob";
import { EnqueueAfterTransactionCommit } from "@blazetrails/activejob/enqueue-after-transaction-commit";
import { TestAdapter } from "@blazetrails/activejob/queue-adapters/test-adapter";
import { include, registerConstant } from "@blazetrails/ruby-compat";
import { fixtures } from "./test-helpers/use-fixtures.js";
import { Topic } from "./test-helpers/models/topic.js";

include(JobBase, EnqueueAfterTransactionCommit);

class AfterCommitTopicJob extends JobBase {
  static toString(): string {
    return "AfterCommitTopicJob";
  }

  perform(): void {}
}
AfterCommitTopicJob.enqueueAfterTransactionCommit = true;
registerConstant("AfterCommitTopicJob", AfterCommitTopicJob);

describe("EnqueueAfterTransactionCommit with a real transaction", () => {
  fixtures(["topics"]);

  it("enqueues a job only after the transaction commits", async () => {
    const adapter = new TestAdapter();
    AfterCommitTopicJob.setQueueAdapter(adapter);

    await Topic.transaction(async () => {
      await Topic.create({ title: "enqueued after commit" });
      await AfterCommitTopicJob.performLater();
      expect(adapter.enqueuedJobs.length).toBe(0);
    });

    expect(adapter.enqueuedJobs.length).toBe(1);
    expect(adapter.enqueuedJobs[0][":job"]).toBe(AfterCommitTopicJob);
  });
});
