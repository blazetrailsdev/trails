import { prepend, Process, rbCallSuper } from "@blazetrails/ruby-compat";

export const ForkTracker = {
  CoreExt: {
    _fork(this: object): unknown {
      const pid = rbCallSuper(this, ForkTracker.CoreExt._fork);
      if (pid === 0) {
        ForkTracker.afterForkCallback();
      }
      return pid;
    },
  },

  _pid: Process.pid,
  _callbacks: [] as Array<() => unknown>,

  afterForkCallback(): void {
    const newPid = Process.pid;
    if (ForkTracker._pid !== newPid) {
      ForkTracker._callbacks.forEach((callback) => callback());
      ForkTracker._pid = newPid;
    }
  },

  hookBang(): void {
    prepend({ prototype: Process }, ForkTracker.CoreExt);
  },

  afterFork<T extends () => unknown>(block: T): T {
    ForkTracker._callbacks.push(block);
    return block;
  },

  unregister(callback: () => unknown): unknown {
    const index = ForkTracker._callbacks.indexOf(callback);
    if (index === -1) return null;
    return ForkTracker._callbacks.splice(index, 1)[0];
  },
};

ForkTracker.hookBang();
