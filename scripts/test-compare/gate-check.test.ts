import { describe, expect, it } from "vitest";
import { GATE_ENFORCED_PACKAGES, gateMismatchOffenders } from "./test-compare.js";

describe("gateMismatchOffenders (hard-zero --check gate)", () => {
  it("enforces activerecord only", () => {
    expect(GATE_ENFORCED_PACKAGES.has("activerecord")).toBe(true);
    expect(GATE_ENFORCED_PACKAGES.has("activemodel")).toBe(false);
  });

  it("passes (no offenders) when activerecord is at zero", () => {
    expect(gateMismatchOffenders([{ package: "activerecord", totalGateMismatch: 0 }])).toEqual([]);
  });

  it("flags activerecord when its gate-mismatch count is non-zero", () => {
    const offenders = gateMismatchOffenders([{ package: "activerecord", totalGateMismatch: 3 }]);
    expect(offenders).toHaveLength(1);
    expect(offenders[0]?.package).toBe("activerecord");
  });

  it("ignores non-enforced packages even when they have mismatches", () => {
    expect(
      gateMismatchOffenders([
        { package: "activemodel", totalGateMismatch: 5 },
        { package: "arel", totalGateMismatch: 2 },
      ]),
    ).toEqual([]);
  });

  it("only reports the enforced package from a mixed result set", () => {
    const offenders = gateMismatchOffenders([
      { package: "activemodel", totalGateMismatch: 5 },
      { package: "activerecord", totalGateMismatch: 1 },
    ]);
    expect(offenders.map((o) => o.package)).toEqual(["activerecord"]);
  });
});
