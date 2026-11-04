import { describe, expect, it } from "vitest";
import { NullInflector } from "./null-inflector.js";

describe("TestNullInflector", () => {
  const camelize = (str: string) => new NullInflector().camelize(str, null);

  it("does not change the basename", () => {
    expect(camelize("user")).toBe("user");
  });

  it("preserves case (camel case)", () => {
    expect(camelize("UsersController")).toBe("UsersController");
  });

  it("preserves case (acronym)", () => {
    expect(camelize("HTMLTag")).toBe("HTMLTag");
  });
});
