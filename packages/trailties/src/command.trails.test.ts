import { describe, it, expect } from "vitest";
import { findByNamespace } from "./command.js";

describe("Rails::Command.find_by_namespace", () => {
  it("resolves the namespace of a namespace:command spelling", () => {
    expect(findByNamespace("dev", "cache")?.name()).toBe("dev");
    expect(findByNamespace("db", "migrate")?.name()).toBe("db");
    expect(findByNamespace("credentials", "edit")?.name()).toBe("credentials");
  });

  it("finds nothing for an unknown namespace", () => {
    expect(findByNamespace("nope", "cache")).toBeUndefined();
  });
});
