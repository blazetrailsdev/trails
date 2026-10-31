import type { Command as Program } from "commander";
import { describe, it, expect, vi } from "vitest";
import { createProgram } from "./cli.js";
import { findByNamespace } from "./command.js";
import { lookupBang, subclasses } from "./command/behavior.js";

const loaded = vi.hoisted(() => [] as string[]);
vi.mock("./commands/db.js", async (importOriginal) => (loaded.push("db"), importOriginal()));
vi.mock(
  "./commands/generate.js",
  async (importOriginal) => (loaded.push("generate"), importOriginal()),
);

function programName(command: Awaited<ReturnType<typeof findByNamespace>>): unknown {
  return (command as Program | undefined)?.name();
}

describe("Rails::Command.find_by_namespace", () => {
  it("loads only the candidate command, as lookup requires only its file", async () => {
    expect(programName(await findByNamespace("server", "server"))).toBe("server");
    expect(loaded).toEqual([]);
  }, 30_000);

  it("resolves the namespace of a namespace:command spelling", async () => {
    expect(programName(await findByNamespace("dev", "cache"))).toBe("dev");
    expect(programName(await findByNamespace("db", "migrate"))).toBe("db");
    expect(programName(await findByNamespace("credentials", "edit"))).toBe("credentials");
  }, 30_000);

  it("hides unused_routes from the program, as printing_commands subtracts hidden_commands", async () => {
    await lookupBang();
    const hidden = createProgram()
      .commands.filter((c) => (c as unknown as { _hidden: boolean })._hidden)
      .map((c) => c.name());
    expect(hidden).toEqual(["unused_routes"]);
  }, 30_000);

  it("finds a command ported onto Base by its namespace", async () => {
    const { UnusedRoutesCommand } = await import("./commands/unused-routes.js");
    expect(await findByNamespace("unused_routes", "unused_routes")).toBe(UnusedRoutesCommand);
    expect(subclasses()).toContain(UnusedRoutesCommand);
  }, 30_000);

  it("finds nothing for an unknown namespace", async () => {
    expect(await findByNamespace("nope", "cache")).toBeUndefined();
  });
});
