import { describe, expect, it } from "vitest";
import { SubscriberMap } from "./subscriber-map.js";

describe("SubscriberMap", () => {
  it("calls onSuccess for new and known channels and removes empty channels", () => {
    const map = new SubscriberMap();
    const seen: unknown[] = [];
    const cb = (m: unknown) => seen.push(m);
    let successes = 0;
    map.addSubscriber("a", cb, () => successes++);
    map.addSubscriber("a", cb, () => successes++);
    expect(successes).toBe(2);
    map.broadcast("a", "x");
    expect(seen).toEqual(["x", "x"]);
    map.removeSubscriber("a", cb);
    map.removeSubscriber("a", cb);
    map.broadcast("a", "y");
    expect(seen).toEqual(["x", "x"]);
    map.removeSubscriber("unknown", cb);
    expect((map as unknown as { subscribers: object }).subscribers).toEqual({});
  });
});
