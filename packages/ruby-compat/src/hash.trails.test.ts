import { describe, expect, it } from "vitest";
import {
  Hash,
  block,
  type ConflictBlock,
  deleteIf,
  dup,
  eachKey,
  eachValue,
  eachPair,
  inspect,
  except,
  fetch,
  hasKey,
  hashDelete,
  isInclude,
  keepIf,
  merge,
  mergeBang,
  reject,
  slice,
  transformValues,
  update,
} from "./hash.js";
import { KeyError } from "./key-error.js";
import { FrozenError } from "./frozen-error.js";
import { IndexError } from "./index-error.js";
import { RuntimeError } from "./runtime-error.js";

describe("Hash#fetch", () => {
  it("looks up an object key in a Map, keeping a stored nil or false", () => {
    const key = {};
    expect(fetch(new Map([[key, null]]), key, 0)).toBeNull();
    expect(fetch(new Map([[key, false]]), key, true)).toBe(false);
    expect(fetch(new Map<object, number>(), key, 0)).toBe(0);
  });

  it("returns a stored null rather than the default", () => {
    expect(fetch({ offset: null }, "offset", 0)).toBeNull();
    expect(fetch({ offset: undefined }, "offset", 0)).toBeUndefined();
  });

  it("returns a stored false rather than the default", () => {
    expect(fetch({ verbose: false }, "verbose", true)).toBe(false);
  });

  it("does not read an inherited JavaScript property as a stored key", () => {
    expect(fetch({}, "toString", "default")).toBe("default");
    expect(() => fetch({}, "toString")).toThrow('key not found: "toString"');
    expect(hasKey({}, "toString")).toBe(false);
  });

  it("returns the default for an absent key", () => {
    expect(fetch({}, "offset", 0)).toBe(0);
  });

  it("raises KeyError with the quoted key when no default is given", () => {
    expect(() => fetch({}, "expression")).toThrow(KeyError);
    expect(() => fetch({}, "expression")).toThrow('key not found: "expression"');
    expect(() => fetch({}, ":expression")).toThrow("key not found: :expression");
  });

  it("sets the receiver and key on the KeyError, as rb_key_err_raise does", () => {
    const hash = { a: 1 };
    let error: unknown;
    try {
      fetch(hash, "b");
    } catch (e) {
      error = e;
    }
    expect(error).toBeInstanceOf(IndexError);
    expect((error as KeyError).receiver()).toBe(hash);
    expect((error as KeyError).key()).toBe("b");
  });

  it("ellipsizes a description past 65 characters, as rb_str_ellipsize does", () => {
    expect(() => fetch({}, "k".repeat(80))).toThrow(`key not found: "${"k".repeat(61)}...`);
  });
});

describe("Hash#fetch with a block", () => {
  it("yields the missing key and returns what the block returns", () => {
    const keys: string[] = [];
    expect(
      fetch(
        { a: 1 },
        "b",
        block((key) => (keys.push(key), 42)),
      ),
    ).toBe(42);
    expect(keys).toEqual(["b"]);
  });

  it("does not yield when the key is stored, even for a stored undefined", () => {
    expect(
      fetch(
        { a: undefined },
        "a",
        block(() => "yielded"),
      ),
    ).toBeUndefined();
  });

  it("keeps a callable default as a default when it is not marked a block", () => {
    const fallback = () => "called";
    expect(fetch<unknown>({}, "a", fallback)).toBe(fallback);
  });
});

describe("Hash#key?", () => {
  it("is true for a stored null and false for an absent key", () => {
    expect(hasKey({ offset: null }, "offset")).toBe(true);
    expect(hasKey({}, "offset")).toBe(false);
  });
});

describe("Hash#include?", () => {
  it("is Hash#key?", () => {
    expect(isInclude({ offset: null }, "offset")).toBe(true);
    expect(isInclude({}, "toString")).toBe(false);
  });
});

