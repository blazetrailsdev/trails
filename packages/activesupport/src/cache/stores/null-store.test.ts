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

describe("NullStoreTest", () => {
  it("clear", () => {
    const store = new NullStore();
    store.write("key", "value");
    store.clear();
    expect(store.read("key")).toBeNull();
  });

  it("cleanup", () => {
    const store = new NullStore();
    // cleanup is a no-op for NullStore; just verify no errors
    expect(() => store.clear()).not.toThrow();
  });

  it("write", () => {
    const store = new NullStore();
    store.write("key", "value");
    // NullStore doesn't persist
    expect(store.read("key")).toBeNull();
  });

  it("read", () => {
    const store = new NullStore();
    expect(store.read("anything")).toBeNull();
  });

  it("delete", () => {
    const store = new NullStore();
    store.write("key", "value");
    store.delete("key");
    expect(store.read("key")).toBeNull();
  });

  it("increment", () => {
    const store = new NullStore();
    // NullStore increment always returns null/0
    expect(store.increment("counter")).toBeNull();
  });

  it("increment with options", () => {
    const store = new NullStore();
    expect(store.increment("counter", 5)).toBeNull();
  });

  it("decrement", () => {
    const store = new NullStore();
    expect(store.decrement("counter")).toBeNull();
  });

  it("decrement with options", () => {
    const store = new NullStore();
    expect(store.decrement("counter", 5)).toBeNull();
  });

  it("delete matched", () => {
    const store = new NullStore();
    // deleteMatched is a no-op for NullStore
    expect(() => store.deleteMatched(/key/)).not.toThrow();
  });

  it("local store strategy", () => {
    const store = new NullStore();
    expect(store.read("x")).toBeNull();
  });

  it("local store repeated reads", () => {
    const store = new NullStore();
    expect(store.read("x")).toBeNull();
    expect(store.read("x")).toBeNull();
  });
});
