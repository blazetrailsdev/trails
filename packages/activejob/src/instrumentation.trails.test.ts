import { describe, expect, it } from "vitest";
import { Notifications } from "@blazetrails/activesupport";
import { Base } from "./base.js";
import "./test-helpers/helper.js";
import { AbortBeforeEnqueueJob } from "./test-helpers/jobs/abort-before-enqueue-job.js";

describe("ActiveJob::Instrumentation", () => {
  it("a perform.active_job event's duration covers an awaited perform body", async () => {
    const order: string[] = [];
    class SlowJob extends Base {
      async perform(): Promise<string> {
        await new Promise((resolve) => setTimeout(resolve, 20));
        order.push("performed");
        return "done";
      }
    }
    const events: Array<{ name: string; duration: number; payload: Record<string, unknown> }> = [];
    const subscriber = Notifications.subscribe(/\.active_job$/, (event: never) => {
      const e = event as { name: string; duration: number; payload: Record<string, unknown> };
      order.push(e.name);
      events.push(e);
    });
    try {
      const job = new SlowJob();
      expect(await job.performNow()).toBe("done");
      expect(order).toEqual(["perform_start.active_job", "performed", "perform.active_job"]);
      const perform = events.find((e) => e.name === "perform.active_job")!;
      expect(perform.duration).toBeGreaterThanOrEqual(15);
      expect(perform.payload["job"]).toBe(job);
      expect(perform.payload["adapter"]).toBe(SlowJob.queueAdapter);
      expect(perform.payload["aborted"]).toBeNull();
    } finally {
      Notifications.unsubscribe(subscriber);
    }
  });

  it("marks an enqueue halted by a before_enqueue callback as aborted", async () => {
    const payloads: Record<string, unknown>[] = [];
    const subscriber = Notifications.subscribe("enqueue.active_job", (event: never) => {
      payloads.push((event as { payload: Record<string, unknown> }).payload);
    });
    try {
      await AbortBeforeEnqueueJob.performLater();
      expect(payloads.length).toBe(1);
      expect(payloads[0]["aborted"]).toBe(true);
    } finally {
      Notifications.unsubscribe(subscriber);
    }
  });
});
