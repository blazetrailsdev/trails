import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  permanentConnectionCheckout,
  setPermanentConnectionCheckout,
} from "@blazetrails/activerecord/active-record";
import { seconds } from "@blazetrails/activesupport";
import { Dispatcher, Job, Process, SolidQueueAdapter, Worker } from "./index.js";
import { ApplicationJob } from "./test-helpers/application-job.js";
import { AddToBufferJob, JobBuffer } from "./test-helpers/add-to-buffer-job.js";
import { loadAppSchema, loadQueueSchema } from "./test-helpers/queue-schema.js";

const sleep = (s: number) => new Promise((resolve) => setTimeout(resolve, s * 1000));

describe("SolidQueue::Dispatcher (trails)", () => {
  let oldPermanentConnectionCheckout: ReturnType<typeof permanentConnectionCheckout>;

  beforeAll(async () => {
    await loadQueueSchema();
    await loadAppSchema();
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
    oldPermanentConnectionCheckout = permanentConnectionCheckout();
    setPermanentConnectionCheckout(true);
  });

  afterAll(async () => {
    setPermanentConnectionCheckout(oldPermanentConnectionCheckout);
    JobBuffer.values.length = 0;
    await Job.destroyAll();
    await Process.destroyAll();
  });

  it("performs a job enqueued with wait: only after its time", async () => {
    const dispatcher = new Dispatcher({ pollingInterval: 0.05, batchSize: 10 });
    const worker = new Worker({ queues: "background", threads: 1, pollingInterval: 0.05 });
    try {
      await AddToBufferJob.set({ wait: seconds(2) }).performLater("later");
      await dispatcher.start();
      await worker.start();

      await sleep(0.2);
      expect(JobBuffer.values).toEqual([]);

      const end = Date.now() + 4000;
      while (Date.now() < end && JobBuffer.values.length === 0) await sleep(0.05);
      expect(JobBuffer.values).toEqual(["later"]);
    } finally {
      await worker.stop();
      await dispatcher.stop();
    }
  });
});
