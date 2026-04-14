import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";

describe("ConsoleCommand", () => {
  it("is registered on the program", () => {
    const program = createProgram();
    expect(program.commands.some((c) => c.name() === "console")).toBe(true);
  });

  it("has alias c", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "console");
    expect(cmd?.aliases()).toContain("c");
  });
});
