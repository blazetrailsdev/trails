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
  text: string | null | undefined,
  options: TruncateOptions = {},
  block?: () => unknown,
): SafeBuffer | undefined {
  if (text === null || text === undefined) return undefined;

  const length = options.length ?? 30;
  const truncated = stringTruncate(text, length, {
    omission: options.omission,
    separator: options.separator,
  });

  let content: SafeBuffer = options.escape === false ? htmlSafe(truncated) : htmlEscape(truncated);

  if (block && text.length > length) {
    const extra = block();
    const extraStr =
      extra instanceof SafeBuffer ? extra.toString() : htmlEscape(String(extra ?? "")).toString();
    content = htmlSafe(content.toString() + extraStr);
  }

  return content;
}

export interface PluralizeOptions {
  plural?: string;
  locale?: string;
}

/**
 * pluralize — returns "<count> <word>", pluralizing +singular+ unless count == 1.
 */
export function pluralize(
  count: number | string | null | undefined,
  singular: string,
  pluralOrOptions?: string | PluralizeOptions,
  options: PluralizeOptions = {},
): string {
  let plural: string | undefined;
  if (typeof pluralOrOptions === "string") {
    plural = pluralOrOptions;
  } else if (pluralOrOptions) {
    plural = pluralOrOptions.plural;
    options = pluralOrOptions;
  }
  if (options.plural !== undefined) plural = options.plural;

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
export function wordWrap(text: string, options: WordWrapOptions = {}): string {
  if (text.length === 0) return "";
  const lineWidth = options.lineWidth ?? 80;
  const breakSequence = options.breakSequence ?? "\n";

  // Match up to `lineWidth` characters, followed by either non-newline whitespace
  // (plus optional newline), end of string (with trailing newlines), or a newline.
  // OR match an empty line.
  const pattern = new RegExp(`(.{1,${lineWidth}})(?:[^\\S\\n]+\\n?|\\n*$|\\n)|\\n`, "g");

  const replaced = text.replace(pattern, `$1${breakSequence}`);
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

function splitParagraphs(text: string): string[] {
  if (isBlank(text)) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\n+/)
    .map((t) => t.replace(/([^\n]\n)(?=[^\n])/g, "$1<br />"));
}
