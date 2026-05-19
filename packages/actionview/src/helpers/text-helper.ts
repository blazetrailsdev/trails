import {
  SafeBuffer,
  htmlEscape,
  htmlSafe,
  isBlank,
  pluralize as inflectorPluralize,
  truncate as stringTruncate,
} from "@blazetrails/activesupport";
import { contentTag } from "./tag-helper.js";
import { sanitize } from "./sanitize-helper.js";
import { raw } from "./output-safety-helper.js";

/**
 * ActionView::Helpers::TextHelper
 *
 * Pure-ish text helpers: truncate, pluralize, word_wrap, simple_format.
 */

export interface TruncateOptions {
  length?: number;
  omission?: string;
  separator?: string | RegExp;
  escape?: boolean;
}

/**
 * truncate — shortens +text+ to +length+, appending omission marker.
 * Result is marked HTML-safe; escaped unless `escape: false`.
 * If a block is given and text was truncated, its return value is appended.
 */
export function truncate(
  text: string | SafeBuffer | null | undefined,
  options: TruncateOptions = {},
  block?: () => unknown,
): SafeBuffer | null {
  if (text === null || text === undefined) return null;

  const wasSafe = text instanceof SafeBuffer && text.htmlSafe;
  const textStr = text instanceof SafeBuffer ? text.toString() : text;
  const length = options.length ?? 30;
  const truncated = stringTruncate(textStr, length, {
    omission: options.omission,
    separator: options.separator,
  });

  // Rails: ERB::Util.html_escape returns html_safe strings unchanged, so an
  // already-safe input passes through untouched when escape != false.
  let content: SafeBuffer =
    options.escape === false || wasSafe ? htmlSafe(truncated) : htmlEscape(truncated);

  if (block && textStr.length > length) {
    const extra = block();
    const extraStr =
      extra instanceof SafeBuffer && extra.htmlSafe
        ? extra.toString()
        : htmlEscape(
            extra instanceof SafeBuffer ? extra.toString() : String(extra ?? ""),
          ).toString();
    content = htmlSafe(content.toString() + extraStr);
  }

  return content;
}

export interface PluralizeOptions {
  plural?: string;
}

/**
 * pluralize — returns "<count> <word>", pluralizing +singular+ unless count == 1.
 */
export function pluralize(
  count: number | string | null | undefined,
  singular: string,
  pluralOrOptions?: string | PluralizeOptions,
): string {
  let plural: string | undefined;
  if (typeof pluralOrOptions === "string") {
    plural = pluralOrOptions;
  } else if (pluralOrOptions && pluralOrOptions.plural !== undefined) {
    plural = pluralOrOptions.plural;
  }

  const isOne =
    count === 1 || count === "1" || (typeof count === "string" && /^1(\.0+)?$/.test(count));

  const word = isOne ? singular : (plural ?? inflectorPluralize(singular));
  return `${count ?? 0} ${word}`;
}

export interface WordWrapOptions {
  lineWidth?: number;
  breakSequence?: string;
}

/**
 * word_wrap — wraps +text+ into lines no longer than +lineWidth+ (80 by default).
 */
export function wordWrap(text: string | SafeBuffer, options: WordWrapOptions = {}): string {
  const textStr = text instanceof SafeBuffer ? text.toString() : text;
  if (textStr.length === 0) return "";
  const lineWidth = options.lineWidth ?? 80;
  const breakSequence = options.breakSequence ?? "\n";

  // Match up to `lineWidth` characters, followed by either non-newline whitespace
  // (plus optional newline), end of string (with trailing newlines), or a newline.
  // OR match an empty line.
  const pattern = new RegExp(`(.{1,${lineWidth}})(?:[^\\S\\n]+\\n?|\\n*$|\\n)|\\n`, "g");

  const replaced = textStr.replace(pattern, (_match, group1: string | undefined) =>
    group1 === undefined ? breakSequence : group1 + breakSequence,
  );
  // Rails: .chomp!(break_sequence). Ruby's chomp("") is paragraph mode and
  // strips trailing newlines; otherwise strip one trailing copy of the arg.
  if (breakSequence === "") return replaced.replace(/\n+$/, "");
  return replaced.endsWith(breakSequence) ? replaced.slice(0, -breakSequence.length) : replaced;
}

export interface SimpleFormatOptions {
  sanitize?: boolean;
  sanitizeOptions?: Record<string, unknown>;
  wrapperTag?: string;
}

/**
 * simple_format — wraps text in `<p>` paragraphs (split on `\n\n+`) and
 * converts single newlines to `<br />`. Sanitizes by default.
 */
export function simpleFormat(
  text: string | SafeBuffer | null | undefined,
  htmlOptions: Record<string, unknown> = {},
  options: SimpleFormatOptions = {},
): SafeBuffer {
  const wrapperTag = options.wrapperTag ?? "p";

  let working: string;
  if (options.sanitize !== false) {
    working = sanitize(text == null ? "" : String(text), options.sanitizeOptions ?? {}).toString();
  } else {
    working = text == null ? "" : String(text);
  }

  const paragraphs = splitParagraphs(working);

  if (paragraphs.length === 0) {
    return contentTag(wrapperTag, null, htmlOptions);
  }

  const wrapped = paragraphs.map((paragraph) =>
    contentTag(wrapperTag, raw(paragraph), htmlOptions).toString(),
  );
  return htmlSafe(wrapped.join("\n\n"));
}

/** @internal */
function splitParagraphs(text: string): string[] {
  if (isBlank(text)) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\n+/)
    .map((t) => t.replace(/([^\n]\n)(?=[^\n])/g, "$1<br />"));
}
