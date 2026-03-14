import { describe, it, expect } from "vitest";
import { Types } from "../index.js";

describe("ActiveModel", () => {
  describe("TypeTest", () => {
    it("registering a new type", () => {
      class CustomType extends Types.Type<string> {
        readonly name = "custom";
        cast(value: unknown) {
          return value === null ? null : `custom:${value}`;
        }
      }
      Types.typeRegistry.register("custom_test", () => new CustomType());
      const type = Types.typeRegistry.lookup("custom_test");
      expect(type.cast("hello")).toBe("custom:hello");
    });
  });
});
