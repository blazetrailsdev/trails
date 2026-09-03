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

export function raw(stringish: unknown): SafeBuffer {
  if (stringish instanceof OutputBuffer) return htmlSafe(stringish.toStr());
  return htmlSafe(String(stringish ?? ""));
}

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
