import { rbProcCall } from "@blazetrails/ruby-compat";
import { Entry } from "../entry.js";
import { Record } from "../record.js";
import { SolidCache } from "../solid-cache.js";
import type { StoreHost } from "../store.js";

export const Execution = {
  /** @internal */
  async(this: StoreHost, block: () => unknown): void {
    const currentShard = Entry.currentShard();
    this._background.append(async () => {
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
  execute<T>(this: StoreHost, async: boolean, block: () => T): T | Promise<T> | undefined {
    if (async) {
      this.async(block);
      return undefined;
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
