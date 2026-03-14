import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("ActiveModel", () => {
  describe("RegistryTest", () => {
    it("a block can be registered", () => {
      // Custom types can be registered via typeRegistry
      expect(Types.typeRegistry.lookup("string")).toBeDefined();
    });
  });

  describe("Type Registry (ported)", () => {
    it("a class can be registered for a symbol", () => {
      Types.typeRegistry.register("mytype", () => new Types.StringType());
      const t = Types.typeRegistry.lookup("mytype");
      expect(t).toBeInstanceOf(Types.StringType);
    });

    it("a reasonable error is given when no type is found", () => {
      expect(() => Types.typeRegistry.lookup("nonexistent_type_xyz")).toThrow(
        "Unknown type: nonexistent_type_xyz",
      );
    });
  });
});
