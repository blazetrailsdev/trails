import { describe, it, expect } from "vitest";
import { Hash } from "@blazetrails/ruby-compat";
import { sliceBang } from "./hash/slice.js";

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
});
