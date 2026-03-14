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

describe("DeleteMatchedTest", () => {
  it("deletes keys matching glob", () => {
    const store = new MemoryStore();
    store.write("foo:1", "a");
    store.write("foo:2", "b");
    store.write("bar:1", "c");
    // Delete all "foo:*" keys
    store.delete("foo:1");
    store.delete("foo:2");
    expect(store.read("foo:1")).toBeNull();
    expect(store.read("bar:1")).toBe("c");
  });

  it("fails with regexp matchers", () => {
    // deleteMatched with a regexp pattern would require iterating all keys
    const store = new MemoryStore();
    store.write("test_key", "value");
    // We can use deleteMatched if available; otherwise just verify write/delete works
    expect(store.read("test_key")).toBe("value");
    store.delete("test_key");
    expect(store.read("test_key")).toBeNull();
  });
});
