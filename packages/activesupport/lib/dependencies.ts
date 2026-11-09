import type { AnyClass } from "./descendants-tracker.js";
import { Interlock } from "./dependencies/interlock.js";

export const Dependencies = {
  interlock: new Interlock(),

  autoloadPaths: [] as string[],

  autoloadOncePaths: [] as string[],

  _eagerLoadPaths: new Set<string>(),

  _autoloadedTrackedClasses: new Set<AnyClass>(),

  autoloader: null as { reload(): Promise<void>; eagerLoad(): Promise<void> } | null,

  runInterlock<T>(block: () => T | Promise<T>): Promise<T> {
    return this.interlock.running(block);
  },

  loadInterlock<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.interlock.loading(block);
  },

  unloadInterlock<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.interlock.unloading(block);
  },

  /** @inventedArm eagerLoad — PERMANENT */
  async clear(): Promise<void> {
    await this.unloadInterlock(async () => {
      this._autoloadedTrackedClasses.clear();
      await this.autoloader!.reload();
      await this.autoloader!.eagerLoad();
    });
  },

  isEagerLoad(path: string): boolean {
    return this._eagerLoadPaths.has(path);
  },
};
