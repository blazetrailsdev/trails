import { StandardError } from "@blazetrails/ruby-compat";
import { PG } from "./namespaces.js";
import type { Result } from "./result.js";

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

/** @noRailsEquivalent PERMANENT */
export class FeatureNotSupported extends ServerError {}

export const ERROR_CLASSES: Record<string, typeof Error> = {
  "0A000": FeatureNotSupported,
  "0A": FeatureNotSupported,
};

PG.ERROR_CLASSES = ERROR_CLASSES;
PG.Error = Error;
PG.ServerError = ServerError;
PG.UnableToSend = UnableToSend;
PG.ConnectionBad = ConnectionBad;
PG.FeatureNotSupported = FeatureNotSupported;
