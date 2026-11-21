import { describe, expect, it, vi } from "vitest";
import { Errno } from "../lib/errno.js";
import { STDERR } from "../lib/io.js";
import { rbFBackquote } from "../lib/kernel-system.js";

describe("Kernel#`", () => {
  it("answers the command's standard output", async () => {
    expect(await rbFBackquote("echo hello")).toBe("hello\n");
  });

  it("passes the command's standard error through to $stderr", async () => {
    const write = vi.spyOn(STDERR, "write").mockImplementation(() => 0);
    try {
      expect(await rbFBackquote("echo out; echo err >&2")).toBe("out\n");
      expect(write).toHaveBeenCalledWith("err\n");
    } finally {
      write.mockRestore();
    }
  });

  it("answers a shell command that exits 127", async () => {
    expect(await rbFBackquote("echo out; exit 127")).toBe("out\n");
  });

  it("hands an assignment prefix and a shell builtin to the shell", async () => {
    expect(await rbFBackquote("FOO=1 true")).toBe("");
    expect(await rbFBackquote("exit 0")).toBe("");
  });

  it("raises Errno::ENOENT for a command that does not exist", async () => {
    await expect(rbFBackquote("no-such-command-trails --version")).rejects.toBeInstanceOf(
      Errno.ENOENT,
    );
  });
});
