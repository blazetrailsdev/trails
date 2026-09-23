import { FloatDomainError, NoMethodError } from "@blazetrails/ruby-compat";

import type { SqliteBinds } from "../sqlite-adapter.js";
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
  execute(sql: string, bindVars?: SqliteBinds, block?: (row: unknown) => void): unknown;
  getFirstValue(sql: string): unknown;
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

export async function getBooleanPragma(this: PragmasHost, name: string): Promise<boolean> {
  return (await this.getFirstValue(`PRAGMA ${name}`)) !== 0;
}

export function setBooleanPragma(this: PragmasHost, name: string, mode: unknown): unknown {
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

export function getQueryPragma(this: PragmasHost, name: string, ...params: unknown[]): unknown {
  const block =
    params.length > 0 &&
    (params[params.length - 1] === undefined || typeof params[params.length - 1] === "function")
      ? (params.pop() as ((row: unknown) => void) | undefined)
      : undefined;
  if (params.length === 0) {
    return this.execute(`PRAGMA ${name}`, [], block);
  } else {
    const args = "'" + params.join("','") + "'";
    return this.execute(`PRAGMA ${name}( ${args} )`, [], block);
  }
}

export function getEnumPragma(this: PragmasHost, name: string): unknown {
  return this.getFirstValue(`PRAGMA ${name}`);
}

export function setEnumPragma(
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

export async function getIntPragma(this: PragmasHost, name: string): Promise<number> {
  return toI(await this.getFirstValue(`PRAGMA ${name}`));
}

export function setIntPragma(this: PragmasHost, name: string, value: unknown): unknown {
  return this.execute(`PRAGMA ${name}=${toI(value)}`);
}

export function applicationId(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "application_id");
}

export function setApplicationId(this: PragmasHost, integer: unknown): unknown {
  return setIntPragma.call(this, "application_id", integer);
}

export function autoVacuum(this: PragmasHost): unknown {
  return getEnumPragma.call(this, "auto_vacuum");
}

export function setAutoVacuum(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "auto_vacuum", mode, AUTO_VACUUM_MODES);
}

export function automaticIndex(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "automatic_index");
}

export function setAutomaticIndex(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "automatic_index", mode);
}

export function busyTimeout(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "busy_timeout");
}

export function setBusyTimeout(this: PragmasHost, milliseconds: unknown): unknown {
  return setIntPragma.call(this, "busy_timeout", milliseconds);
}

export function cacheSize(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "cache_size");
}

export function setCacheSize(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "cache_size", size);
}

export function cacheSpill(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "cache_spill");
}

export function setCacheSpill(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "cache_spill", mode);
}

export function setCaseSensitiveLike(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "case_sensitive_like", mode);
}

export function cellSizeCheck(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "cell_size_check");
}

export function setCellSizeCheck(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "cell_size_check", mode);
}

export function checkpointFullfsync(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "checkpoint_fullfsync");
}

export function setCheckpointFullfsync(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "checkpoint_fullfsync", mode);
}

export function collationList(this: PragmasHost, block?: (row: unknown) => void): unknown {
  return getQueryPragma.call(this, "collation_list", block);
}

export function compileOptions(this: PragmasHost, block?: (row: unknown) => void): unknown {
  return getQueryPragma.call(this, "compile_options", block);
}

export function countChanges(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "count_changes");
}

export function setCountChanges(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "count_changes", mode);
}

export function dataVersion(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "data_version");
}

export function databaseList(this: PragmasHost, block?: (row: unknown) => void): unknown {
  return getQueryPragma.call(this, "database_list", block);
}

export function defaultCacheSize(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "default_cache_size");
}

export function setDefaultCacheSize(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "default_cache_size", size);
}

export function defaultSynchronous(this: PragmasHost): unknown {
  return getEnumPragma.call(this, "default_synchronous");
}

export function setDefaultSynchronous(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "default_synchronous", mode, SYNCHRONOUS_MODES);
}

export function defaultTempStore(this: PragmasHost): unknown {
  return getEnumPragma.call(this, "default_temp_store");
}

export function setDefaultTempStore(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "default_temp_store", mode, TEMP_STORE_MODES);
}

export function deferForeignKeys(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "defer_foreign_keys");
}

export function setDeferForeignKeys(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "defer_foreign_keys", mode);
}

export function encoding(this: PragmasHost): unknown {
  return getEnumPragma.call(this, "encoding");
}

export function setEncoding(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "encoding", mode, ENCODINGS);
}

export function foreignKeyCheck(this: PragmasHost, ...table: unknown[]): unknown {
  return getQueryPragma.call(this, "foreign_key_check", ...table);
}

