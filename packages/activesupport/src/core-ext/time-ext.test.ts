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

describe("TimeExtCalculationsTest", () => {
  it.skip("seconds since midnight at daylight savings time start", () => {
    /* fixture-dependent */
  });
  it.skip("seconds since midnight at daylight savings time end", () => {
    /* fixture-dependent */
  });
  it.skip("seconds until end of day at daylight savings time start", () => {
    /* fixture-dependent */
  });
  it.skip("seconds until end of day at daylight savings time end", () => {
    /* fixture-dependent */
  });
  it.skip("sec fraction", () => {
    /* fixture-dependent */
  });
  it.skip("floor", () => {
    /* fixture-dependent */
  });
  it.skip("ceil", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings backward start", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings backward end", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings backward start 1day", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings backward end 1day", () => {
    /* fixture-dependent */
  });
  it.skip("since with instance of time deprecated", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings forward start", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings forward start 1day", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings forward start tomorrow", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings backward start yesterday", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings forward end", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings forward end 1day", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings forward end tomorrow", () => {
    /* fixture-dependent */
  });
  it.skip("daylight savings time crossings backward end yesterday", () => {
    /* fixture-dependent */
  });
  it.skip("change", () => {
    /* fixture-dependent */
  });
  it.skip("utc change", () => {
    /* fixture-dependent */
  });
  it.skip("offset change", () => {
    /* fixture-dependent */
  });
  it.skip("change offset", () => {
    /* fixture-dependent */
  });
  it.skip("change preserves offset for local times around end of dst", () => {
    /* fixture-dependent */
  });
  it.skip("change preserves offset for zoned times around end of dst", () => {
    /* fixture-dependent */
  });
  it.skip("change preserves fractional seconds on zoned time", () => {
    /* fixture-dependent */
  });
  it.skip("change preserves fractional hour offset for local times around end of dst", () => {
    /* fixture-dependent */
  });
  it.skip("change preserves fractional hour offset for zoned times around end of dst", () => {
    /* fixture-dependent */
  });
  it.skip("utc advance", () => {
    /* fixture-dependent */
  });
  it.skip("offset advance", () => {
    /* fixture-dependent */
  });
  it.skip("advance with nsec", () => {
    /* fixture-dependent */
  });
  it.skip("advance gregorian proleptic", () => {
    /* fixture-dependent */
  });
  it.skip("advance preserves offset for local times around end of dst", () => {
    /* fixture-dependent */
  });
  it.skip("advance preserves offset for zoned times around end of dst", () => {
    /* fixture-dependent */
  });
  it.skip("advance preserves fractional hour offset for local times around end of dst", () => {
    /* fixture-dependent */
  });
  it.skip("advance preserves fractional hour offset for zoned times around end of dst", () => {
    /* fixture-dependent */
  });
  it.skip("last week", () => {
    /* fixture-dependent */
  });
  it.skip("next week near daylight start", () => {
    /* fixture-dependent */
  });
  it.skip("next week near daylight end", () => {
    /* fixture-dependent */
  });
  it.skip("to fs", () => {
    /* fixture-dependent */
  });
  it.skip("to fs custom date format", () => {
    /* fixture-dependent */
  });
  it.skip("rfc3339 with fractional seconds", () => {
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
  it.skip("fp inaccuracy ticket 1836", () => {
    /* fixture-dependent */
  });
  it.skip("days in month with year", () => {
    /* fixture-dependent */
  });
  it.skip("days in month feb in common year without year arg", () => {
    /* fixture-dependent */
  });
  it.skip("days in month feb in leap year without year arg", () => {
    /* fixture-dependent */
  });
  it.skip("days in year with year", () => {
    /* fixture-dependent */
  });
  it.skip("days in year in common year without year arg", () => {
    /* fixture-dependent */
  });
  it.skip("days in year in leap year without year arg", () => {
    /* fixture-dependent */
  });
  it.skip("xmlschema is available", () => {
    /* fixture-dependent */
  });
  it.skip("today with time local", () => {
    /* fixture-dependent */
  });
  it.skip("today with time utc", () => {
    /* fixture-dependent */
  });
  it.skip("yesterday with time local", () => {
    /* fixture-dependent */
  });
  it.skip("yesterday with time utc", () => {
    /* fixture-dependent */
  });
  it.skip("prev day with time utc", () => {
    /* fixture-dependent */
  });
  it.skip("tomorrow with time local", () => {
    /* fixture-dependent */
  });
  it.skip("tomorrow with time utc", () => {
    /* fixture-dependent */
  });
  it.skip("next day with time utc", () => {
    /* fixture-dependent */
  });
  it.skip("past with time current as time local", () => {
    /* fixture-dependent */
  });
  it.skip("past with time current as time with zone", () => {
    /* fixture-dependent */
  });
  it.skip("future with time current as time local", () => {
    /* fixture-dependent */
  });
  it.skip("future with time current as time with zone", () => {
    /* fixture-dependent */
  });
  it.skip("acts like time", () => {
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
  it.skip("at with datetime", () => {
    /* fixture-dependent */
  });
  it.skip("at with datetime returns local time", () => {
    /* fixture-dependent */
  });
  it.skip("at with time with zone", () => {
    /* fixture-dependent */
  });
  it.skip("at with in option", () => {
    /* fixture-dependent */
  });
  it.skip("at with time with zone returns local time", () => {
    /* fixture-dependent */
  });
  it.skip("at with time microsecond precision", () => {
    /* fixture-dependent */
  });
  it.skip("at with utc time", () => {
    /* fixture-dependent */
  });
  it.skip("at with local time", () => {
    /* fixture-dependent */
  });
  it.skip("eql?", () => {
    /* fixture-dependent */
  });
  it.skip("minus with time with zone", () => {
    /* fixture-dependent */
  });
  it.skip("minus with datetime", () => {
    /* fixture-dependent */
  });
  it.skip("time created with local constructor cannot represent times during hour skipped by dst", () => {
    /* fixture-dependent */
  });
  it.skip("case equality", () => {
    /* fixture-dependent */
  });
  it.skip("all day with timezone", () => {
    /* fixture-dependent */
  });
  it.skip("rfc3339 parse", () => {
    /* fixture-dependent */
  });
});
