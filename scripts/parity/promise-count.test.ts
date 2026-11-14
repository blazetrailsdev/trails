import * as fs from "fs/promises";
import { describe, expect, it } from "vitest";

import {
  MARK_PATH,
  RULES,
  changesEveryPackage,
  exceedances,
  packageOf,
  raisedMarks,
  tally,
  tightened,
} from "./promise-count.js";

const [FLOAT, CTOR, SWALLOW] = RULES;

describe("promise-count gate", () => {
  it("keys a file by its package", () => {
    expect(packageOf("packages/rack/lib/a.ts")).toBe("rack");
    expect(packageOf("scripts/parity/a.ts")).toBe("scripts");
    expect(packageOf("eslint/a.mjs")).toBeNull();
  });

  it("tallies the gated rules only", () => {
    const counts = tally([
      { file: "packages/rack/lib/a.ts", ruleIds: [FLOAT, FLOAT, "other", null] },
      { file: "packages/rake/lib/b.ts", ruleIds: [CTOR, SWALLOW] },
    ]);
    expect(counts).toEqual({ [FLOAT]: { rack: 2 }, [CTOR]: { rake: 1 }, [SWALLOW]: { rake: 1 } });
  });

  it("passes at the mark and fails one over, holding an unmarked package at 0", () => {
    const mark = { [FLOAT]: { rack: 2 }, [CTOR]: {} };
    expect(exceedances(mark, { [FLOAT]: { rack: 2 }, [CTOR]: {} })).toEqual([]);
    expect(exceedances(mark, { [FLOAT]: { rack: 3 }, [CTOR]: {} })).toHaveLength(1);
    expect(exceedances(mark, { [FLOAT]: {}, [CTOR]: { rake: 1 } })).toHaveLength(1);
  });

  it("tightens a linted package down and never up", () => {
    const mark = { [FLOAT]: { rack: 2, rake: 5 }, [CTOR]: { rake: 1 }, [SWALLOW]: {} };
    const current = { [FLOAT]: { rack: 9, rake: 3 }, [CTOR]: {}, [SWALLOW]: {} };
    expect(tightened(mark, current, ["rack", "rake"])).toEqual({
      [FLOAT]: { rack: 2, rake: 3 },
      [CTOR]: {},
      [SWALLOW]: {},
    });
    expect(tightened(mark, current, ["rack"])).toEqual(mark);
  });

  it("fails a mark raised above the base, an unmarked base package counting 0", () => {
    const base = { [FLOAT]: { rack: 2 }, [CTOR]: {} };
    expect(raisedMarks(base, { [FLOAT]: { rack: 1 }, [CTOR]: {} })).toEqual([]);
    expect(raisedMarks(base, { [FLOAT]: { rack: 3 }, [CTOR]: {} })).toHaveLength(1);
    expect(raisedMarks(base, { [FLOAT]: { rack: 2 }, [CTOR]: { rake: 1 } })).toHaveLength(1);
    expect(raisedMarks(base, { [FLOAT]: { rack: 2 }, [CTOR]: {}, [SWALLOW]: { rack: 4 } })).toEqual(
      [],
    );
  });

  it("re-measures every package when a rule, the config or a tsconfig changes", () => {
    for (const file of [
      "eslint/constructor-creates-no-promise.mjs",
      "eslint.config.mjs",
      "scripts/parity/promise-count-mark.json",
      "packages/rack/tsconfig.json",
    ]) {
      expect(changesEveryPackage(file)).toBe(true);
    }
    expect(changesEveryPackage("packages/rack/lib/a.ts")).toBe(false);
  });

  it("commits a mark for each gated rule", async () => {
    const mark = JSON.parse(await fs.readFile(MARK_PATH, "utf8"));
    expect(Object.keys(mark).sort()).toEqual([...RULES].sort());
  });
});
