import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
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
});
