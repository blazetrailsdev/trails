import { Interlock } from "./dependencies/interlock.js";

export const Dependencies = {
  interlock: new Interlock(),

  autoloadPaths: [] as string[],

  autoloadOncePaths: [] as string[],

  _eagerLoadPaths: new Set<string>(),

  _autoloadedTrackedClasses: new Set<unknown>(),

  autoloader: null as unknown,

  runInterlock<T>(block: () => T | Promise<T>): Promise<T> {
    return this.interlock.running(block);
  },

  loadInterlock<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.interlock.loading(block);
  },

  unloadInterlock<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.interlock.unloading(block);
  },

  isEagerLoad(path: string): boolean {
    return this._eagerLoadPaths.has(path);
  },
};
