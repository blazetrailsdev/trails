import {
  SafeBuffer,
  htmlEscape,
  htmlSafe,
  isBlank,
  pluralize as inflectorPluralize,
  truncate as stringTruncate,
} from "@blazetrails/activesupport";
import { OutputBuffer } from "../buffers.js";
import { contentTag } from "./tag-helper.js";
import { sanitize } from "./sanitize-helper.js";
import { raw } from "./output-safety-helper.js";

/**
 * Host interface for helpers that write to or read per-render state from
 * a view context. Rails stores `@output_buffer` and `@_cycles` on the
 * view instance; the equivalents here are properties on the host.
 */
export interface TextHelperHost {
  outputBuffer: OutputBuffer;
  /** @internal */
  _cycles?: Record<string, Cycle>;
}

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

  const textStr = text instanceof SafeBuffer ? text.toString() : text;
  const length = options.length ?? 30;
  const truncated = stringTruncate(textStr, length, {
    omission: options.omission,
    separator: options.separator,
  });

  let content: SafeBuffer = options.escape === false ? htmlSafe(truncated) : htmlEscape(truncated);

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

export interface HighlightOptions {
  highlighter?: string;
  sanitize?: boolean;
}

/**
 * highlight — highlights occurrences of +phrases+ in +text+ by wrapping
 * matches in `<mark>` (or a custom highlighter / block-supplied) HTML.
 * Sanitizes input by default; preserves HTML tag structure by only
 * substituting within text segments.
 */
export function highlight(
  text: string | SafeBuffer | null | undefined,
  phrases: string | RegExp | Array<string | RegExp> | null | undefined,
  options: HighlightOptions = {},
  block?: (match: string) => string,
): SafeBuffer {
  const doSanitize = options.sanitize !== false;
  let working: string;
  if (text == null) {
    working = "";
  } else {
    working = doSanitize ? sanitize(String(text)).toString() : String(text);
  }

  const phrasesBlank =
    phrases == null ||
    (typeof phrases === "string" && phrases.length === 0) ||
    (Array.isArray(phrases) && phrases.length === 0);
  const phraseList: Array<string | RegExp> = Array.isArray(phrases)
    ? phrases
    : phrases == null
      ? []
      : [phrases];

  if (isBlank(working) || phrasesBlank) {
    return htmlSafe(working);
  }

  const sources = phraseList.map((p) => (p instanceof RegExp ? p.source : escapeRegExp(String(p))));
  const pattern = new RegExp(`(${sources.join("|")})`, "gi");
  const highlighter = options.highlighter ?? "<mark>\\1</mark>";

  const segments = working.match(/<[^>]*|[^<]+/g) ?? [];
  const replaced = segments
    .map((segment) => {
      if (segment.startsWith("<")) return segment;
      if (block) {
        return segment.replace(pattern, (match) => block(match));
      }
      return segment.replace(pattern, (_match, p1: string) => highlighter.replace(/\\1/g, p1));
    })
    .join("");

  return htmlSafe(replaced);
}

export interface ExcerptOptions {
  radius?: number;
  omission?: string;
  separator?: string;
}

/**
 * excerpt — extracts the first occurrence of +phrase+ plus surrounding text,
 * prepending / appending an omission marker when the excerpt is truncated.
 * Returns null if +phrase+ is not found.
 */
export function excerpt(
  text: string | null | undefined,
  phrase: string | RegExp | null | undefined,
  options: ExcerptOptions = {},
): string | null {
  if (text == null || phrase == null) return null;

  const separator = options.separator ?? "";
  const regex = phrase instanceof RegExp ? phrase : new RegExp(escapeRegExp(String(phrase)), "i");

  const match = text.match(regex);
  if (!match) return null;
  let matchedPhrase: string = match[0];

  if (separator !== "") {
    for (const value of text.split(separator)) {
      if (regex.test(value)) {
        matchedPhrase = value;
        break;
      }
    }
  }

  const idx = text.indexOf(matchedPhrase);
  const firstPart = text.slice(0, idx);
  const secondPart = text.slice(idx + matchedPhrase.length);

  const [prefix, first] = cutExcerptPart("first", firstPart, separator, options);
  const [postfix, second] = cutExcerptPart("second", secondPart, separator, options);

  const affix = [first, separator, matchedPhrase, separator, second].join("").trim();
  return [prefix, affix, postfix].join("");
}

/** @internal */
function cutExcerptPart(
  position: "first" | "second",
  part: string | null,
  separator: string,
  options: ExcerptOptions,
): [string, string] {
  if (part == null) return ["", ""];

  const radius = options.radius ?? 100;
  const omission = options.omission ?? "...";

  let tokens: string[];
  if (separator !== "") {
    tokens = part.split(separator).filter((t) => t !== "");
  } else {
    tokens = Array.from(part);
  }

  const affix = tokens.length > radius ? omission : "";
  const sliced =
    position === "first"
      ? tokens.slice(Math.max(0, tokens.length - radius))
      : tokens.slice(0, radius);

  const joined = separator !== "" ? sliced.join(separator) : sliced.join("");
  return [affix, joined];
}

