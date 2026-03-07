/**
 * OrderedHashTest — tests for OrderedHash, which mirrors Rails ActiveSupport::OrderedHash.
 * In Rails, OrderedHash is a deprecated Hash subclass that guarantees insertion order.
 * In modern JS, plain objects and Map both preserve insertion order.
 * We implement OrderedHash as a thin wrapper around Map.
 */
import { describe, it, expect } from "vitest";
import { OrderedHash } from "./ordered-hash.js";

describe("OrderedHashTest", () => {
  it("order", () => {
    const h = new OrderedHash<string, number>();
    h.set("b", 2);
    h.set("a", 1);
    h.set("c", 3);
    expect([...h.keys()]).toEqual(["b", "a", "c"]);
  });

  it("access", () => {
    const h = new OrderedHash<string, number>();
    h.set("foo", 42);
    expect(h.get("foo")).toBe(42);
    expect(h.get("bar")).toBeUndefined();
  });

  it("assignment", () => {
    const h = new OrderedHash<string, string>();
    h.set("key", "value");
    expect(h.get("key")).toBe("value");
    h.set("key", "new_value");
    expect(h.get("key")).toBe("new_value");
    expect(h.size).toBe(1);
  });

  it("delete", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    h.delete("a");
    expect(h.has("a")).toBe(false);
    expect(h.size).toBe(1);
  });

  it("to hash", () => {
    const h = new OrderedHash<string, number>();
    h.set("x", 10);
    h.set("y", 20);
    expect(h.toObject()).toEqual({ x: 10, y: 20 });
  });

  it("to a", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    expect(h.toArray()).toEqual([["a", 1], ["b", 2]]);
  });

  it("has key", () => {
    const h = new OrderedHash<string, number>();
    h.set("foo", 1);
    expect(h.has("foo")).toBe(true);
    expect(h.has("bar")).toBe(false);
  });

  it("has value", () => {
    const h = new OrderedHash<string, number>();
    h.set("foo", 42);
    expect(h.hasValue(42)).toBe(true);
    expect(h.hasValue(99)).toBe(false);
  });

  it("each key", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    const keys: string[] = [];
    h.forEach((_, k) => keys.push(k));
    expect(keys).toEqual(["a", "b"]);
  });

  it("each value", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    expect([...h.values()]).toEqual([1, 2]);
  });

  it("each", () => {
    const h = new OrderedHash<string, number>();
    h.set("x", 10);
    h.set("y", 20);
    const entries: [string, number][] = [];
    for (const [k, v] of h) entries.push([k, v]);
    expect(entries).toEqual([["x", 10], ["y", 20]]);
  });

  it("each with index", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    const indexed: [number, string, number][] = [];
    let i = 0;
    for (const [k, v] of h) { indexed.push([i++, k, v]); }
    expect(indexed[0]).toEqual([0, "a", 1]);
    expect(indexed[1]).toEqual([1, "b", 2]);
  });

  it("each pair", () => {
    const h = new OrderedHash<string, number>();
    h.set("p", 5);
    h.set("q", 6);
    const pairs: [string, number][] = [];
    for (const pair of h.entries()) pairs.push(pair);
    expect(pairs).toEqual([["p", 5], ["q", 6]]);
  });

  it("find all", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    h.set("c", 3);
    const result = h.select((k, v) => v > 1);
    expect([...result.keys()]).toEqual(["b", "c"]);
  });

  it("select", () => {
    const h = new OrderedHash<string, number>();
    h.set("x", 10);
    h.set("y", 5);
    const result = h.select((k, v) => v >= 10);
    expect(result.size).toBe(1);
    expect(result.get("x")).toBe(10);
  });

  it("delete if", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    h.set("c", 3);
    h.deleteIf((k, v) => v % 2 === 0);
    expect([...h.keys()]).toEqual(["a", "c"]);
  });

  it("reject!", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    h.reject((k, v) => v > 1);
    // reject! modifies in place
    h.deleteIf((k, v) => v > 1);
    expect(h.size).toBe(1);
    expect(h.has("a")).toBe(true);
  });

  it("reject", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    const result = h.reject((k, v) => v > 1);
    expect(result.size).toBe(1);
    expect(result.get("a")).toBe(1);
  });

  it("clear", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.clear();
    expect(h.size).toBe(0);
  });

  it("merge", () => {
    const h1 = new OrderedHash<string, number>();
    h1.set("a", 1);
    const h2 = new OrderedHash<string, number>();
    h2.set("b", 2);
    const merged = h1.merge(h2);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
  });

  it("merge with block", () => {
    const h1 = new OrderedHash<string, number>();
    h1.set("a", 1);
    const h2 = new OrderedHash<string, number>();
    h2.set("a", 2);
    const merged = h1.merge(h2, (k, v1, v2) => v1 + v2);
    expect(merged.get("a")).toBe(3);
  });

  it("merge bang with block", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    const other = new OrderedHash<string, number>();
    other.set("a", 2);
    h.mergeInPlace(other, (k, v1, v2) => v1 + v2);
    expect(h.get("a")).toBe(3);
  });

  it("shift", () => {
    const h = new OrderedHash<string, number>();
    h.set("first", 1);
    h.set("second", 2);
    const pair = h.shift();
    expect(pair).toEqual(["first", 1]);
    expect(h.size).toBe(1);
  });

  it("keys", () => {
    const h = new OrderedHash<string, number>();
    h.set("z", 3);
    h.set("a", 1);
    expect([...h.keys()]).toEqual(["z", "a"]);
  });

  it("inspect", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    expect(h.inspect()).toContain("a");
    expect(h.inspect()).toContain("1");
  });

  it("json", () => {
    const h = new OrderedHash<string, number>();
    h.set("x", 42);
    const json = JSON.stringify(h.toObject());
    expect(json).toBe('{"x":42}');
  });

  it("alternate initialization with splat", () => {
    const h = OrderedHash.from([["a", 1], ["b", 2]]);
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
  });

  it("alternate initialization with array", () => {
    const h = OrderedHash.from([["x", 10], ["y", 20]]);
    expect([...h.keys()]).toEqual(["x", "y"]);
  });

  it("alternate initialization raises exception on odd length args", () => {
    // In JS, this isn't directly applicable; we validate pairs instead
    expect(() => OrderedHash.from([["a", 1], ["b"]] as any)).toThrow();
  });

  it("replace updates keys", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    h.replace(new OrderedHash<string, number>([["c", 3]]));
    expect([...h.keys()]).toEqual(["c"]);
  });

  it("nested under indifferent access", () => {
    const h = new OrderedHash<string, unknown>();
    h.set("data", { nested: true });
    expect((h.get("data") as any).nested).toBe(true);
  });

  it("update sets keys", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    const other = new OrderedHash<string, number>();
    other.set("b", 2);
    h.update(other);
    expect(h.has("b")).toBe(true);
  });

  it("invert", () => {
    const h = new OrderedHash<string, number>();
    h.set("one", 1);
    h.set("two", 2);
    const inverted = h.invert();
    expect(inverted.get(1)).toBe("one");
    expect(inverted.get(2)).toBe("two");
  });

  it("extractable", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    const [key, value] = [...h.entries()][0];
    expect(key).toBe("a");
    expect(value).toBe(1);
  });

  it.skip("each after yaml serialization", () => { /* YAML not applicable in JS */ });
  it.skip("each when yielding to block with splat", () => { /* Ruby-specific block pattern */ });
  it.skip("each pair when yielding to block with splat", () => { /* Ruby-specific */ });
  it.skip("order after yaml serialization", () => { /* YAML */ });
  it.skip("order after yaml serialization with nested arrays", () => { /* YAML */ });
  it.skip("psych serialize", () => { /* YAML/Psych */ });
  it.skip("psych serialize tag", () => { /* YAML */ });
  it.skip("has yaml tag", () => { /* YAML */ });
});
