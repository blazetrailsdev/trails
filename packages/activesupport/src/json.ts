/**
 * ActiveSupport::JSON — `encode`/`decode` mirroring the Rails API.
 *
 * Mirrors: ActiveSupport::JSON (json/encoding.rb:15-42). The encoding itself
 * lives in `json/encoding.ts`, as it does in Rails.
 */

import { Date as RubyDate } from "@blazetrails/date";
import { ArgumentError } from "./hash-utils.js";
import { Encoding, type EncodeOptions } from "./json/encoding.js";
import { zone } from "./time-zone-config.js";

/**
 * Look for and parse JSON strings that look like ISO 8601 times.
 *
 * Mirrors `mattr_accessor :parse_json_times` (json/decoding.rb:9). A module has
 * no settable accessor in ESM, so the writer half keeps the Rails name in
 * `setParseJsonTimes()`, the settled trails shape for a Ruby `x=`.
 */
export let parseJsonTimes: boolean | undefined = undefined;

export function setParseJsonTimes(value: boolean | undefined): void {
  parseJsonTimes = value;
}

/** matches YAML-formatted dates (json/decoding.rb:13) */
const DATE_REGEX = /^\d{4}-\d{2}-\d{2}$/;
const DATETIME_REGEX =
  /^(?:\d{4}-\d{2}-\d{2}|\d{4}-\d{1,2}-\d{1,2}[T \t]+\d{1,2}:\d{2}:\d{2}(\.[0-9]*)?(([ \t]*)Z|[-+]\d{2}?(:\d{2})?)?)$/;

/** Mirrors the private `convert_dates_from` (json/decoding.rb:48-73). */
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

/**
 * String-aware comment removal: quoted spans (and their backslash escapes) are
 * copied verbatim so a comment marker inside a JSON string survives.
 */
function stripJsonComments(value: string): string {
  let out = "";
  let index = 0;
  while (index < value.length) {
    const char = value[index];
    if (char === '"') {
      const start = index++;
      while (index < value.length && value[index] !== '"') {
        index += value[index] === "\\" ? 2 : 1;
      }
      out += value.slice(start, ++index);
    } else if (char === "/" && value[index + 1] === "*") {
      const end = value.indexOf("*/", index + 2);
      index = end === -1 ? value.length : end + 2;
    } else if (char === "/" && value[index + 1] === "/") {
      const end = value.indexOf("\n", index + 2);
      index = end === -1 ? value.length : end;
    } else {
      out += char;
      index++;
    }
  }
  return out;
}

export namespace ActiveSupportJSON {
  /**
   * Dumps objects in JSON (JavaScript Object Notation).
   * See http://www.json.org for more info.
   *
   *     ActiveSupportJSON.encode({ team: "rails", players: "36" })
   *     // => '{"team":"rails","players":"36"}'
   *
   * Generates JSON that is safe to include in JavaScript as it escapes
   * U+2028 (Line Separator) and U+2029 (Paragraph Separator).
   *
   * By default, it also generates JSON that is safe to include in HTML, as
   * it escapes `<`, `>`, and `&`:
   *
   *     ActiveSupportJSON.encode({ key: "<>&" })
   *     // => '{"key":"\\u003c\\u003e\\u0026"}'
   *
   * This can be changed with the `escapeHtmlEntities` option, or the global
   * `escapeHtmlEntitiesInJson` configuration option.
   */
  export function encode(value: unknown, options?: EncodeOptions): string {
    return new Encoding.jsonEncoder(options).encode(value);
  }

  /**
   * Mirrors `alias_method :dump, :encode` (json/encoding.rb:43) — the same
   * method under a second name, not a second implementation.
   */
  export const dump = encode;

  /**
   * Ruby's JSON parser — what `ActiveSupport::JSON.decode` delegates to — skips
   * block and line comments anywhere whitespace is allowed, while `JSON.parse`
   * rejects them. The retry runs only after a parse failure, so valid documents
   * (where a comment marker can only be inside a string) are untouched.
   */
  export function decode(json: string): unknown {
    let data: unknown;
    try {
      data = JSON.parse(json);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      data = JSON.parse(stripJsonComments(json));
    }

    if (parseJsonTimes != null && parseJsonTimes !== false) {
      return convertDatesFrom(data);
    } else {
      return data;
    }
  }

  /**
   * Mirrors `alias_method :load, :decode` (json/decoding.rb:31) — the same
   * method under a second name, not a second implementation.
   */
  export const load = decode;

  /**
   * Returns the class of the error that will be raised when there is an error
   * in decoding JSON. Using this method means you won't directly depend on the
   * ActiveSupport's JSON implementation, in case it changes in the future.
   *
   * Ruby's `::JSON::ParserError` is `SyntaxError` in JS, which is what
   * `JSON.parse` raises (json/decoding.rb:43-45).
   */
  export function parseError(): typeof SyntaxError {
    return SyntaxError;
  }
}
