import { SQLite3 } from "./namespaces.js";

export const Constants = {
  Open: {
    READWRITE: 0x00000002,
    CREATE: 0x00000004,
    SHAREDCACHE: 0x00020000,
  },
  ErrorCode: {
    OK: 0,
    ERROR: 1,
    INTERNAL: 2,
    PERM: 3,
    ABORT: 4,
    BUSY: 5,
    LOCKED: 6,
    NOMEM: 7,
    READONLY: 8,
    INTERRUPT: 9,
    IOERR: 10,
    CORRUPT: 11,
    NOTFOUND: 12,
    FULL: 13,
    CANTOPEN: 14,
    PROTOCOL: 15,
    EMPTY: 16,
    SCHEMA: 17,
    TOOBIG: 18,
    CONSTRAINT: 19,
    MISMATCH: 20,
    MISUSE: 21,
    NOLFS: 22,
    AUTH: 23,
    FORMAT: 24,
    RANGE: 25,
    NOTADB: 26,
    DONE: 101,
  },
  Optimize: {
    DEBUG: 0x00001,
    ANALYZE_TABLES: 0x00002,
    LIMIT_ANALYZE: 0x00010,
    CHECK_ALL_TABLES: 0x10000,
    DEFAULT: 0x00002 | 0x00010,
  },
} as const;

SQLite3.Constants = Constants;
