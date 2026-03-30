import { SafeBuffer, htmlEscape, htmlSafe } from "@blazetrails/activesupport";

/**
 * ActionView::Helpers::OutputSafetyHelper
 *
 * Provides raw, safe_join, and to_sentence — html_safe-aware helpers.
 */

/**
 * raw — marks a string as HTML safe without escaping.
 */
export function raw(stringish: unknown): SafeBuffer {
  return htmlSafe(String(stringish ?? ""));
}

/**
 * unwrappedHtmlEscape — escapes HTML but returns SafeBuffer with the underlying
 * string value (for joining purposes). If value is already html_safe, returns as-is.
 */
function unwrappedHtmlEscape(value: unknown): SafeBuffer {
  if (value instanceof SafeBuffer) {
    if (value.htmlSafe) {
      return value;
    }
    return htmlEscape(value.toString());
  }
  return htmlEscape(value);
}

/**
 * safeJoin — joins an array with a separator, escaping non-html_safe elements.
 * Both elements and separator are escaped unless html_safe.
 */
export function safeJoin(array: unknown[], sep?: string | SafeBuffer | null): SafeBuffer {
  const escapedSep = unwrappedHtmlEscape(sep ?? "");

  const flattened = flatten(array);
  const escaped = flattened.map((i) => unwrappedHtmlEscape(i));
  const joined = escaped.map((s) => s.toString()).join(escapedSep.toString());
  return htmlSafe(joined);
}

function flatten(arr: unknown[]): unknown[] {
  const result: unknown[] = [];
  for (const item of arr) {
    if (Array.isArray(item)) {
      result.push(...flatten(item));
    } else {
      result.push(item);
    }
  }
  return result;
}

export interface ToSentenceOptions {
  wordsConnector?: string | SafeBuffer | null;
  twoWordsConnector?: string | SafeBuffer | null;
  lastWordConnector?: string | SafeBuffer | null;
  locale?: string;
}

/**
 * toSentence — converts an array to a comma-separated sentence.
 * HTML-safe-aware version of Array#to_sentence.
 */
export function toSentence(array: unknown[], options: ToSentenceOptions = {}): SafeBuffer {
  const defaultConnectors = {
    wordsConnector: ", ",
    twoWordsConnector: " and ",
    lastWordConnector: ", and ",
  };

  const wordsConnector =
    options.wordsConnector !== undefined
      ? options.wordsConnector
      : defaultConnectors.wordsConnector;
  const twoWordsConnector =
    options.twoWordsConnector !== undefined
      ? options.twoWordsConnector
      : defaultConnectors.twoWordsConnector;
  const lastWordConnector =
    options.lastWordConnector !== undefined
      ? options.lastWordConnector
      : defaultConnectors.lastWordConnector;

  switch (array.length) {
    case 0:
      return htmlSafe("");
    case 1:
      return unwrappedHtmlEscape(array[0]);
    case 2:
      return safeJoin([array[0], array[1]], twoWordsConnector as string | SafeBuffer);
    default: {
      const allButLast = array.slice(0, -1);
      const last = array[array.length - 1];
      const joinedHead = safeJoin(allButLast, wordsConnector as string | SafeBuffer);
      return safeJoin([joinedHead, lastWordConnector, last], null);
    }
  }
}
