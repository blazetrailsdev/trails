import {
  I18n,
  assertValidKeys,
  camelize,
  SafeBuffer,
  htmlEscape,
  htmlSafe,
  unwrappedHtmlEscape,
} from "@blazetrails/activesupport";
import { OutputBuffer } from "../buffers.js";

/**
 * ActionView::Helpers::OutputSafetyHelper
 *
 * Provides raw, safe_join, and to_sentence — html_safe-aware helpers.
 */

/**
 * raw — marks a string as HTML safe without escaping.
 */
export function raw(stringish: unknown): SafeBuffer {
  if (stringish instanceof OutputBuffer) return htmlSafe(stringish.toStr());
  return htmlSafe(String(stringish ?? ""));
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
  locale?: string | false;
}

/**
 * toSentence — converts an array to a comma-separated sentence.
 * HTML-safe-aware version of Array#to_sentence.
 */
export function toSentence(array: unknown[], options: ToSentenceOptions = {}): SafeBuffer {
  assertValidKeys(options as Record<string, unknown>, [
    "wordsConnector",
    "twoWordsConnector",
    "lastWordConnector",
    "locale",
  ]);

  const defaultConnectors: Record<string, string | SafeBuffer | null> = {
    wordsConnector: ", ",
    twoWordsConnector: " and ",
    lastWordConnector: ", and ",
  };
  const i18nConnectors = I18n.translate("support.array", {
    locale: options.locale ?? null,
    default: {},
  }) as Record<string, string>;
  for (const [k, v] of Object.entries(i18nConnectors)) {
    defaultConnectors[camelize(k, "lower")] = v;
  }
  // Ruby's `default_connectors.merge!(options)` overrides on key presence; a TS
  // caller forwarding an absent option passes `undefined`, which must not
  // override, so the merge skips `undefined` values.
  for (const [k, v] of Object.entries(options)) {
    if (v !== undefined) defaultConnectors[k] = v as string | SafeBuffer | null;
  }
  const { wordsConnector, twoWordsConnector, lastWordConnector } = defaultConnectors;

  switch (array.length) {
    case 0:
      return htmlSafe("");
    case 1:
      return htmlEscape(array[0]);
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
