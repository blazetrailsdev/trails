/**
 * Array utilities mirroring Rails ActiveSupport array extensions.
 */

import { ArgumentError, assertValidKeys } from "./hash-utils.js";
import { I18n } from "./i18n.js";
import { camelize } from "./inflector.js";
import { inspect, toS } from "./core-ext/object/inspect.js";

/**
 * Wraps a value in an array. `null`/`undefined` → `[]`, arrays pass through,
 * scalars become `[value]`.
 */
export function wrap<T>(object: T | T[] | null | undefined): T[] {
  if (object === null || object === undefined) return [];
  if (Array.isArray(object)) return object;
  // Ruby's `object.respond_to?(:to_ary)` arm: `to_ary || [object]`, so a
  // `to_ary` answering nil still wraps, and one answering a non-array is
  // returned as-is.
  const toAry = (object as { toAry?: () => T[] | null }).toAry;
  if (typeof toAry === "function") return toAry.call(object) ?? ([object] as T[]);
  return [object] as T[];
}

/**
 * Ruby's `Kernel#Array` — the one-or-many normalization Rails leans on
 * directly (e.g. `encryption/cipher.rb:26`, `relation/batches.rb:260`).
 *
 * It is NOT `Array.wrap`: `Kernel#Array` tries `to_ary` and then `to_a`, so a
 * Hash becomes its pairs and an Enumerable becomes its elements, where
 * `Array.wrap` would wrap either in a one-element array. `Array(nil)` is `[]`
 * in both.
 *
 * @noRailsEquivalent PERMANENT — Ruby core (Kernel#Array), which Rails calls
 * without defining, so there is no Ruby file in any gem for the port to mirror;
 * JS has no global equivalent (`Array(3)` builds a 3-hole array, not `[3]`).
 */
export function kernelArray<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  // `to_ary` / `to_a`: anything iterable (bar a String, which defines neither)
  // spreads; a Map's entries mirror Ruby's Hash#to_a pairs.
  if (typeof value === "object" && typeof (value as any)[Symbol.iterator] === "function") {
    return [...(value as unknown as Iterable<T>)];
  }
  return [value] as T[];
}

/**
 * Split an array into groups of `n`, padding the last group with `fillWith`.
 */
export function inGroupsOf<T>(
  array: T[],
  number: number,
  fillWith: T | null | false = null,
  block?: (group: (T | null | false)[]) => void,
): (T | null | false)[][] {
  if (!(Number(number) > 0)) {
    throw new ArgumentError(`Group size must be a positive integer, was ${inspect(number)}`);
  }
  const result: (T | null | false)[][] = [];
  for (let i = 0; i < array.length; i += number) {
    const group: (T | null | false)[] = array.slice(i, i + number);
    if (fillWith !== false) {
      while (group.length < number) {
        group.push(fillWith);
      }
    }
    result.push(group);
  }
  if (block) result.forEach(block);
  return result;
}

/**
 * Convert an array to a sentence string.
 * `["a", "b", "c"]` → `"a, b, and c"`
 *
 * Ruby's `default_connectors.merge!(options)` overrides on key presence; a TS
 * caller forwarding an absent option passes `undefined`, which must not
 * override, so the merge skips `undefined` values.
 */
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

/**
 * Split an array into `n` groups of roughly equal size, padding with `fillWith`.
 * Mirrors Rails' `Array#in_groups`.
 */
export function inGroups<T>(
  array: T[],
  n: number,
  fillWith: T | null | false = null,
  block?: (group: (T | null | false)[]) => void,
): (T | null | false)[][] {
  const quotient = Math.floor(array.length / n);
  const remainder = array.length % n;
  const groups: (T | null | false)[][] = [];
  let start = 0;
  for (let i = 0; i < n; i++) {
    const size = i < remainder ? quotient + 1 : quotient;
    const group: (T | null | false)[] = array.slice(start, start + size);
    if (fillWith !== false) {
      while (group.length < quotient + (remainder > 0 ? 1 : 0)) {
        group.push(fillWith);
      }
    }
    groups.push(group);
    start += size;
  }
  if (block) groups.forEach(block);
  return groups;
}

/**
 * Split an array on a value or using a predicate function.
 * Mirrors Rails' `Array#split`.
 */
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

/**
 * Remove elements from `array` that match `predicate`, returning the removed elements.
 * Mirrors Rails' `Array#extract!`.
 */
export function extractBang<T>(array: T[], predicate?: (item: T) => boolean): T[] {
  if (!predicate) return array.splice(0, array.length);
  const extracted: T[] = [];
  for (let i = array.length - 1; i >= 0; i--) {
    if (predicate(array[i])) {
      extracted.unshift(...array.splice(i, 1));
    }
  }
  return extracted;
}

/**
 * Extends `Array#to_s` to convert a collection of elements into a comma
 * separated id list if `:db` argument is given as the format.
 *
 * Mirrors: `Array#to_fs` (`core_ext/array/conversions.rb:94-105`).
 */
export function toFs(self: unknown[], format = "default"): string {
  switch (format) {
    case "db":
      if (self.length === 0) {
        return "null";
      } else {
        return self.map((e) => (e as { id: unknown }).id).join(",");
      }
    default:
      return toS(self);
  }
}

// `alias_method :to_formatted_s, :to_fs` — conversions.rb:106.
export { toFs as toFormattedS };
