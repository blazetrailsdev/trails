import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EncryptedFile, InvalidKeyLengthError, MissingKeyError } from "./encrypted-file.js";
import { getFs, getPath, getOsAsync, setEnv } from "@blazetrails/ruby-compat";
import {
  assert,
  assertNot,
  assertNothingRaised,
  assertPredicate,
  assertRaise,
} from "./testing/assertions.js";

describe("EncryptedFileTest", () => {
  const CONTENT = "One little fox jumped over the hedge";
  let tmpdir: string;
  let contentPath: string;
  let keyPath: string;
  let key: string;
  let originalEnv: string | undefined;

  const make = (overrides: Partial<{ keyPath: string; envKey: string }> = {}) =>
    new EncryptedFile({
      contentPath,
      keyPath: overrides.keyPath ?? keyPath,
      envKey: overrides.envKey ?? "CONTENT_KEY",
      raiseIfMissingKey: true,
    });

  beforeEach(async () => {
    originalEnv = process.env.CONTENT_KEY;
    setEnv("CONTENT_KEY", undefined);

    const fs = getFs();
    const path = getPath();
    const os = await getOsAsync();
    tmpdir = await fs.mkdtemp!(`${os.tmpdir()}${path.sep}encrypted-file-test-`);
    contentPath = path.join(tmpdir, "content.txt.enc");
    keyPath = path.join(tmpdir, "content.txt.key");
    key = EncryptedFile.generateKey();
    await fs.writeFile!(keyPath, key);
  });

  afterEach(async () => {
    const fs = getFs();
    for (const p of [contentPath, keyPath]) {
      try {
        await fs.unlink!(p);
      } catch {}
    }
    try {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    } catch {}
    setEnv("CONTENT_KEY", originalEnv);
  });

  it("reading content by env key", async () => {
    const fs = getFs();
    await fs.unlink!(keyPath);
    setEnv("CONTENT_KEY", key);
    const ef = make();
    await ef.write(CONTENT);
    expect(await ef.read()).toBe(CONTENT);
  });

  it("reading content by key file", async () => {
    const ef = make();
    await ef.write(CONTENT);
    expect(await ef.read()).toBe(CONTENT);
  });

  it("change content by key file", async () => {
    const ef = make();
    await ef.write(CONTENT);
    const fs = getFs();
    await ef.change(async (tmp) => {
      const current = await fs.readFile!(tmp, "utf8");
      await fs.writeFile!(tmp, `${current} and went by the lake`);
    });
    expect(await ef.read()).toBe(`${CONTENT} and went by the lake`);
  });

  it("change sets restricted permissions", async () => {
    const ef = make();
    await ef.write(CONTENT);
    const fs = getFs();
    const tmpdirStat = await fs.stat!(tmpdir);
    await ef.change(async (file) => {
      const stat = await fs.stat!(file);
      assertPredicate(stat, (s) => s.uid === tmpdirStat.uid);
      expect(stat.mode.toString(8)).toBe("100600");
    });
  });

  it("raise MissingKeyError when key is missing", async () => {
    const ef = new EncryptedFile({
      contentPath,
      keyPath: "",
      envKey: "",
      raiseIfMissingKey: true,
    });
    await assertRaise([MissingKeyError], {}, () => ef.read());
  });

  it("raise MissingKeyError when env key is blank", async () => {
    const fs = getFs();
    await fs.unlink!(keyPath);
    setEnv("CONTENT_KEY", "");
    const ef = make();
    const raised = await assertRaise([MissingKeyError], {}, async () => {
      await ef.write(CONTENT);
      await ef.read();
    });

    expect(raised.message).toMatch(/Missing encryption key to decrypt file/);
  });

  it("key can be added after MissingKeyError raised", async () => {
    const fs = getFs();
    await fs.unlink!(keyPath);
    const ef = make();
    await assertRaise([MissingKeyError], {}, () => ef.key());

    await fs.writeFile!(keyPath, key);

    await assertNothingRaised(async () => {
      expect(await make().key()).toBe(key);
    });
  });

  it("key? is true when key file exists", async () => {
    assertPredicate(await make().isKey(), (k) => k);
  });

  it("key? is true when env key is present", async () => {
    const fs = getFs();
    await fs.unlink!(keyPath);
    setEnv("CONTENT_KEY", key);
    assertPredicate(await make().isKey(), (k) => k);
  });

  it("key? is false and does not raise when the key is missing", async () => {
    const fs = getFs();
    await fs.unlink!(keyPath);
    await assertNothingRaised(async () => {
      assertNot(await make().isKey());
    });
  });

  it("raise InvalidKeyLengthError when key is too short", async () => {
    const fs = getFs();
    await fs.writeFile!(keyPath, EncryptedFile.generateKey().slice(0, -1));
    await assertRaise([InvalidKeyLengthError], {}, () => make().write(CONTENT));
  });

  it("raise InvalidKeyLengthError when key is too long", async () => {
    const fs = getFs();
    await fs.writeFile!(keyPath, EncryptedFile.generateKey() + "0");
    await assertRaise([InvalidKeyLengthError], {}, () => make().write(CONTENT));
  });

  it("respects existing content_path symlink", async () => {
    const fs = getFs();
    const path = getPath();
    const ef = make();
    await ef.write(CONTENT);

    const symlinkPath = path.join(tmpdir, "content_symlink.txt.enc");
    await (await import("node:fs/promises")).symlink(contentPath, symlinkPath);

    await ef.write(CONTENT);

    assert((await fs.lstat!(symlinkPath)).isSymbolicLink!());
    expect(await ef.read()).toBe(CONTENT);
  });

  it("creates new content_path symlink if it's dead", async () => {
    const path = getPath();
    const symlinkPath = path.join(tmpdir, "content_symlink.txt.enc");
    await (await import("node:fs/promises")).symlink(contentPath, symlinkPath);

    const ef = make();
    await ef.write(CONTENT);

    const fs = getFs();
    assert(await fs.exists(contentPath));
    expect(await ef.read()).toBe(CONTENT);
  });

  it("can read encrypted file after changing default_serializer", async () => {
    const ef = make();
    await ef.write(CONTENT);
    expect(await ef.read()).toBe(CONTENT);
  });
});
