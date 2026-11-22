import type { Connection } from "./connection.js";
import { PG } from "./namespaces.js";

/** @noRailsEquivalent PERMANENT */
export const Constants = {
  CONNECTION_OK: 0,
  CONNECTION_BAD: 1,
  PQTRANS_IDLE: 0,
  PQTRANS_ACTIVE: 1,
  PQTRANS_INTRANS: 2,
  PQTRANS_INERROR: 3,
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
};

PG.Constants = Constants;
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
