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

describe("ToSentenceTest", () => {
  it("plain array to sentence", () => {
    expect(toSentence(["one", "two", "three"])).toBe("one, two, and three");
  });

  it("to sentence with words connector", () => {
    expect(toSentence(["one", "two", "three"], { wordsConnector: " - " })).toBe(
      "one - two, and three",
    );
  });

  it("to sentence with last word connector", () => {
    expect(toSentence(["one", "two", "three"], { lastWordConnector: " or " })).toBe(
      "one, two or three",
    );
  });

  it("two elements", () => {
    expect(toSentence(["one", "two"])).toBe("one and two");
  });

  it("one element", () => {
    expect(toSentence(["one"])).toBe("one");
  });

  it("one element not same object", () => {
    const arr = ["one"];
    const result = toSentence(arr);
    expect(result).toBe("one");
  });

  it("one non string element", () => {
    // All elements are strings in TS, but numbers work too
    expect(toSentence([String(42)])).toBe("42");
  });

  it("does not modify given hash", () => {
    const arr = ["a", "b", "c"];
    toSentence(arr, { wordsConnector: "; " });
    expect(arr).toEqual(["a", "b", "c"]);
  });

  it("with blank elements", () => {
    expect(toSentence(["one", "", "three"])).toBe("one, , and three");
  });

  it("with invalid options", () => {
    // Unknown options are ignored
    expect(toSentence(["a", "b", "c"], {})).toBe("a, b, and c");
  });

  it("always returns string", () => {
    expect(typeof toSentence([])).toBe("string");
    expect(typeof toSentence(["a"])).toBe("string");
    expect(typeof toSentence(["a", "b"])).toBe("string");
  });

  it("returns no frozen string", () => {
    const result = toSentence(["a", "b"]);
    expect(typeof result).toBe("string");
  });
});
