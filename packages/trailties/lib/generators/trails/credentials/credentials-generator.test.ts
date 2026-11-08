import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { Dir } from "@blazetrails/ruby-compat";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { CredentialsGenerator } from "./credentials-generator.js";

let tmpDir: string;
let pwd: string;

beforeEach(() => {
  tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "trails-creds-"));
  fs.mkdirSync(path.join(tmpDir, "config"));
  fs.writeFileSync(path.join(tmpDir, "config/master.key"), EncryptedFile.generateKey(), {
    mode: 0o600,
  });
  pwd = Dir.pwd();
  Dir.chdir(tmpDir);
});

afterEach(() => {
  Dir.chdir(pwd);
  fs.rmSync(tmpDir, { recursive: true, force: true });
});

const read = (): Promise<string> =>
  new EncryptedFile({
    contentPath: path.join(tmpDir, "config/credentials.yml.enc"),
    keyPath: path.join(tmpDir, "config/master.key"),
    envKey: "TRAILS_MASTER_KEY",
    raiseIfMissingKey: true,
  }).read();

describe("CredentialsGeneratorTest", () => {
  it("add_credentials_file writes encrypted credentials with secret_key_base", async () => {
    await new CredentialsGenerator([], {}, { destinationRoot: tmpDir }).addCredentialsFile();
    const content = await read();
    expect(content).toContain("# aws:");
    expect(content).toMatch(/secret_key_base: [0-9a-f]{128}/);
  });

  it("add_credentials_file with skip_secret_key_base omits secret_key_base and is idempotent", async () => {
    await new CredentialsGenerator(
      [],
      { skipSecretKeyBase: true },
      { destinationRoot: tmpDir },
    ).addCredentialsFile();
    expect(await read()).not.toContain("secret_key_base:");
    const before = fs.readFileSync(path.join(tmpDir, "config/credentials.yml.enc"));
    await new CredentialsGenerator([], {}, { destinationRoot: tmpDir }).addCredentialsFile();
    expect(fs.readFileSync(path.join(tmpDir, "config/credentials.yml.enc"))).toEqual(before);
  });
});