describe("Hash#merge", () => {
  it("returns a new hash and leaves the receiver untouched", () => {
    const defaults = { controller: "photos", action: "index" };
    expect(merge(defaults, { action: "show" })).toEqual({ controller: "photos", action: "show" });
    expect(defaults).toEqual({ controller: "photos", action: "index" });
  });

  it("applies each argument in turn", () => {
    expect(merge({ a: 1 }, { b: 2 }, { b: 3 })).toEqual({ a: 1, b: 3 });
  });

  it("carries a __proto__ key across as an ordinary key", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    const merged = merge(hash, { a: 2 });
    expect(hasKey(merged, "__proto__")).toBe(true);
    expect("toString" in merged).toBe(false);
    expect(Object.getPrototypeOf(merged)).toBeNull();
  });
});

describe("Hash#update", () => {
  it("mutates the receiver and returns it", () => {
    const defaults: Record<string, unknown> = { controller: "photos" };
    expect(update(defaults, { action: "show" })).toBe(defaults);
    expect(defaults).toEqual({ controller: "photos", action: "show" });
  });

  it("is the same body as merge!", () => {
    expect(mergeBang).toBe(update);
  });

  it("applies a Hash argument, as rb_hash_update's rb_to_hash_type does", () => {
    const defaults: Record<string, unknown> = { type: "submit" };
    const options = new Hash<string, unknown>();
    options.set("class", "extra");
    update(defaults, options);
    expect(defaults).toEqual({ type: "submit", class: "extra" });
  });
});

describe("Hash#merge! with a conflict block", () => {
  it("yields the key, the receiver's value and the argument's, and stores the result", () => {
    const yielded: unknown[][] = [];
    const hash = { a: 1, b: 2 };
    mergeBang(
      hash,
      { b: 20, c: 30 },
      block((key: string, oldValue: number, newValue: number) => {
        yielded.push([key, oldValue, newValue]);
        return oldValue;
      }),
    );
    expect(hash).toEqual({ a: 1, b: 2, c: 30 });
    expect(yielded).toEqual([["b", 2, 20]]);
  });

  it("detects the block by its mark, not by the argument's type", () => {
    const hash = { a: 1 };
    const unmarked = ((_key: string, left: number): number =>
      left) as unknown as ConflictBlock<number>;
    update(hash, { a: 2 }, unmarked);
    expect(hash).toEqual({ a: 2 });
  });

  it("leaves merge's copy semantics alone", () => {
    const hash = { a: 1 };
    expect(
      merge(
        hash,
        { a: 2 },
        block((_key: string, left: number) => left),
      ),
    ).toEqual({ a: 1 });
    expect(hash).toEqual({ a: 1 });
  });
});

describe("Hash#freeze", () => {
  it("raises FrozenError from every mutator once frozen", () => {
    const hash = new Hash<string, number>();
    hash.set("a", 1);
    expect(hash.isFrozen()).toBe(false);
    expect(hash.freeze()).toBe(hash);
    expect(hash.isFrozen()).toBe(true);
    expect(() => hash.set("b", 2)).toThrow(FrozenError);
    expect(() => hash.set("b", 2)).toThrow('can\'t modify frozen Hash: {"a"=>1}');
    expect(() => hash.delete("a")).toThrow(FrozenError);
    expect(() => hash.clear()).toThrow(FrozenError);
    expect(() => hash.setDefault(0)).toThrow(FrozenError);
    expect(hash.get("a")).toBe(1);
  });

  it("sets the frozen hash as the FrozenError's receiver", () => {
    const hash = new Hash<string, number>().freeze();
    let error: unknown;
    try {
      hash.clear();
    } catch (e) {
      error = e;
    }
    expect((error as FrozenError).receiver()).toBe(hash);
  });
});

