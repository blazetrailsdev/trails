import { Process, prepend, rbCallSuper, rbSingletonClass, warn } from "@blazetrails/ruby-compat";
import { SQLite3 } from "./namespaces.js";
import type { Database } from "./database.js";

export const CoreExt = {
  /** @internal */
  _fork(this: object): unknown {
    const pid = rbCallSuper(this, CoreExt._fork);
    if (pid === 0) {
      const r = ForkSafety.discard();
      if (r instanceof Promise) return r.then(() => pid);
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
  discard(): void | Promise<void> {
    let warned = ForkSafety._suppress;
    const closing: Promise<unknown>[] = [];
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
        if (r instanceof Promise) closing.push(r);
      }
    }
    ForkSafety._databases.length = 0;
    if (closing.length !== 0) return Promise.all(closing).then(() => {});
  },

  suppressWarningsBang(): void {
    ForkSafety._suppress = true;
  },
};

SQLite3.ForkSafety = ForkSafety;

ForkSafety.hookBang();
