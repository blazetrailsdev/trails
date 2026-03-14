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

describe("DateExtBehaviorTest", () => {
  it.skip("date acts like date", () => {
    /* fixture-dependent */
  });
  it.skip("blank?", () => {
    /* fixture-dependent */
  });
  it.skip("freeze doesnt clobber memoized instance methods", () => {
    /* fixture-dependent */
  });
  it.skip("can freeze twice", () => {
    /* fixture-dependent */
  });
});

describe("DateExtCalculationsTest", () => {
  it.skip("yesterday in calendar reform", () => {
    /* fixture-dependent */
  });
  it.skip("tomorrow in calendar reform", () => {
    /* fixture-dependent */
  });
  it.skip("to fs", () => {
    /* fixture-dependent */
  });
  it.skip("to fs with single digit day", () => {
    /* fixture-dependent */
  });
  it.skip("readable inspect", () => {
    /* fixture-dependent */
  });
  it.skip("to time", () => {
    /* fixture-dependent */
  });
  it.skip("compare to time", () => {
    /* fixture-dependent */
  });
  it.skip("to datetime", () => {
    /* fixture-dependent */
  });
  it.skip("to date", () => {
    /* fixture-dependent */
  });
  it.skip("change", () => {
    /* fixture-dependent */
  });
  it.skip("sunday", () => {
    /* fixture-dependent */
  });
  it.skip("last year in calendar reform", () => {
    /* fixture-dependent */
  });
  it.skip("advance does first years and then days", () => {
    /* fixture-dependent */
  });
  it.skip("advance does first months and then days", () => {
    /* fixture-dependent */
  });
  it.skip("advance in calendar reform", () => {
    /* fixture-dependent */
  });
  it.skip("last week", () => {
    /* fixture-dependent */
  });
  it.skip("last quarter on 31st", () => {
    /* fixture-dependent */
  });
  it.skip("yesterday constructor", () => {
    /* fixture-dependent */
  });
  it.skip("yesterday constructor when zone is not set", () => {
    /* fixture-dependent */
  });
  it.skip("yesterday constructor when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("tomorrow constructor", () => {
    /* fixture-dependent */
  });
  it.skip("tomorrow constructor when zone is not set", () => {
    /* fixture-dependent */
  });
  it.skip("tomorrow constructor when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("since", () => {
    /* fixture-dependent */
  });
  it.skip("since when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("ago", () => {
    /* fixture-dependent */
  });
  it.skip("ago when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("beginning of day", () => {
    /* fixture-dependent */
  });
  it.skip("middle of day", () => {
    /* fixture-dependent */
  });
  it.skip("beginning of day when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("end of day", () => {
    /* fixture-dependent */
  });
  it.skip("end of day when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("all day", () => {
    /* fixture-dependent */
  });
  it.skip("all day when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("all week", () => {
    /* fixture-dependent */
  });
  it.skip("all month", () => {
    /* fixture-dependent */
  });
  it.skip("all quarter", () => {
    /* fixture-dependent */
  });
  it.skip("all year", () => {
    /* fixture-dependent */
  });
  it.skip("xmlschema", () => {
    /* fixture-dependent */
  });
  it.skip("xmlschema when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("past", () => {
    /* fixture-dependent */
  });
  it.skip("future", () => {
    /* fixture-dependent */
  });
  it.skip("current returns date today when zone not set", () => {
    /* fixture-dependent */
  });
  it.skip("current returns time zone today when zone is set", () => {
    /* fixture-dependent */
  });
  it.skip("date advance should not change passed options hash", () => {
    /* fixture-dependent */
  });
});
