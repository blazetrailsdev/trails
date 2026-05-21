import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";

describe("NotesCommand", () => {
  it("is registered on the program", () => {
    const program = createProgram();
    expect(program.commands.some((c) => c.name() === "notes")).toBe(true);
  });

  it("has --annotations option", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "notes");
    const opt = cmd?.options.find((o) => o.long === "--annotations");
    expect(opt).toBeDefined();
  });
});
