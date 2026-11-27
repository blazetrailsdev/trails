import { StandardError } from "@blazetrails/ruby-compat/standard-error";
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

export class FeatureNotSupported extends ServerError {}

export class SyntaxErrorOrAccessRuleViolation extends ServerError {}

export class SyntaxError extends SyntaxErrorOrAccessRuleViolation {}

export const ERROR_CLASSES: Record<string, typeof Error> = {
  "0A000": FeatureNotSupported,
  "0A": FeatureNotSupported,
  "42000": SyntaxErrorOrAccessRuleViolation,
  "42": SyntaxErrorOrAccessRuleViolation,
  "42601": SyntaxError,
};

/** @internal */
export function lookupErrorClass(sqlstate: string | null): typeof Error {
  let klass: typeof Error | undefined;
  if (sqlstate != null) {
    klass = Object.hasOwn(ERROR_CLASSES, sqlstate) ? ERROR_CLASSES[sqlstate] : undefined;
    if (klass == null) {
      klass = Object.hasOwn(ERROR_CLASSES, sqlstate.slice(0, 2))
        ? ERROR_CLASSES[sqlstate.slice(0, 2)]
        : undefined;
      if (klass == null) {
        klass = ServerError;
      }
    }
  } else {
    klass = UnableToSend;
  }
  return klass;
}

PG.ERROR_CLASSES = ERROR_CLASSES;
PG.Error = Error;
PG.ServerError = ServerError;
PG.UnableToSend = UnableToSend;
PG.SyntaxErrorOrAccessRuleViolation = SyntaxErrorOrAccessRuleViolation;
PG.SyntaxError = SyntaxError;
PG.ConnectionBad = ConnectionBad;
PG.FeatureNotSupported = FeatureNotSupported;
