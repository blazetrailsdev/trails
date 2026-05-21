import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createProgram } from "../cli.js";
import { destroyCommand } from "./destroy.js";

let tmpDir: string;
let originalCwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-test-"));
  originalCwd = process.cwd();
});

afterEach(() => {
  process.chdir(originalCwd);
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

  it("destroy migration anchors the filename match", async () => {
    const migrationsDir = path.join(tmpDir, "db", "migrations");
    fs.mkdirSync(migrationsDir, { recursive: true });
    const target = path.join(migrationsDir, "20260101000000_create_posts.ts");
    const decoy = path.join(migrationsDir, "20260202000000_add_create_posts_flag.ts");
    fs.writeFileSync(target, "");
    fs.writeFileSync(decoy, "");

    process.chdir(tmpDir);
    await destroyCommand().parseAsync(["migration", "create_posts"], { from: "user" });

    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(decoy)).toBe(true);
  });
});
