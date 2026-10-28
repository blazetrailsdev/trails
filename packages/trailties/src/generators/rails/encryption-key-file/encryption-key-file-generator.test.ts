import { stdout } from "@blazetrails/ruby-compat";
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Dir } from "@blazetrails/ruby-compat";
import { EncryptionKeyFileGenerator } from "./encryption-key-file-generator.js";

let tmpDir: string;
let pwd: string;
let lines: string[];

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-enc-key-"));
  pwd = Dir.pwd();
  Dir.chdir(tmpDir);
  lines = [];
  vi.spyOn(stdout, "write").mockImplementation(
    (chunk) => lines.push(String(chunk).replace(/\n$/, "")) > 0,
  );
});

afterEach(() => {
  Dir.chdir(pwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const build = () => new EncryptionKeyFileGenerator([], {}, { destinationRoot: tmpDir });

describe("EncryptionKeyFileGeneratorTest", () => {
  it("add_key_file writes a hex key file at mode 0600 and is idempotent", async () => {
    await build().addKeyFile("config/foo.key");
    const fullPath = path.join(tmpDir, "config/foo.key");
    const original = fs.readFileSync(fullPath, "utf-8");
    expect(original).toMatch(/^[0-9a-f]+$/);
    expect(fs.statSync(fullPath).mode & 0o777).toBe(0o600);
    expect(lines.some((l) => l.includes("Adding config/foo.key"))).toBe(true);
    await build().addKeyFile("config/foo.key");
    expect(fs.readFileSync(fullPath, "utf-8")).toBe(original);
  });

  it("ignore_key_file appends once, skips when present, and logs without .gitignore", async () => {
    await build().ignoreKeyFile("config/foo.key");
    expect(lines.some((l) => l.includes("Don't commit config/foo.key"))).toBe(true);
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules\n");
    await build().ignoreKeyFile("config/foo.key");
    const after = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(after).toContain("/config/foo.key");
    await build().ignoreKeyFile("config/foo.key");
    expect(fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8")).toBe(after);
  });
});
