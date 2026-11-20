import { describe, expect, it } from "vitest";
import { Errno, IO, Process, rbFFork } from "../lib/index.js";

const entry = `${import.meta.dirname}/fixtures/fork-child.mjs`;

async function waitpid2(): Promise<[number, InstanceType<typeof Process.Status>]> {
  for (;;) {
    const waited = Process.waitpid2(-1, Process.WNOHANG);
    if (waited !== null) return waited;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
}

describe("Kernel#fork", () => {
  it("runs the entry in a child that writes to an inherited pipe and is reaped by waitpid2", async () => {
    const [reader, writer] = IO.pipe();
    const pid = rbFFork(entry, { exitstatus: 3 }, [writer]);
    writer.close();

    expect(pid).not.toEqual(Process.pid);
    expect(await reader.readAsync()).toEqual(new TextEncoder().encode("."));

    const [waitedPid, status] = await waitpid2();
    expect(waitedPid).toEqual(pid);
    expect(status.isExited()).toBe(true);
    expect(status.exitstatus()).toEqual(3);
    expect(Process.lastStatus).toBe(status);
    expect(() => Process.waitpid2(-1, Process.WNOHANG)).toThrow(Errno.ECHILD);
  });

  it("reports a child killed by a signal", async () => {
    const pid = rbFFork(entry, { exitstatus: 0 });
    Process.kill("KILL", pid);

    const [, status] = await waitpid2();
    expect(status.isExited()).toBe(false);
    expect(status.isSignaled()).toBe(true);
    expect(status.termsig()).toEqual("SIGKILL");
  });
});
