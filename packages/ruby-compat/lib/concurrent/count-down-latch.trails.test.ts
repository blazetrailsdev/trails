import { describe, it, expect } from "vitest";
import { Concurrent } from "../index.js";

describe("Concurrent::CountDownLatch", () => {
  it("wait answers true once the count reaches zero", async () => {
    const latch = new Concurrent.CountDownLatch(2);
    expect(await latch.wait(0)).toBe(false);
    latch.countDown();
    const waiting = latch.wait();
    latch.countDown();
    expect(await waiting).toBe(true);
    expect(await latch.wait(0)).toBe(true);
  });
});

describe("Concurrent::Event", () => {
  it("wait answers true once the event is set", async () => {
    const event = new Concurrent.Event();
    expect(event.isSet()).toBe(false);
    expect(await event.wait(0.001)).toBe(false);
    const waiting = event.wait();
    event.set();
    expect(await waiting).toBe(true);
    expect(event.isSet()).toBe(true);
  });
});
