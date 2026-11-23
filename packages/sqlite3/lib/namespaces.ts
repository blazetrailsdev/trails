import { TopLevel } from "@blazetrails/ruby-compat";
import type * as Errors from "./errors.js";
import type { Database } from "./database.js";
import type { Pragmas } from "./pragmas.js";
import type { Backup } from "./backup.js";
import type { Blob, Statement } from "./statement.js";
import type { HashResultSet, ResultSet } from "./resultset.js";
import type { Constants } from "./constants.js";
import type { ForkSafety } from "./fork-safety.js";

export type SQLite3Namespace = {
  readonly name: string;
  Database: typeof Database;
  Pragmas: typeof Pragmas;
  Backup: typeof Backup;
  Statement: typeof Statement;
  Blob: typeof Blob;
  ResultSet: typeof ResultSet;
  HashResultSet: typeof HashResultSet;
  Constants: typeof Constants;
  ForkSafety: typeof ForkSafety;
} & {
  -readonly [K in
    | "AbortException"
    | "AuthorizationException"
    | "BusyException"
    | "CantOpenException"
    | "ConstraintException"
    | "CorruptException"
    | "EmptyException"
    | "Exception"
    | "FormatException"
    | "FullException"
    | "InternalException"
    | "InterruptException"
    | "IOException"
    | "LockedException"
    | "MemoryException"
    | "MismatchException"
    | "MisuseException"
    | "NotADatabaseException"
    | "NotFoundException"
    | "PermissionException"
    | "ProtocolException"
    | "RangeException"
    | "ReadOnlyException"
    | "SchemaChangedException"
    | "SQLException"
    | "TooBigException"
    | "UnsupportedException"]: (typeof Errors)[K];
};

export const SQLite3 = { name: "SQLite3" } as SQLite3Namespace;

TopLevel.SQLite3 = SQLite3;

declare module "@blazetrails/ruby-compat" {
  interface TopLevelConstants {
    SQLite3?: typeof SQLite3;
  }
}
