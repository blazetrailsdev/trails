/**
 * Trails-only: guards `registerModel` against a bespoke inline model silently
 * shadowing a canonical one in the global registry. The registry is never torn
 * down between tests, so an early `registerModel("Author", BespokeAuthor)`
 * poisons every later test that resolves "Author" as an association target — a
 * wrong-value failure that never announces itself. There is no Rails analogue
 * (Ruby autoloading owns the constant), so this lives in a `.trails.test.ts`.
 *
 * The guard is only armed once the canonical autoload index is installed, so
 * this file imports it for its side effect.
 */
import "./test-helpers/canonical-model-index.js";
import { describe, it, expect } from "vitest";
import { Base, registerModel } from "./index.js";
import { Author } from "./test-helpers/models/author.js";

describe("registerModel canonical-name shadow guard", () => {
  it("throws when a bespoke class is registered under a canonical name", () => {
    class BespokeAuthor extends Base {}
    expect(() => registerModel("Author", BespokeAuthor)).toThrow(/shadow the canonical model/);
  });

  it("allows re-registering the canonical class under its own name", () => {
    expect(() => registerModel("Author", Author)).not.toThrow();
    expect(() => registerModel(Author)).not.toThrow();
  });

  it("allows a bespoke class under a non-canonical name", () => {
    class RfWidgetXyz extends Base {}
    expect(() => registerModel("RfWidgetXyz", RfWidgetXyz)).not.toThrow();
  });
});
