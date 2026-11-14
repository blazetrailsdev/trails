import { rbProcCall, type FixedThreadPool } from "@blazetrails/ruby-compat";
import { Entry } from "../entry.js";
import { Record } from "../record.js";
import { SolidCache } from "../solid-cache.js";
import type { StoreHost } from "../store.js";

export const Execution = {
  /** @internal */
  async(this: StoreHost, block: () => unknown): FixedThreadPool {
    const currentShard = Entry.currentShard();
    return this._background.append(async () => {
      try {
        await this.wrapInRailsExecutor(() =>
          this.connections().with(currentShard, () => this.setupInstrumentation(block)),
        );
      } catch (exception) {
        const errorHandler = this.errorHandler;
        if (errorHandler != null) {
          rbProcCall(errorHandler, { method: "async", exception: exception, returning: null });
        }
      }
    });
  },

  /** @internal */
  execute<T>(this: StoreHost, async: boolean, block: () => T): T | Promise<T> | FixedThreadPool {
    if (async) {
      return this.async(block);
    } else {
      return this.setupInstrumentation(block) as T | Promise<T>;
    }
  },

  /** @internal */
  wrapInRailsExecutor<T>(this: StoreHost, block: () => T): T {
    if (SolidCache.executor) {
      return (SolidCache.executor as { wrap<U>(block: () => U): U }).wrap(block);
    } else {
      return block();
    }
  },

  /** @internal */
  isActiveRecordInstrumentation(this: StoreHost): boolean {
    return this.activeRecordInstrumentation;
  },

  /** @internal */
  setupInstrumentation<T>(this: StoreHost, block: () => T): T | Promise<T> {
    if (this.isActiveRecordInstrumentation()) {
      return block();
    } else {
      return Record.disableInstrumentation(block);
    }
  },
};
