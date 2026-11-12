export const PG_DIAG_SQLSTATE = 67;
export const PG_DIAG_SOURCE_FUNCTION = 82;
export const PG_DIAG_MESSAGE_PRIMARY = 77;
export const PG_DIAG_SEVERITY = 83;

type ErrorField = (fieldcode: number) => string | null;

export class Error extends globalThis.Error {
  readonly connection: object | null;
  readonly result: { errorField: ErrorField; resultErrorField: ErrorField } | null;

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
