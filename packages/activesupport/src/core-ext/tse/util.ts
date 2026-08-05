/**
 * ERB::Util — the escaping utilities Rails defines in
 * `active_support/core_ext/erb/util.rb`.
 */

import { SafeBuffer, htmlSafe } from "../string/output-safety.js";

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
 * `unwrapped_html_escape` (`core_ext/erb/util.rb:11-18`).
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
// `core_ext/erb/util.rb:44-51`. Supplementary-plane code points (U+10000+)
// are outside the ranges JS character classes spell here and are replaced
// with TAG_NAME_REPLACEMENT_CHAR.
/* eslint-disable no-misleading-character-class -- XML spec character ranges */
const TAG_NAME_START_CODEPOINTS =
  "@:A-Z_a-z\\xC0-\\xD6\\xD8-\\xF6\\u00F8-\\u02FF\\u0370-\\u037D\\u037F-\\u1FFF\\u200C-\\u200D\\u2070-\\u218F\\u2C00-\\u2FEF\\u3001-\\uD7FF\\uF900-\\uFDCF\\uFDF0-\\uFFFD";
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
 * Mirrors: ERB::Util#html_escape_once (`core_ext/erb/util.rb:63-65`).
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
