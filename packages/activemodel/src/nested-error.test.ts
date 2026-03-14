import { describe, it, expect } from "vitest";
import { NestedError } from "./index.js";

describe("ActiveModel", () => {
  describe("NestedErrorTest", () => {
    it("initialize", () => {
      const base = {};
      const innerError = { attribute: "title", type: "not_enough", message: "not enough" };
      const nested = new NestedError(base, innerError);
      expect(nested.base).toBe(base);
      expect(nested.attribute).toBe("title");
      expect(nested.type).toBe("not_enough");
    });

    it("initialize with overriding attribute and type", () => {
      const inner: any = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError({}, inner, { attribute: "author" });
      expect(nested.attribute).toBe("author");
      expect(nested.type).toBe("blank");
    });

    it("message", () => {
      const inner: any = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError({}, inner);
      expect(nested.message).toBe("can't be blank");
    });

    it("full message", () => {
      const inner: any = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError({}, inner);
      expect(nested.fullMessage).toBe("Name can't be blank");
    });
  });

  describe("NestedError", () => {
    it("NestedError initialize", () => {
      const base = {};
      const innerError = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError(base, innerError);
      expect(nested.base).toBe(base);
      expect(nested.innerError).toBe(innerError);
      expect(nested.attribute).toBe("name");
    });

    it("NestedError message", () => {
      const base = {};
      const innerError = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError(base, innerError);
      expect(nested.message).toBe("can't be blank");
    });

    it("NestedError full message", () => {
      const base = {};
      const innerError = { attribute: "name", type: "blank", message: "can't be blank" };
      const nested = new NestedError(base, innerError);
      expect(nested.fullMessage).toBe("Name can't be blank");

      const baseNested = new NestedError(base, {
        attribute: "base",
        type: "invalid",
        message: "is invalid",
      });
      expect(baseNested.fullMessage).toBe("is invalid");
    });
  });
});
