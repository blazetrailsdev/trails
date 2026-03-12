/**
 * Array utilities mirroring Rails ActiveSupport array extensions.
 */

/**
 * Wraps a value in an array. `null`/`undefined` → `[]`, arrays pass through,
 * scalars become `[value]`.
 */
export function wrap<T>(value: T | T[] | null | undefined): T[] {
  if (value === null || value === undefined) return [];
  if (Array.isArray(value)) return value;
  return [value] as T[];
}

/**
 * Split an array into groups of `n`, padding the last group with `fillWith`.
 */
export function inGroupsOf<T>(
  array: T[],
  n: number,
  fillWith: T | null | false = null,
): (T | null | false)[][] {
  const result: (T | null | false)[][] = [];
  for (let i = 0; i < array.length; i += n) {
    const group: (T | null | false)[] = array.slice(i, i + n);
    if (fillWith !== false) {
      while (group.length < n) {
        group.push(fillWith);
      }
    }
    result.push(group);
  }
  return result;
}

/**
 * Convert an array to a sentence string.
 * `["a", "b", "c"]` → `"a, b, and c"`
 */
export function toSentence(
  array: string[],
  options: {
    wordsConnector?: string;
    twoWordsConnector?: string;
    lastWordConnector?: string;
  } = {},
): string {
  const {
    wordsConnector = ", ",
    twoWordsConnector = " and ",
    lastWordConnector = ", and ",
  } = options;

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
  return groups;
}

/**
 * Split an array on a value or using a predicate function.
 * Mirrors Rails' `Array#split`.
 */
export function splitArray<T>(array: T[], valueOrFn: T | ((item: T) => boolean)): T[][] {
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
 * Return elements from index `position` onwards.
 * Mirrors Rails' `Array#from`.
 */
export function arrayFrom<T>(array: T[], position: number): T[] {
  if (position < 0) {
    const idx = array.length + position;
    return idx < 0 ? [] : array.slice(idx);
  }
  return array.slice(position);
}

/**
 * Return elements up to (and including) index `position`.
 * Mirrors Rails' `Array#to`.
 */
export function arrayTo<T>(array: T[], position: number): T[] {
  if (position < 0) {
    const idx = array.length + position;
    return idx < 0 ? [] : array.slice(0, idx + 1);
  }
  return array.slice(0, position + 1);
}

/**
 * Remove elements from `array` that match `predicate`, returning the removed elements.
 * Mirrors Rails' `Array#extract!`.
 */
export function extract<T>(array: T[], predicate?: (item: T) => boolean): T[] {
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
 * Return a new array with the given values appended.
 */
export function including<T>(array: T[], ...values: T[]): T[] {
  return [...array, ...values];
}

/**
 * Return a new array with the given values removed.
 */
export function excluding<T>(array: T[], ...values: T[]): T[] {
  return array.filter((item) => !values.includes(item));
}
