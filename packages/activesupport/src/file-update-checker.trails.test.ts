/**
 * `ActiveSupport::FileUpdateChecker`'s Rails coverage is
 * `file_update_checker_test.rb`, which mixes in
 * `FileUpdateCheckerSharedTests` — a suite built on `touch` timing loops and
 * `Process.fork`. It is not enrolled here; these are the trails-only
 * invariants of the port: the async block (`execute` awaits, because
 * `CheckPending`'s block reaches the database) and the sync directory walk
 * that stands in for Ruby's `Dir[@glob]`.
 */
import { describe, it, expect, beforeEach, afterEach } from "vitest";
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";
import { FileUpdateChecker } from "./file-update-checker.js";

describe("FileUpdateChecker", () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), "file_update_checker-"));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  const touch = (file: string, mtimeOffsetSeconds = 0): void => {
    fs.writeFileSync(file, "x");
    if (mtimeOffsetSeconds !== 0) {
      const when = new Date(Date.now() + mtimeOffsetSeconds * 1000);
      fs.utimesSync(file, when, when);
    }
  };

  it("requires a block", () => {
    expect(() => new FileUpdateChecker([])).toThrow(
      "A block is required to initialize a FileUpdateChecker",
    );
  });

  it("awaits an async block", async () => {
    let ran = false;
    const checker = new FileUpdateChecker([], {}, async () => {
      await Promise.resolve();
      ran = true;
    });

    await checker.execute();

    expect(ran).toBe(true);
  });

  it("executeIfUpdated is false until a watched file changes", async () => {
    const file = path.join(tmpDir, "a.ts");
    touch(file, -10);
    let calls = 0;
    const checker = new FileUpdateChecker([file], {}, () => {
      calls++;
    });

    expect(await checker.executeIfUpdated()).toBe(false);
    expect(calls).toBe(0);

    // A bare write races `max_mtime`'s future-mtime skip (`file_update_checker.rb:134`):
    // a kernel mtime can read a hair ahead of `Date.now()` and be ignored.
    touch(file, -1);

    expect(await checker.executeIfUpdated()).toBe(true);
    expect(calls).toBe(1);
    expect(await checker.executeIfUpdated()).toBe(false);
  });

  it("watches the extensions of a directory recursively", async () => {
    const nested = path.join(tmpDir, "nested");
    fs.mkdirSync(nested);
    let calls = 0;
    const checker = new FileUpdateChecker([], { [tmpDir]: ["ts", "js"] }, () => {
      calls++;
    });

    touch(path.join(nested, "ignored.txt"));
    expect(await checker.executeIfUpdated()).toBe(false);

    touch(path.join(nested, "watched.ts"));
    expect(await checker.executeIfUpdated()).toBe(true);
    expect(calls).toBe(1);
  });

  it("ignores mtimes in the future", async () => {
    const file = path.join(tmpDir, "a.ts");
    touch(file, -10);
    const checker = new FileUpdateChecker([file], {}, () => {});

    touch(file, 60 * 60);

    expect(await checker.executeIfUpdated()).toBe(false);
  });
});
