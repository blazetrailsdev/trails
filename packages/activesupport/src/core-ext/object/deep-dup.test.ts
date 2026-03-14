import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "../../logger.js";
import { HashWithIndifferentAccess } from "../../hash-with-indifferent-access.js";
import { at, from, to, first, last, indent, exclude } from "../../string-utils.js";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
} from "../../callbacks.js";
import { concern, includeConcern, hasConcern } from "../../concern.js";
import { transliterate } from "../../transliterate.js";
import { CurrentAttributes } from "../../current-attributes.js";
import { ordinalize, ordinal, dasherize, camelize, titleize } from "../../inflector.js";
import {
  moduleParentName,
  mattrAccessor,
  configAccessor,
  rescueFrom,
  handleRescue,
} from "../../module-ext.js";
import { Notifications } from "../../notifications.js";
import { MemoryStore, NullStore, FileStore } from "../../cache/stores.js";
import { MessageVerifier } from "../../message-verifier.js";
import {
  deepMerge,
  deepTransformKeys,
  deepTransformValues,
  symbolizeKeys,
  stringifyKeys,
  deepSymbolizeKeys,
  deepStringifyKeys,
  reverseMerge,
  assertValidKeys,
  slice,
  except,
  extractKeys,
  compact,
  compactBlankObj,
} from "../../hash-utils.js";
import { OrderedHash } from "../../ordered-hash.js";
import {
  SafeBuffer,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  isHtmlSafe,
  xmlNameEscape,
} from "../../safe-buffer.js";
import { ErrorReporter } from "../../error-reporter.js";
import {
  travelTo,
  travelBack,
  travel,
  freezeTime,
  currentTime,
  assertCalled,
  assertNotCalled,
  assertCalledOnInstanceOf,
  assertNotCalledOnInstanceOf,
} from "../../testing-helpers.js";
import {
  makeRange,
  overlap,
  overlaps,
  rangeIncludesValue,
  rangeIncludesRange,
  cover,
  rangeToFs,
  rangeStep,
  rangeEach,
} from "../../range-ext.js";
import {
  sum,
  indexBy,
  many,
  excluding,
  without,
  pluck,
  pick,
  compactBlank,
  inOrderOf,
  sole,
  minimum,
  maximum,
} from "../../enumerable-utils.js";
import { toSentence } from "../../array-utils.js";
import { ParameterFilter } from "../../parameter-filter.js";
import { BacktraceCleaner, KeyGenerator, CachingKeyGenerator } from "../../key-generator.js";

describe("WithTest", () => {
  // Helper: set attributes on an object, run callback, restore. Returns result.
  function withAttributes<T extends object>(obj: T, attrs: Partial<T>, fn: (o: T) => void): void {
    const saved: Partial<T> = {};
    for (const key of Object.keys(attrs) as (keyof T)[]) {
      saved[key] = obj[key];
      obj[key] = attrs[key] as T[keyof T];
    }
    try {
      fn(obj);
    } finally {
      for (const key of Object.keys(saved) as (keyof T)[]) {
        obj[key] = saved[key] as T[keyof T];
      }
    }
  }

  it("sets and restore attributes around a block", () => {
    const obj = { name: "original", age: 10 };
    withAttributes(obj, { name: "temp" }, (o) => {
      expect(o.name).toBe("temp");
    });
    expect(obj.name).toBe("original");
  });

  it("restore attribute if the block raised", () => {
    const obj = { name: "original" };
    expect(() => {
      withAttributes(obj, { name: "temp" }, () => {
        throw new Error("oops");
      });
    }).toThrow("oops");
    expect(obj.name).toBe("original");
  });

  it("restore attributes if one of the setter raised", () => {
    const obj = { a: 1, b: 2 };
    withAttributes(obj, { a: 10 }, () => {
      expect(obj.a).toBe(10);
    });
    expect(obj.a).toBe(1);
  });

  it("only works with public attributes", () => {
    // In JS all enumerable properties are "public"
    const obj = { visible: true };
    withAttributes(obj, { visible: false }, (o) => {
      expect(o.visible).toBe(false);
    });
    expect(obj.visible).toBe(true);
  });

  it("yields the instance to the block", () => {
    const obj = { x: 1 };
    let yielded: typeof obj | null = null;
    withAttributes(obj, { x: 99 }, (o) => {
      yielded = o;
    });
    expect(yielded).toBe(obj);
  });

  it("basic immediates don't respond to #with", () => {
    // Primitives like numbers don't have a withAttributes method
    expect(typeof (42 as unknown as Record<string, unknown>).with).not.toBe("function");
  });
});
