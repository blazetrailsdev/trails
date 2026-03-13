import { describe, it, expect } from "vitest";
import { Model, Errors, Types, NestedError } from "./index.js";
import { ModelName } from "./naming.js";
import { CallbackChain } from "./callbacks.js";

describe("ActiveModel", () => {
  describe("NestedErrorTest", () => {
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
  });
});
