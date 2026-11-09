import { afterEach } from "vitest";
import { setAppPath, setEngineRoot } from "../lib/app-path.js";
import { root } from "../lib/command.js";
import type { Base } from "../lib/command/base.js";
import { Command as Program } from "commander";
import { Rake } from "@blazetrails/rake";
import { describe, it, expect, onTestFinished, vi } from "vitest";
import { createProgram } from "../lib/cli.js";
import { findByNamespace, hiddenCommands, invoke } from "../lib/command.js";
import { lookupBang, subclasses } from "../lib/command/behavior.js";

const loaded = vi.hoisted(() => [] as string[]);
vi.mock(
  "../lib/commands/generate.js",
  async (importOriginal) => (loaded.push("generate"), importOriginal()),
);

function programName(command: Awaited<ReturnType<typeof findByNamespace>>): unknown {
  return (command as Program | undefined)?.name();
}

describe("Trails::Command.find_by_namespace", () => {
  it("loads only the candidate command, as lookup requires only its file", async () => {
    const server = (await findByNamespace("server", "server")) as typeof Base;
    expect(server.namespace()).toBe("trails:server");
    expect(loaded).toEqual([]);
  }, 30_000);

  it("resolves the namespace of a namespace:command spelling", async () => {
    const { DevCommand } = await import("../lib/commands/dev.js");
    expect(await findByNamespace("dev", "cache")).toBe(DevCommand);
    expect(await findByNamespace("db", "migrate")).toBeUndefined();
    expect(((await findByNamespace("credentials", "edit")) as typeof Base).namespace()).toBe(
      "trails:credentials",
    );
  }, 30_000);

  it("hides unused_routes from the program, as printing_commands subtracts hidden_commands", async () => {
    await lookupBang();
    const hidden = hiddenCommands().map((klass) => klass.commandName());
    expect(hidden).toEqual(["unused-routes", "application", "plugin", "help", "gem-help"]);
  }, 30_000);

  it("finds a command ported onto Base by its namespace", async () => {
    const { UnusedRoutesCommand } = await import("../lib/commands/unused-routes.js");
    expect(await findByNamespace("unused_routes", "unused_routes")).toBe(UnusedRoutesCommand);
    expect(subclasses()).toContain(UnusedRoutesCommand);
  }, 30_000);

  it("performs a Base command only for a name in all_commands", async () => {
    const { UnusedRoutesCommand } = await import("../lib/commands/unused-routes.js");
    const perform = vi.spyOn(UnusedRoutesCommand, "perform").mockResolvedValue();
    const rake = vi.spyOn(Program.prototype, "parseAsync").mockResolvedValue(createProgram());
    onTestFinished(() => (perform.mockRestore(), rake.mockRestore()));

    await invoke("unused_routes", ["-g", "x"]);
    expect(perform).toHaveBeenCalledWith("unused-routes", ["-g", "x"], {});
    expect(rake).not.toHaveBeenCalled();

    perform.mockClear();
    await expect(invoke("unused_routes:constructor")).rejects.toThrow('called with "1"');
    expect(perform).not.toHaveBeenCalled();
    expect(rake).not.toHaveBeenCalled();
  }, 30_000);

  it("hands an unknown name to the rake command, with --describe for help", async () => {
    const { RakeCommand } = await import("../lib/commands/rake.js");
    const location = vi.spyOn(Rake.application!, "findRakefileLocation");
    location.mockResolvedValue(["Rakefile.ts", "/app"] as never);
    const perform = vi.spyOn(RakeCommand, "perform").mockResolvedValue();
    onTestFinished(() => (location.mockRestore(), perform.mockRestore()));

    await invoke("db:migrate[1]", ["x"]);
    expect(perform).toHaveBeenLastCalledWith("db:migrate[1]", ["x"], {});

    await invoke("zeitwerk:check", ["--help"]);
    expect(perform).toHaveBeenLastCalledWith(
      "zeitwerk:check",
      ["--describe", "zeitwerk:check"],
      {},
    );
  }, 30_000);

  it("prints rake tasks with a comment defined outside the application", async () => {
    const { RakeCommand } = await import("../lib/commands/rake.js");
    const location = vi.spyOn(Rake.application!, "findRakefileLocation");
    location.mockResolvedValue(["Rakefile.ts", "/app"] as never);
    onTestFinished(() => location.mockRestore());
    setAppPath("/app/config/application.ts");
    const host = RakeCommand as unknown as { _rakeTasks: unknown };
    const task = (name: string, comment: string | null, file: string) => ({
      comment,
      locations: [file],
      nameWithArgs: () => name,
    });
    host._rakeTasks = [
      task("zeitwerk:check", "Check project structure", "/gem/zeitwerk.ts:1"),
      task("mine", "Application task", "/app/lib/tasks/mine.ts:1"),
      task("quiet", null, "/gem/quiet.ts:1"),
    ];
    onTestFinished(() => {
      host._rakeTasks = undefined;
      setAppPath(undefined);
    });

    expect(await RakeCommand.printingCommands()).toEqual([
      ["zeitwerk:check", "Check project structure"],
    ]);
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

describe("Trails::Command.root", () => {
  afterEach(() => {
    setAppPath(undefined);
    setEngineRoot(undefined);
  });

  it("expands the application root from APP_PATH, source or built", () => {
    setAppPath("/app/config/application.ts");
    expect(root()?.toString()).toBe("/app");
    setAppPath("/srv/dist/config/application.js");
    expect(root()?.toString()).toBe("/srv/dist");
  });

  it("prefers ENGINE_ROOT", () => {
    setAppPath("/app/config/application.ts");
    setEngineRoot("/engine");
    expect(root()?.toString()).toBe("/engine");
  });
});
