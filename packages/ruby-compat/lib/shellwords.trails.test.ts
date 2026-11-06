import { describe, expect, it } from "vitest";
import { Shellwords } from "./shellwords.js";

describe("Shellwords.shellwords", () => {
  it("keeps the final word", () => {
    expect(Shellwords.shellwords("-s")).toEqual(["-s"]);
    expect(Shellwords.shellwords("a b")).toEqual(["a", "b"]);
    expect(Shellwords.shellwords('a"b"')).toEqual(["ab"]);
  });
});
