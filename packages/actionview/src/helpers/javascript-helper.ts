import { SafeBuffer, htmlSafe } from "@blazetrails/activesupport";

import { capture, type CaptureHelperHost } from "./capture-helper.js";
import { cdataSection, contentTag } from "./tag-helper.js";

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

export function javascriptTag(
  this: CaptureHelperHost | void,
  contentOrOptionsWithBlock?: unknown,
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
      contentOrOptionsWithBlock != null &&
      typeof contentOrOptionsWithBlock === "object" &&
      Object.getPrototypeOf(contentOrOptionsWithBlock) === Object.prototype;
    opts = isHash
      ? { ...(contentOrOptionsWithBlock as Record<string, unknown>) }
      : typeof htmlOptions === "object" && htmlOptions !== null
        ? { ...htmlOptions }
        : {};
    content = capture.call(this as CaptureHelperHost, resolvedBlock);
  } else {
    content = contentOrOptionsWithBlock;
    opts = typeof htmlOptions === "object" && htmlOptions !== null ? { ...htmlOptions } : {};
  }

  return contentTag("script", javascriptCdataSection(content), opts);
}
