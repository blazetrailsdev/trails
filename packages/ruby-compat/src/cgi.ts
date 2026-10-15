import { bytes } from "./string/bytes.js";

/**
 * `CGI::Util` (`vendor/ruby/v3.3.11/lib/cgi/util.rb:5`), which `CGI` extends,
 * narrowed to the members Rails calls on it.
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib `CGI`
 * (`vendor/ruby/v3.3.11/lib/cgi/util.rb:5`), which Rails uses but does not define.
 */
export class CGI {
  /**
   * `CGI.escape` (`vendor/ruby/v3.3.11/lib/cgi/util.rb:14-22`): every byte outside
   * `[ a-zA-Z0-9_.\-~]` as `%XX`, then each space as `+`.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `CGI.escape`
   * (`vendor/ruby/v3.3.11/lib/cgi/util.rb:14`).
   */
  static escape(string: string): string {
    let buffer = "";
    for (const byte of bytes(string)) buffer += String.fromCharCode(byte);
    buffer = buffer.replace(/[^ a-zA-Z0-9_.\-~]+/g, (m) =>
      [...m].map((c) => `%${c.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`).join(""),
    );
    return buffer.replace(/ /g, "+");
  }

  /**
   * `CGI.unescape` (`vendor/ruby/v3.3.11/lib/cgi/util.rb:27-36`): `+` as a space and
   * each run of `%XX` as its bytes, read as UTF-8. A `%` not followed by two
   * hex digits is left as it is.
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `CGI.unescape`
   * (`vendor/ruby/v3.3.11/lib/cgi/util.rb:27`).
   */
  static unescape(string: string): string {
    const str = string.replace(/\+/g, " ");
    return str.replace(/(?:%[0-9a-fA-F]{2})+/g, (m) =>
      new TextDecoder("utf-8").decode(
        Uint8Array.from(m.slice(1).split("%"), (h) => parseInt(h, 16)),
      ),
    );
  }
}
