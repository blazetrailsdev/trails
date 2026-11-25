import type { Connection } from "./connection.js";
import { PG } from "./namespaces.js";

/** @noRailsEquivalent PERMANENT */
export const Constants = {
  CONNECTION_OK: 0,
  CONNECTION_BAD: 1,
  CONNECTION_STARTED: 2,
  CONNECTION_MADE: 3,
  PGRES_POLLING_FAILED: 0,
  PGRES_POLLING_READING: 1,
  PGRES_POLLING_WRITING: 2,
  PGRES_POLLING_OK: 3,
  PQTRANS_IDLE: 0,
  PQTRANS_ACTIVE: 1,
  PQTRANS_INTRANS: 2,
  PQTRANS_INERROR: 3,
  PQTRANS_UNKNOWN: 4,
  PQ_PIPELINE_OFF: 0,
  PQ_PIPELINE_ON: 1,
  PQ_PIPELINE_ABORTED: 2,
  PGRES_EMPTY_QUERY: 0,
  PGRES_COMMAND_OK: 1,
  PGRES_TUPLES_OK: 2,
  PGRES_COPY_OUT: 3,
  PGRES_COPY_IN: 4,
  PGRES_BAD_RESPONSE: 5,
  PGRES_NONFATAL_ERROR: 6,
  PGRES_FATAL_ERROR: 7,
  PGRES_COPY_BOTH: 8,
  PGRES_SINGLE_TUPLE: 9,
  PGRES_PIPELINE_SYNC: 10,
  PGRES_PIPELINE_ABORTED: 11,
  PGRES_TUPLES_CHUNK: 12,
  PG_DIAG_SEVERITY: 83,
  PG_DIAG_SEVERITY_NONLOCALIZED: 86,
  PG_DIAG_SQLSTATE: 67,
  PG_DIAG_MESSAGE_PRIMARY: 77,
  PG_DIAG_MESSAGE_DETAIL: 68,
  PG_DIAG_MESSAGE_HINT: 72,
  PG_DIAG_STATEMENT_POSITION: 80,
  PG_DIAG_INTERNAL_POSITION: 112,
  PG_DIAG_INTERNAL_QUERY: 113,
  PG_DIAG_CONTEXT: 87,
  PG_DIAG_SOURCE_FILE: 70,
  PG_DIAG_SOURCE_LINE: 76,
  PG_DIAG_SOURCE_FUNCTION: 82,
  PG_DIAG_SCHEMA_NAME: 115,
  PG_DIAG_TABLE_NAME: 116,
  PG_DIAG_COLUMN_NAME: 99,
  PG_DIAG_DATATYPE_NAME: 100,
  PG_DIAG_CONSTRAINT_NAME: 110,
  INVALID_OID: 0,
};

PG.Constants = Constants;

PG.BUNDLED_LIBPQ_WITH_UNIXSOCKET = false;
Object.assign(PG, Constants);

export function connect(connParams?: Record<string, unknown>): Promise<Connection>;
export function connect<R>(
  connParams: Record<string, unknown>,
  block: (conn: Connection) => R | Promise<R>,
): Promise<R>;
export function connect<R>(
  connParams?: Record<string, unknown>,
  block?: (conn: Connection) => R | Promise<R>,
): Promise<Connection | R> {
  return PG.Connection.new(connParams, block);
}

PG.connect = connect;
