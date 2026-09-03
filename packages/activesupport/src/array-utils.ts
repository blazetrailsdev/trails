import { ArgumentError, assertValidKeys } from "./hash-utils.js";
import { I18n } from "./i18n.js";
import { camelize, pluralize, singularize, underscore } from "./inflector.js";
import * as XmlMini from "./xml-mini.js";
import { isPlainObject } from "./hash-utils.js";
import { rbInspect as inspect, rbObjAsString as toS } from "@blazetrails/ruby-compat";
import { isEmpty } from "@blazetrails/ruby-compat";
import { rbObjClass } from "@blazetrails/ruby-compat";

export function wrap<T>(object: T | T[] | null | undefined): T[] {
  if (object === null || object === undefined) return [];
  if (Array.isArray(object)) return object;
  if ("toAry" in Object(object)) {
    const toAry = (object as { toAry?: () => T[] | null }).toAry;
    if (typeof toAry === "function") return toAry.call(object) ?? ([object] as T[]);
  }
  return [object] as T[];
}

/** @noRailsEquivalent PERMANENT */
export function kernelArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  if (typeof value === "object" && typeof (value as any)[Symbol.iterator] === "function") {
    return [...(value as unknown as Iterable<T>)];
  }
  return [value] as T[];
}

export function inGroupsOf<T>(
  array: T[],
  number: number,
  fillWith: T | null | false = null,
  block?: (group: (T | null | false)[]) => void,
): (T | null | false)[][] {
  const numberToI = Math.trunc(Number(number)) || 0;
  if (numberToI <= 0) {
    throw new ArgumentError(`Group size must be a positive integer, was ${inspect(number)}`);
  }

  let collection: (T | null | false)[];
  if (fillWith === false) {
    collection = array;
  } else {
    const padding = Math.trunc((number - (array.length % number)) % number) || 0;
    collection = (array as (T | null | false)[]).concat(
      globalThis.Array<T | null | false>(padding).fill(fillWith),
    );
  }

  const result: (T | null | false)[][] = [];
  for (let i = 0; i < collection.length; i += numberToI) {
    result.push(collection.slice(i, i + numberToI));
  }
  if (block) result.forEach(block);
  return result;
}

export function toSentence(
  array: string[],
  options: {
    wordsConnector?: string;
    twoWordsConnector?: string;
    lastWordConnector?: string;
    locale?: string | false;
  } = {},
): string {
  assertValidKeys(options, ["wordsConnector", "twoWordsConnector", "lastWordConnector", "locale"]);

  const defaultConnectors: Record<string, string> = {
    wordsConnector: ", ",
    twoWordsConnector: " and ",
    lastWordConnector: ", and ",
  };
  if (options.locale !== false) {
    const i18nConnectors = I18n.translate("support.array", {
      locale: options.locale ?? null,
      default: {},
    }) as Record<string, string>;
    for (const [k, v] of Object.entries(i18nConnectors)) {
      defaultConnectors[camelize(k, "lower")] = v;
    }
  }
  for (const [k, v] of Object.entries(options)) {
    if (v !== undefined) defaultConnectors[k] = v as string;
  }
  const { wordsConnector, twoWordsConnector, lastWordConnector } = defaultConnectors;

  if (array.length === 0) return "";
  if (array.length === 1) return array[0];
  if (array.length === 2) return array[0] + twoWordsConnector + array[1];

  return array.slice(0, -1).join(wordsConnector) + lastWordConnector + array[array.length - 1];
}

export function inGroups<T>(
  array: T[],
  number: number,
  fillWith: T | null | false = null,
  block?: (group: (T | null | false)[]) => void,
): (T | null | false)[][] {
  const division = Math.floor(array.length / number);
  const modulo = array.length % number;

  const groups: (T | null | false)[][] = [];
  let start = 0;

  for (let index = 0; index < number; index++) {
    const length = division + (modulo > 0 && modulo > index ? 1 : 0);
    const lastGroup: (T | null | false)[] = array.slice(start, start + length);
    groups.push(lastGroup);
    if (fillWith !== false && modulo > 0 && length === division) lastGroup.push(fillWith);
    start += length;
  }

  if (block) groups.forEach(block);
  return groups;
}

export function split<T>(array: T[], valueOrFn: T | ((item: T) => boolean)): T[][] {
  const predicate =
    typeof valueOrFn === "function"
      ? (valueOrFn as (item: T) => boolean)
      : (item: T) => item === valueOrFn;

  const result: T[][] = [];
  let current: T[] = [];
  for (const item of array) {
    if (predicate(item)) {
      result.push(current);
      current = [];
    } else {
      current.push(item);
    }
  }
  result.push(current);
  return result;
}

/** @noRailsEquivalent PERMANENT */
export function selectBang<T>(array: T[], predicate: (item: T) => boolean): T[] {
  array.splice(0, array.length, ...array.filter(predicate));
  return array;
}

/** @noRailsEquivalent PERMANENT */
export function min<T>(collection: readonly T[]): T | undefined {
  let result: T | undefined;
  let seen = false;
  for (const item of collection) {
    if (!seen || item < (result as T)) {
      result = item;
      seen = true;
    }
  }
  return result;
}

export function extractBang<T>(array: T[], predicate: (item: T) => boolean): T[] {
  const extracted: T[] = [];
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) {
      extracted.unshift(...array.splice(i, 1));
    }
  }
  return extracted;
}

export function toFs(self: unknown[], format = "default"): string {
  switch (format) {
    case "db":
      if (isEmpty(self)) {
        return "null";
      } else {
        return self.map((e) => (e as { id: unknown }).id).join(",");
      }
    default:
      return toS(self);
  }
}

export { toFs as toFormattedS };

export function toXml(
  self: unknown[],
  options: XmlMini.ToXmlOptions = {},
  block?: (builder: XmlMini.XmlBuilder) => void,
): string {
  options = { ...options };
  options.indent ??= 2;
  options.builder ??= new XmlMini.IndentedXmlStringBuilder("", options.indent);
  options.root ??= (() => {
    const first = self[0];
    if (!isPlainObject(first) && self.every((e) => rbObjClass(e) === rbObjClass(first))) {
      const underscored = underscore(rbObjClass(first));
      return pluralize(underscored).replaceAll("/", "_");
    } else {
      return "objects";
    }
  })();

  const builder = options.builder;
  const skipInstruct = options.skipInstruct;
  delete options.skipInstruct;
  if (!skipInstruct) builder.instruct();

  const root = XmlMini.renameKey(String(options.root), options);
  const children = options.children ?? singularize(root);
  delete options.children;
  const attributes: Record<string, string> = options.skipTypes ? {} : { type: "array" };

  if (isEmpty(self)) {
    builder.tag(root, null, attributes);
  } else {
    builder.openTag(root, attributes);
    for (const value of self) {
      XmlMini.toTag(children, value, options as XmlMini.ToTagOptions);
    }
    if (block) block(builder);
    builder.closeTag(root);
  }
  return builder.target();
}
