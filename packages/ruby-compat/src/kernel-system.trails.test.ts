import { afterEach, describe, expect, it } from "vitest";
import {
  childProcessAdapterConfig,
  getChildProcess,
  registerChildProcessAdapter,
} from "./child-process-adapter.js";
import { Dir } from "./dir.js";
import { Errno } from "./errno.js";
import { File } from "./file.js";
import { IO, STDERR, STDOUT } from "./io.js";
import { IOError } from "./io-error.js";
import { FileUtils } from "./file-utils.js";
import { rbFSystem } from "./kernel-system.js";
import { NotImplementedError } from "./not-implemented-error.js";
import { Open3 } from "./open3.js";
import { rbObjDup } from "./include.js";
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
    expect(await rbFSystem("test", "a;b", "=", "a;b")).toBe(true);
    expect(
      await rbFSystem({ TRAILS_SYSTEM_PROBE: "1" }, "sh", "-c", 'test "$TRAILS_SYSTEM_PROBE" = 1'),
    ).toBe(true);
    expect(await rbFSystem("trails-no-such-program", "--version")).toBeNull();
    await expect(rbFSystem("true", null as never)).rejects.toThrow("nil into String");
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

  it("writes the child's stdout to an out: IO.pipe writer", async () => {
    const [r, w] = IO.pipe();
    expect(await rbFSystem("printf", "ok", { out: w })).toBe(true);
    w.close();
    expect(new TextDecoder().decode(r.read() as Uint8Array)).toBe("ok");
  });

  it("drops output once the out: pipe's reader is closed", async () => {
    const [r, w] = IO.pipe();
    r.close();
    expect(await rbFSystem("printf", "ok", { out: w })).toBe(true);
  });

  it("writes the child's stdout to an out: File's descriptor", async () => {
    const path = File.join(Dir.tmpdir(), `trails-kernel-system-io-${Process.pid}.out`);
    const out = File.open(path, "w");
    try {
      expect(await rbFSystem("printf", "ok", { out })).toBe(true);
      out.close();
      expect(File.read(path)).toBe("ok");
    } finally {
      FileUtils.rmF(path);
    }
  });

  it("opens err: on the named file, truncated, for the child's stderr", async () => {
    const err = File.join(Dir.tmpdir(), `trails-kernel-system-${Process.pid}.err`);
    File.write(err, "stale contents longer than the new output");
    try {
      expect(await rbFSystem("printf ok >&2", { err })).toBe(true);
      expect(File.read(err)).toBe("ok");
    } finally {
      FileUtils.rmF(err);
    }
  });

  it("writes the child's stderr to an err: IO.pipe writer", async () => {
    const [r, w] = IO.pipe();
    expect(await rbFSystem("printf out; printf err >&2", { out: "/dev/null", err: w })).toBe(true);
    w.close();
    expect(new TextDecoder().decode(r.read() as Uint8Array)).toBe("err");
  });

  it("sends an inherited child's stdio to a reopened STDOUT and STDERR", async () => {
    const path = File.join(Dir.tmpdir(), `trails-kernel-system-${Process.pid}.both`);
    const file = File.open(path, "w");
    const origStdout = rbObjDup(STDOUT);
    const origStderr = rbObjDup(STDERR);
    try {
      STDOUT.reopen(file);
      STDERR.reopen(file);
      expect(await rbFSystem("printf out; printf err >&2")).toBe(true);
    } finally {
      STDOUT.reopen(origStdout);
      STDERR.reopen(origStderr);
      origStdout.close();
      origStderr.close();
      file.close();
    }
    expect(STDOUT.fileno()).toBe(1);
    expect(File.read(path)).toBe("outerr");
    FileUtils.rmF(path);
  });

  it("raises IOError for a closed out: IO", async () => {
    const [, w] = IO.pipe();
    w.close();
    await expect(rbFSystem("true", { err: w })).rejects.toThrow(IOError);
  });

  it("raises IOError for a closed err: IO", async () => {
    const [, w] = IO.pipe();
    w.close();
    await expect(rbFSystem("true", { out: w })).rejects.toThrow(IOError);
  });

  it("raises NotImplementedError on an adapter that cannot spawn", async () => {
    withoutSpawn();
    await expect(rbFSystem("true")).rejects.toThrow(NotImplementedError);
    await expect(rbFSystem("true")).rejects.toThrow(
      "system() function is unimplemented on this machine",
    );
  });
});

describe("Kernel#system command line", () => {
  it("is nil for a metacharacter-free command line that cannot be exec'd", async () => {
    expect(await rbFSystem("trails-nonexistent-command")).toBeNull();
  });

  it("runs a command line with a metacharacter through /bin/sh -c", async () => {
    expect(await rbFSystem("trails-nonexistent-command 2>/dev/null")).toBe(false);
  });
});

describe("Open3.capture2e", () => {
  it("raises Errno::ENOENT for a metacharacter-free command line that cannot be exec'd", async () => {
    await expect(Open3.capture2e("trails-nonexistent-command")).rejects.toThrow(Errno.ENOENT);
  });

  it("execs a metacharacter-free command line with its space-split argv", async () => {
    const [output, status] = await Open3.capture2e("printf  %s-%s\tx y");
    expect(output).toBe("x-y");
    expect(status.isSuccess()).toBe(true);
  });

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

describe("Open3.capture3", () => {
  it("answers stdout and stderr apart, and a Process::Status", async () => {
    const [stdout, stderr, status] = await Open3.capture3("sh", "-c", "echo out; echo err 1>&2");
    expect(stdout).toBe("out\n");
    expect(stderr).toBe("err\n");
    expect(status).toBeInstanceOf(Process.Status);
    expect(status.isSuccess()).toBe(true);
  });

  it("writes stdin_data to the child's stdin", async () => {
    expect((await Open3.capture3("cat", { stdinData: "piped" }))[0]).toBe("piped");
    expect((await Open3.capture3("cat"))[0]).toBe("");
  });

  it("gives the child only env under unsetenv_others", async () => {
    const [stdout] = await Open3.capture3({ TRAILS_OPEN3_PROBE: "x" }, "/usr/bin/env", {
      unsetenvOthers: true,
    });
    expect(stdout).toContain("TRAILS_OPEN3_PROBE=x\n");
    expect(stdout).not.toMatch(/^HOME=/m);
  });

  it("raises Errno::ENOENT for a missing executable", async () => {
    await expect(Open3.capture3("trails-no-such-program", "--version")).rejects.toBeInstanceOf(
      Errno.ENOENT,
    );
  });
});
