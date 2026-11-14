import type { Result } from "./result.js";

export const PG_DIAG_SEVERITY = 83;
export const PG_DIAG_SEVERITY_NONLOCALIZED = 86;
export const PG_DIAG_SQLSTATE = 67;
export const PG_DIAG_MESSAGE_PRIMARY = 77;
export const PG_DIAG_MESSAGE_DETAIL = 68;
export const PG_DIAG_MESSAGE_HINT = 72;
export const PG_DIAG_STATEMENT_POSITION = 80;
export const PG_DIAG_INTERNAL_POSITION = 112;
export const PG_DIAG_INTERNAL_QUERY = 113;
export const PG_DIAG_CONTEXT = 87;
export const PG_DIAG_SOURCE_FILE = 70;
export const PG_DIAG_SOURCE_LINE = 76;
export const PG_DIAG_SOURCE_FUNCTION = 82;
export const PG_DIAG_SCHEMA_NAME = 115;
export const PG_DIAG_TABLE_NAME = 116;
export const PG_DIAG_COLUMN_NAME = 99;
export const PG_DIAG_DATATYPE_NAME = 100;
export const PG_DIAG_CONSTRAINT_NAME = 110;

export class Error extends globalThis.Error {
  readonly connection: object | null;
  readonly result: Result | null;

  constructor(
    msg: string | null = null,
    {
      connection = null,
      result = null,
    }: { connection?: object | null; result?: Error["result"] } = {},
  ) {
    super(msg ?? undefined);
    this.connection = connection;
    this.result = result;
  }

  get error(): string {
    return this.message;
  }
}

export class ServerError extends Error {}

export class UnableToSend extends Error {}

export class ConnectionBad extends Error {}
