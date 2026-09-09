import { describe, it, expect } from "vitest";
import { UserProvidedDefault } from "./user-provided-default.js";
import { typeRegistry } from "../type/registry.js";

describe("UserProvidedDefault", () => {
  it("resolves a static default value", () => {
    const attr = new UserProvidedDefault("name", "default_name", typeRegistry.lookup("string"));
    expect(attr.value).toBe("default_name");
    expect(attr.valueBeforeTypeCast).toBe("default_name");
  });

  it("resolves a function default on construction", () => {
    let callCount = 0;
    const attr = new UserProvidedDefault(
      "token",
      () => {
        callCount++;
        return "generated_token";
      },
      typeRegistry.lookup("string"),
    );
    expect(attr.value).toBe("generated_token");
    expect(callCount).toBe(1);
  });

  it("type casts the resolved value", () => {
    const attr = new UserProvidedDefault("count", "42", typeRegistry.lookup("integer"));
    expect(attr.value).toBe(42);
  });

  it("cameFromUser returns true", () => {
    const attr = new UserProvidedDefault("name", "test", typeRegistry.lookup("string"));
    expect(attr.cameFromUser()).toBe(true);
  });
});
