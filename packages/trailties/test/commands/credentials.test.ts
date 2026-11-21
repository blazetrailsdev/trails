import {
  File,
  FileUtils,
  Dir,
  setEnv,
  env,
  getFs,
  include,
  rbFBackquote,
} from "@blazetrails/ruby-compat";
import { TestCase } from "@blazetrails/activesupport/test-case";
import { Isolation } from "@blazetrails/activesupport/testing/isolation";
import type { Generation } from "../support/isolation/abstract-unit.js";
import "../support/isolation/abstract-unit.js";
import { EnvHelpers } from "../support/env-helpers.js";
import { EncryptedConfiguration, InheritableOptions } from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "../../lib/command.js";
import { Trails } from "../../lib/trails.js";
import { CredentialsCommand } from "../../lib/commands/credentials.js";

const DEFAULT_CREDENTIALS_PATTERN = /access_key_id: 123\n[\s\S]*secret_key_base: [0-9a-f]{128}\n/;

function assertFile(relative: string): void {
  expect(File.isExist(relative)).toBeTruthy();
}

function assertNoFile(relative: string): void {
  expect(File.isExist(relative)).toBeFalsy();
}

describe("Trails::Command::CredentialsTest", () => {
  let appPath: string, cwd: string, output: string[];
  const saved = { VISUAL: env.VISUAL, EDITOR: env.EDITOR, TRAILS_ENV: env.TRAILS_ENV };

  const run = async (command: string, args: string[] = []): Promise<string> => {
    output = [];
    await invoke(command, args);
    return output.join("\n");
  };
  const edit = (args: string[] = [], visual = "true", editor = "true") => {
    setEnv("VISUAL", visual);
    setEnv("EDITOR", editor);
    return run("credentials:edit", args);
  };
  const show = (args: string[] = []) => run("credentials:show", args);
  const diff = (...args: string[]) => run("credentials:diff", args);

  beforeEach(async () => {
    cwd = Dir.pwd();
    appPath = await getFs().mkdtemp!(`${cwd}/tmp-credentials-`);
    Dir.chdir(appPath);
    FileUtils.mkdirP("config");
    File.write(".gitignore", "");
    const config = {
      root: appPath,
      get credentials() {
        let contentPath = `config/credentials/${env.TRAILS_ENV}.yml.enc`;
        if (!File.isExist(contentPath)) contentPath = "config/credentials.yml.enc";
        let keyPath = `config/credentials/${env.TRAILS_ENV}.key`;
        if (!File.isExist(keyPath)) keyPath = "config/master.key";
        return new InheritableOptions({
          contentPath: `${appPath}/${contentPath}`,
          keyPath: `${appPath}/${keyPath}`,
        });
      },
    };
    vi.spyOn(Trails, "application", "get").mockReturnValue({
      config,
      loadGenerators: async () => {},
      encrypted: async (path: string, opts: { keyPath: string }) =>
        new EncryptedConfiguration({
          configPath: `${appPath}/${path}`,
          keyPath: `${appPath}/${opts.keyPath}`,
          envKey: "TRAILS_MASTER_KEY",
          raiseIfMissingKey: false,
        }),
    } as never);
    vi.spyOn(CredentialsCommand.prototype, "say").mockImplementation(((m: string) => {
      output.push(m);
    }) as never);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    setEnv("VISUAL", saved.VISUAL);
    setEnv("EDITOR", saved.EDITOR);
    setEnv("TRAILS_ENV", saved.TRAILS_ENV);
    Dir.chdir(cwd);
    FileUtils.rmRf(appPath);
  });

  it("edit without visual or editor gives hint", async () => {
    const out = await edit([], "", "");
    expect(out).toMatch("No $VISUAL or $EDITOR to open file in");
    expect(out).toMatch("trails credentials:edit");
  });

  it("edit with visual but not editor does not give hint", async () => {
    expect(await edit([], "true", "")).not.toMatch("No $VISUAL or $EDITOR to open file in");
  });

  it("edit with editor but not visual does not give hint", async () => {
    expect(await edit([], "", "true")).not.toMatch("No $VISUAL or $EDITOR to open file in");
  });

  it("edit command adds master key", async () => {
    await edit();
    assertFile("config/master.key");
    expect(File.read(".gitignore")).toMatch("config/master.key");
  });

  it("edit command does not overwrite master key file if it already exists", async () => {
    await edit();
    const masterKey = File.read("config/master.key");
    await edit();
    expect(File.read("config/master.key")).toBe(masterKey);
  });

  it("edit command does not add duplicate master key entries to gitignore", async () => {
    await edit();
    await edit();
    expect(File.read(".gitignore").match(/config\/master\.key/g)?.length).toBe(1);
  });

  it("edit command modifies file specified by environment option", async () => {
    await edit(["--environment", "production"]);
    expect(await show(["--environment", "production"])).toMatch(DEFAULT_CREDENTIALS_PATTERN);
    assertNoFile("config/credentials.yml.enc");
    assertFile("config/credentials/production.key");
    assertFile("config/credentials/production.yml.enc");
  });

  it("edit command properly expands environment option", async () => {
    await edit(["--environment", "prod"]);
    expect(await show(["--environment", "prod"])).toMatch(DEFAULT_CREDENTIALS_PATTERN);
    assertNoFile("config/credentials.yml.enc");
    assertFile("config/credentials/production.key");
    assertFile("config/credentials/production.yml.enc");
  });

  it("edit command generates credentials file when it does not exist", async () => {
    await edit();
    expect(await show()).toMatch(DEFAULT_CREDENTIALS_PATTERN);
    assertFile("config/credentials.yml.enc");
  });

  it("show credentials", async () => {
    await edit();
    expect(await show()).toMatch(DEFAULT_CREDENTIALS_PATTERN);
  });

  it("show command does not raise error when require_master_key is false and master key does not exist", async () => {
    expect(await show()).toMatch(/Missing 'config\/master\.key' to decrypt credentials/);
  });

  it("diff enroll diffing", async () => {
    expect(await diff("--enroll")).toMatch(/\benrolled project/i);
    expect(File.read(".gitattributes")).toContain(
      "config/credentials/*.yml.enc diff=trails_credentials\nconfig/credentials.yml.enc diff=trails_credentials\n",
    );
  });

  it("diff enroll diffing when already enrolled", async () => {
    await diff("--enroll");
    expect(await diff("--enroll")).toMatch(/already enrolled/i);
    expect(File.read(".gitattributes").match(/config\/credentials\.yml\.enc/g)?.length).toBe(1);
  });

  it("diff disenroll diffing", async () => {
    await diff("--enroll");
    expect(await diff("--disenroll")).toMatch(/\bdisenrolled project/i);
    expect(File.isExist(".gitattributes")).toBeFalsy();
  });

  it("diff disenroll diffing with existing .gitattributes", async () => {
    File.write(".gitattributes", "foo bar\n");
    await diff("--enroll");
    await diff("--disenroll");
    expect(File.read(".gitattributes")).toBe("foo bar\n");
  });

  it("diff disenroll diffing when not enrolled", async () => {
    expect(await diff("--disenroll")).toMatch(/not enrolled/i);
    expect(File.isExist(".gitattributes")).toBeFalsy();
  });

  it("diff for main credentials", async () => {
    await edit();
    expect(await diff("config/credentials.yml.enc")).toMatch(/access_key_id: 123/);
  });

  it("diff when master key is not available", async () => {
    await edit();
    File.delete("config/master.key");
    const rawContent = File.read("config/credentials.yml.enc");
    expect(await diff("config/credentials.yml.enc")).toMatch(rawContent);
  });

  it("diff returns raw encrypted content when errors occur", async () => {
    await edit();
    const encryptedContent = File.read("config/credentials.yml.enc");
    File.write("config/credentials.yml.enc", `${encryptedContent}ruin decryption`);
    expect(await diff("config/credentials.yml.enc")).toMatch(encryptedContent);
  });
});

// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
interface CredentialsTest extends Generation, EnvHelpers {}
// eslint-disable-next-line @typescript-eslint/no-unsafe-declaration-merging
class CredentialsTest extends TestCase {
  runEditCommand({
    visual = "cat",
    editor = "cat",
    environment,
    ...options
  }: { visual?: string; editor?: string; environment?: string; allowFailure?: boolean } = {}) {
    return this.switchEnv("VISUAL", visual, () =>
      this.switchEnv("EDITOR", editor, () => {
        const args = environment ? ["--environment", environment] : [];
        return this.trails("credentials:edit", args, options);
      }),
    );
  }

  runShowCommand({
    environment,
    ...options
  }: { environment?: string; allowFailure?: boolean } = {}) {
    const args = environment ? ["--environment", environment] : [];
    return this.trails("credentials:show", args, options);
  }

  runDiffCommand(path: string | null = null, { enroll = false, disenroll = false } = {}) {
    const args = [path, enroll ? "--enroll" : null, disenroll ? "--disenroll" : null].filter(
      (arg) => arg != null,
    );
    return this.trails("credentials:diff", args);
  }

  async writeCredentials(content: string, options: { environment?: string } = {}) {
    const visual = await this.appFile("tmp/write-content", `printf %s "$CONTENT" > "$1"\n`);
    return this.switchEnv("CONTENT", content, () =>
      this.runEditCommand({ visual: `sh ${visual}`, ...options }),
    );
  }

