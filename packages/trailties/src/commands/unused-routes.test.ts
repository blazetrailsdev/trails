import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";
import type { ThorClass } from "@blazetrails/thor";
import { lookupBang } from "../command/behavior.js";
import { UnusedRoutesCommand } from "./unused-routes.js";

await lookupBang();

describe("UnusedRoutesCommand", () => {
  it("is registered on the program", () => {
    const program = createProgram();
    expect(program.commands.some((c) => c.name() === "unused-routes")).toBe(true);
  });

  it("is hidden, mirroring hide_command!", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "unused-routes");
    expect(cmd?.helpInformation).toBeDefined();
    expect(
      program
        .createHelp()
        .visibleCommands(program)
        .map((c) => c.name()),
    ).not.toContain("unused-routes");
  });

  it("has the class options UnusedRoutesCommand declares", () => {
    const options = (UnusedRoutesCommand as unknown as ThorClass).classOptions();
    expect(Object.values(options).map((o) => o.switchName)).toEqual(
      expect.arrayContaining(["--controller", "--grep"]),
    );
  });

  it("routes gains the -u/--unused class option", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "routes");
    const unused = cmd?.options.find((o) => o.long === "--unused");
    expect(unused?.short).toBe("-u");
  });
});
