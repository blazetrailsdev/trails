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
import type { Time } from "@blazetrails/date";
import { Job, Pause, Queue, ReadyExecution, SolidQueueAdapter } from "../lib/index.js";
import { ApplicationJob } from "./support/application-job.js";
import { AddToBufferJob } from "./support/add-to-buffer-job.js";

describe("QueueTest", () => {
  let backgroundQueue: Queue;
  let defaultQueue: Queue;

  beforeAll(async () => {
    ApplicationJob.setQueueAdapter(new SolidQueueAdapter());
  });

  beforeEach(async () => {
    freezeTime();

    for (let i = 0; i < 5; i++) await AddToBufferJob.performLater("hey!");

    backgroundQueue = Queue.findByName("background");
    defaultQueue = Queue.findByName("default");
  });

  afterEach(async () => {
    travelBack();
    await Job.destroyAll();
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
    travelTo(minutes(5).fromNow() as Time);

    assertInDelta(minutes(5).toI(), await backgroundQueue.latency(), seconds(1).toI());
    expect(await defaultQueue.latency()).toBe(0);

    backgroundQueue = Queue.findByName("background");
    defaultQueue = Queue.findByName("default");
    travelTo(minutes(10).fromNow() as Time);

    assertInDelta(minutes(15).toI(), await backgroundQueue.latency(), seconds(1).toI());
    expect(await defaultQueue.latency()).toBe(0);
  });

  it("returns memoized latency after the first call", async () => {
    travelTo(minutes(5).fromNow() as Time);

    assertInDelta(minutes(5).toI(), await backgroundQueue.latency(), seconds(1).toI());

    travelTo(minutes(10).fromNow() as Time);

    assertInDelta(minutes(5).toI(), await backgroundQueue.latency(), seconds(1).toI());
  });

  it("return human latency on each queue", async () => {
    travelTo(minutes(5).fromNow() as Time);

    expect(await backgroundQueue.humanLatency()).toMatch(/5 minutes/);
    expect(await defaultQueue.humanLatency()).toMatch(/0 seconds/);
  });
});
