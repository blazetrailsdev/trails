import { rbModConstSet } from "@blazetrails/ruby-compat";
import { Interlock } from "./dependencies/interlock.js";
import { ActiveSupport } from "./namespaces.js";

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
rbModConstSet(ActiveSupport, "Dependencies", Dependencies);
