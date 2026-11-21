import type {} from "@blazetrails/vitest-matchers";
import { afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import "./support/dummy-application.js";
import { minutes, seconds } from "@blazetrails/activesupport";
import {
  assertChanges,
  assertDifference,
  assertInDelta,
  assertNoDifference,
} from "@blazetrails/activesupport/testing/assertions";
import { freezeTime, travelBack, travelTo } from "@blazetrails/activesupport/testing/time-helpers";
import { Job, Pause, Queue, ReadyExecution, Semaphore, SolidQueueAdapter } from "../lib/index.js";
import { JobResult } from "./support/job-result.js";
import { loadAppSchema } from "./support/queue-schema.js";
import { NonOverlappingUpdateResultJob } from "./support/non-overlapping-update-result-job.js";
import { ApplicationJob } from "./support/application-job.js";
import { AddToBufferJob } from "./support/add-to-buffer-job.js";
import "./test-helper.js";

describe("QueueTest", () => {
  let backgroundQueue: Queue;
  let defaultQueue: Queue;

  beforeAll(async () => {
    await loadAppSchema();
    ApplicationJob.queueAdapter = new SolidQueueAdapter();
  });

  beforeEach(async () => {
    freezeTime();

    for (let i = 0; i < 5; i++) await AddToBufferJob.performLater("hey!");

    backgroundQueue = Queue.findByName("background");
    defaultQueue = Queue.findByName("default");
  });

  afterEach(async () => {
    travelBack();
    await Pause.deleteAll();
  });

  it("count jobs currently in a queue", async () => {
    expect(await backgroundQueue.size()).toBe(5);
    expect(await defaultQueue.size()).toBe(0);
  });

  it("clear queue", async () => {
    await assertDifference([() => Job.count(), () => ReadyExecution.count()], -5, null, () =>
      backgroundQueue.clear(),
    );
    expect(await backgroundQueue.size()).toBe(0);

    await assertNoDifference([() => Job.count(), () => ReadyExecution.count()], null, () =>
      defaultQueue.clear(),
    );
  });

  for (const nextQueue of ["default", "background"]) {
    it(`clear queue unblocks the next job in ${nextQueue}`, async () => {
      const result = await JobResult.createBang({});
      for (const queue of ["default", nextQueue, nextQueue]) {
        await NonOverlappingUpdateResultJob.set({ queue: queue }).performLater(result, {
          name: "A",
        });
      }
      const [readyJob, nextJob, blockedJob] = await Job.last(3);

      await assertDifference(
        () => Job.count(),
        -1,
        null,
        () => defaultQueue.clear(),
      );

      expect(await Job.isExists(readyJob.id)).toBeFalsy();
      expect(await (await nextJob.reload()).isReady()).toBeTruthy();
      expect(await nextJob.isBlocked()).toBeFalsy();
      expect(await (await blockedJob.reload()).isBlocked()).toBeTruthy();
      expect((await Semaphore.findByBang({ key: readyJob.concurrency_key })).value).toEqual(0);
    });
  }

  it("all existing queues", async () => {
    expect(await Queue.all()).toEqualRuby([backgroundQueue]);
  });

  it("pause and resume queue", async () => {
    await assertChanges(
      () => defaultQueue.isPaused(),
      null,
      { from: false, to: true },
      () => defaultQueue.pause(),
    );

    await assertChanges(
      () => defaultQueue.isPaused(),
      null,
      { from: true, to: false },
      () => defaultQueue.resume(),
    );
  });

  it("return latency in seconds on each queue", async () => {
    travelTo(minutes(5).fromNow());

    assertInDelta(minutes(5).toI(), await backgroundQueue.latency(), seconds(1).toI());
    expect(await defaultQueue.latency()).toBe(0);

    backgroundQueue = Queue.findByName("background");
    defaultQueue = Queue.findByName("default");
    travelTo(minutes(10).fromNow());

    assertInDelta(minutes(15).toI(), await backgroundQueue.latency(), seconds(1).toI());
    expect(await defaultQueue.latency()).toBe(0);
  });

  it("returns memoized latency after the first call", async () => {
    travelTo(minutes(5).fromNow());

    assertInDelta(minutes(5).toI(), await backgroundQueue.latency(), seconds(1).toI());

    travelTo(minutes(10).fromNow());

    assertInDelta(minutes(5).toI(), await backgroundQueue.latency(), seconds(1).toI());
  });

  it("return human latency on each queue", async () => {
    travelTo(minutes(5).fromNow());

    expect(await backgroundQueue.humanLatency()).toMatch(/5 minutes/);
    expect(await defaultQueue.humanLatency()).toMatch(/0 seconds/);
  });
});
