import { describe, expect, it } from "vitest";
import { countsFromArtifact, parseMark } from "./assertion-ratchet.js";

// The gate arms (violations / nextMark / missingFromArtifact / the renderers)
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

describe("parseMark", () => {
  it("rejects a non-integer counter", () => {
    expect(() =>
      parseMark('{"packages":{"arel":{"assertionCount":1.5,"kind":0,"value":0}}}'),
    ).toThrow(/arel\.assertionCount/);
  });

  it("rejects a missing counter", () => {
    expect(() => parseMark('{"packages":{"arel":{"assertionCount":0,"kind":0}}}')).toThrow(
      /arel\.value/,
    );
  });

  it("rejects a mark without a packages object", () => {
    expect(() => parseMark("{}")).toThrow(/expected/);
  });
});
