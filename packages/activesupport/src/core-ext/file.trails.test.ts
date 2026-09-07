import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite } from "./file/atomic.js";

describe("AtomicWriteTest", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "trails-atomic-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it("renames into place only after an asynchronous block settles", async () => {
    const fileName = join(dir, "atomic.file");

    const pending = atomicWrite(fileName, dir, async (file) => {
      await Promise.resolve();
      file.write("written after a tick");
      return "block value";
    });

    expect(existsSync(fileName)).toBe(false);
    expect(await pending).toBe("block value");
    expect(readFileSync(fileName, "utf8")).toBe("written after a tick");
  });

  it("propagates a rejection from an asynchronous block", async () => {
    const fileName = join(dir, "atomic.file");

    await expect(
      atomicWrite(fileName, dir, async () => {
        throw new Error("boom");
      }),
    ).rejects.toThrow("boom");
    expect(existsSync(fileName)).toBe(false);
  });
});