export function foreignKeyList(
  this: PragmasHost,
  table: unknown,
  block?: (row: unknown) => void,
): unknown {
  return getQueryPragma.call(this, "foreign_key_list", table, block);
}

export function foreignKeys(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "foreign_keys");
}

export function setForeignKeys(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "foreign_keys", mode);
}

export function freelistCount(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "freelist_count");
}

export function fullColumnNames(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "full_column_names");
}

export function setFullColumnNames(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "full_column_names", mode);
}

export function fullfsync(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "fullfsync");
}

export function setFullfsync(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "fullfsync", mode);
}

export function setIgnoreCheckConstraints(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "ignore_check_constraints", mode);
}

export function incrementalVacuum(
  this: PragmasHost,
  pages: unknown,
  block?: (row: unknown) => void,
): unknown {
  return getQueryPragma.call(this, "incremental_vacuum", pages, block);
}

export function indexInfo(
  this: PragmasHost,
  index: unknown,
  block?: (row: unknown) => void,
): unknown {
  return getQueryPragma.call(this, "index_info", index, block);
}

export function indexList(
  this: PragmasHost,
  table: unknown,
  block?: (row: unknown) => void,
): unknown {
  return getQueryPragma.call(this, "index_list", table, block);
}

export function indexXinfo(
  this: PragmasHost,
  index: unknown,
  block?: (row: unknown) => void,
): unknown {
  return getQueryPragma.call(this, "index_xinfo", index, block);
}

export function integrityCheck(this: PragmasHost, ...numErrors: unknown[]): unknown {
  return getQueryPragma.call(this, "integrity_check", ...numErrors);
}

export function journalMode(this: PragmasHost): unknown {
  return getEnumPragma.call(this, "journal_mode");
}

export function setJournalMode(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "journal_mode", mode, JOURNAL_MODES);
}

export function journalSizeLimit(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "journal_size_limit");
}

export function setJournalSizeLimit(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "journal_size_limit", size);
}

export function legacyFileFormat(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "legacy_file_format");
}

export function setLegacyFileFormat(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "legacy_file_format", mode);
}

export function lockingMode(this: PragmasHost): unknown {
  return getEnumPragma.call(this, "locking_mode");
}

export function setLockingMode(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "locking_mode", mode, LOCKING_MODES);
}

export function maxPageCount(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "max_page_count");
}

export function setMaxPageCount(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "max_page_count", size);
}

export function mmapSize(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "mmap_size");
}

export function setMmapSize(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "mmap_size", size);
}

export function optimize(this: PragmasHost, bitmask: unknown = null): unknown {
  if (bitmask != null && bitmask !== false) {
    return setIntPragma.call(this, "optimize", bitmask);
  } else {
    return this.execute("PRAGMA optimize");
  }
}

export function pageCount(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "page_count");
}

export function pageSize(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "page_size");
}

export function setPageSize(this: PragmasHost, size: unknown): unknown {
  return setIntPragma.call(this, "page_size", size);
}

export function setParserTrace(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "parser_trace", mode);
}

export function queryOnly(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "query_only");
}

export function setQueryOnly(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "query_only", mode);
}

export function quickCheck(this: PragmasHost, ...numErrors: unknown[]): unknown {
  return getQueryPragma.call(this, "quick_check", ...numErrors);
}

export function readUncommitted(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "read_uncommitted");
}

export function setReadUncommitted(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "read_uncommitted", mode);
}

export function recursiveTriggers(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "recursive_triggers");
}

export function setRecursiveTriggers(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "recursive_triggers", mode);
}

export function reverseUnorderedSelects(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "reverse_unordered_selects");
}

export function setReverseUnorderedSelects(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "reverse_unordered_selects", mode);
}

export function schemaCookie(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "schema_cookie");
}

export function setSchemaCookie(this: PragmasHost, cookie: unknown): unknown {
  return setIntPragma.call(this, "schema_cookie", cookie);
}

export function schemaVersion(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "schema_version");
}

export function setSchemaVersion(this: PragmasHost, version: unknown): unknown {
  return setIntPragma.call(this, "schema_version", version);
}

export function secureDelete(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "secure_delete");
}

export function setSecureDelete(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "secure_delete", mode);
}

export function shortColumnNames(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "short_column_names");
}

export function setShortColumnNames(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "short_column_names", mode);
}

export function shrinkMemory(this: PragmasHost): unknown {
  return this.execute("PRAGMA shrink_memory");
}

export function softHeapLimit(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "soft_heap_limit");
}

export function setSoftHeapLimit(this: PragmasHost, mode: unknown): unknown {
  return setIntPragma.call(this, "soft_heap_limit", mode);
}

