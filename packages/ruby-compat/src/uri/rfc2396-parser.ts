import { regexpEscape } from "../regexp.js";
import { b } from "../string/b.js";

/**
 * `URI::REGEXP::PATTERN` (`vendor/ruby/lib/uri/rfc2396_parser.rb:19-54`), the
 * RFC 2396 character classes `UNSAFE` is built out of. Only the constants
 * `initialize_regexp` reads for `UNSAFE` are ported.
 */
const ALPHA = "a-zA-Z";
const ALNUM = `${ALPHA}\\d`;
const UNRESERVED = `\\-_.!~*'()${ALNUM}`;
const RESERVED = ";/?:@&=+$,\\[\\]";

/**
 * `URI::RFC2396_Parser` (`vendor/ruby/lib/uri/rfc2396_parser.rb:63`), the
 * parser `URI::RFC2396_PARSER` is an instance of. Only `escape` is ported —
 * the one member trails sends, from `Rack::Utils.escape_path`
 * (`vendor/rack/lib/rack/utils.rb:47`) and
 * `ActionDispatch::Routing::RoutesInspector#normalize_filter`
 * (`actionpack/lib/action_dispatch/routing/inspector.rb:104`).
 *
 * @noRailsEquivalent PERMANENT — Ruby stdlib, not Rails: `URI::RFC2396_Parser`
 * (`vendor/ruby/lib/uri/rfc2396_parser.rb:63`) ships with the interpreter.
 */
export class RFC2396Parser {
  /** `@regexp` (`vendor/ruby/lib/uri/rfc2396_parser.rb:117`), of which
   *  `initialize_regexp` builds `:UNSAFE` at `rfc2396_parser.rb:510`. */
  readonly regexp: Record<string, RegExp> = {
    UNSAFE: new RegExp(`[^${UNRESERVED}${RESERVED}]`, "g"),
  };

  /** `escape` (`vendor/ruby/lib/uri/rfc2396_parser.rb:287`). */
  escape(str: string, unsafe: RegExp | string = this.regexp.UNSAFE): string {
    if (!(unsafe instanceof RegExp)) {
      unsafe = new RegExp(`[${regexpEscape(unsafe)}]`, "g");
    } else if (!unsafe.flags.includes("g")) {
      unsafe = new RegExp(unsafe.source, `${unsafe.flags}g`);
    }
    return str.replace(unsafe, (us) => {
      let tmp = "";
      for (const uc of b(us)) {
        tmp += `%${uc.charCodeAt(0).toString(16).toUpperCase().padStart(2, "0")}`;
      }
      return tmp;
    });
  }
}
