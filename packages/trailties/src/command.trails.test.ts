import { describe, it, expect, vi } from "vitest";
import { findByNamespace } from "./command.js";
import { lookupBang } from "./command/behavior.js";

const loaded = vi.hoisted(() => [] as string[]);
vi.mock("./commands/db.js", async (importOriginal) => (loaded.push("db"), importOriginal()));
vi.mock(
  "./commands/generate.js",
  async (importOriginal) => (loaded.push("generate"), importOriginal()),
);

describe("Rails::Command.find_by_namespace", () => {
  it("loads only the candidate command, as lookup requires only its file", async () => {
    expect((await findByNamespace("server", "server"))?.name()).toBe("server");
    expect(loaded).toEqual([]);
  }, 30_000);

  it("resolves the namespace of a namespace:command spelling", async () => {
    expect((await findByNamespace("dev", "cache"))?.name()).toBe("dev");
    expect((await findByNamespace("db", "migrate"))?.name()).toBe("db");
    expect((await findByNamespace("credentials", "edit"))?.name()).toBe("credentials");
  }, 30_000);

  it("hides unused_routes from the program, as printing_commands subtracts hidden_commands", async () => {
    await lookupBang();
    const { createProgram } = await import("./cli.js");
    const hidden = createProgram()
      .commands.filter((c) => (c as unknown as { _hidden: boolean })._hidden)
      .map((c) => c.name());
    expect(hidden).toEqual(["unused_routes"]);
  }, 30_000);

  it("finds nothing for an unknown namespace", async () => {
    expect(await findByNamespace("nope", "cache")).toBeUndefined();
  });
});
