import { Date as RubyDate } from "@blazetrails/date";
import { JSON as RbJSON } from "@blazetrails/ruby-compat";
import { ArgumentError } from "./hash-utils.js";
import { Encoding, type EncodeOptions } from "./json/encoding.js";
import { zone } from "./time-zone-config.js";

export let parseJsonTimes: boolean | undefined = undefined;

export function setParseJsonTimes(value: boolean | undefined): void {
  parseJsonTimes = value;
}

const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_REGEX =
  /^(?:\d{4}-\d{2}-\d{2}|\d{4}-\d{1,2}-\d{1,2}[T \t]+\d{1,2}:\d{2}:\d{2}(\.[0-9]*)?(([ \t]*)Z|[-+]\d{2}?(:\d{2})?)?)$/;

/** @internal */
function convertDatesFrom(data: unknown): unknown {
  if (data == null) {
    return null;
  } else if (typeof data === "string" && DATE_REGEX.test(data)) {
    try {
      return RubyDate.parse(data);
    } catch (error) {
      if (!(error instanceof ArgumentError)) throw error;
      return data;
    }
  } else if (typeof data === "string" && DATETIME_REGEX.test(data)) {
    try {
      return zone()!.parse(data);
    } catch (error) {
      if (!(error instanceof ArgumentError)) throw error;
      return data;
    }
  } else if (Array.isArray(data)) {
    for (let i = 0; i < data.length; i++) data[i] = convertDatesFrom(data[i]);
    return data;
  } else if (
    data !== null &&
    typeof data === "object" &&
    Object.getPrototypeOf(data) === Object.prototype
  ) {
    const hash = data as Record<string, unknown>;
    for (const key of Object.keys(hash)) hash[key] = convertDatesFrom(hash[key]);
    return hash;
  } else {
    return data;
  }
}

export namespace ActiveSupportJSON {
  export function encode(value: unknown, options?: EncodeOptions): string {
    return new Encoding.jsonEncoder(options).encode(value);
  }

  export const dump = encode;

  /** @missingRailsArgs parse — CONVERGEABLE json-parse-skips-comments-in-one-pass-and-takes-options */
  export function decode(json: string | Uint8Array): unknown {
    const data = RbJSON.parse(json);

    if (parseJsonTimes != null && parseJsonTimes !== false) {
      return convertDatesFrom(data);
    } else {
      return data;
    }
  }

  export const load = decode;

  export function parseError(): typeof SyntaxError {
    return SyntaxError;
  }
}
