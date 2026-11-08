import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { EncryptedFile } from "./encrypted-file.js";
import { getFs, getPath, getOsAsync } from "@blazetrails/ruby-compat";

describe("EncryptedFile cipher", () => {
  let tmpdir: string;
  let contentPath: string;
  let keyPath: string;

  beforeEach(async () => {
    const fs = getFs();
    const path = getPath();
    const os = await getOsAsync();
    tmpdir = await fs.mkdtemp!(`${os.tmpdir()}${path.sep}encrypted-file-cipher-test-`);
    contentPath = path.join(tmpdir, "content.txt.enc");
    keyPath = path.join(tmpdir, "content.txt.key");
  });

  afterEach(async () => {
    const fs = getFs();
    try {
      fs.rmSync(tmpdir, { recursive: true, force: true });
    } catch {}
  });

  it("generates a 16-byte key, hex-encoded", () => {
    expect(EncryptedFile.generateKey()).toMatch(/^[0-9a-f]{32}$/);
  });

  it("expects a 32-character key", () => {
    expect(EncryptedFile.expectedKeyLength()).toBe(32);
  });

  it("round-trips content under aes-128-gcm", async () => {
    const fs = getFs();
    await fs.writeFile!(keyPath, EncryptedFile.generateKey());
    const ef = new EncryptedFile({
      contentPath,
      keyPath,
      envKey: "CONTENT_KEY",
      raiseIfMissingKey: true,
    });
    await ef.write("One little fox jumped over the hedge");
    expect(await ef.read()).toBe("One little fox jumped over the hedge");
  });
});