export function stats(this: PragmasHost, block?: (row: unknown) => void): unknown {
  return getQueryPragma.call(this, "stats", block);
}

export function synchronous(this: PragmasHost): unknown {
  return getEnumPragma.call(this, "synchronous");
}

export function setSynchronous(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "synchronous", mode, SYNCHRONOUS_MODES);
}

export function tempStore(this: PragmasHost): unknown {
  return getEnumPragma.call(this, "temp_store");
}

export function setTempStore(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "temp_store", mode, TEMP_STORE_MODES);
}

export function threads(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "threads");
}

export function setThreads(this: PragmasHost, count: unknown): unknown {
  return setIntPragma.call(this, "threads", count);
}

export function userCookie(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "user_cookie");
}

export function setUserCookie(this: PragmasHost, cookie: unknown): unknown {
  return setIntPragma.call(this, "user_cookie", cookie);
}

export function userVersion(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "user_version");
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

export function vdbeTrace(this: PragmasHost): Promise<boolean> {
  return getBooleanPragma.call(this, "vdbe_trace");
}

export function setVdbeTrace(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "vdbe_trace", mode);
}

export function walAutocheckpoint(this: PragmasHost): Promise<number> {
  return getIntPragma.call(this, "wal_autocheckpoint");
}

export function setWalAutocheckpoint(this: PragmasHost, mode: unknown): unknown {
  return setIntPragma.call(this, "wal_autocheckpoint", mode);
}

export function walCheckpoint(this: PragmasHost): unknown {
  return getEnumPragma.call(this, "wal_checkpoint");
}

export function setWalCheckpoint(this: PragmasHost, mode: unknown): unknown {
  return setEnumPragma.call(this, "wal_checkpoint", mode, WAL_CHECKPOINTS);
}

export function setWritableSchema(this: PragmasHost, mode: unknown): unknown {
  return setBooleanPragma.call(this, "writable_schema", mode);
}

export const Pragmas = {
  getBooleanPragma,
  setBooleanPragma,
  getQueryPragma,
  getEnumPragma,
  setEnumPragma,
  getIntPragma,
  setIntPragma,
  applicationId,
  setApplicationId,
  autoVacuum,
  setAutoVacuum,
  automaticIndex,
  setAutomaticIndex,
  busyTimeout,
  setBusyTimeout,
  cacheSize,
  setCacheSize,
  cacheSpill,
  setCacheSpill,
  setCaseSensitiveLike,
  cellSizeCheck,
  setCellSizeCheck,
  checkpointFullfsync,
  setCheckpointFullfsync,
  collationList,
  compileOptions,
  countChanges,
  setCountChanges,
  dataVersion,
  databaseList,
  defaultCacheSize,
  setDefaultCacheSize,
  defaultSynchronous,
  setDefaultSynchronous,
  defaultTempStore,
  setDefaultTempStore,
  deferForeignKeys,
  setDeferForeignKeys,
  encoding,
  setEncoding,
  foreignKeyCheck,
  foreignKeyList,
  foreignKeys,
  setForeignKeys,
  freelistCount,
  fullColumnNames,
  setFullColumnNames,
  fullfsync,
  setFullfsync,
  setIgnoreCheckConstraints,
  incrementalVacuum,
  indexInfo,
  indexList,
  indexXinfo,
  integrityCheck,
  journalMode,
  setJournalMode,
  journalSizeLimit,
  setJournalSizeLimit,
  legacyFileFormat,
  setLegacyFileFormat,
  lockingMode,
  setLockingMode,
  maxPageCount,
  setMaxPageCount,
  mmapSize,
  setMmapSize,
  optimize,
  pageCount,
  pageSize,
  setPageSize,
  setParserTrace,
  queryOnly,
  setQueryOnly,
  quickCheck,
  readUncommitted,
  setReadUncommitted,
  recursiveTriggers,
  setRecursiveTriggers,
  reverseUnorderedSelects,
  setReverseUnorderedSelects,
  schemaCookie,
  setSchemaCookie,
  schemaVersion,
  setSchemaVersion,
  secureDelete,
  setSecureDelete,
  shortColumnNames,
  setShortColumnNames,
  shrinkMemory,
  softHeapLimit,
  setSoftHeapLimit,
  stats,
  synchronous,
  setSynchronous,
  tempStore,
  setTempStore,
  threads,
  setThreads,
  userCookie,
  setUserCookie,
  userVersion,
  setUserVersion,
  setVdbeAddoptrace,
  setVdbeDebug,
  setVdbeListing,
  vdbeTrace,
  setVdbeTrace,
  walAutocheckpoint,
  setWalAutocheckpoint,
  walCheckpoint,
  setWalCheckpoint,
  setWritableSchema,
};