describe("Hash#delete_if", () => {
  it("mutates the receiver and returns it", () => {
    const hash: Record<string, number> = { foo: 0, bar: 1, baz: 2 };
    expect(deleteIf(hash, (_k, v) => v > 0)).toBe(hash);
    expect(hash).toEqual({ foo: 0 });
  });

  it("keeps a pair whose block answers nil or false, and drops one answering 0", () => {
    expect(
      deleteIf({ a: 1, b: 2, c: 3 }, (k) => (k === "a" ? 0 : k === "b" ? null : false)),
    ).toEqual({
      b: 2,
      c: 3,
    });
  });
});

describe("Hash#keep_if", () => {
  it("mutates and returns the receiver, keeping the pairs the block answers truthily for", () => {
    const hash = { foo: 0, bar: 1, baz: 2 };
    expect(keepIf(hash, (k) => k.startsWith("b"))).toBe(hash);
    expect(hash).toEqual({ bar: 1, baz: 2 });
  });

  it("drops a pair whose block answers nil or false, and keeps one answering 0", () => {
    expect(keepIf({ a: 1, b: 2, c: 3 }, (k) => (k === "a" ? 0 : k === "b" ? null : false))).toEqual(
      { a: 1 },
    );
  });
});

describe("Hash#reject", () => {
  it("returns a new hash and leaves the receiver untouched", () => {
    const hash = { foo: 0, bar: 1, baz: 2 };
    expect(reject(hash, (k) => k.startsWith("b"))).toEqual({ foo: 0 });
    expect(hash).toEqual({ foo: 0, bar: 1, baz: 2 });
  });

  it("carries a __proto__ key across as an ordinary key", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    const rejected = reject(hash, (k) => k === "nope");
    expect(hasKey(rejected, "__proto__")).toBe(true);
    expect("toString" in rejected).toBe(false);
    expect(Object.getPrototypeOf(rejected)).toBeNull();
  });
});

describe("Hash#each_pair", () => {
  it("yields each key and value and returns the receiver", () => {
    const hash = { foo: 0, bar: 1 };
    const seen: [string, number][] = [];
    expect(eachPair(hash, (k, v) => seen.push([k, v]))).toBe(hash);
    expect(seen).toEqual([
      ["foo", 0],
      ["bar", 1],
    ]);
  });
});

describe("Hash#each_key", () => {
  it("yields each key and returns the receiver", () => {
    const hash = { foo: 0, bar: 1 };
    const seen: string[] = [];
    expect(eachKey(hash, (k) => seen.push(k))).toBe(hash);
    expect(seen).toEqual(["foo", "bar"]);
  });

  it("enumerates the keys when no block is given", () => {
    const hash = { foo: 0, bar: 1 };
    expect(eachKey(hash).filter((k) => hash[k as keyof typeof hash] > 0)).toEqual(["bar"]);
  });
});

describe("Hash#transform_values", () => {
  it("returns a new hash with the same keys", () => {
    const hash = { foo: 0, bar: 1, baz: 2 };
    expect(transformValues(hash, (v) => v * 100)).toEqual({ foo: 0, bar: 100, baz: 200 });
    expect(hash).toEqual({ foo: 0, bar: 1, baz: 2 });
  });
});

describe("Hash#slice", () => {
  it("returns the entries for the given keys, in argument order", () => {
    expect(Object.entries(slice({ foo: 0, bar: 1, baz: 2 }, "baz", "foo"))).toEqual([
      ["baz", 2],
      ["foo", 0],
    ]);
  });

  it("keeps a __proto__ key as an ordinary key", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    expect(hasKey(slice(hash, "__proto__"), "__proto__")).toBe(true);
  });

  it("ignores keys that are not found, and keeps a stored undefined", () => {
    expect(slice({ foo: undefined }, "foo", "nope")).toEqual({ foo: undefined });
    expect(hasKey(slice({ foo: undefined }, "foo", "nope"), "nope")).toBe(false);
  });
});

