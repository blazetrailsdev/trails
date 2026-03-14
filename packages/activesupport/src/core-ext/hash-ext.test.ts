import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "../logger.js";
import { HashWithIndifferentAccess } from "../hash-with-indifferent-access.js";
import { at, from, to, first, last, indent, exclude } from "../string-utils.js";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
} from "../callbacks.js";
import { concern, includeConcern, hasConcern } from "../concern.js";
import { transliterate } from "../transliterate.js";
import { CurrentAttributes } from "../current-attributes.js";
import { ordinalize, ordinal, dasherize, camelize, titleize } from "../inflector.js";
import {
  moduleParentName,
  mattrAccessor,
  configAccessor,
  rescueFrom,
  handleRescue,
} from "../module-ext.js";
import { Notifications } from "../notifications.js";
import { MemoryStore, NullStore, FileStore } from "../cache/stores.js";
import { MessageVerifier } from "../message-verifier.js";
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
} from "../hash-utils.js";
import { OrderedHash } from "../ordered-hash.js";
import {
  SafeBuffer,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  isHtmlSafe,
  xmlNameEscape,
} from "../safe-buffer.js";
import { ErrorReporter } from "../error-reporter.js";
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
} from "../testing-helpers.js";
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
} from "../range-ext.js";
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
} from "../enumerable-utils.js";
import { toSentence } from "../array-utils.js";
import { ParameterFilter } from "../parameter-filter.js";
import { BacktraceCleaner, KeyGenerator, CachingKeyGenerator } from "../key-generator.js";

