import { describe, expect, it } from "vitest";
import { Errno } from "./errno.js";
import { IO } from "./io.js";
import { Process } from "./process.js";
import { Tempfile } from "./tempfile.js";

describe("IO.popen", () => {
  it("yields the child's stdout and answers the block's value", async () => {
    const value = await IO.popen(["printf", "%s", "hello"], (out) => out.read());
    expect(new TextDecoder().decode(value)).toBe("hello");
    expect(Process.lastStatus!.isSuccess()).toBe(true);
    expect(Process.lastStatus!.exitstatus()).toBe(0);
  });

  it("runs argv with no shell", async () => {
    const value = await IO.popen(["echo", "$HOME"], (out) => out.read());
    expect(new TextDecoder().decode(value)).toBe("$HOME\n");
  });

  it("sets $? to a non-zero exit and redirects err: to an IO", async () => {
    const err = Tempfile.create("popen");
    try {
      await IO.popen(["sh", "-c", "echo oops >&2; exit 3"], { err }, (out) => out.read());
      expect(Process.lastStatus!.isSuccess()).toBe(false);
      expect(Process.lastStatus!.exitstatus()).toBe(3);
      err.rewind();
      expect(err.read()).toBe("oops\n");
    } finally {
      err.close();
    }
  });

  it("raises Errno::ENOENT for a missing executable", async () => {
    await expect(
      IO.popen(["trails-no-such-binary-xyz"], (out) => out.read()),
    ).rejects.toBeInstanceOf(Errno.ENOENT);
  });
});
