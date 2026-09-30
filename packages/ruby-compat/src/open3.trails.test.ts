import { afterEach, describe, expect, it } from "vitest";
import {
  childProcessAdapterConfig,
  getChildProcess,
  registerChildProcessAdapter,
} from "./child-process-adapter.js";
import { Errno } from "./errno.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { Open3 } from "./open3.js";

describe("Open3.capture2e", () => {
  afterEach(() => {
    childProcessAdapterConfig.adapter = null;
  });

  it("answers stdout and stderr on one String with a successful status", async () => {
    const [out, outStatus] = await Open3.capture2e("echo out");
    expect(out).toBe("out\n");
    expect(outStatus.isSuccess()).toBe(true);
    expect(outStatus.exitstatus).toBe(0);

    const [err, errStatus] = await Open3.capture2e("echo err >&2");
    expect(err).toBe("err\n");
    expect(errStatus.isSuccess()).toBe(true);
  });

  it("answers an unsuccessful status with the exit code", async () => {
    const [, status] = await Open3.capture2e("exit 4");
    expect(status.isSuccess()).toBe(false);
    expect(status.exitstatus).toBe(4);
  });

  it("answers a nil success? for a child a signal ended", async () => {
    const [, status] = await Open3.capture2e("kill -9 $$");
    expect(status.isSuccess()).toBeNull();
    expect(status.exitstatus).toBeNull();
  });

  it("closes the child's stdin", async () => {
    const [out, status] = await Open3.capture2e("cat");
    expect(out).toBe("");
    expect(status.isSuccess()).toBe(true);
  });

  it("merges the env hash over ENV", async () => {
    const [out] = await Open3.capture2e({ hgga: "ugu" }, "printenv hgga");
    expect(out).toBe("ugu\n");
  });

  it("raises Errno::ENOENT for a program it cannot spawn", async () => {
    await expect(Open3.capture2e("nonexistent_trails_command a")).rejects.toThrow(
      new Errno.ENOENT("nonexistent_trails_command"),
    );
  });

  it("raises Errno::ENOENT for an empty command line", async () => {
    await expect(Open3.capture2e("")).rejects.toThrow(new Errno.ENOENT(""));
  });

  it("raises Errno::EACCES for a program it may not execute", async () => {
    await expect(Open3.capture2e("/dev/null")).rejects.toThrow(new Errno.EACCES("/dev/null"));
  });

  it("raises NotImplementedError on an adapter without capture2e", async () => {
    registerChildProcessAdapter("spawn-sync-only", { spawnSync: getChildProcess().spawnSync });
    childProcessAdapterConfig.adapter = "spawn-sync-only";
    await expect(Open3.capture2e("true")).rejects.toThrow(
      new NotImplementedError("spawn() function is unimplemented on this machine"),
    );
  });
});
