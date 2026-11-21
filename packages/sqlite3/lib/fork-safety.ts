import { SQLite3 } from "./namespaces.js";
import type { Database } from "./database.js";

export const ForkSafety = {
  _databases: [] as WeakRef<Database>[],
  _suppress: false,

  /** @internal */
  track(database: Database): void {
    ForkSafety._databases.push(new WeakRef(database));
  },

  suppressWarningsBang(): void {
    ForkSafety._suppress = true;
  },
};

SQLite3.ForkSafety = ForkSafety;
