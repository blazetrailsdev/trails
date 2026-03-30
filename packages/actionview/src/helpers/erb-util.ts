import {
  SafeBuffer,
  htmlEscape as _htmlEscape,
  htmlEscapeOnce as _htmlEscapeOnce,
  htmlSafe,
} from "@blazetrails/activesupport";

/**
 * ERB::Util equivalent — html_escape, json_escape, html_escape_once
 */

export const htmlEscape = _htmlEscape;
export const h = _htmlEscape;
export const htmlEscapeOnce = _htmlEscapeOnce;

const JSON_ESCAPE: Record<string, string> = {
  "&": "\\u0026",
  ">": "\\u003e",
  "<": "\\u003c",
  "\u2028": "\\u2028",
  "\u2029": "\\u2029",
};

const JSON_ESCAPE_PATTERN = /[&><\u2028\u2029]/g;

/**
 * jsonEscape — escapes characters that would be unsafe to embed JSON in HTML.
 * Returns html_safe if input was html_safe.
 */
export function jsonEscape(value: unknown): string | SafeBuffer {
  const wasSafe = value instanceof SafeBuffer && value.htmlSafe;
  const input = value == null ? "" : String(value);
  const result = input.replace(JSON_ESCAPE_PATTERN, (c) => JSON_ESCAPE[c]);
  return wasSafe ? htmlSafe(result) : result;
}
