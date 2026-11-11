import { readFile } from "fs/promises";
import * as path from "path";
import { fileURLToPath } from "url";
import { describe, expect, it } from "vitest";
import { NOT_EXERCISED, STEPS, parseArgs, railsComparisonScripts, unaccounted } from "./steps.js";

const CI_YML = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../../.github/workflows/ci.yml",
);

describe("bump dry-run steps", () => {
  it("accounts for every script ci.yml's rails-comparison job names", async () => {
    const scripts = railsComparisonScripts(await readFile(CI_YML, "utf8"));
    expect(scripts.length).toBeGreaterThan(30);
    expect(unaccounted(scripts)).toEqual([]);
  });

  it("names no step both run and not exercised", () => {
    const run = new Set(STEPS.map((s) => s.name));
    expect(NOT_EXERCISED.filter((s) => run.has(s.name))).toEqual([]);
  });

  it("reads --source and --ref only as flag values", () => {
    expect(parseArgs(["--source", "rails", "--ref", "v8.0.5.2"])).toEqual({
      source: "rails",
      ref: "v8.0.5.2",
    });
    expect(parseArgs(["rails", "--ref", "v8.0.5.2"])).toEqual({
      source: undefined,
      ref: "v8.0.5.2",
    });
    expect(parseArgs(["--source", "--ref", "v8.0.5.2"])).toEqual({
      source: undefined,
      ref: "v8.0.5.2",
    });
    expect(parseArgs(["--source", "rails", "--ref"])).toEqual({ source: "rails", ref: undefined });
  });

  it("finds a script ci.yml names that no list accounts for", () => {
    expect(unaccounted(["scripts/api-compare/lint-body-pins.ts", "scripts/new-gate.ts"])).toEqual([
      "scripts/new-gate.ts",
    ]);
  });
});