describe("Hash#except", () => {
  it("returns a new hash excluding the given keys", () => {
    const hash = { a: 100, b: 200, c: 300 };
    expect(except(hash, "a")).toEqual({ b: 200, c: 300 });
    expect(hash).toEqual({ a: 100, b: 200, c: 300 });
  });

  it("keeps a __proto__ key as an ordinary key", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    expect(hasKey(except(hash, "nope"), "__proto__")).toBe(true);
  });
});

describe("Hash#default", () => {
  it("returns the default value for every miss", () => {
    const hash = new Hash<string, number>(0);
    expect(hash.get("nope")).toBe(0);
    expect(hash.default()).toBe(0);
    expect(hash.defaultProc()).toBeUndefined();
  });

  it("runs the default_proc with the hash and the missing key", () => {
    const hash = new Hash<string, string>((h, key) => h.set(key, `No key ${key}`).get(key)!);
    hash.set("foo", "Hello");
    expect(hash.get("foo")).toBe("Hello");
    expect(hash.default("foo")).toBe("No key foo");
    expect(hash.get("bar")).toBe("No key bar");
    expect(hash.has("bar")).toBe(true);
  });

  it("returns nil from the no-argument arm when a default_proc is stored", () => {
    const hash = new Hash<string, number>(() => 1);
    expect(hash.default()).toBeUndefined();
  });

  it("clears the default_proc on a default= write", () => {
    const hash = new Hash<string, number>(() => 1);
    hash.setDefault(9);
    expect(hash.defaultProc()).toBeUndefined();
    expect(hash.get("nope")).toBe(9);
  });

  it("distinguishes a key equal only by string coercion", () => {
    const hash = new Hash<unknown, string>("miss");
    hash.set(1, "integer");
    expect(hash.get("1")).toBe("miss");
    expect(hash.get(1)).toBe("integer");
  });

  it("carries the default over a dup, as hash_dup does", () => {
    const hash = new Hash<string, number>(7);
    hash.set("a", 1);
    const copy = dup(hash);
    copy.set("b", 2);
    expect(copy.get("a")).toBe(1);
    expect(copy.get("miss")).toBe(7);
    expect(hash.has("b")).toBe(false);
  });

  it("carries the default_proc over a dup, as the RHASH_PROC_DEFAULT flag does", () => {
    const hash = new Hash<string, string>((_h, key) => `made ${String(key)}`);
    const copy = dup(hash);
    expect(copy.get("x")).toBe("made x");
    expect(copy.default()).toBeUndefined();
  });

  it("dups a plain object into a new object", () => {
    const hash = { a: 1 };
    const copy = dup(hash);
    copy.a = 2;
    expect(hash.a).toBe(1);
  });

  it("dups a plain object without ancestors, as rb_hash_dup does", () => {
    const hash = Object.assign(Object.create(null) as Record<string, number>, { ["__proto__"]: 1 });
    const copy = dup(hash);
    expect(hasKey(copy, "__proto__")).toBe(true);
    expect("toString" in copy).toBe(false);
    expect(Object.getPrototypeOf(copy)).toBeNull();
  });

  describe("inspect", () => {
    it("renders an empty hash as {}", () => {
      expect(inspect({})).toBe("{}");
    });

    it("renders keys and values as rb_inspect does, joined by =>", () => {
      expect(inspect({ a: 1, b: [1, null], c: { d: true }, e: ":sym" })).toBe(
        '{"a"=>1, "b"=>[1, nil], "c"=>{"d"=>true}, "e"=>:sym}',
      );
      expect(inspect({ f: 1.5, n: null, s: ":sym", empty: [] })).toBe(
        '{"f"=>1.5, "n"=>nil, "s"=>:sym, "empty"=>[]}',
      );
    });

    it("escapes strings as String#inspect does", () => {
      expect(inspect({ q: 'a"b\\c', t: "tab\there", esc: "\n\r\f\v\b\u0007\u001b" })).toBe(
        '{"q"=>"a\\"b\\\\c", "t"=>"tab\\there", "esc"=>"\\n\\r\\f\\v\\b\\a\\e"}',
      );
      expect(inspect({ nul: "\u0000", soh: "\u0001", del: "\u007f", nel: "\u0085" })).toBe(
        '{"nul"=>"\\u0000", "soh"=>"\\u0001", "del"=>"\\u007F", "nel"=>"\\u0085"}',
      );
      expect(inspect({ uni: "\u00e9\u{1f600}\u200b\ufffd" })).toBe(
        '{"uni"=>"\u00e9\u{1f600}\u200b\ufffd"}',
      );
      expect(inspect({ hash: "#z", interp: "#{y", dollar: "#$x", at: "#@y" })).toBe(
        '{"hash"=>"#z", "interp"=>"\\#{y", "dollar"=>"\\#$x", "at"=>"\\#@y"}',
      );
    });

    it("renders a recursive hash or array as MRI's recursive slot", () => {
      const hash: Record<string, unknown> = { a: 1 };
      hash.self = hash;
      expect(inspect(hash)).toBe('{"a"=>1, "self"=>{...}}');

      const ary: unknown[] = [1];
      ary.push(ary);
      expect(inspect({ ary })).toBe('{"ary"=>[1, [...]]}');
    });
  });
});

