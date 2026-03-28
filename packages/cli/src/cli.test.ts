import { describe, it, expect } from "vitest";
import { createProgram } from "./cli.js";
import { VERSION } from "./version.js";

describe("CLI", () => {
  it("prints version with --version flag", () => {
    const program = createProgram();
    program.exitOverride();
    let output = "";
    program.configureOutput({
      writeOut: (str) => {
        output = str;
      },
    });
    try {
      program.parse(["node", "trails", "--version"]);
    } catch (e: any) {
      // commander throws on --version
    }
    expect(output.trim()).toBe(VERSION);
  });

  it("has all expected commands registered", () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("new");
    expect(names).toContain("generate");
    expect(names).toContain("server");
    expect(names).toContain("db");
    expect(names).toContain("routes");
    expect(names).toContain("console");
    expect(names).toContain("destroy");
  });

  it("generate command has alias g", () => {
    const program = createProgram();
    const gen = program.commands.find((c) => c.name() === "generate");
    expect(gen?.aliases()).toContain("g");
  });

  it("server command has alias s", () => {
    const program = createProgram();
    const srv = program.commands.find((c) => c.name() === "server");
    expect(srv?.aliases()).toContain("s");
  });

  it("console command has alias c", () => {
    const program = createProgram();
    const con = program.commands.find((c) => c.name() === "console");
    expect(con?.aliases()).toContain("c");
  });

  it("destroy command has alias d", () => {
    const program = createProgram();
    const des = program.commands.find((c) => c.name() === "destroy");
    expect(des?.aliases()).toContain("d");
  });

  it("generate command has subcommands", () => {
    const program = createProgram();
    const gen = program.commands.find((c) => c.name() === "generate");
    const subNames = gen?.commands.map((c) => c.name());
    expect(subNames).toContain("model");
    expect(subNames).toContain("migration");
    expect(subNames).toContain("controller");
    expect(subNames).toContain("scaffold");
  });

  it("db command has subcommands", () => {
    const program = createProgram();
    const db = program.commands.find((c) => c.name() === "db");
    const subNames = db?.commands.map((c) => c.name());
    expect(subNames).toContain("migrate");
    expect(subNames).toContain("rollback");
    expect(subNames).toContain("seed");
    expect(subNames).toContain("create");
    expect(subNames).toContain("drop");
  });

  it("destroy command has subcommands", () => {
    const program = createProgram();
    const destroy = program.commands.find((c) => c.name() === "destroy");
    const subNames = destroy?.commands.map((c) => c.name());
    expect(subNames).toContain("model");
    expect(subNames).toContain("controller");
    expect(subNames).toContain("migration");
    expect(subNames).toContain("scaffold");
  });
});
