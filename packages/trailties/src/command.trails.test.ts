import { Command as Program } from "commander";
import { describe, it, expect, onTestFinished, vi } from "vitest";
import { createProgram } from "./cli.js";
import { findByNamespace, invoke } from "./command.js";
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
    expect(hidden).toEqual(["unused-routes"]);
  }, 30_000);

  it("finds a command ported onto Base by its namespace", async () => {
    const { UnusedRoutesCommand } = await import("./commands/unused-routes.js");
    expect(await findByNamespace("unused_routes", "unused_routes")).toBe(UnusedRoutesCommand);
    expect(subclasses()).toContain(UnusedRoutesCommand);
  }, 30_000);

  it("performs a Base command only for a name in all_commands", async () => {
    const { UnusedRoutesCommand } = await import("./commands/unused-routes.js");
    const perform = vi.spyOn(UnusedRoutesCommand, "perform").mockResolvedValue();
    const rake = vi.spyOn(Program.prototype, "parseAsync").mockResolvedValue(createProgram());
    onTestFinished(() => (perform.mockRestore(), rake.mockRestore()));

    await invoke("unused_routes", ["-g", "x"]);
    expect(perform).toHaveBeenCalledWith("unused-routes", ["-g", "x"], {});
    expect(rake).not.toHaveBeenCalled();

    perform.mockClear();
    await invoke("unused_routes:constructor");
    expect(perform).not.toHaveBeenCalled();
    expect(rake).toHaveBeenCalled();
  }, 30_000);

  it("finds nothing for an unknown namespace", async () => {
    expect(await findByNamespace("nope", "cache")).toBeUndefined();
  });

  it("finds a command by either spelling and keeps an underscored rake name", async () => {
    await expect(findByNamespace("unused_routes")).resolves.toBeDefined();
    await expect(findByNamespace("unused-routes")).resolves.toBeDefined();
    await expect(findByNamespace("active_storage", "install")).resolves.toBeUndefined();
  });
});
