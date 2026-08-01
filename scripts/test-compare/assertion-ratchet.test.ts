import { describe, expect, it } from "vitest";
import {
  type AssertionMark,
  countsFromArtifact,
  missingFromArtifact,
  nextMark,
  parseMark,
  renderExceeded,
  shrunk,
  violations,
} from "./assertion-ratchet.js";
import { NO_REGEN_FLAG, REGEN_SKIP_ENV, shouldRegenerate } from "./lint-assertion-mismatches.js";

const mark: AssertionMark = {
  packages: {
    activerecord: { assertionCount: 10, kind: 20, value: 3 },
    arel: { assertionCount: 0, kind: 0, value: 0 },
  },
};

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

describe("violations", () => {
  it("flags each counter that exceeds its mark", () => {
    const { exceeded, unmarked } = violations(
      {
        activerecord: { assertionCount: 11, kind: 20, value: 4 },
        arel: { assertionCount: 0, kind: 0, value: 0 },
      },
      mark,
    );
    expect(unmarked).toEqual([]);
    expect(exceeded).toEqual([
      { package: "activerecord", counter: "assertionCount", current: 11, mark: 10 },
      { package: "activerecord", counter: "value", current: 4, mark: 3 },
    ]);
  });

  it("treats a package absent from the mark as an error, not an implicit zero", () => {
    const { exceeded, unmarked } = violations(
      { activemodel: { assertionCount: 9, kind: 0, value: 0 } },
      mark,
    );
    expect(exceeded).toEqual([]);
    expect(unmarked).toEqual(["activemodel"]);
  });

  it("passes when every counter sits at or under its mark", () => {
    const { exceeded, unmarked } = violations(
      {
        activerecord: { assertionCount: 10, kind: 19, value: 0 },
        arel: { assertionCount: 0, kind: 0, value: 0 },
      },
      mark,
    );
    expect(exceeded).toEqual([]);
    expect(unmarked).toEqual([]);
  });
});

describe("nextMark", () => {
  it("lowers a counter that shrank and never raises one that grew", () => {
    expect(
      nextMark(
        {
          activerecord: { assertionCount: 4, kind: 99, value: 3 },
          arel: { assertionCount: 0, kind: 0, value: 0 },
        },
        mark,
      ),
    ).toEqual({
      packages: {
        activerecord: { assertionCount: 4, kind: 20, value: 3 },
        arel: { assertionCount: 0, kind: 0, value: 0 },
      },
    });
  });

  it("seeds a package the mark does not cover at its current counts", () => {
    expect(nextMark({ activemodel: { assertionCount: 2, kind: 1, value: 0 } }, mark)).toEqual({
      packages: { activemodel: { assertionCount: 2, kind: 1, value: 0 } },
    });
  });
});

describe("missingFromArtifact", () => {
  it("reports marked packages the artifact does not cover", () => {
    expect(
      missingFromArtifact({ activerecord: { assertionCount: 1, kind: 1, value: 1 } }, mark),
    ).toEqual(["arel"]);
  });
});

describe("shrunk", () => {
  it("reports counters that came in under the mark", () => {
    expect(
      shrunk(
        {
          activerecord: { assertionCount: 10, kind: 18, value: 3 },
          arel: { assertionCount: 0, kind: 0, value: 0 },
        },
        mark,
      ),
    ).toEqual([{ package: "activerecord", counter: "kind", current: 18, mark: 20 }]);
  });
});

describe("renderExceeded", () => {
  it("names the counter, the excess, and the only-shrink rule", () => {
    const text = renderExceeded(
      [{ package: "activerecord", counter: "kind", current: 25, mark: 20 }],
      "scripts/test-compare/assertion-mismatch-mark.json",
    );
    expect(text).toContain("assertion-kind-mismatch: 25 (mark 20, +5)");
    expect(text).toContain("only shrinks");
  });
});

describe("shouldRegenerate", () => {
  it("regenerates the artifact for a plain local run", () => {
    expect(shouldRegenerate([], {})).toBe(true);
  });

  it("does not regenerate under CI, which writes the artifact in its own step", () => {
    expect(shouldRegenerate([], { CI: "true" })).toBe(false);
  });

  it("does not regenerate under --no-regen or the skip env", () => {
    expect(shouldRegenerate([NO_REGEN_FLAG], {})).toBe(false);
    expect(shouldRegenerate([], { [REGEN_SKIP_ENV]: "1" })).toBe(false);
  });
});
