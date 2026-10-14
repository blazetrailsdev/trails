import { describe, expect, it } from "vitest";
import type { ParamInfo } from "@blazetrails/parity/types";
import { dropsBlock } from "./block-params.js";
import { measure, staleMarkFailure, staleMarks, type ParamNameMarks } from "./param-name-mark.js";

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

describe("the block-param gate's stale-mark arm", () => {
  const gated = ["actionview"];
  const row = (rubyFile: string) => ({ package: "actionview", rubyFile });

  it("fails on a per-package total or per-file mark above the measurement", () => {
    const marks: ParamNameMarks = { actionview: { total: 5, byFile: { "a.rb": 3, "b.rb": 2 } } };
    const current = measure([row("a.rb"), row("a.rb"), row("a.rb")], gated);
    const failure = staleMarkFailure(
      "block-param gate",
      "parity:api:blocks:tighten",
      staleMarks(marks, current, gated),
    )!;
    expect(failure).toContain("pnpm parity:api:blocks:tighten");
    expect(failure).toContain("actionview  total: mark 5 → current 3");
    expect(failure).toContain("actionview  b.rb: mark 2 → current 0");
    expect(failure).not.toContain("a.rb");
  });

  it("passes a mark that sits on the measurement", () => {
    const current = measure([row("a.rb")], gated);
    expect(
      staleMarkFailure("block-param gate", "t", staleMarks(current, current, gated)),
    ).toBeNull();
  });
});
