import { File, FileUtils, Dir, setEnv, env, getFs } from "@blazetrails/ruby-compat";
import { EncryptedConfiguration } from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "../command.js";
import { Trails } from "../rails.js";
import { CredentialsCommand } from "./credentials.js";

const DEFAULT_CREDENTIALS_PATTERN = /access_key_id: 123\n[\s\S]*secret_key_base: [0-9a-f]{128}\n/;

describe("Rails::Command::CredentialsTest", () => {
  let appPath: string, cwd: string, output: string[];
  const saved = { VISUAL: env.VISUAL, EDITOR: env.EDITOR };

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
      credentials: { contentPath: null, keyPath: null },
      credentialsDefaults: async () => ({
        contentPath: `${appPath}/config/credentials.yml.enc`,
        keyPath: `${appPath}/config/master.key`,
      }),
    };
    vi.spyOn(Trails, "application", "get").mockReturnValue({
      config,
      loadGenerators: async () => {},
      encrypted: async (path: string, opts: { keyPath: string }) =>
        new EncryptedConfiguration({
          configPath: `${appPath}/${path}`,
          keyPath: `${appPath}/${opts.keyPath}`,
          envKey: "RAILS_MASTER_KEY",
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
    Dir.chdir(cwd);
    FileUtils.rmRf(appPath);
  });

  it("edit without visual or editor gives hint", async () => {
    const out = await edit([], "", "");
    expect(out).toContain("No $VISUAL or $EDITOR to open file in");
    expect(out).toContain("rails credentials:edit");
  });

  it("edit with visual but not editor does not give hint", async () => {
    expect(await edit([], "true", "")).not.toContain("No $VISUAL or $EDITOR to open file in");
  });

  it("edit with editor but not visual does not give hint", async () => {
    expect(await edit([], "", "true")).not.toContain("No $VISUAL or $EDITOR to open file in");
  });

  it("edit command adds master key", async () => {
    await edit();
    expect(File.isExist("config/master.key")).toBe(true);
    expect(File.read(".gitignore")).toContain("config/master.key");
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
    expect(File.read(".gitignore").match(/config\/master\.key/g)).toHaveLength(1);
  });

  it("edit command modifies file specified by environment option", async () => {
    await edit(["--environment", "production"]);
    expect(File.isExist("config/credentials.yml.enc")).toBe(false);
    expect(File.isExist("config/credentials/production.key")).toBe(true);
    expect(File.isExist("config/credentials/production.yml.enc")).toBe(true);
  });

  it("edit command properly expands environment option", async () => {
    await edit(["--environment", "prod"]);
    expect(File.isExist("config/credentials.yml.enc")).toBe(false);
    expect(File.isExist("config/credentials/production.key")).toBe(true);
    expect(File.isExist("config/credentials/production.yml.enc")).toBe(true);
  });

  it("edit command generates credentials file when it does not exist", async () => {
    await edit();
    expect(File.isExist("config/credentials.yml.enc")).toBe(true);
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
      "config/credentials/*.yml.enc diff=rails_credentials\nconfig/credentials.yml.enc diff=rails_credentials\n",
    );
  });

  it("diff enroll diffing when already enrolled", async () => {
    await diff("--enroll");
    expect(await diff("--enroll")).toMatch(/already enrolled/i);
    expect(File.read(".gitattributes").match(/config\/credentials\.yml\.enc/g)).toHaveLength(1);
  });

  it("diff disenroll diffing", async () => {
    await diff("--enroll");
    expect(await diff("--disenroll")).toMatch(/\bdisenrolled project/i);
    expect(File.isExist(".gitattributes")).toBe(false);
  });

  it("diff disenroll diffing with existing .gitattributes", async () => {
    File.write(".gitattributes", "foo bar\n");
    await diff("--enroll");
    await diff("--disenroll");
    expect(File.read(".gitattributes")).toBe("foo bar\n");
  });

  it("diff disenroll diffing when not enrolled", async () => {
    expect(await diff("--disenroll")).toMatch(/not enrolled/i);
    expect(File.isExist(".gitattributes")).toBe(false);
  });

  it("diff for main credentials", async () => {
    await edit();
    expect(await diff("config/credentials.yml.enc")).toMatch(/access_key_id: 123/);
  });

  it("diff when master key is not available", async () => {
    await edit();
    File.delete("config/master.key");
    const rawContent = File.read("config/credentials.yml.enc");
    expect(await diff("config/credentials.yml.enc")).toContain(rawContent);
  });

  it("diff returns raw encrypted content when errors occur", async () => {
    await edit();
    const encryptedContent = File.read("config/credentials.yml.enc");
    File.write("config/credentials.yml.enc", `${encryptedContent}ruin decryption`);
    expect(await diff("config/credentials.yml.enc")).toContain(encryptedContent);
  });
});
