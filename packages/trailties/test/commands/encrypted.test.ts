import { File, FileUtils, Dir, setEnv, env, getFs, include } from "@blazetrails/ruby-compat";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { EnvHelpers } from "../support/env-helpers.js";
import { EncryptedConfiguration } from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "../../lib/command.js";
import { Trails } from "../../lib/trails.js";
import { EncryptedCommand } from "../../lib/commands/encrypted.js";

const encryptedFile = "config/tokens.yml.enc";

function assertFile(relative: string): void {
  expect(File.isExist(relative)).toBeTruthy();
}

function assertNoFile(relative: string): void {
  expect(File.isExist(relative)).toBeFalsy();
}

describe("Trails::Command::EncryptedTest", () => {
  let appPath: string, cwd: string, output: string[];
  const saved = { VISUAL: env.VISUAL, EDITOR: env.EDITOR };

  const prepareArgs = (key?: string) => (key ? [encryptedFile, "--key", key] : [encryptedFile]);
  const edit = async (key?: string, visual = "true", editor = "true") => {
    setEnv("VISUAL", visual);
    setEnv("EDITOR", editor);
    output = [];
    await invoke("encrypted:edit", prepareArgs(key));
    return output.join("\n");
  };
  const show = async (key?: string) => {
    output = [];
    await invoke("encrypted:show", prepareArgs(key));
    return output.join("\n");
  };

  beforeEach(async () => {
    cwd = Dir.pwd();
    appPath = await getFs().mkdtemp!(`${cwd}/tmp-encrypted-`);
    Dir.chdir(appPath);
    FileUtils.mkdirP("config");
    File.write(".gitignore", "");
    vi.spyOn(Trails, "application", "get").mockReturnValue({
      encrypted: async (path: string, opts: { keyPath: string }) =>
        new EncryptedConfiguration({
          configPath: `${appPath}/${path}`,
          keyPath: `${appPath}/${opts.keyPath}`,
          envKey: "TRAILS_MASTER_KEY",
          raiseIfMissingKey: false,
        }),
    } as never);
    vi.spyOn(EncryptedCommand.prototype, "say").mockImplementation(((m: string) => {
      output.push(m);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("VISUAL", saved.VISUAL);
    setEnv("EDITOR", saved.EDITOR);
    Dir.chdir(cwd);
    FileUtils.rmRf(appPath);
  });

  it("edit without visual or editor gives hint", async () => {
    const out = await edit(undefined, "", "");
    expect(out).toMatch("No $VISUAL or $EDITOR to open file in");
    expect(out).toMatch("trails encrypted:edit");
  });

  it("edit with visual but not editor does not give hint", async () => {
    expect(await edit(undefined, "true", "")).not.toMatch("No $VISUAL or $EDITOR");
  });

  it("edit with editor but not visual does not give hint", async () => {
    expect(await edit(undefined, "", "true")).not.toMatch("No $VISUAL or $EDITOR");
  });

  it("edit command adds master key", async () => {
    await edit();
    assertFile("config/master.key");
    expect(File.read(".gitignore")).toMatch("config/master.key");
  });

  it("edit command does not add duplicate master key entries to gitignore", async () => {
    await edit();
    await edit();
    expect(File.read(".gitignore").match(/config\/master\.key/g)?.length).toBe(1);
  });

  it("edit encrypts file with custom key", async () => {
    await edit("config/tokens.key");
    expect(File.isExist("config/tokens.key")).toBeTruthy();
    expect(File.read(".gitignore")).toMatch("/config/tokens.key");
    expect(await show("config/tokens.key")).toMatch(/access_key_id: 123/);
  });

  it("show encrypted file with custom key", async () => {
    await edit("config/tokens.key");
    expect(await show("config/tokens.key")).toMatch(/access_key_id: 123/);
  });

  it("show command does not raise error when require_master_key is false and master key does not exist", async () => {
    expect(await show()).toMatch(/Missing 'config\/master\.key' to decrypt data/);
  });

  it("won't corrupt encrypted file when passed wrong key", async () => {
    await edit("config/tokens.key");
    File.write("config/master.key", "0".repeat(32));
    expect(await edit()).toMatch("passed the wrong key");
    expect(await show("config/tokens.key")).toMatch(/access_key_id: 123/);
  });
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface EncryptedTest extends Generation, EnvHelpers {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class EncryptedTest extends TestCase {
  encryptedFile = "config/tokens.yml.enc";

  runEditCommand(
    file = this.encryptedFile,
    {
      key,
      visual = "cat",
      editor = "cat",
      ...options
    }: { key?: string; visual?: string; editor?: string; allowFailure?: boolean } = {},
  ) {
    return this.switchEnv("VISUAL", visual, () =>
      this.switchEnv("EDITOR", editor, () =>
        this.trails("encrypted:edit", this.prepareArgs(file, key), options),
      ),
    );
  }

  runShowCommand(
    file = this.encryptedFile,
    { key, ...options }: { key?: string; allowFailure?: boolean } = {},
  ) {
    return this.trails("encrypted:show", this.prepareArgs(file, key), options);
  }

  prepareArgs(file: string, key: string | undefined) {
    const args = [file];
    if (key) args.push("--key", key);
    return args;
  }

  async readFile(relative: string) {
    return File.readAsync(await this.appPath(relative));
  }

  async assertFile(relative: string) {
    expect(await File.isExistAsync(await this.appPath(relative))).toBe(true);
  }

  async assertNoFile(relative: string) {
    expect(await File.isExistAsync(await this.appPath(relative))).toBe(false);
  }
}
include(EncryptedTest, Isolation);
include(EncryptedTest, EnvHelpers);

describe("Trails::Command::EncryptedTest", { timeout: 120_000 }, () => {
  let t: EncryptedTest;

  beforeEach(async () => {
    t = new EncryptedTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("edit encrypted file", async () => {
    for (let i = 0; i < 2; i++) {
      expect(await t.runEditCommand()).toMatch(/access_key_id: 123/);
    }
  });

  it("edit command does not overwrite master key file if it already exists", async () => {
    const masterKey = await t.readFile("config/master.key");
    await t.runEditCommand();

    expect(await t.readFile("config/master.key")).toBe(masterKey);
  });

  it("edit command does not add master key when `RAILS_MASTER_KEY` env specified", async () => {
    const masterKey = await t.readFile("config/master.key");
    await t.removeFile("config/master.key");
    await t.appFile(".gitignore", "");

    await t.switchEnv("TRAILS_MASTER_KEY", masterKey, async () => {
      await t.runEditCommand();
      await t.assertNoFile("config/master.key");
      expect(await t.readFile(".gitignore")).not.toMatch("config/master.key");
    });
  });

  it("edit command does not display save confirmation message if interrupted", async () => {
    expect(await t.runEditCommand()).toMatch(/file encrypted and saved/i);

    const interruptCommandProcess = `sh -c 'kill -INT $PPID'`;
    const output = await t.runEditCommand(undefined, { visual: interruptCommandProcess });

    expect(output).not.toMatch(/file encrypted and saved/i);
    expect(output).toMatch(/nothing saved/i);
  });

  it("edit command preserves user's content even if it contains invalid YAML", async () => {
    const writeInvalidYaml = `sh ${await t.appFile("tmp/write-invalid-yaml", `printf "foo: bar: bad" > "$1"\n`)}`;

    expect(await t.runEditCommand(undefined, { visual: writeInvalidYaml })).toMatch(
      /WARNING: Invalid YAML/,
    );
    expect(await t.runEditCommand()).toMatch(/foo: bar: bad/);
  });

  it("show command raise error when require_master_key is specified and key does not exist", async () => {
    await t.addToConfig("this.config.requireMasterKey = true;");

    expect(await t.runShowCommand(undefined, { key: "unexist.key", allowFailure: true })).toMatch(
      /Missing encryption key to decrypt file with/,
    );
  });

  it("show command does not raise when an initializer tries to access non-existent credentials", async () => {
    await t.appFile(
      "config/initializers/raise-when-loaded.ts",
      `
      import { Trails } from "@blazetrails/trailties";
      ((await Trails.application!.credentials()) as never as Record<string, () => unknown>)["missingKey!"]();
`,
    );

    await t.runEditCommand(undefined, { key: "config/tokens.key" });

    expect(await t.runShowCommand(undefined, { key: "config/tokens.key" })).toMatch(
      /access_key_id: 123/,
    );
  });
});
