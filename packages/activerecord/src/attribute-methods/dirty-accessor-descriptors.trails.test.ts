import { describe, it, expect } from "vitest";
import { Base } from "../index.js";

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
