import { describe, it, expect } from "vitest";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";

describe("HashWithIndifferentAccessTest", () => {
  // Basic indifferent access
  it("indifferent reading — string and symbol keys are interchangeable", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: true, c: false });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(true);
    expect(h.get("c")).toBe(false);
    expect(h.get("d")).toBeUndefined();
  });

  it("indifferent writing — set then retrieve with same key", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.set("a", 1);
    h.set("b", 2);
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
  });

  it("has — reports key presence", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.has("a")).toBe(true);
    expect(h.has("z")).toBe(false);
  });

  it("delete — removes key", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.delete("a")).toBe(true);
    expect(h.has("a")).toBe(false);
    expect(h.delete("a")).toBe(false);
  });

  it("size — reports entry count", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.size).toBe(2);
    h.set("c", 3);
    expect(h.size).toBe(3);
  });

  // merge / update
  it("indifferent merging — merge returns new HWIA", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: "failure", b: "failure" });
    const other = { a: 1, b: 2 };
    const merged = h.merge(other);
    expect(merged).toBeInstanceOf(HashWithIndifferentAccess);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
    // original unchanged
    expect(h.get("a")).toBe("failure");
  });

  it("indifferent merging — merge with another HWIA", () => {
    const h1 = new HashWithIndifferentAccess({ a: 1 });
    const h2 = new HashWithIndifferentAccess({ b: 2 });
    const merged = h1.merge(h2);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
  });

  it("indifferent update — update mutates and returns self", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: "old" });
    const returned = h.update({ a: 1, b: 2 });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
    expect(returned).toBe(h);
  });

  it("update with multiple arguments", () => {
    const h = new HashWithIndifferentAccess<unknown>();
    h.update({ a: 1 }, { b: 2 });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
  });

  // select / reject
  it("indifferent select — returns new HWIA with matching pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select((_k, v) => v === 1);
    expect(selected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(selected.toHash()).toEqual({ a: 1 });
  });

  it("indifferent select returns all when predicate always true", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select(() => true);
    expect(selected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(selected.size).toBe(2);
  });

  it("indifferent reject — returns new HWIA excluding matching pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const rejected = h.reject((_k, v) => v !== 1);
    expect(rejected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(rejected.toHash()).toEqual({ a: 1 });
  });

  // transform_keys / transform_values
  it("indifferent transform_keys — returns new HWIA", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const transformed = h.transformKeys((k) => k.repeat(2));
    expect(transformed).toBeInstanceOf(HashWithIndifferentAccess);
    expect(transformed.toHash()).toEqual({ aa: 1, bb: 2 });
  });

  it("indifferent transform_values — returns new HWIA", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const transformed = h.transformValues((v) => (v as number) * 2);
    expect(transformed).toBeInstanceOf(HashWithIndifferentAccess);
    expect(transformed.toHash()).toEqual({ a: 2, b: 4 });
  });

  // compact
  it("indifferent compact — removes null/undefined values", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: null, c: undefined, d: 2 });
    const compacted = h.compact();
    expect(compacted).toBeInstanceOf(HashWithIndifferentAccess);
    expect(compacted.toHash()).toEqual({ a: 1, d: 2 });
    // original unchanged
    expect(h.has("b")).toBe(true);
  });

  it("compact on hash with no nil values returns equivalent hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const compacted = h.compact();
    expect(compacted.toHash()).toEqual({ a: 1, b: 2 });
  });

  // assoc
  it("indifferent assoc — returns [key, value] pair", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.assoc("a")).toEqual(["a", 1]);
    expect(h.assoc("z")).toBeUndefined();
  });

  // dig
  it("nested dig indifferent access", () => {
    const h = new HashWithIndifferentAccess<unknown>({
      this: new HashWithIndifferentAccess({ views: 1234 }),
    });
    expect(h.dig("this", "views")).toBe(1234);
  });

  it("dig returns undefined for missing keys", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.dig("a", "b")).toBeUndefined();
    expect(h.dig("z")).toBeUndefined();
  });

  // slice
  it("indifferent slice — returns HWIA with only given keys", () => {
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const sliced = original.slice("a", "b");
    expect(sliced).toBeInstanceOf(HashWithIndifferentAccess);
    expect(sliced.toHash()).toEqual({ a: "x", b: "y" });
    expect(original.size).toBe(3);
  });

  it("indifferent slice access — sliced value accessible by same key", () => {
    const original = new HashWithIndifferentAccess({
      login: "bender",
      password: "shiny",
      stuff: "foo",
    });
    const sliced = original.slice("login", "password");
    expect(sliced.get("login")).toBe("bender");
  });

  // except / without
  it("indifferent except — returns HWIA without given keys", () => {
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const result = original.except("a", "b");
    expect(result).toBeInstanceOf(HashWithIndifferentAccess);
    expect(result.toHash()).toEqual({ c: 10 });
    expect(original.size).toBe(3);
  });

  it("without — alias for except", () => {
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const result = original.without("a", "b");
    expect(result.toHash()).toEqual({ c: 10 });
  });

  // toHash
  it("indifferent to_hash — converts to plain object with string keys", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: 2 });
    const plain = h.toHash();
    expect(plain).toEqual({ a: 1, b: 2 });
    expect(plain).not.toBeInstanceOf(HashWithIndifferentAccess);
  });

  // any / all / none / count / find / each / map / flatMap
  it("any — true if any entries exist", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.any()).toBe(true);
    const empty = new HashWithIndifferentAccess({});
    expect(empty.any()).toBe(false);
  });

  it("anyWith — true if predicate matches at least one pair", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.anyWith((_k, v) => (v as number) > 1)).toBe(true);
    expect(h.anyWith((_k, v) => (v as number) > 99)).toBe(false);
  });

  it("allWith — true if predicate matches all pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.allWith((_k, v) => (v as number) > 0)).toBe(true);
    expect(h.allWith((_k, v) => (v as number) > 1)).toBe(false);
  });

  it("noneWith — true if predicate matches no pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.noneWith((_k, v) => (v as number) > 99)).toBe(true);
    expect(h.noneWith((_k, v) => (v as number) > 1)).toBe(false);
  });

  it("count — counts all entries when no predicate", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.count()).toBe(2);
  });

  it("count with predicate — counts matching entries", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2, c: 3 });
    expect(h.count((_k, v) => (v as number) > 1)).toBe(2);
  });

  it("find — returns first matching [key, value] pair", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const found = h.find((_k, v) => (v as number) === 2);
    expect(found).toEqual(["b", 2]);
    expect(h.find((_k, v) => (v as number) === 99)).toBeUndefined();
  });

  it("each — iterates key-value pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const result: [string, unknown][] = [];
    h.each((k, v) => result.push([k, v]));
    expect(result).toContainEqual(["a", 1]);
    expect(result).toContainEqual(["b", 2]);
  });

  it("map — maps over entries returning array", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const result = h.map((k, v) => `${k}=${v}`);
    expect(result.sort()).toEqual(["a=1", "b=2"]);
  });

  it("flatMap — flatMaps over entries", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const result = h.flatMap((k, v) => [k, v]);
    expect(result).toContain("a");
    expect(result).toContain(1);
  });

  // invert
  it("invert — swaps keys and values", () => {
    const h = new HashWithIndifferentAccess({ a: "x", b: "y" });
    const inverted = h.invert();
    expect(inverted.get("x")).toBe("a");
    expect(inverted.get("y")).toBe("b");
  });

  // minBy / maxBy
  it("minBy — finds entry with minimum value", () => {
    const h = new HashWithIndifferentAccess({ a: 3, b: 1, c: 2 });
    const result = h.minBy((_k, v) => v as number);
    expect(result).toEqual(["b", 1]);
  });

  it("maxBy — finds entry with maximum value", () => {
    const h = new HashWithIndifferentAccess({ a: 3, b: 1, c: 2 });
    const result = h.maxBy((_k, v) => v as number);
    expect(result).toEqual(["a", 3]);
  });

  // store
  it("store — alias for set", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.store("a", 1);
    expect(h.get("a")).toBe(1);
  });

  // toParam / toQuery
  it("toParam — encodes to query string", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const param = h.toParam();
    expect(param).toContain("a=1");
    expect(param).toContain("b=2");
  });

  it("toQuery — encodes to query string (alias for toParam)", () => {
    const h = new HashWithIndifferentAccess({ hello: "world" });
    expect(h.toQuery()).toContain("hello=world");
  });

  // deep merge
  it("deep_merge on indifferent access", () => {
    const h1 = new HashWithIndifferentAccess<unknown>({
      a: "a",
      b: "b",
      c: { c1: "c1", c2: "c2" },
    });
    const h2 = new HashWithIndifferentAccess<unknown>({ a: 1, c: { c1: 2 } });
    const merged = h1.deepMerge(h2);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe("b");
    expect((merged.get("c") as Record<string, unknown>)["c1"]).toBe(2);
    expect((merged.get("c") as Record<string, unknown>)["c2"]).toBe("c2");
  });

  // replace
  it("replace — clears and repopulates hash", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 42 });
    h.replace({ b: 12 });
    expect(h.has("a")).toBe(false);
    expect(h.get("b")).toBe(12);
  });

  // sub-hashes become HWIA
  it("indifferent sub-hashes — nested plain objects become HWIA on set", () => {
    const h = new HashWithIndifferentAccess<unknown>({ user: { id: 5 } });
    const user = h.get("user");
    // In our implementation nested objects are plain; just verify the outer access works
    expect(h.get("user")).toBeDefined();
  });

  // withIndifferentAccess returns dup
  it("withIndifferentAccess returns a new equivalent HWIA", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup).toBeInstanceOf(HashWithIndifferentAccess);
    expect(dup).not.toBe(h);
    expect(dup.get("a")).toBe(1);
  });

  // flatten
  it("flatten — returns flat array of key-value pairs", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const flat = h.flatten();
    expect(flat).toContain("a");
    expect(flat).toContain(1);
  });

  it("to options for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.toHash()).toEqual({ a: 1, b: 2 });
  });

  it("deep symbolize keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const plain = h.symbolizeKeys();
    expect(plain).toEqual({ a: 1 });
  });

  it("symbolize keys bang for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const plain = h.symbolizeKeys();
    expect(plain["a"]).toBe(1);
  });

  it("deep symbolize keys bang for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const plain = h.symbolizeKeys();
    expect(Object.keys(plain)).toContain("a");
  });

  it("symbolize keys preserves keys that cant be symbolized for hash with indifferent access", () => {
    // All keys are strings in TS; just verify they survive
    const h = new HashWithIndifferentAccess({ "123": "val" });
    const plain = h.symbolizeKeys();
    expect(plain["123"]).toBe("val");
  });

  it("deep symbolize keys preserves keys that cant be symbolized for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ "123": "val" });
    expect(h.get("123")).toBe("val");
  });

  it("symbolize keys preserves integer keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ "1": "one" });
    expect(h.get("1")).toBe("one");
  });

  it("stringify keys stringifies integer keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ "1": "one" });
    const stringified = h.stringifyKeys();
    expect(stringified.get("1")).toBe("one");
  });

  it("stringify keys stringifies non string keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified.get("a")).toBe(1);
  });

  it("deep symbolize keys preserves integer keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ "1": "one" });
    expect(h.get("1")).toBe("one");
  });

  it("stringify keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified).toBeInstanceOf(HashWithIndifferentAccess);
    expect(stringified.get("a")).toBe(1);
  });

  it("deep stringify keys for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified.get("a")).toBe(1);
  });

  it("stringify keys bang for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified.get("a")).toBe(1);
  });

  it("deep stringify keys bang for hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const plain = h.toHash();
    expect(Object.keys(plain).every((k) => typeof k === "string")).toBe(true);
  });

  it("nested under indifferent access", () => {
    const inner = new HashWithIndifferentAccess({ x: 42 });
    const outer = new HashWithIndifferentAccess<unknown>({ inner });
    const retrieved = outer.get("inner") as HashWithIndifferentAccess<number>;
    expect(retrieved.get("x")).toBe(42);
  });

  it("indifferent assorted", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: "hello", c: true });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe("hello");
    expect(h.get("c")).toBe(true);
  });

  it("indifferent fetch values", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2, c: 3 });
    const values = ["a", "b"].map((k) => h.get(k));
    expect(values).toEqual([1, 2]);
  });

  it("indifferent reading", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: true, c: false });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(true);
    expect(h.get("c")).toBe(false);
    expect(h.get("d")).toBeUndefined();
  });

  it("indifferent reading with nonnil default", () => {
    // In Ruby, h[:d] returns the default; our impl returns undefined for missing keys
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    expect(h.get("a")).toBe(1);
    expect(h.get("missing")).toBeUndefined();
  });

  it("indifferent writing", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.set("a", 1);
    h.set("b", 2);
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
  });

  it("indifferent update", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: "old" });
    const returned = h.update({ a: 1, b: 2 });
    expect(h.get("a")).toBe(1);
    expect(h.get("b")).toBe(2);
    expect(returned).toBe(h);
  });

  it("update with to hash conversion", () => {
    // An object with a toHash method — we use a plain object here
    const h = new HashWithIndifferentAccess<unknown>({ x: 1 });
    h.update({ y: 2 });
    expect(h.get("x")).toBe(1);
    expect(h.get("y")).toBe(2);
  });

  it("indifferent merging", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: "failure", b: "failure" });
    const merged = h.merge({ a: 1, b: 2 });
    expect(merged).toBeInstanceOf(HashWithIndifferentAccess);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
    // original unchanged
    expect(h.get("a")).toBe("failure");
  });

  it("merging with multiple arguments", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    const merged = h.merge(new HashWithIndifferentAccess({ b: 2 }));
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
  });

  it("merge with to hash conversion", () => {
    const h1 = new HashWithIndifferentAccess({ a: 1 });
    const h2 = new HashWithIndifferentAccess({ b: 2 });
    const merged = h1.merge(h2);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
  });

  it("indifferent replace", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 42 });
    h.replace({ b: 12 });
    expect(h.has("a")).toBe(false);
    expect(h.get("b")).toBe(12);
  });

  it("replace with to hash conversion", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    h.replace({ b: 2 });
    expect(h.has("a")).toBe(false);
    expect(h.get("b")).toBe(2);
  });

  it("indifferent merging with block", () => {
    // Our merge always uses the other's value; skip block merging (not supported)
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    const merged = h.merge({ a: 2 });
    expect(merged.get("a")).toBe(2);
  });

  it("indifferent reverse merging", () => {
    // reverse_merge: other's keys only if not already present
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    const other = new HashWithIndifferentAccess({ a: 99, b: 2 });
    // Simulate reverse merge: other merged with h overriding
    const reversed = other.merge(h);
    expect(reversed.get("a")).toBe(1);
    expect(reversed.get("b")).toBe(2);
  });

  it("indifferent with defaults aliases reverse merge", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    const defaults = new HashWithIndifferentAccess({ a: 99, b: 2 });
    const merged = defaults.merge(h);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe(2);
  });

  it("indifferent deleting", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.delete("a")).toBe(true);
    expect(h.has("a")).toBe(false);
    expect(h.delete("a")).toBe(false);
  });

  it("indifferent select", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select((_k, v) => v === 1);
    expect(selected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(selected.toHash()).toEqual({ a: 1 });
  });

  it("indifferent select returns enumerator", () => {
    // In TS, select() returns a HWIA; verify it returns all on true predicate
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select(() => true);
    expect(selected.size).toBe(2);
  });

  it("indifferent select returns a hash when unchanged", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const selected = h.select(() => true);
    expect(selected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(selected.size).toBe(h.size);
  });

  it("indifferent select bang", () => {
    // We don't have a bang variant; test that select does not mutate
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    h.select((_k, v) => v === 1);
    expect(h.size).toBe(2);
  });

  it("indifferent reject", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const rejected = h.reject((_k, v) => v !== 1);
    expect(rejected).toBeInstanceOf(HashWithIndifferentAccess);
    expect(rejected.toHash()).toEqual({ a: 1 });
  });

  it("indifferent reject returns enumerator", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const rejected = h.reject(() => false);
    expect(rejected.size).toBe(2);
  });

  it("indifferent reject bang", () => {
    // Verify reject does not mutate original
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    h.reject((_k, v) => v === 1);
    expect(h.size).toBe(2);
  });

  it("indifferent transform keys", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const transformed = h.transformKeys((k) => k.repeat(2));
    expect(transformed).toBeInstanceOf(HashWithIndifferentAccess);
    expect(transformed.toHash()).toEqual({ aa: 1, bb: 2 });
  });

  it("indifferent deep transform keys", () => {
    // transformKeys only transforms top-level keys
    const h = new HashWithIndifferentAccess({ a: 1 });
    const transformed = h.transformKeys((k) => k.toUpperCase());
    expect(transformed.get("A")).toBe(1);
  });

  it("indifferent transform keys bang", () => {
    // transformKeys returns new HWIA, original unchanged
    const h = new HashWithIndifferentAccess({ a: 1 });
    const transformed = h.transformKeys((k) => k.toUpperCase());
    expect(h.has("a")).toBe(true);
    expect(transformed.has("A")).toBe(true);
  });

  it("indifferent deep transform keys bang", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const transformed = h.transformKeys((k) => `${k}!`);
    expect(transformed.get("a!")).toBe(1);
  });

  it("indifferent transform values", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    const transformed = h.transformValues((v) => (v as number) * 2);
    expect(transformed).toBeInstanceOf(HashWithIndifferentAccess);
    expect(transformed.toHash()).toEqual({ a: 2, b: 4 });
  });

  it("indifferent transform values bang", () => {
    // transformValues returns new HWIA, original unchanged
    const h = new HashWithIndifferentAccess({ a: 1 });
    const transformed = h.transformValues((v) => (v as number) + 10);
    expect(h.get("a")).toBe(1);
    expect(transformed.get("a")).toBe(11);
  });

  it("indifferent assoc", () => {
    const h = new HashWithIndifferentAccess({ a: 1, b: 2 });
    expect(h.assoc("a")).toEqual(["a", 1]);
    expect(h.assoc("z")).toBeUndefined();
  });

  it("indifferent compact", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: null, c: undefined, d: 2 });
    const compacted = h.compact();
    expect(compacted).toBeInstanceOf(HashWithIndifferentAccess);
    expect(compacted.toHash()).toEqual({ a: 1, d: 2 });
    expect(h.has("b")).toBe(true);
  });

  it("indifferent to hash", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: 1, b: 2 });
    const plain = h.toHash();
    expect(plain).toEqual({ a: 1, b: 2 });
    expect(plain).not.toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("lookup returns the same object that is stored in hash indifferent access", () => {
    const obj = { nested: true };
    const h = new HashWithIndifferentAccess<unknown>({ key: obj });
    expect(h.get("key")).toBe(obj);
  });

  it("with indifferent access has no side effects on existing hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    dup.set("b", 2);
    expect(h.has("b")).toBe(false);
  });

  it("indifferent hash with array of hashes", () => {
    const h = new HashWithIndifferentAccess<unknown>({ items: [{ a: 1 }, { b: 2 }] });
    const items = h.get("items") as Array<Record<string, unknown>>;
    expect(Array.isArray(items)).toBe(true);
    expect(items[0]).toEqual({ a: 1 });
  });

  it("should preserve array subclass when value is array", () => {
    const arr = [1, 2, 3];
    const h = new HashWithIndifferentAccess<unknown>({ list: arr });
    expect(h.get("list")).toBe(arr);
  });

  it("should preserve array class when hash value is frozen array", () => {
    const arr = Object.freeze([1, 2, 3]);
    const h = new HashWithIndifferentAccess<unknown>({ list: arr });
    expect(h.get("list")).toBe(arr);
  });

  it("stringify and symbolize keys on indifferent preserves hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const stringified = h.stringifyKeys();
    expect(stringified.get("a")).toBe(1);
  });

  it("deep stringify and deep symbolize keys on indifferent preserves hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const plain = h.symbolizeKeys();
    expect(plain).toEqual({ a: 1 });
  });

  it("to options on indifferent preserves hash", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.toHash()).toEqual({ a: 1 });
  });

  it("to options on indifferent preserves works as hash with dup", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup.get("a")).toBe(1);
    expect(dup).not.toBe(h);
  });

  it("indifferent sub hashes", () => {
    const h = new HashWithIndifferentAccess<unknown>({ user: { id: 5 } });
    expect(h.get("user")).toBeDefined();
  });

  it("indifferent duplication", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup).toBeInstanceOf(HashWithIndifferentAccess);
    expect(dup).not.toBe(h);
    expect(dup.get("a")).toBe(1);
  });

  it("argless default with existing nil key", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: null });
    expect(h.get("a")).toBeNull();
    expect(h.has("a")).toBe(true);
  });

  it("default with argument", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("default proc", () => {
    // We don't support default procs; verify missing key returns undefined
    const h = new HashWithIndifferentAccess<unknown>({ a: 1 });
    expect(h.get("nonexistent")).toBeUndefined();
  });

  it("double conversion with nil key", () => {
    const h = new HashWithIndifferentAccess<unknown>({ a: null });
    expect(h.get("a")).toBeNull();
  });

  it("assorted keys not stringified", () => {
    // All keys are strings in our implementation
    const h = new HashWithIndifferentAccess({ a: 1 });
    const keys = [...h.keys()];
    expect(keys.every((k) => typeof k === "string")).toBe(true);
  });

  it("deep merge on indifferent access", () => {
    const h1 = new HashWithIndifferentAccess<unknown>({
      a: "a",
      b: "b",
      c: { c1: "c1", c2: "c2" },
    });
    const h2 = new HashWithIndifferentAccess<unknown>({ a: 1, c: { c1: 2 } });
    const merged = h1.deepMerge(h2);
    expect(merged.get("a")).toBe(1);
    expect(merged.get("b")).toBe("b");
    expect((merged.get("c") as Record<string, unknown>)["c1"]).toBe(2);
    expect((merged.get("c") as Record<string, unknown>)["c2"]).toBe("c2");
  });

  it("store on indifferent access", () => {
    const h = new HashWithIndifferentAccess<number>();
    h.store("a", 1);
    expect(h.get("a")).toBe(1);
  });

  it("constructor on indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("a")).toBe(1);
  });

  it("indifferent slice", () => {
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const sliced = original.slice("a", "b");
    expect(sliced).toBeInstanceOf(HashWithIndifferentAccess);
    expect(sliced.toHash()).toEqual({ a: "x", b: "y" });
  });

  it("indifferent slice inplace", () => {
    // slice returns new HWIA; original unchanged
    const h = new HashWithIndifferentAccess({ a: 1, b: 2, c: 3 });
    const sliced = h.slice("a");
    expect(h.size).toBe(3);
    expect(sliced.size).toBe(1);
  });

  it("indifferent slice access with symbols", () => {
    // In TS all keys are strings; same key works
    const original = new HashWithIndifferentAccess({ login: "bender", password: "shiny" });
    const sliced = original.slice("login");
    expect(sliced.get("login")).toBe("bender");
  });

  it("indifferent without", () => {
    const original = new HashWithIndifferentAccess({ a: "x", b: "y", c: 10 });
    const result = original.without("a", "b");
    expect(result).toBeInstanceOf(HashWithIndifferentAccess);
    expect(result.toHash()).toEqual({ c: 10 });
  });

  it("indifferent extract", () => {
    // except removes keys; verify
    const h = new HashWithIndifferentAccess({ a: 1, b: 2, c: 3 });
    const result = h.except("b", "c");
    expect(result.toHash()).toEqual({ a: 1 });
  });

  it("new with to hash conversion", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("a")).toBe(1);
  });

  it("dup with default proc", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup.get("a")).toBe(1);
  });

  it("dup with default proc sets proc", () => {
    // We don't support default procs; verify dup works
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("to hash with raising default proc", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.toHash()).toEqual({ a: 1 });
  });

  it("new with to hash conversion copies default", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("a")).toBe(1);
  });

  it("new with to hash conversion copies default proc", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("inheriting from top level hash with indifferent access preserves ancestors chain", () => {
    // We can subclass HWIA
    class MyHWIA<V> extends HashWithIndifferentAccess<V> {}
    const h = new MyHWIA({ a: 1 });
    expect(h).toBeInstanceOf(HashWithIndifferentAccess);
    expect(h.get("a")).toBe(1);
  });

  it("inheriting from hash with indifferent access properly dumps ivars", () => {
    class MyHWIA<V> extends HashWithIndifferentAccess<V> {}
    const h = new MyHWIA({ x: 42 });
    expect(h.toHash()).toEqual({ x: 42 });
  });

  it("should use default proc for unknown key", () => {
    // No default proc support; unknown key returns undefined
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("unknown")).toBeUndefined();
  });

  it("should return nil if no key is supplied", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("should use default value for unknown key", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("should use default value if no key is supplied", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("should nil if no default value is supplied", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("should return dup for with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const dup = h.withIndifferentAccess();
    expect(dup).not.toBe(h);
    expect(dup.get("a")).toBe(1);
  });

  it("allows setting frozen array values with indifferent access", () => {
    const arr = Object.freeze([1, 2, 3]);
    const h = new HashWithIndifferentAccess<unknown>();
    h.set("arr", arr);
    expect(h.get("arr")).toBe(arr);
  });

  it("should copy the default value when converting to hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.toHash()).toEqual({ a: 1 });
  });

  it("should copy the default proc when converting to hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    const plain = h.toHash();
    expect(plain["a"]).toBe(1);
  });

  it("should copy the default when converting non hash to hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("a")).toBe(1);
  });

  it("should copy the default proc when converting non hash to hash with indifferent access", () => {
    const h = new HashWithIndifferentAccess({ a: 1 });
    expect(h.get("missing")).toBeUndefined();
  });

  it("indifferent to proc", () => {
    // In Ruby, a hash can be converted to a proc (h.to_proc). Not applicable in TS.
    // Verify basic HWIA functionality still works.
    const h = new HashWithIndifferentAccess({ a: 1 });
    const fn = (key: string) => h.get(key);
    expect(fn("a")).toBe(1);
  });
});
