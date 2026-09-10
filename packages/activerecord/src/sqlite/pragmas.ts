import { NoMethodError } from "@blazetrails/ruby-compat";

class SQLite3Exception extends Error {
  constructor(message: string) {
    super(message);
    this.name = "SQLite3::Exception";
  }
}

export const SYNCHRONOUS_MODES: (string | number)[][] = [
  ["full", 2],
  ["normal", 1],
  ["off", 0],
];

export const TEMP_STORE_MODES: (string | number)[][] = [
  ["default", 0],
  ["file", 1],
  ["memory", 2],
];

export const AUTO_VACUUM_MODES: (string | number)[][] = [
  ["none", 0],
  ["full", 1],
  ["incremental", 2],
];

export const JOURNAL_MODES: (string | number)[][] = [
  ["delete"],
  ["truncate"],
  ["persist"],
  ["memory"],
  ["wal"],
  ["off"],
];

export const LOCKING_MODES: (string | number)[][] = [["normal"], ["exclusive"]];

export const ENCODINGS: (string | number)[][] = [["utf-8"], ["utf-16"], ["utf-16le"], ["utf-16be"]];

export const WAL_CHECKPOINTS: (string | number)[][] = [
  ["passive"],
  ["full"],
  ["restart"],
  ["truncate"],
];

const BOOLEAN_PRAGMAS = [
  "automatic_index",
  "cache_spill",
  "case_sensitive_like",
  "cell_size_check",
  "checkpoint_fullfsync",
  "count_changes",
  "defer_foreign_keys",
  "foreign_keys",
  "full_column_names",
  "fullfsync",
  "ignore_check_constraints",
  "legacy_file_format",
  "parser_trace",
  "query_only",
  "read_uncommitted",
  "recursive_triggers",
  "reverse_unordered_selects",
  "secure_delete",
  "short_column_names",
  "vdbe_addoptrace",
  "vdbe_debug",
  "vdbe_listing",
  "vdbe_trace",
  "writable_schema",
];

const INT_PRAGMAS = [
  "application_id",
  "busy_timeout",
  "cache_size",
  "default_cache_size",
  "journal_size_limit",
  "max_page_count",
  "mmap_size",
  "page_size",
  "schema_cookie",
  "schema_version",
  "soft_heap_limit",
  "threads",
  "user_cookie",
  "user_version",
  "wal_autocheckpoint",
];

const ENUM_PRAGMAS: Record<string, (string | number)[][]> = {
  auto_vacuum: AUTO_VACUUM_MODES,
  default_synchronous: SYNCHRONOUS_MODES,
  default_temp_store: TEMP_STORE_MODES,
  encoding: ENCODINGS,
  journal_mode: JOURNAL_MODES,
  locking_mode: LOCKING_MODES,
  synchronous: SYNCHRONOUS_MODES,
  temp_store: TEMP_STORE_MODES,
  wal_checkpoint: WAL_CHECKPOINTS,
};

export const PRAGMA_SETTERS: ReadonlySet<string> = new Set([
  ...BOOLEAN_PRAGMAS,
  ...INT_PRAGMAS,
  ...Object.keys(ENUM_PRAGMAS),
]);

function toS(value: unknown): string {
  const str = String(value);
  return str.startsWith(":") ? str.slice(1) : str;
}

function toI(value: unknown): number {
  if (typeof value === "number") return Math.trunc(value);
  if (value == null) return 0;
  if (typeof value === "string") return parseInt(value, 10) || 0;
  throw new NoMethodError(`undefined method 'to_i' for ${JSON.stringify(value)}`);
}

function setBooleanPragma(name: string, mode: unknown): string {
  let value: string;
  if (typeof mode === "string") {
    switch (mode.toLowerCase()) {
      case "on":
      case "yes":
      case "true":
      case "y":
      case "t":
        value = "'ON'";
        break;
      case "off":
      case "no":
      case "false":
      case "n":
      case "f":
        value = "'OFF'";
        break;
      default:
        throw new SQLite3Exception(`unrecognized pragma parameter ${JSON.stringify(mode)}`);
    }
  } else if (mode === true || mode === 1) {
    value = "ON";
  } else if (mode === false || mode === 0 || mode == null) {
    value = "OFF";
  } else {
    throw new SQLite3Exception(`unrecognized pragma parameter ${JSON.stringify(mode)}`);
  }
  return `${name}=${value}`;
}

function setIntPragma(name: string, value: unknown): string {
  return `${name}=${toI(value)}`;
}

function setEnumPragma(name: string, mode: unknown, enums: (string | number)[][]): string {
  const match = enums.find((p) => p.find((i) => toS(i).toLowerCase() === toS(mode).toLowerCase()));
  if (!match) {
    throw new SQLite3Exception(`unrecognized ${name} ${JSON.stringify(mode)}`);
  }
  return `${name}='${toS(match[0]).toUpperCase()}'`;
}

/** @noRailsEquivalent PERMANENT */
export function setPragma(name: string, value: unknown): string {
  const enums = ENUM_PRAGMAS[name];
  if (enums) return setEnumPragma(name, value, enums);
  if (INT_PRAGMAS.includes(name)) return setIntPragma(name, value);
  return setBooleanPragma(name, value);
}
