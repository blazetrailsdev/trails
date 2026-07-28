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
import { subclasses } from "./inheritance.js";
import { modelRegistry } from "./associations.js";
import { safeConstantize } from "@blazetrails/activesupport";
import { Author } from "./test-helpers/models/author.js";
import "./test-helpers/models/country.js";

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
    expect(subclasses(RfStiParentXyz)).not.toContain(shadow);
  });

  it("throws when a bespoke class reaches the registry through a bare set", () => {
    class RfBareSetXyz extends Base {}
    const before = modelRegistry.generation;
    expect(() => modelRegistry.set("Author", RfBareSetXyz)).toThrow(/shadow the canonical model/);
    expect(modelRegistry.get("Author")).toBe(Author);
    expect(modelRegistry.generation).toBe(before);
  });

  it("keeps a constant rebound by another writer when the registry entry is dropped", () => {
    class RfRebindHostXyz extends Base {}
    registerModel(RfRebindHostXyz);
    const sub = subclassNamed(RfRebindHostXyz, "RfRebindHostXyz");
    registerSubclass(sub);
    expect(safeConstantize("RfRebindHostXyz")).toBe(sub);
    modelRegistry.delete("RfRebindHostXyz");
    expect(safeConstantize("RfRebindHostXyz")).toBe(sub);
  });

  it("registers an STI subclass as a constant without widening the registry", () => {
    class RfStiHostXyz extends Base {}
    const sub = subclassNamed(RfStiHostXyz, "RfStiSubXyz");
    registerSubclass(sub);
    expect(safeConstantize("RfStiSubXyz")).toBe(sub);
    expect(modelRegistry.has("RfStiSubXyz")).toBe(false);
  });

  it("binds the habtm join model as a constant, as Rails' const_set does", () => {
    // Rails: `const_set join_model.name, join_model` (associations.rb:1877).
    expect(safeConstantize("Country::HABTM_Treaties")).toBe(
      modelRegistry.get("Country::HABTM_Treaties"),
    );
    expect(modelRegistry.get("Country::HABTM_Treaties")).toBeDefined();
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
      // Replay each key the way it was installed: a bare `set` key (e.g. the
      // habtm join key) must not come back with the `_registryKeys` entry and
      // counter-cache flush that only `registerModel` performs.
      for (const [name, model] of saved) {
        if (model._registryKeys?.includes(name)) registerModel(name, model);
        else modelRegistry.set(name, model);
      }
    }
  });
});
