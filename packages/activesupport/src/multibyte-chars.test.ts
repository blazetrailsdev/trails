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

describe("MultibyteProxyText", () => {
  it.skip("custom multibyte encoder", () => {
    /* fixture-dependent */
  });
});

describe("MultibyteCharsUTF8BehaviorTest", () => {
  it.skip("split should return an array of chars instances", () => {
    /* fixture-dependent */
  });
  it.skip("tidy bytes bang should return self", () => {
    /* fixture-dependent */
  });
  it.skip("tidy bytes bang should change wrapped string", () => {
    /* fixture-dependent */
  });
  it.skip("unicode string should have utf8 encoding", () => {
    /* fixture-dependent */
  });
  it.skip("identity", () => {
    /* fixture-dependent */
  });
  it.skip("string methods are chainable", () => {
    /* fixture-dependent */
  });
  it.skip("should be equal to the wrapped string", () => {
    /* fixture-dependent */
  });
  it.skip("should not be equal to an other string", () => {
    /* fixture-dependent */
  });
  it.skip("sortability", () => {
    /* fixture-dependent */
  });
  it.skip("should return character offset for regexp matches", () => {
    /* fixture-dependent */
  });
  it.skip("match should return boolean for regexp match", () => {
    /* fixture-dependent */
  });
  it.skip("should use character offsets for insert offsets", () => {
    /* fixture-dependent */
  });
  it.skip("insert should be destructive", () => {
    /* fixture-dependent */
  });
  it.skip("should know if one includes the other", () => {
    /* fixture-dependent */
  });
  it.skip("include raises when nil is passed", () => {
    /* fixture-dependent */
  });
  it.skip("index should return character offset", () => {
    /* fixture-dependent */
  });
  it.skip("rindex should return character offset", () => {
    /* fixture-dependent */
  });
  it.skip("indexed insert should take character offsets", () => {
    /* fixture-dependent */
  });
  it.skip("indexed insert should raise on index overflow", () => {
    /* fixture-dependent */
  });
  it.skip("indexed insert should raise on range overflow", () => {
    /* fixture-dependent */
  });
  it.skip("rjust should raise argument errors on bad arguments", () => {
    /* fixture-dependent */
  });
  it.skip("rjust should count characters instead of bytes", () => {
    /* fixture-dependent */
  });
  it.skip("ljust should raise argument errors on bad arguments", () => {
    /* fixture-dependent */
  });
  it.skip("ljust should count characters instead of bytes", () => {
    /* fixture-dependent */
  });
  it.skip("center should raise argument errors on bad arguments", () => {
    /* fixture-dependent */
  });
  it.skip("center should count characters instead of bytes", () => {
    /* fixture-dependent */
  });
  it.skip("lstrip strips whitespace from the left of the string", () => {
    /* fixture-dependent */
  });
  it.skip("rstrip strips whitespace from the right of the string", () => {
    /* fixture-dependent */
  });
  it.skip("strip strips whitespace", () => {
    /* fixture-dependent */
  });
  it.skip("stripping whitespace leaves whitespace within the string intact", () => {
    /* fixture-dependent */
  });
  it.skip("size returns characters instead of bytes", () => {
    /* fixture-dependent */
  });
  it.skip("reverse reverses characters", () => {
    /* fixture-dependent */
  });
  it.skip("reverse should work with normalized strings", () => {
    /* fixture-dependent */
  });
  it.skip("slice should take character offsets", () => {
    /* fixture-dependent */
  });
  it.skip("slice bang returns sliced out substring", () => {
    /* fixture-dependent */
  });
  it.skip("slice bang returns nil on out of bound arguments", () => {
    /* fixture-dependent */
  });
  it.skip("slice bang removes the slice from the receiver", () => {
    /* fixture-dependent */
  });
  it.skip("slice bang returns nil and does not modify receiver if out of bounds", () => {
    /* fixture-dependent */
  });
  it.skip("slice should throw exceptions on invalid arguments", () => {
    /* fixture-dependent */
  });
  it.skip("ord should return unicode value for first character", () => {
    /* fixture-dependent */
  });
  it.skip("upcase should upcase ascii characters", () => {
    /* fixture-dependent */
  });
  it.skip("downcase should downcase ascii characters", () => {
    /* fixture-dependent */
  });
  it.skip("swapcase should swap ascii characters", () => {
    /* fixture-dependent */
  });
  it.skip("capitalize should work on ascii characters", () => {
    /* fixture-dependent */
  });
  it.skip("titleize should work on ascii characters", () => {
    /* fixture-dependent */
  });
  it.skip("respond to knows which methods the proxy responds to", () => {
    /* fixture-dependent */
  });
  it.skip("method works for proxyed methods", () => {
    /* fixture-dependent */
  });
  it.skip("acts like string", () => {
    /* fixture-dependent */
  });
});
