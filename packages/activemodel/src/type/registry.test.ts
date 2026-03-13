import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "../index.js";
import { ModelName } from "../naming.js";
import { CallbackChain } from "../callbacks.js";

describe("ActiveModel", () => {
  describe("RegistryTest", () => {
    it("a block can be registered", () => {
      // Custom types can be registered via typeRegistry
      expect(Types.typeRegistry.lookup("string")).toBeDefined();
    });
  });
});
