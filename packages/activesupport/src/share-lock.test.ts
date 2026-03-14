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

describe("ShareLockTest", () => {
  it.skip("reentrancy", () => {
    /* fixture-dependent */
  });
  it.skip("sharing doesnt block", () => {
    /* fixture-dependent */
  });
  it.skip("sharing blocks exclusive", () => {
    /* fixture-dependent */
  });
  it.skip("exclusive blocks sharing", () => {
    /* fixture-dependent */
  });
  it.skip("multiple exclusives are able to progress", () => {
    /* fixture-dependent */
  });
  it.skip("sharing is upgradeable to exclusive", () => {
    /* fixture-dependent */
  });
  it.skip("exclusive upgrade waits for other sharers to leave", () => {
    /* fixture-dependent */
  });
  it.skip("exclusive matching purpose", () => {
    /* fixture-dependent */
  });
  it.skip("killed thread loses lock", () => {
    /* fixture-dependent */
  });
  it.skip("exclusive conflicting purpose", () => {
    /* fixture-dependent */
  });
  it.skip("exclusive ordering", () => {
    /* fixture-dependent */
  });
  it.skip("new share attempts block on waiting exclusive", () => {
    /* fixture-dependent */
  });
  it.skip("share remains reentrant ignoring a waiting exclusive", () => {
    /* fixture-dependent */
  });
  it.skip("compatible exclusives cooperate to both proceed", () => {
    /* fixture-dependent */
  });
  it.skip("manual yield", () => {
    /* fixture-dependent */
  });
  it.skip("manual incompatible yield", () => {
    /* fixture-dependent */
  });
  it.skip("manual recursive yield", () => {
    /* fixture-dependent */
  });
  it.skip("manual recursive yield cannot expand outer compatible", () => {
    /* fixture-dependent */
  });
  it.skip("manual recursive yield restores previous compatible", () => {
    /* fixture-dependent */
  });
  it.skip("in shared section incompatible non upgrading threads cannot preempt upgrading threads", () => {
    /* fixture-dependent */
  });
});

describe("ShareLockTest", () => {
  it.skip("happy path", () => {
    /* fixture-dependent */
  });
  it.skip("detects stuck thread", () => {
    /* fixture-dependent */
  });
  it.skip("detects free thread", () => {
    /* fixture-dependent */
  });
  it.skip("detects already released", () => {
    /* fixture-dependent */
  });
  it.skip("detects remains latched", () => {
    /* fixture-dependent */
  });
});
