import { Queue, RuntimeError } from "@blazetrails/ruby-compat";
import { include, type Duration } from "@blazetrails/activesupport";
import { AppExecutor } from "../app-executor.js";

interface InterruptibleHost {
  _queue?: Queue<boolean>;
  queue(): Queue<boolean>;
  interrupt(): Promise<void>;
  handleThreadError(error: unknown): void;
}

export const Interruptible = {
  async wakeUp(this: InterruptibleHost): Promise<void> {
    await this.interrupt();
  },

  /** @internal */
  async interrupt(this: InterruptibleHost): Promise<void> {
    await this.queue().push(true);
  },

  /** @internal */
  async interruptibleSleep(this: InterruptibleHost, time: number | Duration): Promise<null> {
    try {
      const timeout = Number(time);
      if ((await this.queue().pop(false, { timeout })) != null) this.queue().clear();
    } catch (e) {
      const wrappedException = new RuntimeError(
        `Interruptible#interruptible_sleep - ${(e as Error).constructor.name}: ${(e as Error).message}`,
      );
      wrappedException.stack = (e as Error).stack;
      this.handleThreadError(wrappedException);
    }

    return null;
  },

  /** @internal */
  queue(this: InterruptibleHost): Queue<boolean> {
    return (this._queue ??= new Queue<boolean>());
  },
};
include(Interruptible, AppExecutor);
