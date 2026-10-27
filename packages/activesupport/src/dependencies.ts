import { Interlock } from "./dependencies/interlock.js";

export const Dependencies = {
  interlock: new Interlock(),

  runInterlock<T>(block: () => T | Promise<T>): Promise<T> {
    return this.interlock.running(block);
  },

  loadInterlock<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.interlock.loading(block);
  },

  unloadInterlock<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.interlock.unloading(block);
  },
};
