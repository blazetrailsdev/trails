import { describe, expect, it } from "vitest";
import { Errno } from "../lib/errno.js";
import { File } from "../lib/file.js";
import { IO } from "../lib/io.js";
import { Process } from "../lib/process.js";
import { Tempfile } from "../lib/tempfile.js";
import { Thread } from "../lib/thread.js";

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
    expect(Process.lastStatus!.exitstatus()).toBe(127);
  });

  it("answers the IO when no block is given", async () => {
    const out = await IO.popen(["printf", "%s", "x"]);
    expect(new TextDecoder().decode(out.read())).toBe("x");
    expect(Process.lastStatus!.isSuccess()).toBe(true);
  });

  it("merges a leading env hash over the parent's env, keeping PATH", async () => {
    const out = await IO.popen(
      [{ POPEN_TEST: "yes" }, "sh", "-c", 'printf %s "$POPEN_TEST"'],
      (o) => o.read(),
    );
    expect(new TextDecoder().decode(out)).toBe("yes");
  });

  it("keeps $? per thread when two children finish concurrently", async () => {
    const run = (code: number) =>
      new Thread(async () => {
        await IO.popen(["sh", "-c", `sleep 0.0${code}; exit ${code}`], (out) => out.read());
        await new Promise((resolve) => setTimeout(resolve, 50));
        return Process.lastStatus!.exitstatus();
      });
    const [a, b] = [run(1), run(2)];
    expect(await a.value()).toBe(1);
    expect(await b.value()).toBe(2);
  });

  it("writes a w+ block's output to the child's stdin and merges err into out", async () => {
    const path = Tempfile.create("popen").path()!;
    await IO.popen(`cat > ${path}; echo oops >&2`, "w+", { err: "out" }, (io) => {
      io.puts("hello");
    });
    expect(Process.lastStatus!.exitstatus()).toBe(0);
    expect(await File.readAsync(path)).toBe("hello\n");
  });
});
