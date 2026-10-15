import { SafeBuffer, htmlSafe, isPlainObject } from "@blazetrails/activesupport";

import { capture } from "./capture-helper.js";
import { cdataSection, contentTag, type TagHelperHost } from "./tag-helper.js";
import { Module } from "@blazetrails/ruby-compat";

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
  this: TagHelperHost & { contentSecurityPolicyNonce(): string | null },
  contentOrOptionsWithBlock: unknown = null,
  htmlOptions: Record<string, unknown> = {},
  block?: () => unknown,
): SafeBuffer {
  let content: unknown;
  if (block) {
    if (isPlainObject(contentOrOptionsWithBlock)) {
      htmlOptions = contentOrOptionsWithBlock as Record<string, unknown>;
    }
    content = capture.call(this, block);
  } else {
    content = contentOrOptionsWithBlock;
  }

  if (htmlOptions.nonce === true) {
    htmlOptions.nonce = this.contentSecurityPolicyNonce();
  }

  return contentTag.call(this, "script", javascriptCdataSection(content), htmlOptions);
}

export const JavaScriptHelper = new Module((mod) => {
  mod.moduleEval((m) => {
    Object.assign(m, { escapeJavascript, j, javascriptCdataSection, javascriptTag });
  });
});
