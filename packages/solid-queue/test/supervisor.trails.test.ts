import { describe, expect, it, vi } from "vitest";
import { Thread } from "@blazetrails/ruby-compat";
import { Supervisor } from "../lib/supervisor.js";

describe("Supervisor#reap_terminated_forks", () => {
  it("fails the claimed jobs of a supervisee stopped by TERM and then killed by QUIT", async () => {
    const supervisor = Object.create(Supervisor.prototype) as {
      forks: Record<string, unknown>;
      configuredProcesses: Record<string, unknown>;
      handleClaimedJobsBy(fork: unknown, status: { exitstatus: number | null }): Promise<void>;
      reapTerminatedForks(): Promise<void>;
    };
    const thread = new Thread(() => new Promise(() => {}));
    const supervisee = { name: "worker-1", _thread: thread, isStopped: () => true };
    supervisor.forks = { "1": supervisee };
    supervisor.configuredProcesses = {};
    const handleClaimedJobsBy = vi
      .spyOn(supervisor, "handleClaimedJobsBy")
      .mockResolvedValue(undefined);

    thread.kill();
    await supervisor.reapTerminatedForks();

    expect(handleClaimedJobsBy).toHaveBeenCalledTimes(1);
    expect(handleClaimedJobsBy.mock.calls[0][0]).toBe(supervisee);
    expect(handleClaimedJobsBy.mock.calls[0][1].exitstatus).toBe(1);
  });
});
