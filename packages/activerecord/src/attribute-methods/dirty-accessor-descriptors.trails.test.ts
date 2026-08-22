import { describe, it, expect } from "vitest";
import { Base } from "../index.js";

// The save-side readers of AttributeMethods::Dirty are zero-arg Ruby readers,
// so they port as accessor properties (CLAUDE.md, "Generated attribute readers
// are properties"). `include()` preserves that only through its class-module
// branch — an object-literal module is read by value and flattens each getter
// into a data property whose value is the getter's result at include time, so
// every record would answer the same stale hash. Pin the descriptor kind.
describe("AttributeMethods::Dirty accessor descriptors", () => {
  const SAVE_SIDE_READERS = [
    "savedChanges",
    "hasChangesToSave",
    "changesToSave",
    "changedAttributeNamesToSave",
    "attributesInDatabase",
  ] as const;

  it("save-side dirty readers are accessor properties on Base", () => {
    for (const name of SAVE_SIDE_READERS) {
      const descriptor = Object.getOwnPropertyDescriptor(Base.prototype, name);
      expect(descriptor, name).toBeDefined();
      expect(typeof descriptor!.get, name).toBe("function");
      expect(descriptor!.value, name).toBeUndefined();
    }
  });

  it("save-side dirty readers do not live on ActiveModel", () => {
    const model = Object.getPrototypeOf(Base.prototype) as object;
    for (const name of SAVE_SIDE_READERS) {
      expect(Object.getOwnPropertyDescriptor(model, name), name).toBeUndefined();
    }
  });
});
