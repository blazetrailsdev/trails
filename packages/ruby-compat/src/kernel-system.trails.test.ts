import { afterEach, describe, expect, it } from "vitest";
import { ArgumentError } from "./argument-error.js";
import {
  childProcessAdapterConfig,
  getChildProcess,
  registerChildProcessAdapter,
} from "./child-process-adapter.js";
import { rbKernelSystem } from "./kernel-system.js";
import { NotImplementedError } from "./not-implemented-error.js";

describe("Kernel#system", () => {
  afterEach(() => {
    childProcessAdapterConfig.adapter = null;
  });

  it("answers true for a command that exits 0", async () => {
    expect(await rbKernelSystem("true")).toBe(true);
  });

  it("answers false for a command that exits non-zero", async () => {
    expect(await rbKernelSystem("false")).toBe(false);
    expect(await rbKernelSystem("exit 3")).toBe(false);
  });

  it("answers nil for a program it cannot execute, where the shell would exit 127", async () => {
    expect(await rbKernelSystem("nonexistent_trails_command")).toBeNull();
    expect(await rbKernelSystem("nonexistent_trails_command; true")).toBe(true);
    expect(await rbKernelSystem("")).toBeNull();
  });

  it("answers nil for a program it may not execute", async () => {
    expect(await rbKernelSystem("/dev/null")).toBeNull();
  });

  it("runs a line with shell meta characters through /bin/sh -c", async () => {
    expect(await rbKernelSystem("true && test 1 = 1")).toBe(true);
    expect(await rbKernelSystem("true || exit 1; exit 2")).toBe(false);
  });

  it("merges the env hash over ENV, a nil value unsetting the name", async () => {
    expect(await rbKernelSystem({ hgga: "ugu" }, 'test "$hgga" = ugu')).toBe(true);
    expect(await rbKernelSystem({ HOME: null }, 'test -z "${HOME+set}"')).toBe(true);
  });

  it("raises ArgumentError for an env name containing =", async () => {
    await expect(rbKernelSystem({ "a=b": "c" }, "true")).rejects.toThrow(
      new ArgumentError("environment name contains a equal : a=b"),
    );
  });

  it("raises TypeError for a non-String env value and ArgumentError for a NUL byte", async () => {
    await expect(rbKernelSystem({ a: 1 } as never, "true")).rejects.toThrow(
      "no implicit conversion of Integer into String",
    );
    await expect(rbKernelSystem({ "a\0": "c" }, "true")).rejects.toThrow(
      new ArgumentError("string contains null byte"),
    );
    await expect(rbKernelSystem({ a: "c\0" }, "true")).rejects.toThrow(
      new ArgumentError("string contains null byte"),
    );
  });

  it("does not block the event loop while the child runs", async () => {
    let ticked = false;
    setTimeout(() => (ticked = true), 10);
    expect(await rbKernelSystem("sleep 0.2")).toBe(true);
    expect(ticked).toBe(true);
  });

  it("raises NotImplementedError on an adapter without system", async () => {
    registerChildProcessAdapter("spawn-sync-only", { spawnSync: getChildProcess().spawnSync });
    childProcessAdapterConfig.adapter = "spawn-sync-only";
    await expect(rbKernelSystem("true")).rejects.toThrow(
      new NotImplementedError("system() function is unimplemented on this machine"),
    );
  });
});
