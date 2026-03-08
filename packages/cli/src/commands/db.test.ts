import { describe, it, expect } from "vitest";
import { createProgram } from "../cli.js";

describe("DbCommand", () => {
  it("has migrate subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "migrate")).toBe(true);
  });

  it("has rollback subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "rollback")).toBe(true);
  });

  it("has seed subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "seed")).toBe(true);
  });

  it("has create subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "create")).toBe(true);
  });

  it("has drop subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "drop")).toBe(true);
  });

  it("has migrate:status subcommand", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    expect(db?.commands.some((c) => c.name() === "migrate:status")).toBe(true);
  });
});
