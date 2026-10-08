import { describe, expect, it } from "vitest";
import { ObjectSpace } from "./object-space.js";

const gc = (globalThis as { gc?: () => void }).gc;

describe("ObjectSpace::WeakMap", () => {
  it("[]= returns the value; each_key yields each key once, in insertion order, and returns the map", async () => {
    const map = new ObjectSpace.WeakMap<object, object>();
    const a = { name: "a" };
    const b = { name: "b" };
    map.set(a, a);
    map.set(b, b);
    expect(map.set(a, b)).toBe(b);
    const keys: object[] = [];
    expect(await map.eachKey((key) => keys.push(key))).toBe(map);
    expect(keys).toEqual([a, b]);
  });

  it("each_key awaits the block before yielding the next key", async () => {
    const map = new ObjectSpace.WeakMap<object, object>();
    const a = {};
    const b = {};
    map.set(a, a);
    map.set(b, b);
    const order: string[] = [];
    await map.eachKey(async (key) => {
      order.push(key === a ? "enter a" : "enter b");
      await Promise.resolve();
      order.push(key === a ? "leave a" : "leave b");
    });
    expect(order).toEqual(["enter a", "leave a", "enter b", "leave b"]);
  });

  it.skipIf(!gc)("holds its keys weakly and yields only live ones", async () => {
    const map = new ObjectSpace.WeakMap<object, object>();
    const live = {};
    map.set(live, live);
    (() => {
      const dead = {};
      map.set(dead, dead);
    })();
    await new Promise((resolve) => setTimeout(resolve, 0));
    gc!();
    const keys: object[] = [];
    await map.eachKey((key) => keys.push(key));
    expect(keys).toEqual([live]);
  });
});
