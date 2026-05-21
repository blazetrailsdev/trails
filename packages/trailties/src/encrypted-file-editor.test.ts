import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EncryptedFile } from "@blazetrails/activesupport/encrypted-file";
import { getFsAsync, getPathAsync } from "@blazetrails/activesupport/fs-adapter";
import { getOsAsync } from "@blazetrails/activesupport";
import { setEnv, setExitCode } from "@blazetrails/activesupport/process-adapter";
import {
  registerChildProcessAdapter,
  childProcessAdapterConfig,
} from "@blazetrails/activesupport/child-process-adapter";
import { editEncryptedFile, showEncryptedFile } from "./encrypted-file-editor.js";

describe("encrypted-file-editor", () => {
  let dir: string, contentPath: string, keyPath: string;
  const saved = { v: "", e: "", a: null as string | null };
  const calls: string[][] = [];

  beforeEach(async () => {
    const [fs, path, os] = await Promise.all([getFsAsync(), getPathAsync(), getOsAsync()]);
    dir = await fs.mkdtemp!(`${os.tmpdir()}${path.sep}enc-editor-`);
    contentPath = path.join(dir, "c.yml.enc");
    keyPath = path.join(dir, "c.key");
    [saved.v, saved.e, saved.a] = [
      process.env.VISUAL ?? "",
      process.env.EDITOR ?? "",
      childProcessAdapterConfig.adapter,
    ];
    setEnv("VISUAL", undefined);
    setEnv("EDITOR", undefined);
    setExitCode(0);
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
    new EncryptedFile({ contentPath, keyPath, envKey: "ENC_TEST_KEY", raiseIfMissingKey: true });

  it("edit generates a key file on first run and re-encrypts editor output", async () => {
    setEnv("EDITOR", "fake");
    const fs = await getFsAsync();
    registerChildProcessAdapter("write", {
      spawnSync: (_c, args) => (
        fs.writeFileSync(args[args.length - 1], "hello\n"),
        { status: 0, signal: null, stdout: "", stderr: "" }
      ),
    });
    childProcessAdapterConfig.adapter = "write";
    const file = build();
    await editEncryptedFile(file, "test edit");
    expect(await (await getFsAsync()).exists!(keyPath)).toBe(true);
    expect(await file.read()).toBe("hello\n");
  });

  it("edit does nothing when neither $VISUAL nor $EDITOR is set", async () => {
    const fs = await getFsAsync();
    await fs.writeFile!(keyPath, EncryptedFile.generateKey());
    await editEncryptedFile(build(), "test edit");
    expect(calls).toHaveLength(0);
    expect(await fs.exists!(contentPath)).toBe(false);
  });

  it("show round-trips on success and sets exit 1 when key is absent", async () => {
    await showEncryptedFile(build(), "missing");
    expect(process.exitCode).toBe(1);
    const fs = await getFsAsync();
    await fs.writeFile!(keyPath, EncryptedFile.generateKey());
    const f = build();
    await f.write("payload");
    setExitCode(0);
    await showEncryptedFile(f, "missing");
    expect(process.exitCode).not.toBe(1);
  });
});
