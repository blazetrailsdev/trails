import { afterEach, describe, expect, it } from "vitest";
import {
  childProcessAdapterConfig,
  getChildProcess,
  registerChildProcessAdapter,
} from "./child-process-adapter.js";
import { Dir } from "./dir.js";
import { File } from "./file.js";
import { FileUtils } from "./file-utils.js";
import { rbFSystem } from "./kernel-system.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { Open3 } from "./open3.js";
import { Process } from "./process.js";

afterEach(() => {
  childProcessAdapterConfig.adapter = null;
});

function withoutSpawn(): void {
  registerChildProcessAdapter("browser", { spawnSync: getChildProcess().spawnSync });
  childProcessAdapterConfig.adapter = "browser";
}

describe("Kernel#system", () => {
  it("is true for a command that exits with 0", async () => {
    expect(await rbFSystem("exit 0")).toBe(true);
  });

  it("is false for a command that exits with anything else", async () => {
    expect(await rbFSystem("exit 3")).toBe(false);
    expect(await rbFSystem("kill -9 $$")).toBe(false);
  });

  it("is nil when the command could not be executed", async () => {
    registerChildProcessAdapter("failing", {
      spawnSync: getChildProcess().spawnSync,
      system: async () => ({ pid: null, status: null, signal: null, error: new Error("ENOENT") }),
    });
    childProcessAdapterConfig.adapter = "failing";
    expect(await rbFSystem("true")).toBeNull();

    registerChildProcessAdapter("failing", {
      spawnSync: getChildProcess().spawnSync,
      system: async () => ({ pid: 7, status: null, signal: null, error: new Error("EACCES") }),
    });
    expect(await rbFSystem("true")).toBeNull();
  });

  it("runs the command line through /bin/sh -c", async () => {
    expect(await rbFSystem('true && test -n "$0" | cat')).toBe(true);
    expect(await rbFSystem("false || exit 2")).toBe(false);
  });

  it("lays a leading env hash over ENV, a nil value unsetting the name", async () => {
    expect(await rbFSystem({ TRAILS_SYSTEM_PROBE: "1" }, 'test "$TRAILS_SYSTEM_PROBE" = 1')).toBe(
      true,
    );
    expect(await rbFSystem('test -z "$TRAILS_SYSTEM_PROBE" && test -n "$PATH"')).toBe(true);
    expect(await rbFSystem({ HOME: null }, 'test -z "${HOME+set}"')).toBe(true);
  });

  it("execs a program and its argv with no shell", async () => {
    expect(await rbFSystem("sh", "-c", "exit 3")).toBe(false);
    expect(await rbFSystem("test", "a;b", "=", "a;b")).toBe(true);
    expect(
      await rbFSystem({ TRAILS_SYSTEM_PROBE: "1" }, "sh", "-c", 'test "$TRAILS_SYSTEM_PROBE" = 1'),
    ).toBe(true);
    expect(await rbFSystem("trails-no-such-program", "--version")).toBeNull();
  });

  it("opens out: on the named file, truncated, for the child's stdout", async () => {
    const out = File.join(Dir.tmpdir(), `trails-kernel-system-${Process.pid}.out`);
    File.write(out, "stale contents longer than the new output");
    try {
      expect(await rbFSystem("printf", "ok", { out })).toBe(true);
      expect(File.read(out)).toBe("ok");
    } finally {
      FileUtils.rmF(out);
    }
  });

  it("raises NotImplementedError on an adapter that cannot spawn", async () => {
    withoutSpawn();
    await expect(rbFSystem("true")).rejects.toThrow(NotImplementedError);
    await expect(rbFSystem("true")).rejects.toThrow(
      "system() function is unimplemented on this machine",
    );
  });
});

describe("Open3.capture2e", () => {
  it("answers stdout and stderr merged, and a Process::Status", async () => {
    const [output, status] = await Open3.capture2e("echo out; echo err 1>&2; echo again");
    expect(output).toBe("out\nerr\nagain\n");
    expect(status).toBeInstanceOf(Process.Status);
    expect(status.isSuccess()).toBe(true);
    expect(status.pid).toBeGreaterThan(0);
  });

  it("success? is false for a non-zero exit and nil for a signalled child", async () => {
    const [output, status] = await Open3.capture2e("printf partial; exit 4");
    expect(output).toBe("partial");
    expect(status.isSuccess()).toBe(false);
    expect((await Open3.capture2e("kill -9 $$"))[1].isSuccess()).toBeNull();
  });

  it("gives the child an empty stdin", async () => {
    expect((await Open3.capture2e("cat"))[0]).toBe("");
  });

  it("lays a leading env hash over ENV", async () => {
    const [output] = await Open3.capture2e(
      { TRAILS_OPEN3_PROBE: "x" },
      'printf "$TRAILS_OPEN3_PROBE"',
    );
    expect(output).toBe("x");
  });

  it("raises NotImplementedError on an adapter that cannot spawn", async () => {
    withoutSpawn();
    await expect(Open3.capture2e("true")).rejects.toThrow(NotImplementedError);
  });
});
