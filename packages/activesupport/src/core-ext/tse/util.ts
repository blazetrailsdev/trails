import { SafeBuffer, htmlSafe } from "../string/output-safety.js";
import { NotImplementedError } from "../../cache/store.js";
import { isEmpty } from "@blazetrails/ruby-compat";

const HTML_ESCAPE: Record<string, string> = {
  "&": "&amp;",
  ">": "&gt;",
  "<": "&lt;",
  '"': "&quot;",
  "'": "&#39;",
};

const HTML_ESCAPE_PATTERN = /[&<>"']/g;

const HTML_ESCAPE_ONCE_REGEXP = /["><']|&(?!([a-zA-Z]+|(#\d+)|(#[xX][\dA-Fa-f]+));)/g;

export function unwrappedHtmlEscape(s: unknown): string | SafeBuffer {
  if (s instanceof SafeBuffer && s.htmlSafe) return s;
  return String(s ?? "").replace(HTML_ESCAPE_PATTERN, (c) => HTML_ESCAPE[c]);
}

export function htmlEscape(s: unknown): SafeBuffer {
  const escaped = unwrappedHtmlEscape(s);
  return escaped instanceof SafeBuffer ? escaped : htmlSafe(escaped);
}

export const h = htmlEscape;

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

export function htmlEscapeOnce(s: unknown): SafeBuffer {
  return htmlSafe(
    String(s ?? "").replace(HTML_ESCAPE_ONCE_REGEXP, (c) => (c === "&" ? "&amp;" : HTML_ESCAPE[c])),
  );
}

export function jsonEscape(s: unknown): string | SafeBuffer {
  let result = String(s ?? "");
  result = result.replace(/>/g, "\\u003e");
  result = result.replace(/</g, "\\u003c");
  result = result.replace(/&/g, "\\u0026");
  result = result.replace(/\u2028/g, "\\u2028");
  result = result.replace(/\u2029/g, "\\u2029");
  return s instanceof SafeBuffer && s.htmlSafe ? htmlSafe(result) : result;
}

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

class StringScanner {
  pos = 0;
  matched: string | null = null;

  constructor(readonly string: string) {}

  isEos(): boolean {
    return this.pos >= this.string.length;
  }

  get rest(): string {
    return this.string.slice(this.pos);
  }

  terminate(): void {
    this.pos = this.string.length;
  }

  scan(re: RegExp): string | null {
    return this._match(new RegExp(re.source, `${re.flags.replace(/[gy]/g, "")}y`));
  }

  scanUntil(re: RegExp): string | null {
    return this._match(new RegExp(re.source, `${re.flags.replace(/[gy]/g, "")}g`));
  }

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
