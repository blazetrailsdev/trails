import { ArgumentError } from "@blazetrails/ruby-compat";

export const SYNCHRONOUS_MODES: string[][] = [
  ["full", "2"],
  ["normal", "1"],
  ["off", "0"],
];

export const TEMP_STORE_MODES: string[][] = [
  ["default", "0"],
  ["file", "1"],
  ["memory", "2"],
];

export const AUTO_VACUUM_MODES: string[][] = [
  ["none", "0"],
  ["full", "1"],
  ["incremental", "2"],
];

export const JOURNAL_MODES: string[][] = [
  ["delete"],
  ["truncate"],
  ["persist"],
  ["memory"],
  ["wal"],
  ["off"],
];

export const LOCKING_MODES: string[][] = [["normal"], ["exclusive"]];

export const ENCODINGS: string[][] = [["utf-8"], ["utf-16"], ["utf-16le"], ["utf-16be"]];

export const WAL_CHECKPOINTS: string[][] = [["passive"], ["full"], ["restart"], ["truncate"]];

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

const ENUM_PRAGMAS: Record<string, string[][]> = {
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

function setBooleanPragma(name: string, mode: unknown): string {
  let value: string;
  if (typeof mode === "string") {
    switch (toS(mode).toLowerCase()) {
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
        throw new ArgumentError(`unrecognized pragma parameter ${JSON.stringify(mode)}`);
    }
  } else if (mode === true || mode === 1) {
    value = "ON";
  } else if (mode === false || mode === 0 || mode == null) {
    value = "OFF";
  } else {
    throw new ArgumentError(`unrecognized pragma parameter ${JSON.stringify(mode)}`);
  }
  return `${name}=${value}`;
}

function setIntPragma(name: string, value: unknown): string {
  return `${name}=${parseInt(String(value), 10) || 0}`;
}

function setEnumPragma(name: string, mode: unknown, enums: string[][]): string {
  const match = enums.find((p) => p.find((i) => i.toLowerCase() === toS(mode).toLowerCase()));
  if (!match) {
    throw new ArgumentError(`unrecognized ${name} ${JSON.stringify(mode)}`);
  }
  return `${name}='${match[0].toUpperCase()}'`;
}

/** @noRailsEquivalent PERMANENT */
export function setPragma(name: string, value: unknown): string {
  const enums = ENUM_PRAGMAS[name];
  if (enums) return setEnumPragma(name, value, enums);
  if (INT_PRAGMAS.includes(name)) return setIntPragma(name, value);
  return setBooleanPragma(name, value);
}
