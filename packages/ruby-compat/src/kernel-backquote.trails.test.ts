import { describe, expect, it } from "vitest";
import { Errno } from "./errno.js";
import { rbFBackquote } from "./kernel-system.js";

describe("Kernel#`", () => {
  it("answers the command's standard output", async () => {
    expect(await rbFBackquote("echo hello")).toBe("hello\n");
  });

  it("raises Errno::ENOENT for a command that does not exist", async () => {
    await expect(rbFBackquote("no-such-command-trails --version")).rejects.toBeInstanceOf(
      Errno.ENOENT,
    );
  });
});
