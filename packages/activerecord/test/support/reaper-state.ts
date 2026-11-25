import { expect, vi } from "vitest";
import { Reaper } from "../../lib/connection-adapters/abstract/connection-pool/reaper.js";

interface ReaperThread {
  isAlive(): boolean;
  join(): unknown;
  kill(): unknown;
}

interface ReaperRegistries {
  pools: Map<number, unknown[]>;
  threads: Map<number, ReaperThread>;
}

export function snapshotReaperState(): () => Promise<void> {
  const reaper = Reaper as unknown as ReaperRegistries;
  const lengthsBefore = new Map([...reaper.pools].map(([f, pools]) => [f, pools.length]));
  const threadsBefore = new Map(reaper.threads);
  reaper.threads.clear();

  return async () => {
    for (const [frequency, thread] of [...reaper.threads]) {
      const pools = reaper.pools.get(frequency);
      if (lengthsBefore.has(frequency) || !thread.isAlive()) {
        thread.kill();
        continue;
      }
      expect(vi.isFakeTimers() || frequency < 1).toBe(true);
      if (pools) pools.length = 0;
      if (vi.isFakeTimers()) await vi.advanceTimersByTimeAsync(frequency * 1000 + 1);
      await thread.join();
    }
    reaper.threads.clear();
    for (const frequency of [...reaper.pools.keys()]) {
      if (!lengthsBefore.has(frequency)) reaper.pools.delete(frequency);
    }
    for (const [frequency, length] of lengthsBefore) reaper.pools.get(frequency)?.splice(length);
    for (const [frequency, thread] of threadsBefore) reaper.threads.set(frequency, thread);
  };
}
