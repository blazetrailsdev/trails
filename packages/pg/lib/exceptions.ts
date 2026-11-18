import { StandardError } from "@blazetrails/ruby-compat";
import { PG } from "./namespaces.js";

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

/** @noRailsEquivalent PERMANENT */
export class ServerError extends Error {}

/** @noRailsEquivalent PERMANENT */
export class UnableToSend extends Error {}

/** @noRailsEquivalent PERMANENT */
export class ConnectionBad extends Error {}

/** @noRailsEquivalent PERMANENT */
export class FeatureNotSupported extends ServerError {}

PG.Error = Error;
PG.ServerError = ServerError;
PG.UnableToSend = UnableToSend;
PG.ConnectionBad = ConnectionBad;
PG.FeatureNotSupported = FeatureNotSupported;
