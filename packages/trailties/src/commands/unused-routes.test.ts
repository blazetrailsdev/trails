import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";

describe("UnusedRoutesCommand", () => {
  it("is registered on the program", () => {
    const program = createProgram();
    expect(program.commands.some((c) => c.name() === "unused_routes")).toBe(true);
  });

  it("is hidden, mirroring hide_command!", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "unused_routes");
    expect(cmd?.helpInformation).toBeDefined();
    expect(
      program
        .createHelp()
        .visibleCommands(program)
        .map((c) => c.name()),
    ).not.toContain("unused_routes");
  });

  it("has the class options UnusedRoutesCommand declares", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "unused_routes");
    const longs = cmd?.options.map((o) => o.long);
    expect(longs).toEqual(expect.arrayContaining(["--controller", "--grep"]));
  });

  it("routes gains the -u/--unused class option", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "routes");
    const unused = cmd?.options.find((o) => o.long === "--unused");
    expect(unused?.short).toBe("-u");
  });
});
