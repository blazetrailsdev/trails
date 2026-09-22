import { describe, it, expect } from "vitest";
import { Error as ModelError, NestedError } from "./index.js";

describe("NestedErrorTest", () => {
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

  it("NestedError keeps an inner nil raw_type", () => {
    const base = {};
    const innerError = new ModelError(base, "name", null);
    const nested = new NestedError(base, innerError);
    expect(nested.rawType).toBeNull();
    expect(nested.type).toBe(":invalid");
    expect(nested.details).toEqual({ error: null });
  });
});
