import { describe, expect, it, vi } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { ForkSupervisor } from "../lib/fork-supervisor.js";

describe("Supervisor#reap_terminated_forks", () => {
  it("fails the claimed jobs of a supervisee stopped by TERM and then killed by QUIT", async () => {
    const supervisor = Object.create(ForkSupervisor.prototype) as {
      processInstances: Record<string, unknown>;
      configuredProcesses: Record<string, unknown>;
      attemptToReleaseClaimedJobsBy(fork: unknown, options: { withError: Error }): Promise<void>;
      reapTerminatedForks(): Promise<void>;
    };
    const thread = new Thread(() => new Promise(() => {}));
    const supervisee = {
      name: "worker-1",
      _thread: thread,
      isStopped: () => true,
      isAlive: () => thread.isAlive(),
      markAsReaped: () => {},
    };
    supervisor.processInstances = { "1": supervisee };
    supervisor.configuredProcesses = {};
    const handleClaimedJobsBy = vi
      .spyOn(supervisor, "attemptToReleaseClaimedJobsBy")
      .mockResolvedValue(undefined);

    thread.kill();
    await supervisor.reapTerminatedForks();

    expect(handleClaimedJobsBy).toHaveBeenCalledTimes(1);
    expect(handleClaimedJobsBy.mock.calls[0][0]).toBe(supervisee);
    expect(handleClaimedJobsBy.mock.calls[0][1].withError.message).toContain(
      "Exited with status 1.",
    );
  });
});
