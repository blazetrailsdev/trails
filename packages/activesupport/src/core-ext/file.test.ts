import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  chmodSync,
  existsSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { atomicWrite, probeStatIn } from "./file/atomic.js";
import { assert, assertNot, assertNil } from "../testing/assertions.js";

describe("AtomicWriteTest", () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "trails-atomic-"));
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  function fileName(): string {
    return join(dir, "atomic.file");
  }

  function fileMode(): number {
    return statSync(fileName()).mode;
  }

  it("atomic write without errors", () => {
    const contents = "Atomic Text";
    atomicWrite(fileName(), dir, (file) => {
      file.write(contents);
      assertNot(existsSync(fileName()));
    });
    assert(existsSync(fileName()));
    expect(readFileSync(fileName(), "utf-8")).toEqual(contents);
  });

  it("atomic write doesnt write when block raises", () => {
    try {
      atomicWrite(fileName(), undefined, (file) => {
        file.write("testing");
        throw new Error("something bad");
      });
    } catch {
      assertNot(existsSync(fileName()));
    }
  });

  it("atomic write preserves file permissions", () => {
    const contents = "Atomic Text";
    writeFileSync(fileName(), contents);
    chmodSync(fileName(), 0o755);
    assert(existsSync(fileName()));
    assert(existsSync(fileName()));
    expect(fileMode()).toEqual(0o100755);
    expect(readFileSync(fileName(), "utf-8")).toEqual(contents);

    atomicWrite(fileName(), dir, (file) => {
      file.write(contents);
      assert(existsSync(fileName()));
    });
    assert(existsSync(fileName()));
    expect(fileMode()).toEqual(0o100755);
    expect(readFileSync(fileName(), "utf-8")).toEqual(contents);
  });

  it("atomic write preserves default file permissions", () => {
    const contents = "Atomic Text";
    atomicWrite(fileName(), dir, (file) => {
      file.write(contents);
      assertNot(existsSync(fileName()));
    });
    assert(existsSync(fileName()));
    expect(fileMode()).toEqual(probeStatIn(dir)!.mode);
    expect(readFileSync(fileName(), "utf-8")).toEqual(contents);
  });

  it("atomic write preserves file permissions same directory", () => {
    chmodSync(dir, 0o700);

    const probedPermissions = probeStatIn(dir)!.mode.toString(8);

    atomicWrite(join(dir, "atomic.file"), undefined, () => undefined);

    const actualPermissions = statSync(join(dir, "atomic.file")).mode.toString(8);

    expect(actualPermissions).toBe(probedPermissions);
  });

  it("atomic write returns result from yielded block", () => {
    const blockReturnValue = atomicWrite(fileName(), dir, () => "Hello world!");

    expect(blockReturnValue).toBe("Hello world!");
  });

  it("probe stat in when no dir", () => {
    assertNil(probeStatIn("/dir/does/not/exist"));
  });
});
