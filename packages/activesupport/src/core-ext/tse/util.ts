/**
 * ERB::Util — the escaping utilities Rails defines in
 * `active_support/core_ext/erb/util.rb`.
 */

import { SafeBuffer, htmlSafe } from "../string/output-safety.js";
import { NotImplementedError } from "../../cache/store.js";
import { isEmpty } from "../../ruby-empty.js";

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  ">": "&gt;",
  "<": "&lt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_PATTERN = /[&<>"']/g;

const HTML_ESCAPE_ONCE_REGEXP = /["><']|&(?!([a-zA-Z]+|(#\d+)|(#[xX][\dA-Fa-f]+));)/g;

/**
 * HTML escapes strings but doesn't wrap them with an ActiveSupport::SafeBuffer.
 * This method is not for public consumption! Seriously!
 *
 * @internal Mirrors: ActiveSupport::CoreExt::ERBUtil#html_escape, aliased
 * `unwrapped_html_escape` (`core_ext/erb/util.rb:11-18`). Rails' escape arm is
 * `super(ActiveSupport::Multibyte::Unicode.tidy_bytes(s))`; `tidy_bytes`
 * repairs invalid UTF-8 byte sequences, which a JS string cannot hold, so the
 * escape runs on `s` directly.
 */
export function unwrappedHtmlEscape(s: unknown): string | SafeBuffer {
  if (s instanceof SafeBuffer && s.htmlSafe) return s;
  return String(s ?? "").replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
}

/**
 * A utility method for escaping HTML tag characters.
 * This method is also aliased as `h`.
 *
 * Mirrors: ActiveSupport::CoreExt::ERBUtil#html_escape (`core_ext/erb/util.rb:25-27`).
 */
export function htmlEscape(s: unknown): SafeBuffer {
  const escaped = unwrappedHtmlEscape(s);
  return escaped instanceof SafeBuffer ? escaped : htmlSafe(escaped);
}

/** Mirrors: `alias h html_escape` (`core_ext/erb/util.rb:28`). */
export const h = htmlEscape;

// Following XML requirements: https://www.w3.org/TR/REC-xml/#NT-Name
/* eslint-disable no-misleading-character-class -- XML spec character ranges */
const TAG_NAME_START_CODEPOINTS =
  "@:A-Z_a-z\\xC0-\\xD6\\xD8-\\xF6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD\\u{10000}-\\u{EFFFF}";
const INVALID_TAG_NAME_START_REGEXP = new RegExp(`[^${TAG_NAME_START_CODEPOINTS}]`, "gu");
const TAG_NAME_FOLLOWING_CODEPOINTS = `${TAG_NAME_START_CODEPOINTS}\\-.0-9\\xB7\\u0300-\\u036F\\u203F-\\u2040`;
const INVALID_TAG_NAME_FOLLOWING_REGEXP = new RegExp(`[^${TAG_NAME_FOLLOWING_CODEPOINTS}]`, "gu");
const SAFE_XML_TAG_NAME_REGEXP = new RegExp(
  `^[${TAG_NAME_START_CODEPOINTS}][${TAG_NAME_FOLLOWING_CODEPOINTS}]*$`,
  "u",
);
/* eslint-enable no-misleading-character-class */
const TAG_NAME_REPLACEMENT_CHAR = "_";

/**
 * A utility method for escaping HTML without affecting existing escaped entities.
 *
 * Mirrors: ERB::Util#html_escape_once (`core_ext/erb/util.rb:63-65`), whose
 * `tidy_bytes` reach is dropped for the reason given on
 * {@link unwrappedHtmlEscape}.
 */
export function htmlEscapeOnce(s: unknown): SafeBuffer {
  return htmlSafe(
    String(s ?? "").replace(HTML_ESCAPE_ONCE_REGEXP, (c) => (c === "&" ? "&amp;" : HTML_ESCAPE[c])),
  );
}

/**
 * A utility method for escaping HTML entities in JSON strings. Specifically, the
 * &, > and < characters are replaced with their equivalent unicode escaped form —
 * \\u0026, \\u003e, and \\u003c. The Unicode sequences \\u2028 and \\u2029 are
 * also escaped as they are treated as newline characters in some JavaScript
 * engines.
 *
 * Mirrors: ERB::Util#json_escape (`core_ext/erb/util.rb:134-142`).
 */
export function jsonEscape(s: unknown): string | SafeBuffer {
  let result = String(s ?? "");
  result = result.replace(/>/g, "\\u003e");
  result = result.replace(/</g, "\\u003c");
  result = result.replace(/&/g, "\\u0026");
  result = result.replace(/\u2028/g, "\\u2028");
  result = result.replace(/\u2029/g, "\\u2029");
  return s instanceof SafeBuffer && s.htmlSafe ? htmlSafe(result) : result;
}

/**
 * A utility method for escaping XML names of tags and names of attributes.
 *
 * It follows the requirements of the specification: https://www.w3.org/TR/REC-xml/#NT-Name
 *
 * Mirrors: ERB::Util#xml_name_escape (`core_ext/erb/util.rb:157-171`).
 */
export function xmlNameEscape(name: unknown): string {
  const s = String(name ?? "");
  if (s.trim() === "") return "";
  if (SAFE_XML_TAG_NAME_REGEXP.test(s)) return s;

  const codePoints = [...s];
  const startingChar = codePoints[0].replace(
    INVALID_TAG_NAME_START_REGEXP,
    TAG_NAME_REPLACEMENT_CHAR,
  );

  if (codePoints.length === 1) return startingChar;

  const followingChars = codePoints
    .slice(1)
    .join("")
    .replace(INVALID_TAG_NAME_FOLLOWING_REGEXP, TAG_NAME_REPLACEMENT_CHAR);

  return startingChar + followingChars;
}

/**
 * The slice of Ruby's `StringScanner` that `tokenize` uses: a cursor over the
 * source with `scan` / `scan_until` / `matched` / `eos?` / `exist?` / `rest` /
 * `terminate`. Ruby's stdlib class has no JS counterpart, so it is ported here
 * at its Ruby names. `pos` counts UTF-16 code units rather than bytes; every
 * offset `tokenize` computes is a difference of two `pos` values from this same
 * scanner, so the arithmetic is self-consistent and a multibyte source slices
 * at the same boundaries Ruby's `byteslice` reaches.
 */
class StringScanner {
  pos = 0;
  matched: string | null = null;

  constructor(readonly string: string) {}

  /** Ruby: `StringScanner#eos?` */
  isEos(): boolean {
    return this.pos >= this.string.length;
  }

  /** Ruby: `StringScanner#rest` */
  get rest(): string {
    return this.string.slice(this.pos);
  }

  /** Ruby: `StringScanner#terminate` */
  terminate(): void {
    this.pos = this.string.length;
  }

  /** Ruby: `StringScanner#scan` — match anchored at `pos`, advancing on a hit. */
  scan(re: RegExp): string | null {
    return this._match(new RegExp(re.source, `${re.flags.replace(/[gy]/g, "")}y`));
  }

  /** Ruby: `StringScanner#scan_until` — advance past the next match anywhere ahead. */
  scanUntil(re: RegExp): string | null {
    return this._match(new RegExp(re.source, `${re.flags.replace(/[gy]/g, "")}g`));
  }

  /** Ruby: `StringScanner#exist?` — is there a match ahead, without advancing? */
  exist(re: RegExp): boolean {
    const search = new RegExp(re.source, `${re.flags.replace(/[gy]/g, "")}g`);
    search.lastIndex = this.pos;
    return search.exec(this.string) !== null;
  }

  private _match(re: RegExp): string | null {
    re.lastIndex = this.pos;
    const m = re.exec(this.string);
    this.matched = m === null ? null : m[0];
    if (m !== null) this.pos = m.index + m[0].length;
    return this.matched;
  }
}

const START_RE = /<%(?:={1,2}|-|#|%)?/s;
const FINISH_RE = /(?:[-=])?%>/s;
const START_OR_FINISH_RE = new RegExp(`(?:${START_RE.source}|${FINISH_RE.source})`, "s");
const CODE_RE = new RegExp(`.*?(?=(?:${FINISH_RE.source})|$)`, "s");

/**
 * Tokenizes a line of ERB. This is really just for error reporting and
 * nobody should use it.
 *
 * Mirrors: ERB::Util.tokenize (`core_ext/erb/util.rb:159-207`). Ruby Symbol
 * token kinds keep their leading colon, per the trails Symbol convention.
 *
 * @internal
 */
export function tokenize(source: string): [string, string][] {
  const scanner = new StringScanner(source.replace(/\r\n$|[\r\n]$/, ""));
  const tokens: [string, string][] = [];

  while (!scanner.isEos()) {
    const pos = scanner.pos;
    scanner.scanUntil(START_OR_FINISH_RE);
    if (scanner.matched === null)
      // @nie disposition=TODO
      throw new NotImplementedError();
    const len = scanner.pos - scanner.matched.length - pos;

    if (START_RE.test(scanner.matched)) {
      if (len > 0) tokens.push([":TEXT", scanner.string.slice(pos, pos + len)]);
      tokens.push([":OPEN", scanner.matched]);
      if (scanner.scan(CODE_RE) !== null) {
        if (!isEmpty(scanner.matched)) tokens.push([":CODE", scanner.matched]);
        if (!scanner.isEos()) tokens.push([":CLOSE", scanner.scan(FINISH_RE)!]);
      } else {
        // @nie disposition=TODO
        throw new NotImplementedError();
      }
    } else if (FINISH_RE.test(scanner.matched)) {
      if (len > 0) tokens.push([":CODE", scanner.string.slice(pos, pos + len)]);
      tokens.push([":CLOSE", scanner.matched]);
    } else {
      // @nie disposition=TODO
      throw new NotImplementedError(scanner.matched);
    }

    if (!scanner.isEos() && !scanner.exist(START_RE) && !scanner.exist(FINISH_RE)) {
      tokens.push([":TEXT", scanner.rest]);
      scanner.terminate();
    }
  }

  return tokens;
}
