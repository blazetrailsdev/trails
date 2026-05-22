import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";

import { capture, type CaptureHelperHost } from "./capture-helper.js";
import { cdataSection, contentTag } from "./tag-helper.js";

/**
 * ActionView::Helpers::JavaScriptHelper
 */

export const JS_ESCAPE_MAP: Record<string, string> = {
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
 * Escapes carriage returns and single and double quotes for JavaScript
 * segments. Also available through the alias {@link j}.
 */
export function escapeJavascript(javascript: unknown): string | SafeBuffer {
  const str = javascript == null ? "" : String(javascript);
  const result =
    str === "" ? "" : str.replace(JS_ESCAPE_PATTERN, (match) => JS_ESCAPE_MAP[match] ?? match);
  const wasSafe = javascript instanceof SafeBuffer && javascript.htmlSafe;
  return wasSafe ? htmlSafe(result) : result;
}

export const j = escapeJavascript;

/** @internal */
export function javascriptCdataSection(content: unknown): SafeBuffer {
  return htmlSafe(`\n//${cdataSection(`\n${String(content ?? "")}\n//`).toString()}\n`);
}

/**
 * Returns a JavaScript `<script>` tag wrapping `content` in a CDATA section.
 * Mirrors `ActionView::Helpers::JavaScriptHelper#javascript_tag`. Pass a
 * block (with optional leading `htmlOptions`) to capture from the output
 * buffer instead.
 */
export function javascriptTag(
  this: CaptureHelperHost | void,
  contentOrOptions?: unknown,
  htmlOptions?: Record<string, unknown> | (() => unknown),
  block?: () => unknown,
): SafeBuffer {
  const resolvedBlock =
    typeof htmlOptions === "function"
      ? htmlOptions
      : typeof block === "function"
        ? block
        : undefined;

  let opts: Record<string, unknown>;
  let content: unknown;

  if (resolvedBlock) {
    const isHash =
      contentOrOptions != null &&
      typeof contentOrOptions === "object" &&
      Object.getPrototypeOf(contentOrOptions) === Object.prototype;
    opts = isHash
      ? { ...(contentOrOptions as Record<string, unknown>) }
      : typeof htmlOptions === "object" && htmlOptions !== null
        ? { ...(htmlOptions as Record<string, unknown>) }
        : {};
    content = capture.call(this as CaptureHelperHost, resolvedBlock);
  } else {
    content = contentOrOptions;
    opts =
      typeof htmlOptions === "object" && htmlOptions !== null
        ? { ...(htmlOptions as Record<string, unknown>) }
        : {};
  }

  return contentTag("script", javascriptCdataSection(content), opts, true) as SafeBuffer;
}
