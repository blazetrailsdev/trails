import { describe, expect, it } from "vitest";
import type { ParamInfo } from "@blazetrails/parity/types";
import { dropsBlock } from "./block-params.js";

const opts: ParamInfo = { name: "opts", kind: "optional" };
const fn: ParamInfo = { name: "fn", kind: "optional", admitsFunction: true };

describe("dropsBlock", () => {
  it("flags a block-taking Ruby method whose port has no function parameter", () => {
    expect(dropsBlock(true, [[opts]])).toBe(true);
  });

  it("clears the pair when any candidate signature admits a function", () => {
    expect(dropsBlock(true, [[opts], [opts, fn]])).toBe(false);
  });

  it("ignores a Ruby method that takes no block", () => {
    expect(dropsBlock(false, [[opts]])).toBe(false);
  });

  it("has nothing to judge without a TS candidate", () => {
    expect(dropsBlock(true, [])).toBe(false);
  });
});
