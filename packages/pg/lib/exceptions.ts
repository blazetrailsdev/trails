import { StandardError } from "@blazetrails/ruby-compat";

export interface Result {
  errorField(fieldcode: number): string | null;
  resultErrorField(fieldcode: number): string | null;
}

export class Error extends StandardError {
  readonly connection: object | null;
  readonly result: Result | null;

  constructor(
    msg: string | null = null,
    {
      connection = null,
      result = null,
    }: { connection?: object | null; result?: Result | null } = {},
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

export class FeatureNotSupported extends ServerError {}
