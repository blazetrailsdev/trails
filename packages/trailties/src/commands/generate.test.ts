import { afterEach, describe, it, expect, vi } from "vitest";
import { createProgram } from "../cli.js";
import { Generators } from "../generators.js";

afterEach(() => {
  vi.restoreAllMocks();
});

describe("GenerateCommand", () => {
  it("has migration subcommand", () => {
    const program = createProgram();
    const gen = program.commands.find((c) => c.name() === "generate");
    expect(gen?.commands.some((c) => c.name() === "migration")).toBe(true);
  });

  it("invokes the named generator with its raw args and switches", async () => {
    const invoke = vi.spyOn(Generators, "invoke").mockResolvedValue([]);
    await createProgram().parseAsync(
      ["generate", "model", "Account", "name:string", "--no-migration", "--parent=Admin"],
      { from: "user" },
    );
    expect(invoke).toHaveBeenCalledWith(
      "model",
      ["Account", "name:string", "--no-migration", "--parent=Admin"],
      expect.objectContaining({ behavior: "invoke" }),
    );
  });

  it("prints the generator list when no generator is given", async () => {
    const help = vi.spyOn(Generators, "help").mockResolvedValue();
    await createProgram().parseAsync(["generate"], { from: "user" });
    expect(help).toHaveBeenCalledWith("generate", console.log);
  });
});
