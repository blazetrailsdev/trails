import { beforeAll, describe, it, expect } from "vitest";
import { aliases } from "./commands.js";
import { createProgram } from "./cli.js";
import { VERSION } from "./gem-version.js";
import { Generators } from "./generators.js";
import { lookupBang } from "./command/behavior.js";

await lookupBang();

beforeAll(async () => {
  await Generators.lookupBang();
});

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
      /** @empty */
    }
    expect(output.trim()).toBe(VERSION.STRING);
  });

  it("has all expected commands registered", () => {
    const program = createProgram();
    const names = program.commands.map((c) => c.name());
    expect(names).toContain("new");
    expect(names).toContain("db");
  });

  it("server command has alias s", () => {
    expect(aliases.s).toBe("server");
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
});
