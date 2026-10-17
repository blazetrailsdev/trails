import { cattrReader } from "../module-ext.js";

export class Parallelization {
  declare static afterForkHooks: Array<() => unknown>;
  declare static runCleanupHooks: Array<() => unknown>;

  static {
    cattrReader.call(this, "afterForkHooks", { default: [] });
    cattrReader.call(this, "runCleanupHooks", { default: [] });
  }

  static afterForkHook(blk: () => unknown): void {
    this.afterForkHooks.push(blk);
  }

  static runCleanupHook(blk: () => unknown): void {
    this.runCleanupHooks.push(blk);
  }
}
