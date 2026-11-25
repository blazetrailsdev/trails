import { vi } from "vitest";
import { Reaper } from "../../lib/connection-adapters/abstract/connection-pool/reaper.js";

interface ReaperThread {
  isAlive(): boolean;
  join(): unknown;
}

interface ReaperRegistries {
  pools: Map<number, unknown[]>;
  threads: Map<number, ReaperThread>;
}

const registries = () => Reaper as unknown as ReaperRegistries;

export function snapshotReaperState(): () => Promise<void> {
  const reaper = registries();
  const poolsBefore = new Map(reaper.pools);
  const threadsBefore = new Map(reaper.threads);
  for (const frequency of poolsBefore.keys()) reaper.pools.set(frequency, []);
  reaper.threads.clear();

  return async () => {
    for (const pools of reaper.pools.values()) pools.length = 0;
    for (const [frequency, thread] of [...reaper.threads]) {
      if (!thread.isAlive()) continue;
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(frequency * 1000 + 1);
      await thread.join();
    }
    reaper.threads.clear();
    reaper.pools.clear();
    for (const [frequency, pools] of poolsBefore) reaper.pools.set(frequency, pools);
    for (const [frequency, thread] of threadsBefore) reaper.threads.set(frequency, thread);
  };
}
