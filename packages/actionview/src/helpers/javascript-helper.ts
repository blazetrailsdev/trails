import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";
import { contentTag } from "./tag-helper.js";
import { cdataSection } from "./tag-helper.js";

/**
 * ActionView::Helpers::JavaScriptHelper
 */

const JS_ESCAPE_MAP: Record<string, string> = {
  "\\": "\\\\",
  "</": "<\\/",
  "\r\n": "\\n",
  "\n": "\\n",
  "\r": "\\n",
  '"': '\\"',
  "'": "\\'",
  "`": "\\`",
  $: "\\$",
  "\u2028": "&#x2028;",
  "\u2029": "&#x2029;",
};

const JS_ESCAPE_PATTERN = /(\\|<\/|\r\n|\u2028|\u2029|[\n\r"']|[`]|[$])/g;

/**
 * escapeJavascript — escapes carriage returns, quotes, and other characters
 * for safe embedding in JavaScript strings.
 */
export function escapeJavascript(javascript: unknown): string | SafeBuffer {
  const str = String(javascript ?? "");
  if (str === "") {
    const wasSafe = javascript instanceof SafeBuffer && javascript.htmlSafe;
    return wasSafe ? htmlSafe("") : "";
  }
  const result = str.replace(JS_ESCAPE_PATTERN, (match) => JS_ESCAPE_MAP[match] ?? match);
  const wasSafe = javascript instanceof SafeBuffer && javascript.htmlSafe;
  return wasSafe ? htmlSafe(result) : result;
}

export const j = escapeJavascript;

/**
 * javascriptCdataSection — wraps content in a JavaScript CDATA section.
 */
export function javascriptCdataSection(content: string): SafeBuffer {
  return htmlSafe(`\n//${cdataSection(`\n${content}\n//`).toString()}\n`);
}

/**
 * javascriptTag — returns a <script> tag wrapping the content.
 */
export function javascriptTag(content: string, htmlOptions?: Record<string, unknown>): SafeBuffer {
  const opts = htmlOptions ? { ...htmlOptions } : {};
  const cdataContent = javascriptCdataSection(content);
  return contentTag("script", cdataContent, opts, true) as SafeBuffer;
}
