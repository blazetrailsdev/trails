import { describe, expect, it } from "vitest";
import { block } from "../hash.js";
import { Concurrent } from "./map.js";

describe("Concurrent::Map", () => {
  it("fetch_or_store stores the block's value, or the default value, once per eql? key", () => {
    const map = new Concurrent.Map<unknown[], number>();
    let calls = 0;
    const compute = block(() => ++calls);
    expect(map.fetchOrStore([1, "a"], compute)).toBe(1);
    expect(map.fetchOrStore([1, "a"], compute)).toBe(1);
    expect(map.fetchOrStore([2, "a"], 7)).toBe(7);
    expect(map.size()).toBe(2);
  });

  it("[] runs the default proc for a missing key only", () => {
    const map = new Concurrent.Map<string, string>(null, (h, key) => h.fetchOrStore(key, "A"));
    expect([map.get("a"), map.size()]).toEqual(["A", 1]);
    expect(new Concurrent.Map<string, string>().get("a")).toBeUndefined();
  });
});
