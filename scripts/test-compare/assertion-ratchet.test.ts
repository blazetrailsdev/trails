import { describe, expect, it } from "vitest";
import { countsFromArtifact } from "./assertion-ratchet.js";

// The gate arms (violations / missingFromArtifact / the renderers)
// are exercised end-to-end through `main` in lint-assertion-mismatches.test.ts.
describe("countsFromArtifact", () => {
  it("reads the three per-package totals", () => {
    expect(
      countsFromArtifact({
        results: [
          {
            package: "activerecord",
            totalAssertionMismatch: 5,
            totalKindMismatch: 7,
            totalValueMismatch: 1,
          },
        ],
      }),
    ).toEqual({ activerecord: { assertionCount: 5, kind: 7, value: 1 } });
  });

  it("keeps a converged package at zero rather than dropping it", () => {
    expect(countsFromArtifact({ results: [{ package: "arel" }] })).toEqual({
      arel: { assertionCount: 0, kind: 0, value: 0 },
    });
  });
});
