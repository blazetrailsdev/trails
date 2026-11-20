import { SQLite3 } from "./namespaces.js";

export const ForkSafety = {
  _suppress: false,

  suppressWarningsBang(): void {
    ForkSafety._suppress = true;
  },
};

SQLite3.ForkSafety = ForkSafety;
