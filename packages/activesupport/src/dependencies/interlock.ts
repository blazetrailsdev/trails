import { ShareLock, type ShareLockThreadInfo } from "../concurrency/share-lock.js";
import type { Thread } from "@blazetrails/ruby-compat";

export class Interlock {
  private lock: ShareLock;

  constructor() {
    this.lock = new ShareLock();
  }

  loading<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.lock.exclusive(
      { purpose: "load", compatible: ["load"], afterCompatible: ["load"] },
      block,
    );
  }

  unloading<T>(block: () => T | Promise<T>): Promise<T | undefined> {
    return this.lock.exclusive(
      { purpose: "unload", compatible: ["load", "unload"], afterCompatible: ["load", "unload"] },
      block,
    );
  }

  startUnloading(): Promise<boolean> {
    return this.lock.startExclusive({ purpose: "unload", compatible: ["load", "unload"] });
  }

  doneUnloading(): Promise<void> {
    return this.lock.stopExclusive({ compatible: ["load", "unload"] });
  }

  startRunning(): Promise<void> {
    return this.lock.startSharing();
  }

  doneRunning(): void {
    this.lock.stopSharing();
  }

  running<T>(block: () => T | Promise<T>): Promise<T> {
    return this.lock.sharing(block);
  }

  permitConcurrentLoads<T>(block: () => T | Promise<T>): Promise<T> {
    return this.lock.yieldShares({ compatible: ["load"] }, block);
  }

  rawState<T>(block: (data: Map<Thread, ShareLockThreadInfo>) => T): T {
    return this.lock.rawState(block);
  }
}
