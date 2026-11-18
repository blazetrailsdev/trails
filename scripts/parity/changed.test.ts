import { describe, it, expect } from "vitest";
import { changedPackages, plan } from "./changed.js";

describe("changedPackages", () => {
  it("collects each packages/* directory once, ignoring files outside packages", () => {
    expect(
      changedPackages([
        "packages/thor/lib/thor.ts",
        "packages/thor/test/thor.test.ts",
        "packages/activemodel/lib/api.ts",
        "scripts/parity/changed.ts",
        "CLAUDE.md",
      ]),
    ).toEqual(["activemodel", "thor"]);
  });
});

describe("plan", () => {
  it("runs enrolled packages, skips the rest, and flags shared ones", () => {
    const p = plan(
      [
        "packages/activesupport/lib/a.ts",
        "packages/ruby-compat/lib/b.ts",
        "packages/thor/lib/c.ts",
      ],
      new Set(["activesupport", "thor"]),
    );
    expect(p.run).toEqual(["activesupport", "thor"]);
    expect(p.skipped).toEqual(["ruby-compat"]);
    expect(p.shared).toEqual(["activesupport", "ruby-compat"]);
  });
});
