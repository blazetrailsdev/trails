import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";

describe("GenerateCommand", () => {
  it("has model subcommand", () => {
    const program = createProgram();
    const gen = program.commands.find((c) => c.name() === "generate");
    expect(gen?.commands.some((c) => c.name() === "model")).toBe(true);
  });

  it("has migration subcommand", () => {
    const program = createProgram();
    const gen = program.commands.find((c) => c.name() === "generate");
    expect(gen?.commands.some((c) => c.name() === "migration")).toBe(true);
  });

  it("has controller subcommand", () => {
    const program = createProgram();
    const gen = program.commands.find((c) => c.name() === "generate");
    expect(gen?.commands.some((c) => c.name() === "controller")).toBe(true);
  });

  it("has scaffold subcommand", () => {
    const program = createProgram();
    const gen = program.commands.find((c) => c.name() === "generate");
    expect(gen?.commands.some((c) => c.name() === "scaffold")).toBe(true);
  });
});
