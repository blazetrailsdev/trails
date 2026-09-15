import { FloatDomainError, NoMethodError } from "@blazetrails/ruby-compat";

import { Exception } from "./errors.js";

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

export interface PragmasHost {
  execute(sql: string): unknown;
}

function toS(value: unknown): string {
  const str = String(value);
  return str.startsWith(":") ? str.slice(1) : str;
}

function toI(value: unknown): number {
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new FloatDomainError(String(value));
    return Math.trunc(value);
  }
  if (value == null) return 0;
  if (typeof value === "string") return parseInt(value, 10) || 0;
  throw new NoMethodError(`undefined method 'to_i' for ${JSON.stringify(value)}`);
}

function setBooleanPragma(this: PragmasHost, name: string, mode: unknown): unknown {
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
        throw new Exception(`unrecognized pragma parameter ${JSON.stringify(mode)}`);
    }
  } else if (mode === true || mode === 1) {
    value = "ON";
  } else if (mode === false || mode === 0 || mode == null) {
    value = "OFF";
  } else {
    throw new Exception(`unrecognized pragma parameter ${JSON.stringify(mode)}`);
  }
  return this.execute(`PRAGMA ${name}=${value}`);
}

function setIntPragma(this: PragmasHost, name: string, value: unknown): unknown {
  return this.execute(`PRAGMA ${name}=${toI(value)}`);
}

function setEnumPragma(
  this: PragmasHost,
  name: string,
  mode: unknown,
  enums: (string | number)[][],
): unknown {
  const match = enums.find((p) => p.find((i) => toS(i).toLowerCase() === toS(mode).toLowerCase()));
  if (!match) {
    throw new Exception(`unrecognized ${name} ${JSON.stringify(mode)}`);
  }
  return this.execute(`PRAGMA ${name}='${toS(match[0]).toUpperCase()}'`);
}

export function setApplicationId(this: PragmasHost, integer: unknown): unknown {
  return setIntPragma.call(this, "application_id", integer);
}

export function setAutoVacuum(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "auto_vacuum", mode, AUTO_VACUUM_MODES);
}

export function setAutomaticIndex(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "automatic_index", mode);
}

export function setBusyTimeout(this: PragmasHost, milliseconds: unknown): unknown {
  return setIntPragma.call(this, "busy_timeout", milliseconds);
}

export function setCacheSize(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "cache_size", size);
}

export function setCacheSpill(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "cache_spill", mode);
}

export function setCaseSensitiveLike(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "case_sensitive_like", mode);
}

export function setCellSizeCheck(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "cell_size_check", mode);
}

export function setCheckpointFullfsync(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "checkpoint_fullfsync", mode);
}

export function setCountChanges(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "count_changes", mode);
}

export function setDefaultCacheSize(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "default_cache_size", size);
}

export function setDefaultSynchronous(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "default_synchronous", mode, SYNCHRONOUS_MODES);
}

export function setDefaultTempStore(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "default_temp_store", mode, TEMP_STORE_MODES);
}

export function setDeferForeignKeys(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "defer_foreign_keys", mode);
}

export function setEncoding(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "encoding", mode, ENCODINGS);
}

export function setForeignKeys(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "foreign_keys", mode);
}

export function setFullColumnNames(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "full_column_names", mode);
}

export function setFullfsync(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "fullfsync", mode);
}

export function setIgnoreCheckConstraints(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "ignore_check_constraints", mode);
}

export function setJournalMode(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "journal_mode", mode, JOURNAL_MODES);
}

export function setJournalSizeLimit(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "journal_size_limit", size);
}

export function setLegacyFileFormat(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "legacy_file_format", mode);
}

export function setLockingMode(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "locking_mode", mode, LOCKING_MODES);
}

export function setMaxPageCount(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "max_page_count", size);
}

export function setMmapSize(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "mmap_size", size);
}

export function setPageSize(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "page_size", size);
}

export function setParserTrace(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "parser_trace", mode);
}

export function setQueryOnly(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "query_only", mode);
}

export function setReadUncommitted(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "read_uncommitted", mode);
}

export function setRecursiveTriggers(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "recursive_triggers", mode);
}

export function setReverseUnorderedSelects(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "reverse_unordered_selects", mode);
}

export function setSchemaCookie(this: PragmasHost, cookie: unknown): unknown {
  return setIntPragma.call(this, "schema_cookie", cookie);
}

export function setSchemaVersion(this: PragmasHost, version: unknown): unknown {
  return setIntPragma.call(this, "schema_version", version);
}

export function setSecureDelete(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "secure_delete", mode);
}

export function setShortColumnNames(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "short_column_names", mode);
}

export function setSoftHeapLimit(this: PragmasHost, mode: unknown): unknown {
  return setIntPragma.call(this, "soft_heap_limit", mode);
}

export function setSynchronous(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "synchronous", mode, SYNCHRONOUS_MODES);
}

export function setTempStore(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "temp_store", mode, TEMP_STORE_MODES);
}

export function setThreads(this: PragmasHost, count: unknown): unknown {
  return setIntPragma.call(this, "threads", count);
}

export function setUserCookie(this: PragmasHost, cookie: unknown): unknown {
  return setIntPragma.call(this, "user_cookie", cookie);
}

export function setUserVersion(this: PragmasHost, version: unknown): unknown {
  return setIntPragma.call(this, "user_version", version);
}

export function setVdbeAddoptrace(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "vdbe_addoptrace", mode);
}

export function setVdbeDebug(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "vdbe_debug", mode);
}

export function setVdbeListing(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "vdbe_listing", mode);
}

export function setVdbeTrace(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "vdbe_trace", mode);
}

export function setWalAutocheckpoint(this: PragmasHost, mode: unknown): unknown {
  return setIntPragma.call(this, "wal_autocheckpoint", mode);
}

export function setWalCheckpoint(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "wal_checkpoint", mode, WAL_CHECKPOINTS);
}

export function setWritableSchema(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "writable_schema", mode);
}

export const Pragmas = {
  setApplicationId,
  setAutoVacuum,
  setAutomaticIndex,
  setBusyTimeout,
  setCacheSize,
  setCacheSpill,
  setCaseSensitiveLike,
  setCellSizeCheck,
  setCheckpointFullfsync,
  setCountChanges,
  setDefaultCacheSize,
  setDefaultSynchronous,
  setDefaultTempStore,
  setDeferForeignKeys,
  setEncoding,
  setForeignKeys,
  setFullColumnNames,
  setFullfsync,
  setIgnoreCheckConstraints,
  setJournalMode,
  setJournalSizeLimit,
  setLegacyFileFormat,
  setLockingMode,
  setMaxPageCount,
  setMmapSize,
  setPageSize,
  setParserTrace,
  setQueryOnly,
  setReadUncommitted,
  setRecursiveTriggers,
  setReverseUnorderedSelects,
  setSchemaCookie,
  setSchemaVersion,
  setSecureDelete,
  setShortColumnNames,
  setSoftHeapLimit,
  setSynchronous,
  setTempStore,
  setThreads,
  setUserCookie,
  setUserVersion,
  setVdbeAddoptrace,
  setVdbeDebug,
  setVdbeListing,
  setVdbeTrace,
  setWalAutocheckpoint,
  setWalCheckpoint,
  setWritableSchema,
};