describe("eachValue", () => {
  it("yields each value alone and returns the receiver", () => {
    const h = { a: 1, b: 2 };
    const seen: number[] = [];
    expect(eachValue(h, (v) => seen.push(v))).toBe(h);
    expect(seen).toEqual([1, 2]);
  });

  it("enumerates the values when no block is given", () => {
    expect(eachValue({ a: 1, b: null }).every((v) => v == null)).toBe(false);
    expect(eachValue({ a: null, b: null }).every((v) => v == null)).toBe(true);
  });
});

describe("hashDelete", () => {
  it("removes the entry and returns its stored value, including a stored nil", () => {
    const hash: Record<string, number | null> = { foo: 0, bar: null };
    expect(hashDelete(hash, "foo")).toBe(0);
    expect(hashDelete(hash, "bar")).toBeNull();
    expect(hash).toEqual({});
  });

  it("returns nil for an absent key, or the block's value for it", () => {
    const hash: Record<string, number> = { foo: 0 };
    expect(hashDelete(hash, "baz")).toBeNull();
    expect(hashDelete(hash, "baz", (key) => `no ${key}`)).toBe("no baz");
    expect(hash).toEqual({ foo: 0 });
  });
});

describe("Hash keys by eql?", () => {
  it("collapses equal Array keys into one entry and keeps the first key", () => {
    const first = ["a", 1];
    const h = new Hash<unknown[], string>();
    h.set(first, "x");
    h.set(["a", 1], "y");
    expect(h.size).toBe(1);
    expect(h.keys()[0]).toBe(first);
    expect(h.get(["a", 1])).toBe("y");
    expect(h.has(["a", 1])).toBe(true);
    expect(h.delete(["a", 1])).toBe("y");
    expect(h.has(first)).toBe(false);
  });
});

class EqlKey {
  constructor(readonly id: number) {}
  hash(): number {
    return this.id;
  }
  eql(other: unknown): boolean {
    return other instanceof EqlKey && other.id === this.id;
  }
}

