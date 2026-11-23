import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { seconds, type Duration } from "@blazetrails/activesupport";
import { rbFSleep as sleep } from "@blazetrails/ruby-compat";
import { ForkGuard, NullGuard } from "../lib/processes/runnable.js";
import { SolidQueue } from "../lib/solid-queue.js";

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

    expect(guard.isCompleted()).toBeFalsy();
    expect(guard.isTimedOut()).toBeFalsy();

    await sleep(SolidQueue.forkBootTimeout.toF());

    expect(guard.isCompleted()).toBeFalsy();
    expect(guard.isTimedOut()).toBeTruthy();
  });

  // BLOCKED: solid-queue-fork-mode-unported-register
  it.skip("a fork guard completed from the forked process doesn't time out", async () => {
    const forkGuard = new ForkGuard();
    guard = forkGuard;

    forkGuard.complete();
    forkGuard.start();

    expect(forkGuard.isCompleted()).toBeTruthy();

    await sleep(SolidQueue.forkBootTimeout.toF());

    expect(forkGuard.isCompleted()).toBeTruthy();
    expect(forkGuard.isTimedOut()).toBeFalsy();
  });

  // BLOCKED: solid-queue-fork-mode-unported-register
  it.skip("a fork guard reads as completed when the forked process exits before finishing its boot", () => {
    const forkGuard = new ForkGuard();
    guard = forkGuard;

    forkGuard.start();

    expect(forkGuard.isCompleted()).toBeTruthy();
    expect(forkGuard.isTimedOut()).toBeFalsy();
  });

  it("a null guard completes on boot and never times out", () => {
    guard = new NullGuard();

    expect(guard.isCompleted()).toBeFalsy();
    expect(guard.isTimedOut()).toBeFalsy();

    guard.complete();

    expect(guard.isCompleted()).toBeTruthy();
    expect(guard.isTimedOut()).toBeFalsy();
  });
});
