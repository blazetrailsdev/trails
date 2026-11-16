import {
  ARRAY_METHOD_TABLE,
  eachSlice,
  rbInspect as inspect,
  rtest,
} from "@blazetrails/ruby-compat";
import { ArgumentError } from "../../hash-utils.js";

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

  if (block) {
    eachSlice(collection, number, block);
    return collection as unknown as (T | null | false)[][];
  } else {
    return eachSlice(collection, number).toA();
  }
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

export function split<T>(
  array: T[],
  value: T | ((item: T) => unknown) | null = null,
  block?: (item: T) => unknown,
): T[][] {
  if (typeof value === "function" && block === undefined) {
    block = value as (item: T) => unknown;
    value = null;
  }
  const arr = [...array];
  const result: T[][] = [];
  let idx: number;
  if (block !== undefined) {
    while ((idx = arr.findIndex((item) => rtest(block(item)))) !== -1) {
      result.push(arr.splice(0, idx));
      arr.shift();
    }
  } else {
    while ((idx = arr.indexOf(value as T)) !== -1) {
      result.push(arr.splice(0, idx));
      arr.shift();
    }
  }
  result.push(arr);
  return result;
}

Object.assign(ARRAY_METHOD_TABLE, { inGroupsOf, inGroups });
