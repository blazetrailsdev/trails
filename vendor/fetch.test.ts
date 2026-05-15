import { describe, expect, it } from "vitest";
import { parseArgs } from "./fetch.js";

describe("vendor/fetch.ts parseArgs", () => {
  it("defaults: no flags", () => {
    expect(parseArgs([])).toEqual({
      refresh: false,
      migrate: false,
      printPaths: { active: false },
      printTestPaths: false,
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

  it("--print-test-paths sets the flag", () => {
    expect(parseArgs(["--print-test-paths"]).printTestPaths).toBe(true);
  });

  it("--print-test-paths emits valid JSON matching testPathsManifest()", async () => {
    // Spawn the CLI for real (not just parseArgs) so the integration that
    // ruby relies on — `TEST_PATHS_JSON=$(pnpm -s vendor:fetch --print-test-paths)`
    // — gets exercised end-to-end. Catches regressions in stdout shape that
    // unit-testing the parser alone would miss (extra log lines, banner output,
    // newline trimming bugs, etc.).
    const { execFileSync } = await import("node:child_process");
    const { fileURLToPath } = await import("node:url");
    const { dirname, join } = await import("node:path");
    const here = dirname(fileURLToPath(import.meta.url));
    const out = execFileSync("pnpm", ["-s", "tsx", join(here, "fetch.ts"), "--print-test-paths"], {
      encoding: "utf8",
    });
    const { testPathsManifest } = await import("./sources.js");
    expect(JSON.parse(out)).toEqual(testPathsManifest());
  });

  it("rejects unknown flags", () => {
    expect(() => parseArgs(["--bogus"])).toThrow(/unknown flag: --bogus/);
  });
});