/** @internal */
function escapeRegExp(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
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

/**
 * concat — append +value+ to the host's output buffer. Use inside non-output
 * code blocks where you cannot use `<%= %>`. Mirrors `ActionView::Helpers::TextHelper#concat`.
 */
export function concat(this: TextHelperHost, value: unknown): OutputBuffer {
  this.outputBuffer.concat(value);
  return this.outputBuffer;
}

/**
 * safe_concat — like {@link concat}, but appends the value as HTML-safe.
 * Mirrors `ActionView::Helpers::TextHelper#safe_concat`.
 */
export function safeConcat(this: TextHelperHost, value: unknown): OutputBuffer {
  this.outputBuffer.safeConcat(value);
  return this.outputBuffer;
}

/**
 * Cycle — cycles through its values each time {@link Cycle.toString} is called.
 * Mirrors `ActionView::Helpers::TextHelper::Cycle`.
 */
export class Cycle {
  readonly values: unknown[];
  private _index = 0;

  constructor(firstValue: unknown, ...rest: unknown[]) {
    if (arguments.length === 0) {
      throw new TypeError("wrong number of arguments (given 0, expected 1+)");
    }
    this.values = [firstValue, ...rest];
  }

  reset(): void {
    this._index = 0;
  }

  currentValue(): string {
    return String(this.values[this._previousIndex()] ?? "");
  }

  toString(): string {
    const value = String(this.values[this._index] ?? "");
    this._index = this._nextIndex();
    return value;
  }

  /** @internal */
  private _nextIndex(): number {
    return this._stepIndex(1);
  }

  /** @internal */
  private _previousIndex(): number {
    return this._stepIndex(-1);
  }

  /** @internal */
  private _stepIndex(n: number): number {
    const size = this.values.length;
    return (((this._index + n) % size) + size) % size;
  }
}

export interface CycleOptions {
  name?: string;
}

function isCycleOptions(value: unknown): value is CycleOptions {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value) &&
    !(value instanceof Cycle) &&
    Object.getPrototypeOf(value) === Object.prototype
  );
}

/**
 * cycle — returns a {@link Cycle} (stringifies to the next value each call).
 * The first arg may be an array of values; trailing options may carry `name`
 * to scope the cycle. Mirrors `ActionView::Helpers::TextHelper#cycle`.
 */
export function cycle(this: TextHelperHost, firstValue: unknown, ...rest: unknown[]): string {
  if (arguments.length === 0) {
    throw new TypeError("wrong number of arguments (given 0, expected 1+)");
  }
  let options: CycleOptions = {};
  if (rest.length > 0 && isCycleOptions(rest[rest.length - 1])) {
    options = rest.pop() as CycleOptions;
  }
  const name = options.name ?? "default";

  const values = Array.isArray(firstValue) ? [...firstValue, ...rest] : [firstValue, ...rest];

  let existing = getCycle(this, name);
  if (!existing || !valuesEqual(existing.values, values)) {
    existing = setCycle(this, name, new Cycle(values[0], ...values.slice(1)));
  }
  return existing.toString();
}

/**
 * current_cycle — returns the current cycle string without advancing.
 * Mirrors `ActionView::Helpers::TextHelper#current_cycle`.
 */
export function currentCycle(this: TextHelperHost, name = "default"): string | undefined {
  const c = getCycle(this, name);
  return c ? c.currentValue() : undefined;
}

/**
 * reset_cycle — rewinds the named cycle to its first element.
 * Mirrors `ActionView::Helpers::TextHelper#reset_cycle`.
 */
export function resetCycle(this: TextHelperHost, name = "default"): void {
  const c = getCycle(this, name);
  if (c) c.reset();
}

/** @internal */
function getCycle(host: TextHelperHost, name: string): Cycle | undefined {
  const cycles = host._cycles;
  if (!cycles || !Object.hasOwn(cycles, name)) return undefined;
  return cycles[name];
}

/** @internal */
function setCycle(host: TextHelperHost, name: string, cycle: Cycle): Cycle {
  host._cycles ??= Object.create(null) as Record<string, Cycle>;
  host._cycles[name] = cycle;
  return cycle;
}

/** @internal */
function valuesEqual(a: unknown[], b: unknown[]): boolean {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}

/** @internal */
function splitParagraphs(text: string): string[] {
  if (isBlank(text)) return [];
  return text
    .replace(/\r\n?/g, "\n")
    .split(/\n\n+/)
    .map((t) => t.replace(/([^\n]\n)(?=[^\n])/g, "$1<br />"));
}
