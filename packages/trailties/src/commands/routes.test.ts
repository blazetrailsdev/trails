import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";

describe("RoutesCommand", () => {
  it("is registered on the program", () => {
    const program = createProgram();
    expect(program.commands.some((c) => c.name() === "routes")).toBe(true);
  });

  it("has --grep option", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "routes");
    const grepOpt = cmd?.options.find((o) => o.long === "--grep");
    expect(grepOpt).toBeDefined();
  });
});
