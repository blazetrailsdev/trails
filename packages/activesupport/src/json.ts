/**
 * ActiveSupport::JSON — `encode`/`decode` mirroring the Rails API.
 *
 * Mirrors: ActiveSupport::JSON (json/encoding.rb:15-42). The encoding itself
 * lives in `json/encoding.ts`, as it does in Rails.
 */

import { Encoding, type EncodeOptions } from "./json/encoding.js";

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
  export function decode(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch (error) {
      if (!(error instanceof SyntaxError)) throw error;
      return JSON.parse(stripJsonComments(value));
    }
  }
}
