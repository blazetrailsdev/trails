import { bytes } from "./string/bytes.js";
import { ArgumentError } from "./argument-error.js";
import { rbFArray } from "./array.js";

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
   * @noRailsEquivalent PERMANENT — Ruby stdlib `CGI::Util::TABLE_FOR_ESCAPE_HTML__`
   * (`vendor/ruby/v3.3.11/lib/cgi/util.rb:66`).
   */
  static readonly TABLE_FOR_ESCAPE_HTML__: Readonly<Record<string, string>> = {
    "'": "&#39;",
    "&": "&amp;",
    '"': "&quot;",
    "<": "&lt;",
    ">": "&gt;",
  };

  /**
   * `CGI.escapeHTML` (`vendor/ruby/v3.3.11/lib/cgi/util.rb:77-94`), its
   * ASCII-compatible arm: a String has no encoding tag (CLAUDE.md, "A String has
   * no encoding tag either").
   *
   * @noRailsEquivalent PERMANENT — Ruby stdlib `CGI.escapeHTML`
   * (`vendor/ruby/v3.3.11/lib/cgi/util.rb:77`).
   */
  static escapeHTML(string: string): string {
    return string.replace(/['&"<>]/g, (c) => CGI.TABLE_FOR_ESCAPE_HTML__[c]);
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

  /**
   * `CGI.unescapeHTML` (`vendor/ruby/v3.3.11/lib/cgi/util.rb:107-162`), its
   * UTF-8 arm: a String has no encoding tag (CLAUDE.md, "A String has no
   * encoding tag either"), so `charlimit` is `0x10ffff`.
   *
   * @noRailsEquivalent PERMANENT
   */
  static unescapeHTML(string: string): string {
    if (!string.includes("&")) return string;
    const charlimit = 0x10ffff;
    return string.replace(/&(apos|amp|quot|gt|lt|#[0-9]+|#[xX][0-9A-Fa-f]+);/g, (_m, match) => {
      let m: RegExpMatchArray | null;
      switch (match) {
        case "apos":
          return "'";
        case "amp":
          return "&";
        case "quot":
          return '"';
        case "gt":
          return ">";
        case "lt":
          return "<";
      }
      if ((m = /^#0*(\d+)$/.exec(match))) {
        const n = parseInt(m[1], 10);
        return n < charlimit ? String.fromCodePoint(n) : `&#${m[1]};`;
      } else if ((m = /^#x([0-9a-f]+)$/i.exec(match))) {
        const n = parseInt(m[1], 16);
        return n < charlimit ? String.fromCodePoint(n) : `&#x${m[1]};`;
      } else {
        return `&${match};`;
      }
    });
  }

  /** @noRailsEquivalent PERMANENT */
  static Cookie: typeof Cookie;
}

/**
 * `CGI::Cookie` (`vendor/ruby/v3.3.11/lib/cgi/cookie.rb:40`), narrowed to the
 * options-hash arm of `initialize` (`cookie.rb:86-100`) that
 * `Rack::MockResponse#parse_cookies_from_header` calls. A Ruby `Cookie < Array`
 * is its own value, so `value` holds the Array. The default `path` is the arm
 * Ruby takes when `ENV["SCRIPT_NAME"]` is unset, `""`: trails reads no process
 * environment.
 *
 * @noRailsEquivalent PERMANENT
 */
export class Cookie {
  /** @noRailsEquivalent PERMANENT */
  static readonly TOKEN_RE = /^[!#$%&'*+\-.^_`|~0-9A-Za-z]+$/;
  /** @noRailsEquivalent PERMANENT */
  static readonly PATH_VALUE_RE = /^[ -:<-~]*$/;
  /** @noRailsEquivalent PERMANENT */
  static readonly DOMAIN_VALUE_RE = /^\.?(?!-)[-A-Za-z0-9]+(?<!-)(?:\.(?!-)[-A-Za-z0-9]+(?<!-))*$/;

  /** @noRailsEquivalent PERMANENT */
  name!: string | null;
  /** @noRailsEquivalent PERMANENT */
  value: string[];
  /** @noRailsEquivalent PERMANENT */
  path!: string | null;
  /** @noRailsEquivalent PERMANENT */
  domain!: string | null;
  /** @noRailsEquivalent PERMANENT */
  expires: Date | null;
  /** @noRailsEquivalent PERMANENT */
  secure: boolean;

  /** @noRailsEquivalent PERMANENT */
  constructor(options: Record<string, unknown>) {
    this.domain = null;
    this.expires = null;

    if (!Object.hasOwn(options, "name")) {
      throw new ArgumentError("`name' required");
    }

    this.setName(options["name"] as string | null);
    const value = rbFArray(options["value"]) as string[];
    this.setPath((options["path"] as string | null | undefined) || "");
    this.setDomain((options["domain"] as string | null | undefined) ?? null);
    this.expires = (options["expires"] as Date | null | undefined) ?? null;
    this.secure = options["secure"] === true;

    this.value = value;
  }

  /** @noRailsEquivalent PERMANENT */
  setName(str: string | null): void {
    if (str != null && !Cookie.TOKEN_RE.test(str)) {
      throw new ArgumentError(`invalid name: ${JSON.stringify(str)}`);
    }
    this.name = str;
  }

  /** @noRailsEquivalent PERMANENT */
  setPath(str: string | null): void {
    if (str != null && !Cookie.PATH_VALUE_RE.test(str)) {
      throw new ArgumentError(`invalid path: ${JSON.stringify(str)}`);
    }
    this.path = str;
  }

  /** @noRailsEquivalent PERMANENT */
  setDomain(str: string | null): void {
    if (str != null && (bytes(str).length > 255 || !Cookie.DOMAIN_VALUE_RE.test(str))) {
      throw new ArgumentError(`invalid domain: ${JSON.stringify(str)}`);
    }
    this.domain = str;
  }
}

CGI.Cookie = Cookie;
