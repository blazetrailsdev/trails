import { describe, expect, it } from "vitest";
import { parseArgs } from "./fetch.js";

describe("vendor/fetch.ts parseArgs", () => {
  it("defaults: no flags", () => {
    expect(parseArgs([])).toEqual({
      refresh: false,
      migrate: false,
      printPaths: { active: false },
    });
  });

  it("--refresh + --migrate", () => {
    const a = parseArgs(["--refresh", "--migrate"]);
    expect(a.refresh).toBe(true);
    expect(a.migrate).toBe(true);
  });

  it("--source <name>", () => {
    expect(parseArgs(["--source", "rails"]).sourceFilter).toBe("rails");
  });

  it("--print-paths with no arg = all sources", () => {
    expect(parseArgs(["--print-paths"]).printPaths).toEqual({ active: true, name: undefined });
  });

  it("--print-paths <name> = filtered", () => {
    expect(parseArgs(["--print-paths", "rails"]).printPaths).toEqual({
      active: true,
      name: "rails",
    });
  });

  it("--print-paths followed by another flag treats next as flag, not name", () => {
    // Regression: a bare --print-paths in the middle of an arg list shouldn't
    // greedily consume the next flag as its argument.
    const a = parseArgs(["--print-paths", "--source", "rails"]);
    expect(a.printPaths).toEqual({ active: true, name: undefined });
    expect(a.sourceFilter).toBe("rails");
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown flag: --bogus/);
  });
});
