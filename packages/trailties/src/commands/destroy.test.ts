import { describe, it, expect, beforeEach, afterEach, onTestFinished, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { createProgram } from "../cli.js";
import { invoke as commandInvoke } from "../command.js";
import { Generators } from "../generators.js";
import { DestroyCommand } from "./destroy.js";
import { lookupBang } from "../command/behavior.js";
import { Application } from "../application.js";
import { Trails } from "../rails.js";
import "../trailties/active-record.js";

class DestroyCommandTestApp extends Application {}

await lookupBang();
Trails.application = DestroyCommandTestApp.instance();
await Trails.application.loadGenerators();

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
  it("is not registered on the program", () => {
    expect(createProgram().commands.some((c) => c.name() === "destroy")).toBe(false);
  });

  it("destroy migration anchors the filename match", async () => {
    const migrationsDir = path.join(tmpDir, "db", "migrate");
    fs.mkdirSync(migrationsDir, { recursive: true });
    const target = path.join(migrationsDir, "20260101000000_create_posts.ts");
    const decoy = path.join(migrationsDir, "20260202000000_add_create_posts_flag.ts");
    fs.writeFileSync(target, "");
    fs.writeFileSync(decoy, "");

    process.chdir(tmpDir);
    await DestroyCommand.perform("destroy", ["migration", "create_posts"], {});

    expect(fs.existsSync(target)).toBe(false);
    expect(fs.existsSync(decoy)).toBe(true);
  });

  it("resolves both spellings of a generator name", async () => {
    const invoke = vi.spyOn(Generators, "invoke").mockResolvedValue();
    onTestFinished(() => invoke.mockRestore());
    await commandInvoke("destroy", ["scaffold_controller", "Post"]);
    await commandInvoke("destroy", ["scaffold-controller", "Post"]);
    expect(invoke.mock.calls.map((c) => c[0])).toEqual([
      "scaffold_controller",
      "scaffold-controller",
    ]);
    expect(await Generators.findByNamespace("scaffold_controller")).toBe(
      await Generators.findByNamespace("scaffold-controller"),
    );
  });
});
