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

describe("CacheSerializerWithFallbackTest", () => {
  it.skip(" serializer can load  dump", () => {
    /* fixture-dependent */
  });
  it.skip(" serializer handles unrecognized payloads gracefully", () => {
    /* fixture-dependent */
  });
  it.skip(" serializer logs unrecognized payloads", () => {
    /* fixture-dependent */
  });
  it.skip(" serializer can compress entries", () => {
    /* fixture-dependent */
  });
  it.skip(":message_pack serializer handles missing class gracefully", () => {
    /* fixture-dependent */
  });
  it.skip("raises on invalid format name", () => {
    /* fixture-dependent */
  });
});

describe("MessagePackCacheSerializerTest", () => {
  it.skip("uses #to_msgpack_ext and ::from_msgpack_ext to roundtrip unregistered objects", () => {
    /* fixture-dependent */
  });
  it.skip("uses #as_json and ::json_create to roundtrip unregistered objects", () => {
    /* fixture-dependent */
  });
  it.skip("raises error when unable to serialize an unregistered object", () => {
    /* fixture-dependent */
  });
  it.skip("raises error when serializing an unregistered object with an anonymous class", () => {
    /* fixture-dependent */
  });
  it.skip("handles missing class gracefully", () => {
    /* fixture-dependent */
  });
});
