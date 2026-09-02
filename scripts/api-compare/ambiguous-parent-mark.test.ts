import { describe, expect, it } from "vitest";

import { exceedances, staleMarks, tightened } from "./lint-ambiguous-parents.js";

describe("ambiguous-parent mark", () => {
  it("flags a package that grew past its mark", () => {
    expect(exceedances({ activerecord: 14 }, { activerecord: 15 })).toEqual([
      { package: "activerecord", mark: 14, current: 15 },
    ]);
  });

  it("holds an unmarked package to zero", () => {
    // A package appearing for the first time is exactly the silent growth the
    // gate exists to catch, so it does not get a free pass.
    expect(exceedances({}, { arel: 1 })).toEqual([{ package: "arel", mark: 0, current: 1 }]);
  });

  it("passes a package sitting at or below its mark", () => {
    expect(exceedances({ rack: 1 }, { rack: 1 })).toEqual([]);
    expect(exceedances({ rack: 1 }, {})).toEqual([]);
  });

  it("reports a mark left above the measurement without failing it", () => {
    expect(staleMarks({ rack: 5 }, { rack: 1 })).toEqual([
      { package: "rack", mark: 5, current: 1 },
    ]);
  });

  it("tightens DOWN only, and drops a package that converged to zero", () => {
    expect(tightened({ rack: 5, activemodel: 1 }, { rack: 1, activemodel: 4 })).toEqual({
      rack: 1,
      activemodel: 1,
    });
    expect(tightened({ rack: 1 }, {})).toEqual({});
  });
});
