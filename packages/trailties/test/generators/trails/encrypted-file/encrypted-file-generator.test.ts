import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Dir } from "@blazetrails/ruby-compat";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { EncryptedFileGenerator } from "../../../../lib/generators/trails/encrypted-file/encrypted-file-generator.js";

let tmpDir: string;
let pwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-enc-file-"));
  fs.mkdirSync(path.join(tmpDir, "config"));
  fs.writeFileSync(path.join(tmpDir, "config/secret.key"), EncryptedFile.generateKey(), {
    mode: 0o600,
  });
  pwd = Dir.pwd();
  Dir.chdir(tmpDir);
});

afterEach(() => {
  Dir.chdir(pwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

describe("EncryptedFileGeneratorTest", () => {
  it("add_encrypted_file_silently round-trips template and is idempotent", async () => {
    const gen = new EncryptedFileGenerator([], {}, { destinationRoot: tmpDir });
    await gen.addEncryptedFileSilently("config/secret.yml.enc", "config/secret.key");
    const file = new EncryptedFile({
      contentPath: path.join(tmpDir, "config/secret.yml.enc"),
      keyPath: path.join(tmpDir, "config/secret.key"),
      envKey: "TRAILS_MASTER_KEY",
      raiseIfMissingKey: true,
    });
    expect(await file.read()).toContain("# aws:");
    const before = fs.readFileSync(path.join(tmpDir, "config/secret.yml.enc"));
    await gen.addEncryptedFileSilently("config/secret.yml.enc", "config/secret.key");
    expect(fs.readFileSync(path.join(tmpDir, "config/secret.yml.enc"))).toEqual(before);
  });
});
