import type { AnyClass } from "./descendants-tracker.js";
import { Interlock } from "./dependencies/interlock.js";

export const Dependencies = {
  interlock: undefined as unknown as Interlock,

  autoloadPaths: undefined as unknown as string[],

  autoloadOncePaths: undefined as unknown as string[],

  _eagerLoadPaths: undefined as unknown as Set<string>,

  _autoloadedTrackedClasses: undefined as unknown as Set<AnyClass>,

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

Dependencies.interlock = new Interlock();
Dependencies.autoloadPaths = [];
Dependencies.autoloadOncePaths = [];
Dependencies._eagerLoadPaths = new Set();
Dependencies._autoloadedTrackedClasses = new Set();
