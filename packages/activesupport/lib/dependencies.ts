import type { AnyClass } from "./descendants-tracker.js";
import { Interlock } from "./dependencies/interlock.js";

export class Dependencies {
  static interlock: Interlock = new Interlock();

  static runInterlock<T>(block: () => T | Promise<T>): Promise<T> {
    return this.interlock.running(block);
  }

  static loadInterlock<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.interlock.loading(block);
  }

  static unloadInterlock<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.interlock.unloading(block);
  }

  static autoloadPaths: string[] = [];

  static autoloadOncePaths: string[] = [];

  static _eagerLoadPaths: Set<string> = new Set();

  static _autoloadedTrackedClasses: Set<AnyClass> = new Set();

  static autoloader: { reload(): Promise<void>; eagerLoad(): Promise<void> } | null = null;

  /** @inventedArm eagerLoad — PERMANENT */
  static async clear(): Promise<void> {
    await this.unloadInterlock(async () => {
      this._autoloadedTrackedClasses.clear();
      await this.autoloader!.reload();
      await this.autoloader!.eagerLoad();
    });
  }

  static isEagerLoad(path: string): boolean {
    return this._eagerLoadPaths.has(path);
  }
}