  async assertCredentialsPaths(
    contentPath: string,
    keyPath: string,
    { environment }: { environment?: string } = {},
  ) {
    const content = `foo: ${contentPath}`;
    await this.removeFile(contentPath);
    await this.removeFile(keyPath);

    expect(await this.writeCredentials(content, { environment })).toMatch(`Editing ${contentPath}`);
    await this.assertFile(contentPath);
    await this.assertFile(keyPath);

    expect(await this.runShowCommand({ environment })).toMatch(content);

    if (/config\/credentials(?:\/.*)?\.yml\.enc$/.test(contentPath)) {
      expect(await this.runDiffCommand(contentPath)).toMatch(content);
    }
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
include(CredentialsTest, Isolation);
include(CredentialsTest, EnvHelpers);

describe("Trails::Command::CredentialsTest", { timeout: 120_000 }, () => {
  let t: CredentialsTest;

  beforeEach(async () => {
    t = new CredentialsTest("test");
    await t.buildApp();
  });

  afterEach(() => t.teardownApp());

  it("edit credentials", async () => {
    for (let i = 0; i < 2; i++) {
      expect(await t.runEditCommand()).toMatch(DEFAULT_CREDENTIALS_PATTERN);
    }
  });

  it("edit command does not add master key to gitignore when already exist", async () => {
    await t.runEditCommand();

    const gitignore = await t.readFile(".gitignore");
    expect(gitignore.match(/config\/master\.key/g)!.length).toBe(1);
  });

  it("edit command does not overwrite by default if credentials already exists", async () => {
    await t.writeCredentials("foo: bar");
    const output = await t.runEditCommand();

    expect(output).toMatch(/foo: bar/);
    expect(output).not.toMatch(DEFAULT_CREDENTIALS_PATTERN);
  });

  it("edit command does not add master key when `RAILS_MASTER_KEY` env specified", async () => {
    const masterKey = await t.readFile("config/master.key");
    await t.removeFile("config/master.key");
    await t.appFile(".gitignore", "");

    await t.switchEnv("TRAILS_MASTER_KEY", masterKey, async () => {
      expect(await t.runEditCommand()).toMatch(DEFAULT_CREDENTIALS_PATTERN);
      await t.assertNoFile("config/master.key");
      expect(await t.readFile(".gitignore")).not.toMatch("config/master.key");
    });
  });

  it("edit command omits secret_key_base from generated credentials for dev environment", async () => {
    expect(await t.runEditCommand({ environment: "dev" })).not.toMatch(/^\s*secret_key_base: /m);
    await t.assertFile("config/credentials/development.yml.enc");
  });

  it("edit command omits secret_key_base from generated credentials for test environment", async () => {
    expect(await t.runEditCommand({ environment: "test" })).not.toMatch(/^\s*secret_key_base: /m);
    await t.assertFile("config/credentials/test.yml.enc");
  });

  it("edit command can add master key when require_master_key is true", async () => {
    await t.removeFile("config/credentials.yml.enc");
    await t.removeFile("config/master.key");
    await t.addToConfig("this.config.requireMasterKey = true;");

    await t.runEditCommand();
    await t.assertFile("config/master.key");
  });

  // PERMANENT-SKIP: CLAUDE.md, "Templates are precompiled (`Template#compile`'s `module_eval`)" — an app's `lib/templates/**/*.tt` is never compiled to the `.tt.js` the generator loads.
  it.skip("edit command can use custom template to generate credentials file", async () => {
    await t.appFile(
      "lib/templates/trails/credentials/credentials.yml.tt",
      "provides_secret_key_base: <%= [secret_key_base] == [secret_key_base].compact %>\n",
    );
    await t.removeFile("config/credentials.yml.enc");

    expect(await t.runEditCommand()).toMatch(/provides_secret_key_base: true/);
  });

  it("edit command preserves user's content even if it contains invalid YAML", async () => {
    const writeInvalidYaml = await t.appFile(
      "tmp/write-invalid-yaml",
      `printf %s 'foo: bar: bad' > "$1"\n`,
    );

    expect(await t.runEditCommand({ visual: `sh ${writeInvalidYaml}` })).toMatch(
      /WARNING: Invalid YAML/,
    );
    expect(await t.runEditCommand()).toMatch(/foo: bar: bad/);
  });

  it("edit command does not raise when an initializer tries to access non-existent credentials", async () => {
    await t.appFile(
      "config/initializers/raise-when-loaded.ts",
      `
      import { Trails } from "@blazetrails/trailties";
      ((await Trails.application!.credentials()) as never as Record<string, () => unknown>)["missingKey!"]();
`,
    );

    expect(await t.runEditCommand({ environment: "qa" })).toMatch(DEFAULT_CREDENTIALS_PATTERN);
  });

  it("edit command does not display save confirmation message if interrupted", async () => {
    expect(await t.runEditCommand()).toMatch(/file encrypted and saved/i);

    const interruptCommandProcess = `sh -c 'kill -INT $PPID'`;
    const output = await t.runEditCommand({ visual: interruptCommandProcess });

    expect(output).not.toMatch(/file encrypted and saved/i);
    expect(output).toMatch(/nothing saved/i);
  });

  it("show command raises error when require_master_key is specified and key does not exist", async () => {
    await t.removeFile("config/master.key");
    await t.addToConfig("this.config.requireMasterKey = true;");

    expect(await t.runShowCommand({ allowFailure: true })).toMatch(
      /Missing encryption key to decrypt file with/,
    );
  });

  it("show command displays content specified by environment option", async () => {
    await t.writeCredentials("foo: bar", { environment: "production" });

    expect(await t.runShowCommand({ environment: "production" })).toMatch(/foo: bar/);
  });

  it("show command properly expands environment option", async () => {
    await t.writeCredentials("foo: bar", { environment: "production" });

    expect(await t.runShowCommand({ environment: "prod" })).toMatch(/foo: bar/);
  });

  it("running edit after enrolling in diffing sets diff driver", async () => {
    await t.runDiffCommand(null, { enroll: true });

    expect(await t.runEditCommand()).toMatch(/git diff driver/i);

    const textconv = await rbFBackquote(
      `cd ${await t.appPath()}; git config --get 'diff.trails_credentials.textconv'`,
    );
    expect(textconv.trim()).toBe("bin/trails credentials:diff");

    expect(await t.runEditCommand()).not.toMatch(/git diff driver/i);
  });

  it("diff from git diff left file", async () => {
    await t.runEditCommand({ environment: "development" });

    expect(await t.runDiffCommand("config/credentials/development.yml.enc")).toMatch(
      /access_key_id: 123/,
    );
  });

  it("diff from git diff right file", async () => {
    await t.runEditCommand({ environment: "development" });

    const contentPath = await t.appPath("config", "credentials", "KnAM4a_development.yml.enc");
    await File.writeAsync(contentPath, await t.readFile("config/credentials/development.yml.enc"));

    expect(await t.runDiffCommand(contentPath)).toMatch(/access_key_id: 123/);
  });

  it("diff for custom environment", async () => {
    await t.runEditCommand({ environment: "custom" });

    expect(await t.runDiffCommand("config/credentials/custom.yml.enc")).toMatch(
      /access_key_id: 123/,
    );
  });

  it("diff for custom environment when key is not available", async () => {
    await t.runEditCommand({ environment: "custom" });
    await t.removeFile("config/credentials/custom.key");

    const rawContent = await t.readFile("config/credentials/custom.yml.enc");
    expect(await t.runDiffCommand("config/credentials/custom.yml.enc")).toMatch(rawContent);
  });

  it("respects config.credentials.content_path when set in config/application.rb", async () => {
    const contentPath = "my_secrets/credentials.yml.enc";
    await t.addToConfig(`this.config.credentials.contentPath = ${JSON.stringify(contentPath)};`);

    await t.assertCredentialsPaths(contentPath, "config/master.key");

    await t.assertCredentialsPaths(contentPath, "config/credentials/production.key", {
      environment: "production",
    });
  });

  it("respects config.credentials.key_path when set in config/application.rb", async () => {
    const keyPath = "my_secrets/master.key";
    await t.addToConfig(`this.config.credentials.keyPath = ${JSON.stringify(keyPath)};`);

    await t.assertCredentialsPaths("config/credentials.yml.enc", keyPath);

    await t.assertCredentialsPaths("config/credentials/production.yml.enc", keyPath, {
      environment: "production",
    });
  });
  it("respects config.credentials.content_path when set in config/environments/*.rb", async () => {
    const contentPath = "my_secrets/credentials.yml.enc";
    await t.addToEnvConfig(
      "production",
      `this.config.credentials.contentPath = ${JSON.stringify(contentPath)};`,
    );

    await t.withTrailsEnv("production", () =>
      t.assertCredentialsPaths(contentPath, "config/master.key"),
    );

    await t.assertCredentialsPaths(contentPath, "config/credentials/production.key", {
      environment: "production",
    });
  });

  it("respects config.credentials.key_path when set in config/environments/*.rb", async () => {
    const keyPath = "my_secrets/master.key";
    await t.addToEnvConfig(
      "production",
      `this.config.credentials.keyPath = ${JSON.stringify(keyPath)};`,
    );

    await t.withTrailsEnv("production", () =>
      t.assertCredentialsPaths("config/credentials.yml.enc", keyPath),
    );

    await t.assertCredentialsPaths("config/credentials/production.yml.enc", keyPath, {
      environment: "production",
    });
  });
});
