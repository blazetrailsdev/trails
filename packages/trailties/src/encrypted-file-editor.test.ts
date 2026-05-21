import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { writeFileSync } from "node:fs";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync } from "@blazetrails/activesupport";
import { setEnv } from "@blazetrails/activesupport/process-adapter";
import {
  registerChildProcessAdapter,
  childProcessAdapterConfig,
} from "@blazetrails/activesupport/child-process-adapter";
import { editEncryptedFile } from "./encrypted-file-editor.js";

describe("editEncryptedFile", () => {
  let dir: string, contentPath: string, keyPath: string;
  const saved = { v: "", e: "", a: null as string | null };
  const calls: string[][] = [];

  beforeEach(async () => {
    const [fs, path, os] = await Promise.all([getFsAsync(), getPathAsync(), getOsAsync()]);
    dir = await fs.mkdtemp!(`${os.tmpdir()}${path.sep}enc-editor-`);
    contentPath = path.join(dir, "secret.yml.enc");
    keyPath = path.join(dir, "secret.key");
    [saved.v, saved.e, saved.a] = [
      process.env.VISUAL ?? "",
      process.env.EDITOR ?? "",
      childProcessAdapterConfig.adapter,
    ];
    setEnv("VISUAL", undefined);
    setEnv("EDITOR", undefined);
    calls.length = 0;
    registerChildProcessAdapter("fake", {
      spawnSync: (cmd, args) => (
        calls.push([cmd, ...args]),
        { status: 0, signal: null, stdout: "", stderr: "" }
      ),
    });
    childProcessAdapterConfig.adapter = "fake";
  });

  afterEach(async () => {
    (await getFsAsync()).rmSync(dir, { recursive: true, force: true });
    setEnv("VISUAL", saved.v || undefined);
    setEnv("EDITOR", saved.e || undefined);
    childProcessAdapterConfig.adapter = saved.a;
  });

  const build = () =>
    new EncryptedFile({
      contentPath,
      keyPath,
      envKey: "ENC_EDITOR_TEST_KEY",
      raiseIfMissingKey: true,
    });

  it("generates a key file on first edit when missing", async () => {
    setEnv("EDITOR", "fake");
    registerChildProcessAdapter("write", {
      spawnSync: (_c, args) => (
        writeFileSync(args[args.length - 1], "hello\n"),
        { status: 0, signal: null, stdout: "", stderr: "" }
      ),
    });
    childProcessAdapterConfig.adapter = "write";
    const file = build();
    await editEncryptedFile(file);
    expect(await (await getFsAsync()).exists!(keyPath)).toBe(true);
    expect(await file.read()).toBe("hello\n");
  });

  it("invokes the editor with extra args split on whitespace", async () => {
    setEnv("VISUAL", "code --wait");
    await (
      await getFsAsync()
    ).writeFile!(keyPath, EncryptedFile.generateKey());
    await editEncryptedFile(build());
    expect(calls).toHaveLength(1);
    expect(calls[0].slice(0, 2)).toEqual(["code", "--wait"]);
  });

  it("does nothing when neither $VISUAL nor $EDITOR is set", async () => {
    await (
      await getFsAsync()
    ).writeFile!(keyPath, EncryptedFile.generateKey());
    await editEncryptedFile(build());
    expect(calls).toHaveLength(0);
    expect(await (await getFsAsync()).exists!(contentPath)).toBe(false);
  });
});
