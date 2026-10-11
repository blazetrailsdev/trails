import { encode, fetch, rtest, StandardError } from "@blazetrails/ruby-compat";

/** @noRailsEquivalent CONVERGEABLE mysql2-client-is-a-class-over-the-npm-connection */
export const DRIVER_ERRORS = new WeakSet<object>();

export class Error extends StandardError {
  static readonly ENCODE_OPTS = Object.freeze({
    undef: ":replace",
    invalid: ":replace",
    replace: "?",
  } as const);

  static ConnectionError: typeof Error;
  static TimeoutError: typeof Error;

  static CODES: Readonly<Record<number, typeof Error>>;

  readonly errorNumber: number | null;
  readonly sqlState: string | null;
  private serverVersion: number | null;

  get errno(): number | null {
    return this.errorNumber;
  }

  get error(): string {
    return this.message;
  }

  constructor(
    msg: string,
    serverVersion: number | null = null,
    errorNumber: number | null = null,
    sqlState: string | null = null,
  ) {
    super();
    this.serverVersion = serverVersion;
    this.errorNumber = errorNumber;
    this.sqlState =
      sqlState != null ? (encode(sqlState, "UTF-8", Error.ENCODE_OPTS) as string) : null;

    this.message = this.cleanMessage(msg);
  }

  static newWithArgs(
    msg: string,
    serverVersion: number | null,
    errorNumber: number | null,
    sqlState: string | null,
  ): Error {
    const errorClass = fetch<typeof Error>(this.CODES, String(errorNumber), this);
    return new errorClass(msg, serverVersion, errorNumber, sqlState);
  }

  /** @noRailsEquivalent CONVERGEABLE mysql2-client-is-a-class-over-the-npm-connection */
  static [Symbol.hasInstance](e: unknown): boolean {
    return (
      Function.prototype[Symbol.hasInstance].call(this, e) ||
      (this === Error && typeof e === "object" && e !== null && DRIVER_ERRORS.has(e))
    );
  }

  private cleanMessage(message: string): string {
    if (rtest(this.serverVersion) && this.serverVersion > 50500) {
      return encode(message, "UTF-8", Error.ENCODE_OPTS) as string;
    } else {
      return encode(message, "UTF-8", Error.ENCODE_OPTS) as string;
    }
  }
}

Error.ConnectionError = class ConnectionError extends Error {};
Error.TimeoutError = class TimeoutError extends Error {};

const { ConnectionError, TimeoutError } = Error;

Error.CODES = Object.freeze({
  1205: TimeoutError,

  1044: ConnectionError,
  1045: ConnectionError,
  1152: ConnectionError,
  1153: ConnectionError,
  1154: ConnectionError,
  1155: ConnectionError,
  1156: ConnectionError,
  1157: ConnectionError,
  1158: ConnectionError,
  1159: ConnectionError,
  1160: ConnectionError,
  1161: ConnectionError,
  1927: ConnectionError,

  2001: ConnectionError,
  2002: ConnectionError,
  2003: ConnectionError,
  2004: ConnectionError,
  2005: ConnectionError,
  2006: ConnectionError,
  2007: ConnectionError,
  2009: ConnectionError,
  2012: ConnectionError,
  2013: ConnectionError,
  2020: ConnectionError,
  2026: ConnectionError,
  2027: ConnectionError,
  2047: ConnectionError,
  2048: ConnectionError,
  2049: ConnectionError,
});