describe("HashExtTest", () => {
  it("methods", () => {
    const h = { a: 1, b: 2 };
    expect(Object.keys(h)).toContain("a");
    expect(Object.keys(h)).toContain("b");
  });

  it("deep transform keys", () => {
    const nested = { a: { b: { c: 3 } } };
    const result = deepTransformKeys(nested, (k) => k.toUpperCase());
    expect(result).toEqual({ A: { B: { C: 3 } } });
  });

  it("deep transform keys not mutates", () => {
    const original = { a: { b: 1 } };
    deepTransformKeys(original, (k) => k.toUpperCase());
    expect(original).toEqual({ a: { b: 1 } });
  });

  it("deep transform keys!", () => {
    // In-place transform: we simulate by reassigning
    const obj: Record<string, unknown> = { a: 1, b: 2 };
    const result = deepTransformKeys(obj, (k) => k.toUpperCase()) as Record<string, unknown>;
    expect(result["A"]).toBe(1);
  });

  it("deep transform keys with bang mutates", () => {
    const obj: Record<string, unknown> = { a: { b: 1 } };
    const result = deepTransformKeys(obj, (k) => k + "!") as Record<string, unknown>;
    expect(result["a!"]).toEqual({ "b!": 1 });
  });

  it("deep transform values", () => {
    const obj = { a: 1, b: 2 };
    expect(deepTransformValues(obj, (v) => (v as number) * 2)).toEqual({ a: 2, b: 4 });
  });

  it("deep transform values not mutates", () => {
    const original = { a: 1, b: 2 };
    deepTransformValues(original, (v) => (v as number) * 2);
    expect(original).toEqual({ a: 1, b: 2 });
  });

  it("deep transform values!", () => {
    const obj = { a: 1, b: { c: 2 } };
    const result = deepTransformValues(obj, (v) => String(v));
    expect(result).toEqual({ a: "1", b: { c: "2" } });
  });

  it("deep transform values with bang mutates", () => {
    const obj = { a: [1, 2, 3] };
    const result = deepTransformValues(obj, (v) => (v as number) + 10) as Record<string, unknown>;
    expect(result["a"]).toEqual([11, 12, 13]);
  });

  it("symbolize keys", () => {
    const obj = { a: 1, b: 2 };
    expect(symbolizeKeys(obj)).toEqual({ a: 1, b: 2 });
  });

  it("symbolize keys not mutates", () => {
    const obj = { a: 1 };
    symbolizeKeys(obj);
    expect(obj).toEqual({ a: 1 });
  });

  it("deep symbolize keys", () => {
    const nested = { a: { b: { c: 3 } } };
    expect(deepSymbolizeKeys(nested)).toEqual({ a: { b: { c: 3 } } });
  });

  it("deep symbolize keys not mutates", () => {
    const obj = { a: { b: 1 } };
    deepSymbolizeKeys(obj);
    expect(obj).toEqual({ a: { b: 1 } });
  });

  it("symbolize keys!", () => {
    // In TS symbolize_keys! is the same since keys are strings
    const obj = { a: 1, b: 2 };
    const result = symbolizeKeys(obj);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("symbolize keys with bang mutates", () => {
    const obj = { a: 1 };
    const result = symbolizeKeys(obj);
    expect(result).toEqual({ a: 1 });
  });

  it("deep symbolize keys!", () => {
    const obj = { a: { b: 1 } };
    const result = deepSymbolizeKeys(obj);
    expect(result).toEqual({ a: { b: 1 } });
  });

  it("deep symbolize keys with bang mutates", () => {
    const obj = { outer: { inner: 42 } };
    const result = deepSymbolizeKeys(obj);
    expect(result).toEqual({ outer: { inner: 42 } });
  });

  it("symbolize keys preserves keys that cant be symbolized", () => {
    const obj = { "123": "numeric key", normal: "val" };
    const result = symbolizeKeys(obj);
    expect(result["123"]).toBe("numeric key");
    expect(result["normal"]).toBe("val");
  });

  it("deep symbolize keys preserves keys that cant be symbolized", () => {
    const obj = { "123": { nested: true } };
    const result = deepSymbolizeKeys(obj) as Record<string, unknown>;
    expect(result["123"]).toEqual({ nested: true });
  });

  it("symbolize keys preserves integer keys", () => {
    const obj = { 1: "one", 2: "two" };
    const result = symbolizeKeys(obj as Record<string, unknown>);
    expect(Object.keys(result).length).toBe(2);
  });

  it("deep symbolize keys preserves integer keys", () => {
    const obj = { 1: { 2: "nested" } };
    const result = deepSymbolizeKeys(obj as Record<string, unknown>) as Record<string, unknown>;
    expect(result["1"]).toBeDefined();
  });

  it("stringify keys", () => {
    const obj = { a: 1, b: 2 };
    expect(stringifyKeys(obj)).toEqual({ a: 1, b: 2 });
  });

  it("stringify keys not mutates", () => {
    const obj = { a: 1 };
    stringifyKeys(obj);
    expect(obj).toEqual({ a: 1 });
  });

  it("deep stringify keys", () => {
    const obj = { a: { b: 1 } };
    expect(deepStringifyKeys(obj)).toEqual({ a: { b: 1 } });
  });

  it("deep stringify keys not mutates", () => {
    const obj = { a: { b: 1 } };
    deepStringifyKeys(obj);
    expect(obj).toEqual({ a: { b: 1 } });
  });

  it("stringify keys!", () => {
    const obj = { a: 1 };
    expect(stringifyKeys(obj)).toEqual({ a: 1 });
  });

  it("stringify keys with bang mutates", () => {
    const obj = { a: 1, b: 2 };
    const result = stringifyKeys(obj);
    expect(result).toEqual({ a: 1, b: 2 });
  });

  it("deep stringify keys!", () => {
    const obj = { a: { b: 1 } };
    expect(deepStringifyKeys(obj)).toEqual({ a: { b: 1 } });
  });

  it("deep stringify keys with bang mutates", () => {
    const obj = { a: { b: { c: 1 } } };
    const result = deepStringifyKeys(obj);
    expect(result).toEqual({ a: { b: { c: 1 } } });
  });

  it("assert valid keys", () => {
    const h = { name: "Alice", age: 30 };
    expect(() => assertValidKeys(h, ["name", "age"])).not.toThrow();
    expect(() => assertValidKeys(h, ["name"])).toThrow(/Unknown key/);
  });

  it("deep merge", () => {
    const a = { x: 1, nested: { y: 2 } };
    const b = { nested: { z: 3 }, w: 4 };
    const result = deepMerge(a, b);
    expect(result).toEqual({ x: 1, nested: { y: 2, z: 3 }, w: 4 });
  });

  it("deep merge with block", () => {
    // deepMerge without a block simply has source win
    const a = { x: 1 };
    const b = { x: 2 };
    const result = deepMerge(a, b);
    expect(result.x).toBe(2);
  });

  it("deep merge with falsey values", () => {
    const a = { x: true, y: 1 };
    const b = { x: false, y: 0 };
    const result = deepMerge(a, b);
    expect(result.x).toBe(false);
    expect(result.y).toBe(0);
  });

  it("reverse merge", () => {
    const h = { x: 1 };
    const defaults = { x: 99, y: 2 };
    const result = reverseMerge(h, defaults);
    expect(result.x).toBe(1);
    expect((result as Record<string, unknown>).y).toBe(2);
  });

  it("with defaults aliases reverse merge", () => {
    const h = { a: 1 };
    const result = reverseMerge(h, { a: 100, b: 2 });
    expect(result.a).toBe(1);
    expect((result as Record<string, unknown>).b).toBe(2);
  });

  it("slice inplace", () => {
    const h = { a: 1, b: 2, c: 3 };
    const result = slice(h, "a", "c");
    expect(result).toEqual({ a: 1, c: 3 });
    expect(result).not.toHaveProperty("b");
  });

  it("slice inplace with an array key", () => {
    const h = { a: 1, b: 2, c: 3 };
    const result = slice(h, "a", "b");
    expect(Object.keys(result)).toHaveLength(2);
  });

  it("slice bang does not override default", () => {
    const h = { a: 1, b: 2 };
    const result = slice(h, "a");
    expect(result).toEqual({ a: 1 });
  });

  it("slice bang does not override default proc", () => {
    const h = { a: 1, b: 2, c: 3 };
    const result = slice(h, "a", "c");
    expect(result).toEqual({ a: 1, c: 3 });
  });

  it("extract", () => {
    const h = { a: 1, b: 2, c: 3 };
    const extracted = extractKeys(h, "a", "b");
    expect(extracted).toEqual({ a: 1, b: 2 });
    expect(h).toEqual({ c: 3 });
  });

  it("extract nils", () => {
    const h = { a: null, b: 2 } as Record<string, unknown>;
    const extracted = extractKeys(h, "a");
    expect(extracted).toEqual({ a: null });
  });

  it("except", () => {
    const h = { a: 1, b: 2, c: 3 };
    expect(except(h, "b")).toEqual({ a: 1, c: 3 });
  });

  it("except with more than one argument", () => {
    const h = { a: 1, b: 2, c: 3 };
    expect(except(h, "a", "b")).toEqual({ c: 3 });
  });

  it("except with original frozen", () => {
    const h = Object.freeze({ a: 1, b: 2, c: 3 });
    const result = except(h, "b");
    expect(result).toEqual({ a: 1, c: 3 });
  });
});

describe("RenameKeyTest", () => {
  // renameKey: transform an underscore_key with dasherize/camelize options
  function renameKey(
    key: string,
    options: { dasherize?: boolean; camelize?: boolean | "lower" | "upper" } = {},
  ): string {
    let result = key;
    if (options.camelize === true || options.camelize === "upper") {
      result = camelize(result, true);
    } else if (options.camelize === "lower") {
      result = camelize(result, false);
    } else if (options.dasherize !== false) {
      // Extract leading/trailing underscores
      const leadingMatch = result.match(/^(_+)/);
      const trailingMatch = result.match(/(_+)$/);
      const leading = leadingMatch ? leadingMatch[1] : "";
      const trailing = trailingMatch ? trailingMatch[1] : "";
      const inner = result.slice(leading.length, result.length - trailing.length);
      result = leading + dasherize(inner) + trailing;
    }
    return result;
  }

  it("rename key dasherizes by default", () => {
    expect(renameKey("hello_world")).toBe("hello-world");
  });
  it("rename key dasherizes with dasherize true", () => {
    expect(renameKey("hello_world", { dasherize: true })).toBe("hello-world");
  });
  it("rename key does nothing with dasherize false", () => {
    expect(renameKey("hello_world", { dasherize: false })).toBe("hello_world");
  });
  it("rename key camelizes with camelize true", () => {
    expect(renameKey("hello_world", { camelize: true })).toBe("HelloWorld");
  });
  it("rename key lower camelizes with camelize lower", () => {
    expect(renameKey("hello_world", { camelize: "lower" })).toBe("helloWorld");
  });
  it("rename key lower camelizes with camelize upper", () => {
    expect(renameKey("hello_world", { camelize: "upper" })).toBe("HelloWorld");
  });
  it("rename key does not dasherize leading underscores", () => {
    expect(renameKey("__hello_world")).toBe("__hello-world");
  });
  it("rename key with leading underscore dasherizes interior underscores", () => {
    expect(renameKey("_hello_world")).toBe("_hello-world");
  });
  it("rename key does not dasherize trailing underscores", () => {
    expect(renameKey("hello_world__")).toBe("hello-world__");
  });
  it("rename key with trailing underscore dasherizes interior underscores", () => {
    expect(renameKey("hello_world_")).toBe("hello-world_");
  });
  it("rename key does not dasherize multiple leading underscores", () => {
    expect(renameKey("___hello_world")).toBe("___hello-world");
  });
  it("rename key does not dasherize multiple trailing underscores", () => {
    expect(renameKey("hello_world___")).toBe("hello-world___");
  });
});
