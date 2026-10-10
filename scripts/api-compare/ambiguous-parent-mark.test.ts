import { describe, expect, it } from "vitest";

import { staleMarkFailure } from "./param-name-mark.js";
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

  it("fails a mark left above the measurement, naming the row and the tighten script", () => {
    const stale = staleMarks({ rack: 5 }, { rack: 1 });
    expect(stale).toEqual([{ package: "rack", mark: 5, current: 1 }]);
    const failure = staleMarkFailure(
      "ambiguous-parent gate",
      "parity:api:parents:tighten",
      stale.map((v) => ({ ...v, dimension: "total" })),
    )!;
    expect(failure).toContain("ambiguous-parent gate: 1 STALE mark dimension(s)");
    expect(failure).toContain("pnpm parity:api:parents:tighten");
    expect(failure).toContain("rack  total: mark 5 → current 1");
    expect(staleMarks({ rack: 1 }, { rack: 1 })).toEqual([]);
  });

  it("tightens DOWN only, and drops a package that converged to zero", () => {
    expect(tightened({ rack: 5, activemodel: 1 }, { rack: 1, activemodel: 4 })).toEqual({
      rack: 1,
      activemodel: 1,
    });
    expect(tightened({ rack: 1 }, {})).toEqual({});
  });
});
