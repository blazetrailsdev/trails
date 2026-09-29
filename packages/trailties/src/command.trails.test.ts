import { describe, it, expect } from "vitest";
import { findByNamespace } from "./command.js";

describe("Rails::Command.find_by_namespace", () => {
  it("resolves the namespace of a namespace:command spelling", async () => {
    expect((await findByNamespace("dev", "cache"))?.name()).toBe("dev");
    expect((await findByNamespace("db", "migrate"))?.name()).toBe("db");
    expect((await findByNamespace("credentials", "edit"))?.name()).toBe("credentials");
  }, 30_000);

  it("finds nothing for an unknown namespace", async () => {
    expect(await findByNamespace("nope", "cache")).toBeUndefined();
  });
});
