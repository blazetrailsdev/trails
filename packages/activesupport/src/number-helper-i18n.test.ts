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

describe("NumberHelperI18nTest", () => {
  it.skip("number to i18n currency", () => {
    /* fixture-dependent */
  });
  it.skip("number to currency with empty i18n store", () => {
    /* fixture-dependent */
  });
  it.skip("locale default format has precedence over helper defaults", () => {
    /* fixture-dependent */
  });
  it.skip("number to currency without currency negative format", () => {
    /* fixture-dependent */
  });
  it.skip("number with i18n precision", () => {
    /* fixture-dependent */
  });
  it.skip("number with i18n round mode", () => {
    /* fixture-dependent */
  });
  it.skip("number with i18n precision and empty i18n store", () => {
    /* fixture-dependent */
  });
  it.skip("number with i18n delimiter", () => {
    /* fixture-dependent */
  });
  it.skip("number with i18n delimiter and empty i18n store", () => {
    /* fixture-dependent */
  });
  it.skip("number to i18n percentage", () => {
    /* fixture-dependent */
  });
  it.skip("number to i18n percentage and empty i18n store", () => {
    /* fixture-dependent */
  });
  it.skip("number to i18n human size", () => {
    /* fixture-dependent */
  });
  it.skip("number to i18n human size with empty i18n store", () => {
    /* fixture-dependent */
  });
  it.skip("number to human with default translation scope", () => {
    /* fixture-dependent */
  });
  it.skip("number to human with empty i18n store", () => {
    /* fixture-dependent */
  });
  it.skip("number to human with custom translation scope", () => {
    /* fixture-dependent */
  });
});