describe("Hash keyed on an object answering hash / eql?", () => {
  it("finds the entry through a different but eql? key", () => {
    const h = new Hash<EqlKey, string>();
    h.set(new EqlKey(1), "one");
    expect(h.get(new EqlKey(1))).toBe("one");
    expect(h.has(new EqlKey(2))).toBe(false);
  });

  it("separates keys that share a hash but are not eql?", () => {
    const h = new Hash<unknown, string>();
    h.set(new EqlKey(1), "key");
    h.set({ hash: () => 1, eql: () => false }, "other");
    expect(h.size).toBe(2);
    expect(h.get(new EqlKey(1))).toBe("key");
  });

  it("counts eql? keys together under Hash.new(0)", () => {
    const h = new Hash<EqlKey, number>(0);
    for (const key of [new EqlKey(1), new EqlKey(1), new EqlKey(2)]) {
      h.set(key, h.get(key)! + 1);
    }
    expect(h.get(new EqlKey(1))).toBe(2);
    expect(h.get(new EqlKey(2))).toBe(1);
    expect(h.get(new EqlKey(3))).toBe(0);
    expect(h.size).toBe(2);
  });

  it("populates one entry per eql? key from a default_proc", () => {
    const h = new Hash<EqlKey, number[]>((hash, key) => {
      const made: number[] = [];
      hash.set(key, made);
      return made;
    });
    h.get(new EqlKey(1))!.push(1);
    h.get(new EqlKey(1))!.push(2);
    expect(h.size).toBe(1);
    expect(h.get(new EqlKey(1))).toEqual([1, 2]);
  });
});

describe("Hash#shift", () => {
  it("removes the first entry and returns it, nil once the hash is empty", () => {
    const first = [1];
    const h = new Hash<unknown, string>("default");
    h.set(first, "a");
    h.set("b", "b");
    expect(h.shift()).toEqual([first, "a"]);
    expect(h.has([1])).toBe(false);
    h.set([1], "again");
    expect(h.size).toBe(2);
    expect(h.shift()).toEqual(["b", "b"]);
    expect(h.shift()).toEqual([[1], "again"]);
    expect(h.shift()).toBeUndefined();
  });

  it("removes the first entry without looking its key up, so a key mutated since is shifted", () => {
    const key = [1];
    const h = new Hash<unknown[], string>();
    h.set(key, "a");
    key.push(2);
    expect(h.shift()).toEqual([[1, 2], "a"]);
    expect(h.size).toBe(0);
    h.set([1], "b");
    h.set([1], "c");
    expect(h.size).toBe(1);
  });

  it("shifts while the hash is being iterated", () => {
    const h = new Hash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    const yielded: string[] = [];
    for (const [key] of h) {
      yielded.push(key);
      expect(h.shift()).toEqual(["a", 1]);
      break;
    }
    expect(yielded).toEqual(["a"]);
    expect(h.keys()).toEqual(["b"]);
  });

  it("raises FrozenError on a frozen hash, even an empty one", () => {
    expect(() => new Hash().freeze().shift()).toThrow(FrozenError);
  });
});

