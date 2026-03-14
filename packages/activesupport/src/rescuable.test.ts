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

describe("RescuableTest", () => {
  it("rescue from with method", () => {
    const handled: Error[] = [];
    const target = {
      handleError(e: Error) {
        handled.push(e);
      },
    };
    rescueFrom(target, Error, { with: "handleError" });
    const err = new Error("oops");
    expect(handleRescue(target, err)).toBe(true);
    expect(handled).toContain(err);
  });

  it("rescue from with block", () => {
    const handled: Error[] = [];
    const target = {};
    rescueFrom(target, Error, { with: (e: Error) => handled.push(e) });
    const err = new Error("boom");
    expect(handleRescue(target, err)).toBe(true);
    expect(handled).toContain(err);
  });

  it("rescue from with block with args", () => {
    const log: string[] = [];
    const target = {};
    rescueFrom(target, TypeError, { with: (e: Error) => log.push(e.message) });
    const err = new TypeError("type error");
    handleRescue(target, err);
    expect(log).toContain("type error");
  });

  it("rescues defined later are added at end of the rescue handlers array", () => {
    const log: string[] = [];
    const target = {};
    rescueFrom(target, Error, { with: () => log.push("first") });
    rescueFrom(target, TypeError, { with: () => log.push("second") });
    handleRescue(target, new TypeError("t"));
    expect(log).toContain("second");
  });

  it("unhandled exceptions", () => {
    const target = {};
    rescueFrom(target, TypeError, { with: () => {} });
    // A RangeError should not be handled
    expect(handleRescue(target, new RangeError("range"))).toBe(false);
  });
});
