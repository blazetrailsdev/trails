/**
 * DeepMergeable — mixin that provides deep_merge and deep_merge! methods.
 * Mirrors ActiveSupport::DeepMergeable.
 *
 * Reuses isPlainObject from hash-utils to keep plain-object detection
 * consistent across the package.
 */

import { isPlainObject } from "./hash-utils.js";

function createLike(source: Record<string, unknown>): Record<string, unknown> {
  return Object.create(Object.getPrototypeOf(source)) as Record<string, unknown>;
}

function deepMergeObjects(
  a: Record<string, unknown>,
  b: Record<string, unknown>,
  block?: (key: string, thisVal: unknown, otherVal: unknown) => unknown,
): Record<string, unknown> {
  const result: Record<string, unknown> = createLike(a);

  for (const key of Object.keys(a)) {
    result[key] = a[key];
  }

  for (const key of Object.keys(b)) {
    const aVal = result[key];
    const bVal = b[key];

    if (isPlainObject(aVal) && isPlainObject(bVal)) {
      result[key] = deepMergeObjects(aVal, bVal, block);
    } else if (block && Object.hasOwn(a, key)) {
      result[key] = block(key, a[key], bVal);
    } else {
      result[key] = bVal;
    }
  }

  return result;
}

export namespace DeepMergeable {
  export function deepMerge(
    target: Record<string, unknown>,
    other: Record<string, unknown>,
    block?: (key: string, thisVal: unknown, otherVal: unknown) => unknown,
  ): Record<string, unknown> {
    return deepMergeObjects(target, other, block);
  }

  export function deepMergeInPlace(
    target: Record<string, unknown>,
    other: Record<string, unknown>,
    block?: (key: string, thisVal: unknown, otherVal: unknown) => unknown,
  ): Record<string, unknown> {
    for (const key of Object.keys(other)) {
      const thisVal = target[key];
      const otherVal = other[key];

      if (Object.hasOwn(target, key) && isPlainObject(thisVal) && isPlainObject(otherVal)) {
        deepMergeInPlace(thisVal, otherVal, block);
      } else if (block && Object.hasOwn(target, key)) {
        target[key] = block(key, thisVal, otherVal);
      } else {
        target[key] = otherVal;
      }
    }
    return target;
  }

  export function isDeepMergeable(other: unknown): boolean {
    return isPlainObject(other);
  }
}
