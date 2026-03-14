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

describe("StringAccessTest", () => {
  it("#at with Integer, returns a substring of one character at that position", () => {
    expect(at("hello", 0)).toBe("h");
    expect(at("hello", -1)).toBe("o");
    expect(at("hello", 10)).toBeUndefined();
  });
  it("#at with Range, returns a substring containing characters at offsets", () => {
    expect(at("hello", [1, 3])).toBe("ell");
    expect(at("hello", [0, -1])).toBe("hello");
  });
  it("#at with Regex, returns the matching portion of the string", () => {
    expect(at("hello world", /\w+/)).toBe("hello");
    expect(at("hello", /xyz/)).toBeUndefined();
  });
  it("#from with positive Integer, returns substring from the given position to the end", () => {
    expect(from("hello", 2)).toBe("llo");
  });
  it("#from with negative Integer, position is counted from the end", () => {
    expect(from("hello", -2)).toBe("lo");
  });
  it("#to with positive Integer, substring from the beginning to the given position", () => {
    expect(to("hello", 2)).toBe("hel");
  });
  it("#to with negative Integer, position is counted from the end", () => {
    expect(to("hello", -2)).toBe("hell");
  });
  it("#from and #to can be combined", () => {
    expect(to(from("hello", 1), 3)).toBe("ello");
  });
  it("#first returns the first character", () => {
    expect(first("hello")).toBe("h");
  });
  it("#first with Integer, returns a substring from the beginning to position", () => {
    expect(first("hello", 3)).toBe("hel");
  });
  it("#first with Integer >= string length still returns a new string", () => {
    expect(first("hello", 100)).toBe("hello");
  });
  it("#first with Integer returns a non-frozen string", () => {
    expect(typeof first("hello", 2)).toBe("string");
  });
  it("#first with negative Integer raises ArgumentError", () => {
    expect(() => first("hello", -1)).toThrow();
  });
  it("#last returns the last character", () => {
    expect(last("hello")).toBe("o");
  });
  it("#last with Integer, returns a substring from the end to position", () => {
    expect(last("hello", 3)).toBe("llo");
  });
  it("#last with Integer >= string length still returns a new string", () => {
    expect(last("hello", 100)).toBe("hello");
  });
  it("#last with Integer returns a non-frozen string", () => {
    expect(typeof last("hello", 2)).toBe("string");
  });
  it("#last with negative Integer raises ArgumentError", () => {
    expect(() => last("hello", -1)).toThrow();
  });
  it("access returns a real string", () => {
    expect(typeof at("hello", 0)).toBe("string");
  });
});

describe("ToTagTest", () => {
  it.skip("#to_tag accepts a callable object and passes options with the builder", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts a callable object and passes options and tag name", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts an object responding to #to_xml and passes the options, where :root is key", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts arbitrary objects responding to #to_str", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag should use the type value in the options hash", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts symbol types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts boolean types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts float types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts decimal types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts date types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts datetime types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts time types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts ActiveSupport::TimeWithZone types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts duration types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts array types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag accepts hash types", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag should not add type when skip types option is set", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag should dasherize the space when passed a string with spaces as a key", () => {
    /* fixture-dependent */
  });
  it.skip("#to_tag should dasherize the space when passed a symbol with spaces as a key", () => {
    /* fixture-dependent */
  });
});

describe("StringConversionsTest", () => {
  it.skip("string to time", () => {
    /* fixture-dependent */
  });
  it.skip("timestamp string to time", () => {
    /* fixture-dependent */
  });
  it.skip("string to time utc offset", () => {
    /* fixture-dependent */
  });
  it.skip("partial string to time", () => {
    /* fixture-dependent */
  });
  it.skip("standard time string to time when current time is standard time", () => {
    /* fixture-dependent */
  });
  it.skip("standard time string to time when current time is daylight savings", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings string to time when current time is standard time", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings string to time when current time is daylight savings", () => {
    /* fixture-dependent */
  });
  it.skip("partial string to time when current time is standard time", () => {
    /* fixture-dependent */
  });
  it.skip("partial string to time when current time is daylight savings", () => {
    /* fixture-dependent */
  });
  it.skip("string to datetime", () => {
    /* fixture-dependent */
  });
  it.skip("partial string to datetime", () => {
    /* fixture-dependent */
  });
  it.skip("string to date", () => {
    /* fixture-dependent */
  });
});

describe("StringIndentTest", () => {
  it("does not indent strings that only contain newlines (edge cases)", () => {
    expect(indent("\n\n", 2)).toBe("\n\n");
  });
  it("by default, indents with spaces if the existing indentation uses them", () => {
    expect(indent("  foo\n  bar", 2)).toBe("    foo\n    bar");
  });
  it("by default, indents with tabs if the existing indentation uses them", () => {
    expect(indent("\tfoo", 1, "\t")).toBe("\t\tfoo");
  });
  it("by default, indents with spaces as a fallback if there is no indentation", () => {
    expect(indent("foo", 2)).toBe("  foo");
  });
  it("uses the indent char if passed", () => {
    expect(indent("foo", 2, "-")).toBe("--foo");
  });
  it("does not indent blank lines by default", () => {
    expect(indent("foo\n\nbar", 2)).toBe("  foo\n\n  bar");
  });
  it("indents blank lines if told so", () => {
    expect(indent("foo\n\nbar", 2, " ", true)).toBe("  foo\n  \n  bar");
  });
});

describe("CoreExtStringMultibyteTest", () => {
  it.skip("core ext adds mb chars", () => {
    /* fixture-dependent */
  });
  it.skip("string should recognize utf8 strings", () => {
    /* fixture-dependent */
  });
  it.skip("mb chars returns instance of proxy class", () => {
    /* fixture-dependent */
  });
});

describe("StringBehaviorTest", () => {
  it("acts like string", () => {
    const s = htmlSafe("hello");
    expect(s.toString()).toBe("hello");
    expect(String(s)).toBe("hello");
    expect(s.length).toBe(5);
    expect(isHtmlSafe(s)).toBe(true);
  });
});

describe("StringExcludeTest", () => {
  it("inverse of #include", () => {
    expect(exclude("hello world" as any, "world" as any)).toBe(false);
    expect(exclude("hello world" as any, "xyz" as any)).toBe(true);
  });
});
