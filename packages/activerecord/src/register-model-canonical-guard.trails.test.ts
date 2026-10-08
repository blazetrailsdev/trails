import { rbModName } from "@blazetrails/ruby-compat";
import "./support/canonical-model-index.js";
import { describe, it, expect } from "vitest";
import { Base, registerModel, registerSubclass } from "./index.js";
import { modelRegistry } from "./associations.js";
import { constantize, safeConstantize } from "@blazetrails/activesupport";
import { Author } from "./test-helpers/models/author.js";
import "./test-helpers/models/country.js";

function subclassNamed(parent: typeof Base, name: string): typeof Base {
  const klass = class extends parent {};
  Object.defineProperty(klass, "name", { value: name });
  return klass;
}

describe("registerModel canonical-name shadow guard", () => {
  it("allows re-registering the canonical class under its own name", () => {
    expect(() => registerModel("Author", Author)).not.toThrow();
    expect(() => registerModel(Author)).not.toThrow();
  });

  it("allows a bespoke class under a non-canonical name", () => {
    class RfWidgetXyz extends Base {}
    expect(() => registerModel("RfWidgetXyz", RfWidgetXyz)).not.toThrow();
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

  it("binds the habtm join model as a private constant", () => {
    expect(constantize("Country::HABTM_Treaties")).toBeDefined();
  });

  it("unregisters the constant when the registry entry is dropped", () => {
    class RfDroppedXyz extends Base {}
    registerModel(RfDroppedXyz);
    expect(safeConstantize("RfDroppedXyz")).toBe(RfDroppedXyz);
    modelRegistry.delete("RfDroppedXyz");
    expect(safeConstantize("RfDroppedXyz")).toBeUndefined();
  });

  it("leaves no per-class map holding a model the registry has dropped", () => {
    class RfNoSideMapXyz extends Base {}
    registerModel(RfNoSideMapXyz);
    modelRegistry.delete("RfNoSideMapXyz");

    const holders = Object.getOwnPropertyNames(Base).filter((key) => {
      const value = Object.getOwnPropertyDescriptor(Base, key)?.value;
      return value instanceof Map && [...value.values()].includes(RfNoSideMapXyz);
    });
    expect(holders).toEqual([]);
  });

  it("leaves no model constants behind when the registry is cleared", () => {
    const saved = [...modelRegistry.entries()];
    try {
      modelRegistry.clear();
      for (const [name, model] of saved) {
        if (name.includes("::") && rbModName(model) === name) continue;
        expect(safeConstantize(name)).not.toBe(model);
      }
    } finally {
      for (const [name, model] of saved) modelRegistry.set(name, model);
    }
  });
});
