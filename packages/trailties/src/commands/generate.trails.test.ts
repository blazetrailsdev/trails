import { capture } from "@blazetrails/activesupport";
import { afterEach, describe, it, expect, vi } from "vitest";
import { invoke as commandInvoke } from "../command.js";
import { Application } from "../application.js";
import { Generators } from "../generators.js";
import { Trails } from "../rails.js";
import { GenerateCommand } from "./generate.js";

class GenerateCommandTestApp extends Application {}
Trails.application = GenerateCommandTestApp.instance();

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GenerateCommand", () => {
  it("is a Thor command named generate", () => {
    expect(GenerateCommand.commandName()).toBe("generate");
  });

  it("invokes the named generator with its raw args and switches", async () => {
    const invoke = vi.spyOn(Generators, "invoke").mockResolvedValue();
    await commandInvoke("generate", [
      "model",
      "Account",
      "name:string",
      "--no-migration",
      "--parent=Admin",
    ]);
    expect(invoke).toHaveBeenCalledWith(
      "model",
      ["Account", "name:string", "--no-migration", "--parent=Admin"],
      expect.objectContaining({ behavior: "invoke" }),
    );
  });

  it("reaches the scaffold controller generator by either spelling", async () => {
    const invoke = vi.spyOn(Generators, "invoke").mockResolvedValue();
    await commandInvoke("generate", ["scaffold_controller", "Post"]);
    await commandInvoke("generate", ["scaffold-controller", "Post"]);
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      "scaffold_controller",
      "scaffold-controller",
    ]);
  });

  it("prints the generator list when no generator is given", async () => {
    const help = vi.spyOn(Generators, "help").mockResolvedValue();
    await commandInvoke("generate", []);
    expect(help).toHaveBeenCalledWith("generate");
  });

  it("--help reaches the command's help", async () => {
    const help = vi.spyOn(Generators, "help").mockResolvedValue();
    await commandInvoke("generate", ["--help"]);
    expect(help).toHaveBeenCalledWith("generate");
  });

  it("lists generator names in kebab-case", async () => {
    const help = await capture(":stdout", () => commandInvoke("generate", ["--help"]));
    expect(help).toMatch(/^\s+scaffold-controller$/m);
    expect(help).not.toContain("scaffold_controller");
  });
});
