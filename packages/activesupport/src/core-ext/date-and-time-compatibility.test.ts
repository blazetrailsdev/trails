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

describe("DateAndTimeCompatibilityTest", () => {
  it.skip("time to time preserves timezone", () => {
    /* fixture-dependent */
  });
  it.skip("time to time does not preserve time zone", () => {
    /* fixture-dependent */
  });
  it.skip("time to time on utc value without preserve configured", () => {
    /* fixture-dependent */
  });
  it.skip("time to time on offset value without preserve configured", () => {
    /* fixture-dependent */
  });
  it.skip("time to time on tzinfo value without preserve configured", () => {
    /* fixture-dependent */
  });
  it.skip("time to time frozen preserves timezone", () => {
    /* fixture-dependent */
  });
  it.skip("time to time frozen does not preserve time zone", () => {
    /* fixture-dependent */
  });
  it.skip("datetime to time preserves timezone", () => {
    /* fixture-dependent */
  });
  it.skip("datetime to time does not preserve time zone", () => {
    /* fixture-dependent */
  });
  it.skip("datetime to time frozen preserves timezone", () => {
    /* fixture-dependent */
  });
  it.skip("datetime to time frozen does not preserve time zone", () => {
    /* fixture-dependent */
  });
  it.skip("twz to time preserves timezone", () => {
    /* fixture-dependent */
  });
  it.skip("twz to time does not preserve time zone", () => {
    /* fixture-dependent */
  });
  it.skip("twz to time frozen preserves timezone", () => {
    /* fixture-dependent */
  });
  it.skip("twz to time frozen does not preserve time zone", () => {
    /* fixture-dependent */
  });
  it.skip("string to time preserves timezone", () => {
    /* fixture-dependent */
  });
  it.skip("string to time does not preserve time zone", () => {
    /* fixture-dependent */
  });
  it.skip("string to time frozen preserves timezone", () => {
    /* fixture-dependent */
  });
  it.skip("string to time frozen does not preserve time zone", () => {
    /* fixture-dependent */
  });
  it.skip("to time preserves timezone is deprecated", () => {
    /* fixture-dependent */
  });
  it.skip("to time preserves timezone supports new values", () => {
    /* fixture-dependent */
  });
});
