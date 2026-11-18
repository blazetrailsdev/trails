import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seconds, type Duration } from "@blazetrails/activesupport";
import { ForkGuard, NullGuard } from "../lib/processes/runnable.js";
import { SolidQueue } from "../lib/solid-queue.js";

const sleep = (s: number) => new Promise((resolve) => setTimeout(resolve, s * 1000));

describe("BootGuardsTest", () => {
  let previousForkBootTimeout: Duration;
  let guard: ForkGuard | NullGuard | null = null;

  beforeEach(() => {
    previousForkBootTimeout = SolidQueue.forkBootTimeout;
    SolidQueue.forkBootTimeout = seconds(0.1);
  });

  afterEach(() => {
    SolidQueue.forkBootTimeout = previousForkBootTimeout;
    guard?.close();
    guard = null;
  });

  it("a fork guard times out when boot doesn't complete within the configured timeout", async () => {
    guard = new ForkGuard();

    expect(guard.isCompleted()).toBe(false);
    expect(guard.isTimedOut()).toBe(false);

    await sleep(SolidQueue.forkBootTimeout.toF());

    expect(guard.isCompleted()).toBe(false);
    expect(guard.isTimedOut()).toBe(true);
  });

  it.skip("a fork guard completed from the forked process doesn't time out", () => {});

  it.skip("a fork guard reads as completed when the forked process exits before finishing its boot", () => {});

  it("a null guard completes on boot and never times out", () => {
    guard = new NullGuard();

    expect(guard.isCompleted()).toBeFalsy();
    expect(guard.isTimedOut()).toBe(false);

    guard.complete();

    expect(guard.isCompleted()).toBe(true);
    expect(guard.isTimedOut()).toBe(false);
  });
});
