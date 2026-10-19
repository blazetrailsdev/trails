import {
  I18n,
  assertValidKeys,
  camelize,
  SafeBuffer,
  htmlEscape,
  htmlSafe,
  isPlainObject,
  unwrappedHtmlEscape,
} from "@blazetrails/activesupport";
import { Hash, isSymbol, symbolToS } from "@blazetrails/ruby-compat";
import { OutputBuffer } from "../buffers.js";

export function raw(stringish: unknown): SafeBuffer {
  if (stringish instanceof OutputBuffer) return htmlSafe(stringish.toStr());
  return htmlSafe(String(stringish ?? ""));
}

export function safeJoin(
  array: unknown[] | Hash<unknown, unknown> | Record<string, unknown>,
  sep?: string | SafeBuffer | null,
): SafeBuffer {
  const escapedSep = unwrappedHtmlEscape(sep ?? "");

  const flattened =
    array instanceof Hash || isPlainObject(array)
      ? [...(array instanceof Hash ? array : Object.entries(array))].flat()
      : flatten(array);
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
  }) as Record<string, string> | Map<unknown, string>;
  for (const [k, v] of i18nConnectors instanceof Map
    ? i18nConnectors
    : Object.entries(i18nConnectors)) {
    defaultConnectors[camelize(isSymbol(k) ? symbolToS(k) : String(k), "lower")] = v;
  }
  options = Object.assign(defaultConnectors, options);

  switch (array.length) {
    case 0:
      return htmlSafe("");
    case 1:
      return htmlEscape(array[0]);
    case 2:
      return safeJoin([array[0], array[1]], options.twoWordsConnector);
    default:
      return safeJoin(
        [
          safeJoin(array.slice(0, -1), options.wordsConnector),
          options.lastWordConnector,
          array.at(-1),
        ],
        null,
      );
  }
}

export const OutputSafetyHelper = {
  raw,
  safeJoin,
  toSentence,
};
