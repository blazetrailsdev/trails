import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createProgram } from "../cli.js";

let tmpDir: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
});

afterEach(() => {
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("DestroyCommand", () => {
  it("is registered on the program", () => {
    const program = createProgram();
    expect(program.commands.some((c) => c.name() === "destroy")).toBe(true);
  });

  it("has alias d", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "destroy");
    expect(cmd?.aliases()).toContain("d");
  });

  it("has model subcommand", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "destroy");
    expect(cmd?.commands.some((c) => c.name() === "model")).toBe(true);
  });

  it("has controller subcommand", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "destroy");
    expect(cmd?.commands.some((c) => c.name() === "controller")).toBe(true);
  });

  it("has scaffold subcommand", () => {
    const program = createProgram();
    const cmd = program.commands.find((c) => c.name() === "destroy");
    expect(cmd?.commands.some((c) => c.name() === "scaffold")).toBe(true);
  });
});
