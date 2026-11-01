import { File, FileUtils, Dir, setEnv, env, getFs } from "@blazetrails/ruby-compat";
import { EncryptedConfiguration } from "@blazetrails/activesupport";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { invoke } from "../command.js";
import { Trails } from "../rails.js";
import { EncryptedCommand } from "./encrypted.js";

const encryptedFile = "config/tokens.yml.enc";

describe("Rails::Command::EncryptedTest", () => {
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
          envKey: "RAILS_MASTER_KEY",
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
    expect(out).toContain("No $VISUAL or $EDITOR to open file in");
    expect(out).toContain("rails encrypted:edit");
  });

  it("edit with visual but not editor does not give hint", async () => {
    expect(await edit(undefined, "true", "")).not.toContain("No $VISUAL or $EDITOR");
  });

  it("edit with editor but not visual does not give hint", async () => {
    expect(await edit(undefined, "", "true")).not.toContain("No $VISUAL or $EDITOR");
  });

  it("edit command adds master key", async () => {
    await edit();
    expect(File.isExist("config/master.key")).toBe(true);
    expect(File.read(".gitignore")).toContain("config/master.key");
  });

  it("edit command does not add duplicate master key entries to gitignore", async () => {
    await edit();
    await edit();
    expect(File.read(".gitignore").match(/config\/master\.key/g)).toHaveLength(1);
  });

  it("edit encrypts file with custom key", async () => {
    await edit("config/tokens.key");
    expect(File.isExist("config/tokens.key")).toBe(true);
    expect(File.read(".gitignore")).toContain("/config/tokens.key");
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
    await invoke("encrypted:edit", prepareArgs("config/other.key")).catch(() => {});
    expect(await show("config/tokens.key")).toMatch(/access_key_id: 123/);
  });
});
