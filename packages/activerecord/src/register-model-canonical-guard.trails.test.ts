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
import "./support/canonical-model-index.js";
import { describe, it, expect } from "vitest";
import { Base, registerModel, registerSubclass } from "./index.js";
import { modelRegistry } from "./associations.js";
import { safeConstantize } from "@blazetrails/activesupport";
import { Author } from "./test-helpers/models/author.js";

/** A subclass whose `.name` is `name`, without shadowing an imported binding. */
function subclassNamed(parent: typeof Base, name: string): typeof Base {
  const klass = class extends parent {};
  Object.defineProperty(klass, "name", { value: name });
  return klass;
}

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

  it("throws when an STI subclass takes a canonical name", () => {
    class RfStiParentXyz extends Base {}
    const shadow = subclassNamed(RfStiParentXyz, "Author");
    expect(() => registerSubclass(shadow)).toThrow(/shadow the canonical model/);
    expect(safeConstantize("Author")).toBe(Author);
  });

  it("unregisters the constant when the registry entry is dropped", () => {
    class RfDroppedXyz extends Base {}
    registerModel(RfDroppedXyz);
    expect(safeConstantize("RfDroppedXyz")).toBe(RfDroppedXyz);
    modelRegistry.delete("RfDroppedXyz");
    expect(safeConstantize("RfDroppedXyz")).toBeUndefined();
  });

  it("leaves no model constants behind when the registry is cleared", () => {
    const saved = [...modelRegistry.entries()];
    try {
      modelRegistry.clear();
      for (const [name] of saved) expect(safeConstantize(name)).toBeUndefined();
    } finally {
      for (const [name, model] of saved) modelRegistry.set(name, model);
    }
  });
});