describe("Hash#compare_by_identity", () => {
  it("returns the receiver and answers compare_by_identity?", () => {
    const h = new Hash<unknown, number>();
    expect(h.isCompareByIdentity()).toBe(false);
    expect(h.compareByIdentity()).toBe(h);
    expect(h.isCompareByIdentity()).toBe(true);
  });

  it("keeps eql? keys as separate entries", () => {
    const first = [1];
    const h = new Hash<unknown, number>().compareByIdentity();
    h.set(first, 1);
    h.set([1], 2);
    expect(h.size).toBe(2);
    expect(h.get(first)).toBe(1);
    expect(h.get([1])).toBeUndefined();
    expect(h.has([1])).toBe(false);
    expect(h.delete([1])).toBeUndefined();
    expect(h.delete(first)).toBe(1);
    expect(h.size).toBe(1);
  });

  it("rehashes the stored keys, so an eql? key no longer finds them", () => {
    const stored = new EqlKey(1);
    const h = new Hash<EqlKey, number>(0);
    h.set(stored, 5);
    h.compareByIdentity();
    expect(h.get(new EqlKey(1))).toBe(0);
    expect(h.get(stored)).toBe(5);
    expect(h.delete(stored)).toBe(5);
    expect(h.size).toBe(0);
  });

  it("returns the default value for an eql? but not identical key", () => {
    const stored = new EqlKey(1);
    const h = new Hash<EqlKey, number>(0).compareByIdentity();
    h.set(stored, h.get(stored)! + 1);
    h.set(stored, h.get(stored)! + 1);
    expect(h.get(stored)).toBe(2);
    expect(h.get(new EqlKey(1))).toBe(0);
  });

  it("runs the default_proc once per identity", () => {
    const h = new Hash<EqlKey, number[]>((hash, key) => {
      const made: number[] = [];
      hash.set(key, made);
      return made;
    }).compareByIdentity();
    const stored = new EqlKey(1);
    h.get(stored)!.push(1);
    h.get(new EqlKey(1))!.push(2);
    expect(h.size).toBe(2);
    expect(h.get(stored)).toEqual([1]);
  });

  it("raises FrozenError on a frozen hash, and returns an identity hash as it is", () => {
    expect(() => new Hash().freeze().compareByIdentity()).toThrow(FrozenError);
    const h = new Hash().compareByIdentity().freeze();
    expect(h.compareByIdentity()).toBe(h);
  });

  it("raises RuntimeError during iteration, and not once the iteration has ended", () => {
    const h = new Hash<string, number>();
    h.set("a", 1);
    eachPair(h, () => {
      expect(() => h.compareByIdentity()).toThrow(RuntimeError);
      expect(() => h.compareByIdentity()).toThrow("compare_by_identity during iteration");
    });
    h.forEach(() => {
      h.forEach(() => {});
      expect(() => h.compareByIdentity()).toThrow(RuntimeError);
    });
    for (const _pair of h) {
      expect(() => h.compareByIdentity()).toThrow(RuntimeError);
    }
    for (const _pair of h.entries()) {
      expect(() => h.compareByIdentity()).toThrow(RuntimeError);
    }
    expect(h.isCompareByIdentity()).toBe(false);
    expect(() =>
      eachPair(h, () => {
        throw new IndexError("stop");
      }),
    ).toThrow(IndexError);
    expect(h.compareByIdentity().isCompareByIdentity()).toBe(true);
  });

  it("lowers the level when a for…of breaks, and keeps it for a suspended iterator", () => {
    const h = new Hash<string, number>();
    h.set("a", 1);
    h.set("b", 2);
    for (const _pair of h) break;
    const [first] = h;
    expect(first).toEqual(["a", 1]);
    const enumerator = h[Symbol.iterator]();
    enumerator.next();
    expect(() => h.compareByIdentity()).toThrow("compare_by_identity during iteration");
    enumerator.return(undefined);
    expect(h.compareByIdentity().isCompareByIdentity()).toBe(true);
  });

  it("raises FrozenError rather than RuntimeError while iterating a frozen hash", () => {
    const h = new Hash<string, number>();
    h.set("a", 1);
    h.freeze();
    eachPair(h, () => {
      expect(() => h.compareByIdentity()).toThrow(FrozenError);
    });
  });

  it("carries over a dup, as hash_copy copies the table's type", () => {
    const h = new Hash<unknown, number>().compareByIdentity();
    const copy = dup(h);
    expect(copy.isCompareByIdentity()).toBe(true);
    copy.set([1], 1);
    copy.set([1], 2);
    expect(copy.size).toBe(2);
  });

  it("stays an identity hash across clear", () => {
    const h = new Hash<unknown, number>().compareByIdentity();
    h.clear();
    h.set([1], 1);
    h.set([1], 2);
    expect(h.size).toBe(2);
  });
});

describe("block (a marked `&block`)", () => {
  it("keeps the block's arity and passes the receiver an instance_exec gives it", () => {
    const receiver = { name: "david" };
    const blk = block(function (this: { name: string }, greeting: string) {
      return `${greeting} ${this.name}`;
    });
    expect(blk.length).toBe(1);
    expect(blk.call(receiver, "hello")).toBe("hello david");
  });
});
