import { Thread } from "@blazetrails/ruby-compat";
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

  createThread<R>(
    this: { name: string; handleThreadError(error: unknown): void },
    block: () => R,
  ): Thread<Promise<R>> {
    return new Thread(async () => {
      Thread.current().name = this.name;
      try {
        return await block();
      } catch (exception) {
        this.handleThreadError(exception);
        throw exception;
      }
    });
  },
};
