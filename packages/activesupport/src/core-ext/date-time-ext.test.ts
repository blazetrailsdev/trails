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

describe("DateTimeExtCalculationsTest", () => {
  it.skip("to fs", () => {
    /* fixture-dependent */
  });
  it.skip("readable inspect", () => {
    /* fixture-dependent */
  });
  it.skip("to fs with custom date format", () => {
    /* fixture-dependent */
  });
  it.skip("localtime", () => {
    /* fixture-dependent */
  });
  it.skip("getlocal", () => {
    /* fixture-dependent */
  });
  it.skip("to date", () => {
    /* fixture-dependent */
  });
  it.skip("to datetime", () => {
    /* fixture-dependent */
  });
  it.skip("to time", () => {
    /* fixture-dependent */
  });
  it.skip("to time preserves fractional seconds", () => {
    /* fixture-dependent */
  });
  it.skip("civil from format", () => {
    /* fixture-dependent */
  });
  it.skip("middle of day", () => {
    /* fixture-dependent */
  });
  it.skip("beginning of minute", () => {
    /* fixture-dependent */
  });
  it.skip("end of minute", () => {
    /* fixture-dependent */
  });
  it.skip("end of month", () => {
    /* fixture-dependent */
  });
  it.skip("change", () => {
    /* fixture-dependent */
  });
  it.skip("advance partial days", () => {
    /* fixture-dependent */
  });
  it.skip("advanced processes first the date deltas and then the time deltas", () => {
    /* fixture-dependent */
  });
  it.skip("last week", () => {
    /* fixture-dependent */
  });
  it.skip("date time should have correct last week for leap year", () => {
    /* fixture-dependent */
  });
  it.skip("last quarter on 31st", () => {
    /* fixture-dependent */
  });
  it.skip("xmlschema", () => {
    /* fixture-dependent */
  });
  it.skip("today with offset", () => {
    /* fixture-dependent */
  });
  it.skip("today without offset", () => {
    /* fixture-dependent */
  });
  it.skip("yesterday with offset", () => {
    /* fixture-dependent */
  });
  it.skip("yesterday without offset", () => {
    /* fixture-dependent */
  });
  it.skip("prev day without offset", () => {
    /* fixture-dependent */
  });
  it.skip("tomorrow with offset", () => {
    /* fixture-dependent */
  });
  it.skip("tomorrow without offset", () => {
    /* fixture-dependent */
  });
  it.skip("next day without offset", () => {
    /* fixture-dependent */
  });
  it.skip("past with offset", () => {
    /* fixture-dependent */
  });
  it.skip("past without offset", () => {
    /* fixture-dependent */
  });
  it.skip("future with offset", () => {
    /* fixture-dependent */
  });
  it.skip("future without offset", () => {
    /* fixture-dependent */
  });
  it.skip("current returns date today when zone is not set", () => {
    /* fixture-dependent */
  });
  it.skip("current returns time zone today when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("current without time zone", () => {
    /* fixture-dependent */
  });
  it.skip("current with time zone", () => {
    /* fixture-dependent */
  });
  it.skip("acts like date", () => {
    /* fixture-dependent */
  });
  it.skip("acts like time", () => {
    /* fixture-dependent */
  });
  it.skip("blank?", () => {
    /* fixture-dependent */
  });
  it.skip("utc?", () => {
    /* fixture-dependent */
  });
  it.skip("utc offset", () => {
    /* fixture-dependent */
  });
  it.skip("utc", () => {
    /* fixture-dependent */
  });
  it.skip("formatted offset with utc", () => {
    /* fixture-dependent */
  });
  it.skip("formatted offset with local", () => {
    /* fixture-dependent */
  });
  it.skip("compare with time", () => {
    /* fixture-dependent */
  });
  it.skip("compare with datetime", () => {
    /* fixture-dependent */
  });
  it.skip("compare with time with zone", () => {
    /* fixture-dependent */
  });
  it.skip("compare with string", () => {
    /* fixture-dependent */
  });
  it.skip("compare with integer", () => {
    /* fixture-dependent */
  });
  it.skip("compare with float", () => {
    /* fixture-dependent */
  });
  it.skip("compare with rational", () => {
    /* fixture-dependent */
  });
  it.skip("to f", () => {
    /* fixture-dependent */
  });
  it.skip("to i", () => {
    /* fixture-dependent */
  });
  it.skip("usec", () => {
    /* fixture-dependent */
  });
  it.skip("nsec", () => {
    /* fixture-dependent */
  });
  it.skip("subsec", () => {
    /* fixture-dependent */
  });
});
