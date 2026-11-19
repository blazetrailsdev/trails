import { Process } from "@blazetrails/ruby-compat";

const sleep = (seconds: number) => new Promise((resolve) => setTimeout(resolve, seconds * 1000));

export const Timer = {
  async waitUntil(timeout: number, condition: () => boolean, block?: () => unknown): Promise<void> {
    if (timeout > 0) {
      const deadline = Timer.monotonicTimeNow() + timeout;

      while (Timer.monotonicTimeNow() < deadline && !condition()) {
        await sleep(0.1);
        if (block) await block();
      }
    } else {
      while (!condition()) {
        await sleep(0.5);
        if (block) await block();
      }
    }
  },

  /** @internal */
  monotonicTimeNow(): number {
    return Process.clockGettime(Process.CLOCK_MONOTONIC);
  },
};
