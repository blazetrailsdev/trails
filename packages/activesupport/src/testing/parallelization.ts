import { cattrReader } from "../module-ext.js";

export class Parallelization {
  declare static afterForkHooks: Array<() => unknown>;
  declare static runCleanupHooks: Array<() => unknown>;

  static afterForkHook(blk: () => unknown): void {
    this.afterForkHooks.push(blk);
  }

  static {
    cattrReader.call(this, "afterForkHooks", { default: [] });
  }

  static runCleanupHook(blk: () => unknown): void {
    this.runCleanupHooks.push(blk);
  }

  static {
    cattrReader.call(this, "runCleanupHooks", { default: [] });
  }
}
