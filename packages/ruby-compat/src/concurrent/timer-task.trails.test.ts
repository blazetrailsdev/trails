import { describe, expect, it } from "vitest";
import { AtomicFixnum } from "./atomic-fixnum.js";
import { Concurrent } from "./map.js";
import { TimerTask } from "./timer-task.js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

describe("TimerTask", () => {
  it("runs repeatedly after the first interval and never again after shutdown", async () => {
    let runs = 0;
    const task = new TimerTask({ executionInterval: 0.05 }, () => {
      runs += 1;
    }).execute();
    expect(task).toBeInstanceOf(Concurrent.TimerTask);
    expect(task.executionInterval).toBe(0.05);
    await sleep(20);
    expect(runs).toBe(0);
    await sleep(160);
    expect(runs).toBeGreaterThanOrEqual(2);

    task.shutdown();
    task.shutdown();
    const after = runs;
    await sleep(120);
    expect(runs).toBe(after);
  });

  it("keeps running after the block raises", async () => {
    let runs = 0;
    const task = new TimerTask({ executionInterval: 0.02 }, () => {
      runs += 1;
      throw new Error("boom");
    }).execute();
    await sleep(110);
    task.shutdown();
    expect(runs).toBeGreaterThanOrEqual(2);
  });

  it("does not overlap a pending async run", async () => {
    let active = 0;
    let peak = 0;
    const task = new TimerTask({ executionInterval: 0.01 }, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(40);
      active -= 1;
    }).execute();
    await sleep(150);
    task.shutdown();
    expect(peak).toBe(1);
  });
});

describe("TimerTask restart", () => {
  it("keeps one chain when restarted while a run is pending", async () => {
    let active = 0;
    let peak = 0;
    const task = new TimerTask({ executionInterval: 0.01 }, async () => {
      active += 1;
      peak = Math.max(peak, active);
      await sleep(30);
      active -= 1;
    }).execute();
    await sleep(15);
    task.shutdown();
    task.execute();
    await sleep(150);
    task.shutdown();
    expect(peak).toBe(1);
  });
});

describe("AtomicFixnum", () => {
  it("rejects a non-integer initial value", () => {
    expect(() => new AtomicFixnum(1.5)).toThrow("initial value must be a Fixnum");
  });

  it("answers the new value from increment and decrement", () => {
    const counter = new Concurrent.AtomicFixnum(1);
    expect(counter).toBeInstanceOf(AtomicFixnum);
    expect(counter.increment()).toBe(2);
    expect(counter.decrement()).toBe(1);
    expect(counter.decrement()).toBe(0);
    expect(counter.value).toBe(0);
  });
});
