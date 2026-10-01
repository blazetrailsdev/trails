import { beforeEach, describe, expect, it } from "vitest";
import { Hash, IndexError, dup, rbFSend } from "@blazetrails/ruby-compat";
import { HashWithIndifferentAccess, type ThorOptions } from "./hash-with-indifferent-access.js";

describe("Thor::CoreExt::HashWithIndifferentAccess", () => {
  let hash: ThorOptions<{ foo: string; baz: string; force: boolean; nothing?: unknown }>;

  function indifferent(hash: Record<string, unknown>): HashWithIndifferentAccess {
    return new HashWithIndifferentAccess(hash);
  }

  beforeEach(() => {
    hash = indifferent({ ":foo": "bar", baz: "bee", ":force": true }) as typeof hash;
  });

  it("has values accessible by either strings or symbols", () => {
    expect(hash.get("foo")).toEqual("bar");
    expect(hash.get(":foo")).toEqual("bar");

    expect(hash.valuesAt(":foo", ":baz")).toEqual(["bar", "bee"]);
    expect(hash.delete(":foo")).toEqual("bar");
  });

  it("supports except", () => {
    const unexceptedHash = dup(hash);
    hash.except("foo");
    expect(hash).toEqual(unexceptedHash);

    expect(hash.except("foo")).toEqual(indifferent({ baz: "bee", force: true }));
    expect(hash.except("foo", "baz")).toEqual(indifferent({ force: true }));
    expect(hash.except(":foo")).toEqual(indifferent({ baz: "bee", force: true }));
    expect(hash.except(":foo", ":baz")).toEqual(indifferent({ force: true }));
  });

  it("supports fetch", () => {
    expect(hash.fetch("foo")).toEqual("bar");
    expect(hash.fetch("foo", null)).toEqual("bar");
    expect(hash.fetch(":foo")).toEqual("bar");
    expect(hash.fetch(":foo", null)).toEqual("bar");

    expect(hash.fetch("baz")).toEqual("bee");
    expect(hash.fetch("baz", null)).toEqual("bee");
    expect(hash.fetch(":baz")).toEqual("bee");
    expect(hash.fetch(":baz", null)).toEqual("bee");

    expect(() => hash.fetch(":missing")).toThrow(IndexError);
    expect(hash.fetch(":missing", ":found")).toEqual(":found");
  });

  it("supports slice", () => {
    expect(hash.slice("foo")).toEqual(indifferent({ foo: "bar" }).toHash());
    expect(hash.slice(":foo")).toEqual(indifferent({ foo: "bar" }).toHash());

    expect(hash.slice("baz")).toEqual(indifferent({ baz: "bee" }).toHash());
    expect(hash.slice(":baz")).toEqual(indifferent({ baz: "bee" }).toHash());

    expect(hash.slice("foo", "baz")).toEqual(indifferent({ foo: "bar", baz: "bee" }).toHash());
    expect(hash.slice(":foo", ":baz")).toEqual(indifferent({ foo: "bar", baz: "bee" }).toHash());

    expect(hash.slice("missing")).toEqual(new Hash());
    expect(hash.slice(":missing")).toEqual(new Hash());
  });

  it("has key checkable by either strings or symbols", () => {
    expect(hash.hasKey("foo")).toBe(true);
    expect(hash.hasKey(":foo")).toBe(true);
    expect(hash.hasKey("nothing")).toBe(false);
    expect(hash.hasKey(":nothing")).toBe(false);
  });

  it("handles magic boolean predicates", () => {
    expect(hash.isForce).toBe(true);
    expect(hash.isFoo).toBe(true);
    expect(hash.isNothing).toBe(false);
  });

  it("handles magic comparisons", () => {
    expect(rbFSend(hash, "foo?", "bar")).toBe(true);
    expect(rbFSend(hash, "foo?", "bee")).toBe(false);
  });

  it("maps methods to keys", () => {
    expect(hash.foo).toEqual(hash.get("foo"));
  });

  it("merges keys independent if they are symbols or strings", () => {
    hash.set("force", false);
    hash.set(":baz", "boom");
    expect(hash.get(":force")).toEqual(false);
    expect(hash.get("baz")).toEqual("boom");
  });

  it("creates a new hash by merging keys independent if they are symbols or strings", () => {
    const other = hash.merge({ force: false, ":baz": "boom" });
    expect(other.get(":force")).toEqual(false);
    expect(other.get("baz")).toEqual("boom");
  });

  it("converts to a traditional hash", () => {
    expect(hash.toHash().constructor).toEqual(Hash);
    expect(hash).toEqual(indifferent({ foo: "bar", baz: "bee", force: true }));
  });

  it("handles reverse_merge", () => {
    const other = { ":foo": "qux", boo: "bae" };
    const newHash = hash.reverseMerge(other);

    expect(hash).not.toBe(newHash);
    expect(newHash.get(":foo")).toEqual("bar");
    expect(newHash.get(":boo")).toEqual("bae");
  });

  it("handles reverse_merge!", () => {
    const other = { ":foo": "qux", boo: "bae" };
    const newHash = hash.reverseMergeBang(other);

    expect(hash).toBe(newHash);
    expect(newHash.get(":foo")).toEqual("bar");
    expect(newHash.get(":boo")).toEqual("bae");
  });
});
