import { describe, it, expect } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { sliceBang } from "./hash/slice.js";
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";
import { deepTransformKeys, deepStringifyKeysBang } from "../hash-utils.js";

describe("HashExtTest (trails)", () => {
  it("slice bang over a Hash keeps the argument order", () => {
    const hash = new Hash<string, number>();
    hash.set("a", 1);
    hash.set("b", 2);
    hash.set("c", 3);

    const omit = sliceBang(hash, "c", "a");

    expect([...hash.keys()]).toEqual(["c", "a"]);
    expect([...omit.keys()]).toEqual(["b"]);
  });

  it("deep transform keys over a Hash answers a Hash of the receiver's class", () => {
    const hash = new Hash<string, unknown>();
    const inner = new Hash<string, unknown>();
    inner.set("b", 1);
    hash.set("a", inner);

    const result = deepTransformKeys(hash, (k) => k.toUpperCase()) as Hash<string, unknown>;

    expect(result).toBeInstanceOf(Hash);
    expect(result.get("A")).toBeInstanceOf(Hash);
    expect((result.get("A") as Hash<string, unknown>).get("B")).toBe(1);
  });

  it("deep transform keys over a HashWithIndifferentAccess answers one of those", () => {
    const hash = new HashWithIndifferentAccess<unknown>({ a: { b: 1 } });

    const result = deepTransformKeys(hash, (k) => k.toUpperCase());

    expect(result).toBeInstanceOf(HashWithIndifferentAccess);
  });

  it("deep stringify keys bang over a Hash answers the receiver", () => {
    const hash = new Hash<string, unknown>();
    hash.set("a", 1);

    expect(deepStringifyKeysBang(hash)).toBe(hash);
  });
});
