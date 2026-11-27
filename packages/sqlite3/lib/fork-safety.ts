import { Process } from "@blazetrails/ruby-compat/process";
import { Thread } from "@blazetrails/ruby-compat/thread";
import { prepend, rbCallSuper } from "@blazetrails/ruby-compat/include";
import { rbSingletonClass } from "@blazetrails/ruby-compat/object";
import { warn } from "@blazetrails/ruby-compat/kernel-warn";
import { SQLite3 } from "./namespaces.js";
import type { Database } from "./database.js";

export const CoreExt = {
  /** @internal */
  _fork(this: object): unknown {
    const pid = rbCallSuper(this, CoreExt._fork);
    if (pid === 0) {
      ForkSafety.discard();
    }
    return pid;
  },
};

export const ForkSafety = {
  CoreExt,

  _databases: [] as WeakRef<Database>[],
  _suppress: false,

  /** @internal */
  hookBang(): void {
    prepend(rbSingletonClass(Process), ForkSafety.CoreExt);
  },

  /** @internal */
  track(database: Database): void {
    ForkSafety._databases.push(new WeakRef(database));
  },

  /** @internal */
  discard(): void {
    let warned = ForkSafety._suppress;
    for (const ref of ForkSafety._databases) {
      const db = ref.deref();
      if (db === undefined) continue;

      if (!(db.isClosed() || db.isReadonly())) {
        if (!warned) {
          warn(
            "Writable sqlite database connection(s) were inherited from a forked process. " +
              "This is unsafe and the connections are being closed to prevent possible data " +
              "corruption. Please close writable sqlite database connections before forking.",
            { uplevel: 0 },
          );
          warned = true;
        }
        const r = db.close();
        if (r instanceof Promise) new Thread(() => r);
      }
    }
    ForkSafety._databases.length = 0;
  },

  suppressWarningsBang(): void {
    ForkSafety._suppress = true;
  },
};

SQLite3.ForkSafety = ForkSafety;

ForkSafety.hookBang();
