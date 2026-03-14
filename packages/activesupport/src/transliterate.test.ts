import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { Logger, BroadcastLogger, taggedLogging } from "./logger.js";
import { HashWithIndifferentAccess } from "./hash-with-indifferent-access.js";
import { at, from, to, first, last, indent, exclude } from "./string-utils.js";
import {
  defineCallbacks,
  setCallback,
  skipCallback,
  resetCallbacks,
  runCallbacks,
} from "./callbacks.js";
import { concern, includeConcern, hasConcern } from "./concern.js";
import { transliterate } from "./transliterate.js";
import { CurrentAttributes } from "./current-attributes.js";
import { ordinalize, ordinal, dasherize, camelize, titleize } from "./inflector.js";
import {
  moduleParentName,
  mattrAccessor,
  configAccessor,
  rescueFrom,
  handleRescue,
} from "./module-ext.js";
import { Notifications } from "./notifications.js";
import { MemoryStore, NullStore, FileStore } from "./cache/stores.js";
import { MessageVerifier } from "./message-verifier.js";
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
} from "./hash-utils.js";
import { OrderedHash } from "./ordered-hash.js";
import {
  SafeBuffer,
  htmlEscape,
  htmlEscapeOnce,
  htmlSafe,
  isHtmlSafe,
  xmlNameEscape,
} from "./safe-buffer.js";
import { ErrorReporter } from "./error-reporter.js";
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
} from "./testing-helpers.js";
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
} from "./range-ext.js";
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
} from "./enumerable-utils.js";
import { toSentence } from "./array-utils.js";
import { ParameterFilter } from "./parameter-filter.js";
import { BacktraceCleaner, KeyGenerator, CachingKeyGenerator } from "./key-generator.js";

describe("TransliterateTest", () => {
  it("transliterate should not change ascii chars", () => {
    expect(transliterate("Hello World")).toBe("Hello World");
    expect(transliterate("abc123!@#")).toBe("abc123!@#");
  });

  it("transliterate should approximate ascii", () => {
    expect(transliterate("Ângela")).toBe("Angela");
    expect(transliterate("café")).toBe("cafe");
    expect(transliterate("über")).toBe("uber");
    expect(transliterate("naïve")).toBe("naive");
    expect(transliterate("Ö")).toBe("O");
  });

  it.skip("transliterate should work with custom i18n rules and uncomposed utf8", () => {
    /* i18n-dependent */
  });
  it.skip("transliterate respects the locale argument", () => {
    /* i18n-dependent */
  });

  it("transliterate should allow a custom replacement char", () => {
    expect(transliterate("hello 日本語 world", "*")).toBe("hello *** world");
    expect(transliterate("café", "_")).toBe("cafe");
  });

  it("transliterate handles empty string", () => {
    expect(transliterate("")).toBe("");
  });

  it("transliterate handles nil", () => {
    expect(transliterate(null)).toBe("");
    expect(transliterate(undefined)).toBe("");
  });

  it("transliterate handles unknown object", () => {
    expect(transliterate(42 as unknown as string)).toBe("42");
  });

  it("transliterate handles strings with valid utf8 encodings", () => {
    expect(transliterate("El Niño")).toBe("El Nino");
  });

  it("transliterate handles strings with valid us ascii encodings", () => {
    expect(transliterate("hello")).toBe("hello");
  });

  it.skip("transliterate handles strings with valid gb18030 encodings", () => {
    /* encoding-specific */
  });
  it.skip("transliterate handles strings with incompatible encodings", () => {
    /* encoding-specific */
  });
  it.skip("transliterate handles strings with invalid utf8 bytes", () => {
    /* encoding-specific */
  });
  it.skip("transliterate handles strings with invalid us ascii bytes", () => {
    /* encoding-specific */
  });
  it.skip("transliterate handles strings with invalid gb18030 bytes", () => {
    /* encoding-specific */
  });

  it("transliterate returns a copy of ascii strings", () => {
    const original = "hello";
    const result = transliterate(original);
    expect(result).toBe("hello");
    // returns a string value (new or same reference doesn't matter in JS)
    expect(typeof result).toBe("string");
  });
});
