import { describe, expect, it } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { IndifferentHash } from "./index.js";

describe("Mail::IndifferentHash", () => {
  it("merges, converts nested hashes and keeps the receiver on reverse merge", () => {
    const hash = new IndifferentHash({ a: 1 });
    expect(hash.merge({ b: 2 }).valuesAt("a", "b")).toEqual([1, 2]);
    expect(hash.reverseMerge(new Hash<string, unknown>().set("a", 2)).get("a")).toEqual(1);
    hash.set("n", new Hash<string, unknown>());
    expect(hash.get("n")).toBeInstanceOf(IndifferentHash);
    expect(hash.isKey("a")).toBe(true);
  });
});
