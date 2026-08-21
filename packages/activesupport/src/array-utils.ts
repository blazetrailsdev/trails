/**
 * Array utilities mirroring Rails ActiveSupport array extensions.
 */

import { ArgumentError, assertValidKeys } from "./hash-utils.js";
import { I18n } from "./i18n.js";
import { camelize, pluralize, singularize, underscore } from "./inflector.js";
import * as XmlMini from "./xml-mini.js";
import { isPlainObject } from "./hash-utils.js";
import { inspect, toS } from "./core-ext/object/inspect.js";
import { isEmpty } from "./ruby-empty.js";

/**
 * Wraps its argument in an array unless it is already an array (or array-like).
 *
 * Mirrors: `Array.wrap` (`core_ext/array/wrap.rb:39-46`) — the
 * `respond_to?(:to_ary)` arm is `object.to_ary || [object]`, so a `to_ary`
 * answering nil still wraps and one answering a non-array is returned as-is.
 */
export function wrap<T>(object: T | T[] | null | undefined): T[] {
  if (object === null || object === undefined) return [];
  if (Array.isArray(object)) return object;
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
 * Splits or iterates over the array in groups of size +number+, padding any
 * remaining slots with +fill_with+ unless it is +false+.
 *
 * Mirrors: `Array#in_groups_of` (`core_ext/array/grouping.rb:21-49`). Ruby's
 * `to_i` and `Array.new` both TRUNCATE, and `each_slice` truncates through
 * `to_int`, so a fractional +number+ is floored at three separate points while
 * the error message reports it unrounded via `inspect` — `in_groups_of(0.7)`
 * raises where `0.7 > 0` would have passed.
 */
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
 * Splits or iterates over the array in +number+ of groups, padding any
 * remaining slots with +fill_with+ unless it is +false+.
 *
 * Mirrors: `Array#in_groups` (`core_ext/array/grouping.rb:57-84`). `division`
 * is Ruby's `size.div number`, floor division as a method — JS has only the
 * operator, so it is `Math.floor` here.
 */
export function inGroups<T>(
  array: T[],
  number: number,
  fillWith: T | null | false = null,
  block?: (group: (T | null | false)[]) => void,
): (T | null | false)[][] {
  // size.div number gives minor group size;
  // size % number gives how many objects need extra accommodation;
  // each group hold either division or division + 1 items.
  const division = Math.floor(array.length / number);
  const modulo = array.length % number;

  // create a new array avoiding dup
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
 * Keep only the elements matching `predicate`, IN PLACE — Ruby's
 * `Array#select!`. The mutation is the point: every holder of the array sees
 * it, which is what `HasManyAssociation#count_records`
 * (`has_many_association.rb:91`) relies on when it prunes the loaded target.
 *
 * @noRailsEquivalent PERMANENT — Ruby core `Array`, not Rails, exactly as
 * `transformKeys` (hash-utils.ts) is Ruby core `Hash`. Rails bodies call it and
 * JS arrays have no in-place filter, so it is spelled here for the ports that
 * consume it.
 */
export function selectBang<T>(array: T[], predicate: (item: T) => boolean): T[] {
  array.splice(0, array.length, ...array.filter(predicate));
  return array;
}

/**
 * Remove elements from `array` that match `predicate`, returning the removed elements.
 *
 * Mirrors: `Array#extract!` (core_ext/array/extract.rb:10-20). Ruby's no-block
 * arm (`return to_enum(:extract!) { size } unless block_given?`, line 11) has
 * no JS analogue — there is no Enumerator to return, as at `Enumerable#index_with`
 * and `Deprecators#each` — so the predicate is required.
 */
export function extractBang<T>(array: T[], predicate: (item: T) => boolean): T[] {
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
      if (isEmpty(self)) {
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

/**
 * Ruby's `value.class.name` for the `all?(first.class)` root inference
 * (conversions.rb:190-192). JS has one `Number` where Ruby has `Integer` and
 * `Float`, so the split follows `XmlMini`'s own `TYPE_NAMES` mapping and
 * `[1, 2]` still roots at `integers` the way Rails does.
 */
function rubyClassName(value: unknown): string {
  if (value === null || value === undefined) return "NilClass";
  switch (typeof value) {
    case "boolean":
      return value ? "TrueClass" : "FalseClass";
    case "bigint":
      return "Integer";
    case "number":
      return Number.isInteger(value) ? "Integer" : "Float";
    case "string":
      return "String";
    default:
      return (value as object).constructor.name;
  }
}

/**
 * Returns a string that represents the array in XML by invoking `to_xml` on
 * each element. Mirrors: `Array#to_xml` (conversions.rb:183-212). Ruby `||=`
 * replaces only nil/false and `0` is truthy there, so `indent: 0` survives the
 * defaulting — hence `??=`.
 */
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
    if (!isPlainObject(first) && self.every((e) => rubyClassName(e) === rubyClassName(first))) {
      const underscored = underscore(rubyClassName(first));
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
