import { SolidQueue } from "./solid-queue.js";

export const AppExecutor = {
  wrapInAppExecutor<T>(block: () => T): T {
    if (SolidQueue.appExecutor) {
      return SolidQueue.appExecutor.wrap(block, { source: "application.solid_queue" });
    } else {
      return block();
    }
  },

  handleThreadError(error: unknown): void {
    SolidQueue.instrument("thread_error", { error: error });

    if (SolidQueue.onThreadError) {
      SolidQueue.onThreadError.call(undefined, error);
    }
  },
};
