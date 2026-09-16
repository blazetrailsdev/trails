import { describe, it, expect, beforeEach } from "vitest";
import { inspect } from "@blazetrails/ruby-compat";
import { OrderedHash } from "./ordered-hash.js";
import { withIndifferentAccess } from "./core-ext/hash/indifferent-access.js";
import { extractOptionsBang } from "./hash-utils.js";

const Enumerator = (globalThis as unknown as { Iterator: abstract new () => unknown }).Iterator;

describe("OrderedHashTest", () => {
  let keys: string[];
  let values: string[];
  let hash: Map<string, string>;
  let orderedHash: OrderedHash<string, string>;

  beforeEach(() => {
    keys = ["blue", "green", "red", "pink", "orange"];
    values = ["000099", "009900", "aa0000", "cc0066", "cc6633"];
    hash = new Map();
    orderedHash = new OrderedHash();

    keys.forEach((key, index) => {
      hash.set(key, values[index]);
      orderedHash.set(key, values[index]);
    });
  });

  it("order", () => {
    expect([...orderedHash.keys()]).toEqual(keys);
    expect([...orderedHash.values()]).toEqual(values);
  });

  it("access", () => {
    expect([...hash].every(([k, v]) => orderedHash.get(k) === v)).toBeTruthy();
  });

  it("assignment", () => {
    const [key, value] = ["purple", "5422a8"];

    orderedHash.set(key, value);
    expect(orderedHash.size).toEqual(keys.length + 1);
    expect([...orderedHash.keys()].at(-1)).toEqual(key);
    expect([...orderedHash.values()].at(-1)).toEqual(value);
    expect(orderedHash.get(key)).toEqual(value);
  });

  it("delete", () => {
    const [key, value] = ["white", "ffffff"];
    const badKey = "black";

    orderedHash.set(key, value);
    expect(orderedHash.size).toEqual(keys.length + 1);
    expect(orderedHash.size).toEqual([...orderedHash.keys()].length);

    const deleted = orderedHash.get(key);
    orderedHash.delete(key);
    expect(deleted).toEqual(value);
    expect(orderedHash.size).toEqual(keys.length);
    expect(orderedHash.size).toEqual([...orderedHash.keys()].length);

    expect(orderedHash.get(badKey)).toBeUndefined();
  });

  it("to hash", () => {
    const h = new OrderedHash<string, number>();
    h.set("x", 10);
    h.set("y", 20);
    expect(h.toObject()).toEqual({ x: 10, y: 20 });
  });

  it("to a", () => {
    expect(orderedHash.toArray()).toEqual(keys.map((k, i) => [k, values[i]]));
  });

  it("has key", () => {
    expect(orderedHash.has("blue")).toEqual(true);
    expect(orderedHash.has("blue")).toEqual(true);
    expect(orderedHash.has("blue")).toEqual(true);
    expect(orderedHash.has("blue")).toEqual(true);

    expect(orderedHash.has("indigo")).toEqual(false);
    expect(orderedHash.has("indigo")).toEqual(false);
    expect(orderedHash.has("indigo")).toEqual(false);
    expect(orderedHash.has("indigo")).toEqual(false);
  });

  it("has value", () => {
    expect(orderedHash.hasValue("000099")).toEqual(true);
    expect(orderedHash.hasValue("000099")).toEqual(true);
    expect(orderedHash.hasValue("ABCABC")).toEqual(false);
    expect(orderedHash.hasValue("ABCABC")).toEqual(false);
  });

  it("each key", () => {
    const eachKeys: string[] = [];
    expect(orderedHash.eachKey((k) => eachKeys.push(k))).toEqual(orderedHash);
    expect(eachKeys).toEqual(keys);
    expect(orderedHash.eachKey()).toBeInstanceOf(Enumerator);
  });

  it("each value", () => {
    const eachValues: string[] = [];
    expect(orderedHash.eachValue((v) => eachValues.push(v))).toEqual(orderedHash);
    expect(eachValues).toEqual(values);
    expect(orderedHash.eachValue()).toBeInstanceOf(Enumerator);
  });

  it("each", () => {
    const eachValues: string[] = [];
    expect(orderedHash.each((_key, value) => eachValues.push(value))).toEqual(orderedHash);
    expect(eachValues).toEqual(values);
    expect(orderedHash.each()).toBeInstanceOf(Enumerator);
  });

  it("each with index", () => {
    [...orderedHash].forEach((pair, index) => expect(pair).toEqual([keys[index], values[index]]));
  });

  it("each pair", () => {
    const pairValues: string[] = [];
    const pairKeys: string[] = [];
    orderedHash.eachPair((key, value) => {
      pairKeys.push(key);
      pairValues.push(value);
    });
    expect(pairValues).toEqual(values);
    expect(pairKeys).toEqual(keys);
    expect(orderedHash.eachPair()).toBeInstanceOf(Enumerator);
  });

  it("find all", () => {
    expect([...orderedHash.select(() => true)].map((pair) => pair[0])).toEqual(keys);
  });

  it("select", () => {
    const newOrderedHash = orderedHash.select(() => true);
    expect([...newOrderedHash].map((pair) => pair[0])).toEqual(keys);
    expect(newOrderedHash).toBeInstanceOf(OrderedHash);
  });

  it("delete if", () => {
    const copy = new OrderedHash(orderedHash);
    copy.delete("pink");
    expect(orderedHash.deleteIf((k) => k === "pink")).toEqual(copy);
    expect([...orderedHash.keys()]).not.toContain("pink");
  });

  it("reject!", () => {
    const copy = new OrderedHash(orderedHash);
    copy.delete("pink");
    orderedHash.rejectBang((k) => k === "pink");
    expect(orderedHash).toEqual(copy);
    expect([...orderedHash.keys()]).not.toContain("pink");
  });

  it("reject", () => {
    const copy = new OrderedHash(orderedHash);
    const newOrderedHash = orderedHash.reject((k) => k === "pink");
    expect(orderedHash).toEqual(copy);
    expect([...newOrderedHash.keys()]).not.toContain("pink");
    expect([...orderedHash.keys()]).toContain("pink");
    expect(newOrderedHash).toBeInstanceOf(OrderedHash);
  });

  it("clear", () => {
    orderedHash.clear();
    expect([...orderedHash.keys()]).toEqual([]);
  });

  it("merge", () => {
    const otherHash = new OrderedHash<string, string>();
    otherHash.set("purple", "800080");
    otherHash.set("violet", "ee82ee");
    const merged = orderedHash.merge(otherHash);
    expect(orderedHash.size + otherHash.size).toEqual(merged.size);
    expect([...merged.keys()]).toEqual([...keys, "purple", "violet"]);
  });

  it("merge with block", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 0);
    h.set("b", 0);
    const merged = h.merge(
      new OrderedHash([
        ["b", 2],
        ["c", 7],
      ]),
      (_key, _oldValue, newValue) => newValue + 1,
    );

    expect(merged.get("a")).toEqual(0);
    expect(merged.get("b")).toEqual(3);
    expect(merged.get("c")).toEqual(7);
  });

  it("merge bang with block", () => {
    const h = new OrderedHash<string, number>();
    h.set("a", 0);
    h.set("b", 0);
    h.mergeInPlace(
      new OrderedHash([
        ["a", 1],
        ["c", 7],
      ]),
      (_key, _oldValue, newValue) => newValue + 3,
    );

    expect(h.get("a")).toEqual(4);
    expect(h.get("b")).toEqual(0);
    expect(h.get("c")).toEqual(7);
  });

  it("shift", () => {
    const pair = orderedHash.shift()!;
    expect(pair).toEqual([keys[0], values[0]]);
    expect([...orderedHash.keys()]).not.toContain(pair[0]);
  });

  it("keys", () => {
    const original = [...orderedHash.keys()];
    [...orderedHash.keys()].pop();
    expect([...orderedHash.keys()]).toEqual(original);
  });

  it("inspect", () => {
    expect(orderedHash.inspect()).toContain(inspect(hash));
  });

  it("json", () => {
    const h = new OrderedHash<string, number>();
    h.set("x", 42);
    const json = JSON.stringify(h.toObject());
    expect(json).toBe('{"x":42}');
  });

  it("alternate initialization with splat", () => {
    const alternate = OrderedHash.from([
      [1, 2],
      [3, 4],
    ]);
    expect(alternate).toBeInstanceOf(OrderedHash);
    expect([...alternate.keys()]).toEqual([1, 3]);
  });

  it("alternate initialization with array", () => {
    const alternate = OrderedHash.from<number | string, number | null>([
      [1, 2],
      [3, 4],
      ["missing value", null],
    ]);

    expect(alternate).toBeInstanceOf(OrderedHash);
    expect([...alternate.keys()]).toEqual([1, 3, "missing value"]);
    expect([...alternate.values()]).toEqual([2, 4, null]);
  });

  it("alternate initialization raises exception on odd length args", () => {
    expect(() => OrderedHash.from([["a", 1], ["b"]] as any)).toThrow();
  });

  it("replace updates keys", () => {
    const otherOrderedHash = OrderedHash.from([
      ["black", "000000"],
      ["white", "000000"],
    ]);
    const original = orderedHash.replace(otherOrderedHash);
    expect(original).toBe(orderedHash);
    expect([...orderedHash.keys()]).toEqual([...otherOrderedHash.keys()]);
  });

  it("nested under indifferent access", () => {
    const flash = withIndifferentAccess({
      a: OrderedHash.from([
        ["b", 1],
        ["c", 2],
      ]),
    });
    expect(flash.get("a")).toBeInstanceOf(OrderedHash);
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
    orderedHash.set("rails", "snowman");
    expect(extractOptionsBang([1, 2, orderedHash])).toEqual(orderedHash);
  });

  it.skip("each after yaml serialization");
  it.skip("each when yielding to block with splat");
  it.skip("each pair when yielding to block with splat");
  it.skip("order after yaml serialization");
  it.skip("order after yaml serialization with nested arrays");
  it.skip("psych serialize");
  it.skip("psych serialize tag");
  it.skip("has yaml tag");
});
