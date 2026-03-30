import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";

describe("NewCommand", () => {
  it("is registered on the program", () => {
    const program = createProgram();
    expect(program.commands.some((c) => c.name() === "new")).toBe(true);
  });

  it("accepts a name argument", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "new");
    // Commander stores arguments as registeredArguments
    expect(cmd?.registeredArguments?.length).toBeGreaterThan(0);
  });

  it("has --database option", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "new");
    const dbOpt = cmd?.options.find((o) => o.long === "--database");
    expect(dbOpt).toBeDefined();
  });
});
