import { describe, it, expect, vi, afterEach } from "vitest";
import { fileURLToPath } from "url";
import { allowMissingRailsApi, railsApiAvailable } from "./require-rails-api.js";

const EXISTING = fileURLToPath(import.meta.url);
const MISSING = `${EXISTING}.does-not-exist.json`;

function options(railsApiPath: string, argv: readonly string[]) {
  return {
    scriptName: "build-rails-privates-manifest",
    railsApiPath,
    manifestName: "eslint/rails-private-methods.json",
    ruleName: "rails-private-jsdoc",
    argv,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("allowMissingRailsApi", () => {
  it("recognizes the --allow-missing opt-in", () => {
    expect(allowMissingRailsApi(["--allow-missing"])).toBe(true);
    expect(allowMissingRailsApi([])).toBe(false);
  });
});

describe("railsApiAvailable", () => {
  it("returns true when rails-api.json exists", () => {
    expect(railsApiAvailable(options(EXISTING, []))).toBe(true);
  });

  it("throws naming pnpm api:compare when rails-api.json is missing", () => {
    expect(() => railsApiAvailable(options(MISSING, []))).toThrow(/pnpm api:compare/);
  });

  it("names the rule that would go inert", () => {
    expect(() => railsApiAvailable(options(MISSING, []))).toThrow(
      /blazetrails\/rails-private-jsdoc/,
    );
  });

  it("returns false and warns when --allow-missing is passed", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(railsApiAvailable(options(MISSING, ["--allow-missing"]))).toBe(false);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0][0]).toMatch(/INERT/);
  });

  it("does not warn when the file exists even with --allow-missing", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(railsApiAvailable(options(EXISTING, ["--allow-missing"]))).toBe(true);
    expect(warn).not.toHaveBeenCalled();
  });
});
