import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Dir } from "@blazetrails/ruby-compat";
import { MasterKeyGenerator } from "./master-key-generator.js";

let tmpDir: string;
let pwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-master-key-"));
  pwd = Dir.pwd();
  Dir.chdir(tmpDir);
});

afterEach(() => {
  Dir.chdir(pwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("MasterKeyGeneratorTest", () => {
  it("add_master_key_file + ignore_master_key_file write key and labelled gitignore entry", () => {
    fs.writeFileSync(path.join(tmpDir, ".gitignore"), "node_modules\n");
    const gen = new MasterKeyGenerator({ cwd: tmpDir });
    gen.addMasterKeyFile();
    gen.ignoreMasterKeyFile();
    expect(fs.readFileSync(path.join(tmpDir, "config/master.key"), "utf-8")).toMatch(/^[0-9a-f]+$/);
    const ignore = fs.readFileSync(path.join(tmpDir, ".gitignore"), "utf-8");
    expect(ignore).toContain("# Ignore master key for decrypting credentials and more.");
    expect(ignore).toContain("/config/master.key");
  });
});
