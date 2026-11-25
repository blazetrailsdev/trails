import { aryDelete } from "@blazetrails/ruby-compat/array";
import { prepend, rbCallSuper } from "@blazetrails/ruby-compat/include";
import { rbSingletonClass } from "@blazetrails/ruby-compat/object";
import { Process } from "@blazetrails/ruby-compat/process";

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
    prepend(rbSingletonClass(Process), ForkTracker.CoreExt);
  },

  afterFork<T extends () => unknown>(block: T): T {
    ForkTracker._callbacks.push(block);
    return block;
  },

  unregister(callback: () => unknown): unknown {
    return aryDelete(ForkTracker._callbacks, callback) ?? null;
  },
};

ForkTracker.hookBang();
