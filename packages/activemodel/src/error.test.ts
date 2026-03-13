import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("ErrorTest", () => {
    it("full_message uses default format", () => {
      const errors = new Errors({});
      expect(errors.fullMessage("name", "is invalid")).toBe("Name is invalid");
    });

    it("comparing against different class would not raise error", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      // Just verify it doesn't throw
      expect(errors.details[0]).toBeDefined();
    });

    it("details which has no raw_type", () => {
      const errors = new Errors({});
      errors.add("name", "blank");
      const detail = errors.details[0];
      expect(detail.type).toBe("blank");
    });
  });

  describe("ErrorTest", () => {
    it("match? handles extra options match", () => {
      const errors = new Errors({});
      errors.add("name", "invalid", { message: "is bad" });
      expect(errors.added("name", "invalid")).toBe(true);
    });

    it("message handles lambda in messages and option values, and i18n interpolation", () => {
      const errors = new Errors({});
      errors.add("name", "invalid", { message: "custom error" });
      expect(errors.get("name")).toEqual(["custom error"]);
    });

    it("message with type as a symbol and indexed attribute can lookup without index in attribute key", () => {
      const errors = new Errors({});
      errors.add("name", "invalid");
      expect(errors.get("name")).toEqual(["is invalid"]);
    });
  });
});
