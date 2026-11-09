import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Dir, File, getFs } from "@blazetrails/ruby-compat";
import { buildTemplates } from "@blazetrails/trails-tsc";
import { capture } from "@blazetrails/activesupport";
import { invoke } from "../../lib/command.js";
import { Base } from "../../lib/command/base.js";
import { CredentialsCommand } from "../../lib/commands/credentials.js";
import { EncryptedCommand } from "../../lib/commands/encrypted.js";

async function helpOutput(klass: typeof Base, namespace: string): Promise<string> {
  const dir = Dir.mktmpdir();
  const source = await klass.usagePath();
  const usage = File.join(dir, "USAGE");
  const usagePath = vi.spyOn(klass, "usagePath").mockResolvedValue(usage);
  try {
    expect(source).toMatch(new RegExp(`commands/${namespace}/USAGE$`));
    await getFs().writeFile!(usage, await getFs().readFile(source!, "utf8"));
    await buildTemplates([usage]);
    return await capture(":stdout", () =>
      expect(invoke(namespace, ["--help"])).rejects.toThrow('called with "1"'),
    );
  } finally {
    usagePath.mockRestore();
    await getFs().rm!(dir, { recursive: true, force: true });
  }
}

describe("command USAGE files", () => {
  let appPath: string;
  let originalCwd: string;

  beforeEach(async () => {
    appPath = Dir.mktmpdir();
    originalCwd = Dir.pwd();
    await getFs().writeFile!(File.join(appPath, "Rakefile.ts"), "");
    Dir.chdir(appPath);
  });

  afterEach(async () => {
    Dir.chdir(originalCwd);
    await getFs().rm!(appPath, { recursive: true, force: true });
  });

  it("prints an unrecognized command and exits 1", async () => {
    const out = await capture(":stdout", () =>
      expect(invoke("db:nope")).rejects.toThrow('called with "1"'),
    );
    expect(out).toContain('Unrecognized command "db:nope"');
  });

  it("credentials --help prints its USAGE", async () => {
    const out = await helpOutput(CredentialsCommand as unknown as typeof Base, "credentials");
    expect(out).toContain("Environment Specific Credentials:");
    expect(out).toContain(`${CredentialsCommand.executable("edit")} --environment development`);
  });

  it("encrypted --help prints its USAGE", async () => {
    const out = await helpOutput(EncryptedCommand as unknown as typeof Base, "encrypted");
    expect(out).toContain("Encryption Keys:");
    expect(out).toContain(`${EncryptedCommand.executable("show")} config/encrypted_file.yml.enc`);
  });
});
